// tests/archive.spec.js — monthly trend archive: freezing, immutability,
// replace guard, per-client trends, unequal-period flags, persistence.
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

/** Seed a scoreable month and archive it. */
async function seedMonth(page, { client = 'SmartBuy', start, end, followers, reach, eng, posts = 20 }) {
  await page.evaluate(([c, s2, e2, f, r, g, po]) => {
    S.meta.client = c; S.meta.curStart = s2; S.meta.curEnd = e2;
    S.platforms.instagram.enabled = true;
    setMetric('instagram', 'current', 'followers', f);
    setMetric('instagram', 'current', 'reach', r);
    setMetric('instagram', 'current', 'engagements', g);
    setMetric('instagram', 'current', 'posts', po);
    saveLocal();
  }, [client, start, end, followers, reach, eng, posts]);
  await page.getByTestId('tab-report').click();
  await page.getByTestId('btn-archive-close').click();
}

const JUNE = { start: '2026-06-01', end: '2026-06-30', followers: 300000, reach: 900000, eng: 9000 };
const JULY = { start: '2026-07-01', end: '2026-07-31', followers: 309574, reach: 929164, eng: 9305 };

test.describe('closing a month', () => {
  test('creates one snapshot with frozen metrics, rates and scores', async ({ page }) => {
    await seedMonth(page, JUNE);
    const arc = await page.evaluate(() => S.archive);
    expect(arc).toHaveLength(1);
    const snap = arc[0];
    expect(snap.client).toBe('SmartBuy');
    expect(snap.curStart).toBe('2026-06-01');
    expect(snap.days).toBe(30);
    expect(snap.platforms.instagram.metrics.followers).toBe(300000);
    expect(snap.platforms.instagram.derived.er_reach).toBeCloseTo(1, 4); // 9000/900000
    expect(snap.platforms.instagram.scores.overall).not.toBeNull();
  });

  test('refuses to close without a client name', async ({ page }) => {
    await page.evaluate(() => {
      S.meta.curStart = '2026-06-01'; S.meta.curEnd = '2026-06-30';
      S.platforms.instagram.enabled = true;
      setMetric('instagram', 'current', 'followers', 100);
      saveLocal();
    });
    await page.getByTestId('tab-report').click();
    await page.getByTestId('btn-archive-close').click();
    await expect(page.locator('.toast')).toContainText('Client');
    expect(await page.evaluate(() => S.archive.length)).toBe(0);
  });

  test('refuses to close without period dates', async ({ page }) => {
    await page.evaluate(() => {
      S.meta.client = 'X';
      S.platforms.instagram.enabled = true;
      setMetric('instagram', 'current', 'followers', 100);
      saveLocal();
    });
    await page.getByTestId('tab-report').click();
    await page.getByTestId('btn-archive-close').click();
    await expect(page.locator('.toast')).toContainText('period dates');
    expect(await page.evaluate(() => S.archive.length)).toBe(0);
  });

  test('refuses to close an empty audit', async ({ page }) => {
    await page.evaluate(() => {
      S.meta.client = 'X'; S.meta.curStart = '2026-06-01'; S.meta.curEnd = '2026-06-30';
      saveLocal();
    });
    await page.getByTestId('tab-report').click();
    await page.getByTestId('btn-archive-close').click();
    await expect(page.locator('.toast')).toContainText('No platform');
    expect(await page.evaluate(() => S.archive.length)).toBe(0);
  });
});

test.describe('immutability', () => {
  test('editing benchmarks after closing never rewrites the archived score', async ({ page }) => {
    await seedMonth(page, JUNE);
    const before = await page.evaluate(() => S.archive[0].platforms.instagram.scores.overall);
    // slash every benchmark so the LIVE score changes drastically
    await page.evaluate(() => {
      Object.keys(S.benchmarks.instagram).forEach((k) => { S.benchmarks.instagram[k] = 1000; });
      saveLocal();
    });
    const live = await page.evaluate(() => scorePlatform('instagram').overall);
    const archived = await page.evaluate(() => S.archive[0].platforms.instagram.scores.overall);
    expect(archived).toBe(before);
    expect(archived).not.toBe(live === null ? null : Math.round(live * 10) / 10);
  });

  test('editing a metric after closing does not touch the snapshot', async ({ page }) => {
    await seedMonth(page, JUNE);
    await page.evaluate(() => { setMetric('instagram', 'current', 'followers', 1); saveLocal(); });
    expect(await page.evaluate(() => S.archive[0].platforms.instagram.metrics.followers)).toBe(300000);
  });
});

test.describe('replace guard', () => {
  test('closing the same client+period again warns instead of silently replacing', async ({ page }) => {
    await seedMonth(page, JUNE);
    await page.getByTestId('btn-archive-close').click();
    await expect(page.getByTestId('archive-dup-warn')).toBeVisible();
    expect(await page.evaluate(() => S.archive.length)).toBe(1);
  });

  test('Cancel keeps the original snapshot untouched', async ({ page }) => {
    await seedMonth(page, JUNE);
    await page.evaluate(() => { setMetric('instagram', 'current', 'followers', 999999); });
    await page.getByTestId('btn-archive-close').click();
    await page.getByTestId('btn-archive-cancel').click();
    await expect(page.getByTestId('archive-dup-warn')).toBeHidden();
    expect(await page.evaluate(() => S.archive[0].platforms.instagram.metrics.followers)).toBe(300000);
  });

  test('Replace overwrites with today\'s values, still exactly one snapshot', async ({ page }) => {
    await seedMonth(page, JUNE);
    await page.evaluate(() => { setMetric('instagram', 'current', 'followers', 999999); });
    await page.getByTestId('btn-archive-close').click();
    await page.getByTestId('btn-archive-replace').click();
    const arc = await page.evaluate(() => S.archive);
    expect(arc).toHaveLength(1);
    expect(arc[0].platforms.instagram.metrics.followers).toBe(999999);
  });

  test('a different period for the same client archives without warning', async ({ page }) => {
    await seedMonth(page, JUNE);
    await seedMonth(page, JULY);
    await expect(page.getByTestId('archive-dup-warn')).toBeHidden();
    expect(await page.evaluate(() => S.archive.length)).toBe(2);
  });
});

test.describe('trends card', () => {
  test('hidden with fewer than two snapshots for the client', async ({ page }) => {
    await seedMonth(page, JUNE);
    await expect(page.getByTestId('trends-card')).toHaveCount(0);
  });

  test('appears with two snapshots and shows the month-over-month deltas', async ({ page }) => {
    await seedMonth(page, JUNE);
    await seedMonth(page, JULY);
    await expect(page.getByTestId('trends-card')).toBeVisible();
    const table = page.getByTestId('trend-table');
    await expect(table).toContainText('309,574');
    // followers delta: (309574-300000)/300000 = +3.19%
    await expect(table).toContainText('3.2%');
  });

  test('another client\'s snapshots never leak into the trends', async ({ page }) => {
    await seedMonth(page, JUNE);
    await seedMonth(page, { ...JULY, client: 'OtherBrand' });
    // active client is now OtherBrand with a single snapshot → no trends
    await expect(page.getByTestId('trends-card')).toHaveCount(0);
    // switch back to SmartBuy: still only one SmartBuy snapshot → no trends
    await page.evaluate(() => { S.meta.client = 'SmartBuy'; saveLocal(); renderReport(); });
    await expect(page.getByTestId('trends-card')).toHaveCount(0);
  });

  test('client matching is case- and whitespace-insensitive', async ({ page }) => {
    await seedMonth(page, JUNE);
    await seedMonth(page, { ...JULY, client: '  smartbuy ' });
    await expect(page.getByTestId('trends-card')).toBeVisible();
  });

  test('unequal period lengths flag totals but not followers or ER', async ({ page }) => {
    await seedMonth(page, JUNE);   // 30 days
    await seedMonth(page, JULY);   // 31 days
    const flags = page.getByTestId('trend-flag');
    // reach + engagements flagged, nothing else
    await expect(flags).toHaveCount(2);
  });

  test('equal-length periods produce no flags', async ({ page }) => {
    await seedMonth(page, { ...JUNE, start: '2026-06-01', end: '2026-06-30' });
    await seedMonth(page, { ...JULY, start: '2026-07-01', end: '2026-07-30' }); // also 30 days
    await expect(page.getByTestId('trend-flag')).toHaveCount(0);
  });

  test('the metric picker switches without errors and marks the active metric', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seedMonth(page, JUNE);
    await seedMonth(page, JULY);
    await page.getByTestId('trend-metric-er').click();
    await expect(page.getByTestId('trend-metric-er')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('trend-metric-followers')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('trend-metric-score').click();
    await expect(page.getByTestId('trend-metric-score')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });
});

test.describe('archive management', () => {
  test('deleting needs a second confirming click', async ({ page }) => {
    await seedMonth(page, JUNE);
    const id = await page.evaluate(() => S.archive[0].id);
    const del = page.getByTestId(`btn-archive-del-${id}`);
    await del.click();
    await expect(del).toContainText('Sure?');
    expect(await page.evaluate(() => S.archive.length)).toBe(1); // not yet
    await del.click();
    expect(await page.evaluate(() => S.archive.length)).toBe(0);
  });

  test('snapshots ride through JSON save/load (hydrate)', async ({ page }) => {
    await seedMonth(page, JUNE);
    await seedMonth(page, JULY);
    const saved = await app.state();
    await page.evaluate((st) => { S = hydrate(st); saveLocal(); }, saved);
    const arc = await page.evaluate(() => S.archive);
    expect(arc).toHaveLength(2);
    expect(arc[0].platforms.instagram.scores.overall).not.toBeNull();
  });

  test('a saved file without an archive key loads as an empty archive', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(() => {
      S = hydrate({ v: 1, platforms: { instagram: { enabled: true, metrics: { current: { followers: 10 } } } } });
      saveLocal();
    });
    await page.getByTestId('tab-report').click();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => Array.isArray(S.archive) && S.archive.length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('the archive card documents the freeze in the Calculations tab', async ({ page }) => {
    await page.getByTestId('tab-calc').click();
    await expect(page.locator('#calcBody')).toContainText('Monthly trend archive');
    await expect(page.locator('#calcBody')).toContainText('never rewrites archived scores');
  });

  test('archive controls stay out of the printed report', async ({ page }) => {
    await seedMonth(page, JUNE);
    const cls = await page.getByTestId('archive-card').getAttribute('class');
    expect(cls).toContain('no-print');
    // trends stay IN the print (they are part of the deliverable)
    await seedMonth(page, JULY);
    const tcls = await page.getByTestId('trends-card').getAttribute('class');
    expect(tcls).not.toContain('no-print');
  });
});
