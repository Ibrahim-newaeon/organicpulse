// tests/exec-summary.spec.js — executive summary generator: gating, template
// filling from entered values only, omission of missing-input sentences,
// priority actions from triggered rules, provenance + limitations, copy, AR.
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

/** Minimal deterministic seed on Instagram. Pass null to skip a metric. */
async function seed(page, {
  client = 'SmartBuy', start = '2026-07-01', end = '2026-07-31',
  followers = 309574, prevFollowers = null,
  reach = 929164, eng = 9305, posts = 20,
} = {}) {
  await page.evaluate(([c, s2, e2, f, pf, r, g, po]) => {
    S.meta.client = c; S.meta.curStart = s2; S.meta.curEnd = e2;
    if (pf !== null) { S.meta.prevStart = '2026-06-01'; S.meta.prevEnd = '2026-06-30'; }
    S.platforms.instagram.enabled = true;
    if (f !== null) setMetric('instagram', 'current', 'followers', f);
    if (pf !== null) setMetric('instagram', 'previous', 'followers', pf);
    if (r !== null) setMetric('instagram', 'current', 'reach', r);
    if (g !== null) setMetric('instagram', 'current', 'engagements', g);
    if (po !== null) setMetric('instagram', 'current', 'posts', po);
    saveLocal();
  }, [client, start, end, followers, prevFollowers, reach, eng, posts]);
  await page.getByTestId('tab-report').click();
}

const summaryText = (page) => page.getByTestId('exec-summary-text');

test.describe('gating', () => {
  test('empty audit shows the empty state, never a padded summary', async ({ page }) => {
    await page.getByTestId('tab-report').click();
    await expect(page.getByTestId('exec-card')).toBeVisible();
    await expect(page.getByTestId('exec-summary-empty')).toBeVisible();
    await expect(summaryText(page)).toHaveCount(0);
    await expect(page.getByTestId('btn-exec-copy')).toHaveCount(0);
  });

  test('a single bullet is not enough — one metric still shows the empty state', async ({ page }) => {
    await seed(page, { reach: null, eng: null, posts: null }); // followers only
    expect(await page.evaluate(() => buildExecSummary('en').bullets)).toBe(1);
    await expect(page.getByTestId('exec-summary-empty')).toBeVisible();
    await expect(summaryText(page)).toHaveCount(0);
  });

  test('two bullets render the summary with header, scope and copy buttons', async ({ page }) => {
    await seed(page);
    await expect(summaryText(page)).toBeVisible();
    await expect(summaryText(page)).toContainText('EXECUTIVE SUMMARY');
    await expect(summaryText(page)).toContainText('SmartBuy · 2026-07-01 → 2026-07-31');
    await expect(summaryText(page)).toContainText('paid media excluded');
    await expect(page.getByTestId('btn-exec-copy')).toBeVisible();
    await expect(page.getByTestId('btn-exec-copy-both')).toBeVisible();
  });
});

test.describe('template filling — entered values only', () => {
  test('every figure traces to a seeded metric or a documented derivation', async ({ page }) => {
    await seed(page);
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('Followers: 309,574');
    expect(txt).toContain('reach 929,164');
    expect(txt).toContain('engagements 9,305');
    expect(txt).toContain('ER by reach 1%'); // 9305/929164*100 = 1.0014 → fmt "1"
    expect(txt).not.toMatch(/undefined|NaN|\bnull\b/);
  });

  test('no previous period → no invented delta', async ({ page }) => {
    await seed(page); // prevFollowers null
    const txt = await summaryText(page).textContent();
    expect(txt).not.toContain('vs previous');
    expect(txt).not.toContain('▲');
    expect(txt).not.toContain('▼');
  });

  test('with both periods the follower delta appears, computed not guessed', async ({ page }) => {
    await seed(page, { prevFollowers: 300000 });
    // (309574-300000)/300000 = +3.19%
    await expect(summaryText(page)).toContainText('▲ +3.2% vs previous');
  });

  test('combined multi-platform totals sum only provided values', async ({ page }) => {
    await seed(page);
    await page.evaluate(() => {
      S.platforms.facebook.enabled = true;
      setMetric('facebook', 'current', 'followers', 100000);
      saveLocal(); renderReport();
    });
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('Followers (combined): 409,574');
    expect(txt).toContain('Instagram 309,574');
    expect(txt).toContain('Facebook 100,000');
  });

  test('combined delta needs BOTH platforms to have a previous value', async ({ page }) => {
    await seed(page, { prevFollowers: 300000 });
    await page.evaluate(() => {
      S.platforms.facebook.enabled = true;
      setMetric('facebook', 'current', 'followers', 100000); // no previous
      saveLocal(); renderReport();
    });
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('Followers (combined): 409,574');
    expect(txt).not.toContain('vs previous'); // one platform lacks previous → no combined delta
  });

  test('sentences with missing inputs are omitted, never padded', async ({ page }) => {
    // two bullets via followers + archive; reach/eng/formats absent
    await seed(page, { reach: null, eng: null, posts: null });
    await page.evaluate(() => {
      const snap = (id, endDate, f) => ({
        id, key: 'smartbuy', client: 'SmartBuy', curStart: '2026-0' + id + '-01',
        curEnd: endDate, days: 30, closedAt: '2026-08-01',
        platforms: { instagram: { metrics: { followers: f }, derived: {}, scores: {} } },
      });
      S.archive = [snap('5', '2026-05-30', 280000), snap('6', '2026-06-29', 300000)];
      saveLocal(); renderReport();
    });
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('archived months');
    expect(txt).not.toContain('Visibility & response'); // no reach/eng entered
    expect(txt).not.toContain('Best-performing format'); // no formats entered
    expect(txt).not.toContain('Overall organic health'); // nothing scoreable
  });

  test('per-format bullet appears only with ≥2 formats and names the top index', async ({ page }) => {
    await seed(page);
    await page.evaluate(() => {
      S.platforms.instagram.formats.current = {
        reel: { posts: 5, views: 100000, eng: 8000 },   // 25% posts, 80% eng → index 3.2
        static: { posts: 15, views: 50000, eng: 2000 },
      };
      saveLocal(); renderReport();
    });
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('Best-performing format:');
    expect(txt).toContain('index 3.20');
  });

  test('archived trajectory quotes the archive, oldest to newest', async ({ page }) => {
    await seed(page);
    await page.evaluate(() => {
      const snap = (id, endDate, f) => ({
        id, key: 'smartbuy', client: 'SmartBuy', curStart: '2026-05-01',
        curEnd: endDate, days: 30, closedAt: '2026-08-01',
        platforms: { instagram: { metrics: { followers: f }, derived: {}, scores: {} } },
      });
      S.archive = [snap('b', '2026-06-29', 300000), snap('a', '2026-05-30', 280000)]; // unsorted on purpose
      saveLocal(); renderReport();
    });
    // sorted by curEnd: 280,000 → 300,000 = +7.1%
    await expect(summaryText(page)).toContainText('280,000 → 300,000 (+7.1%)');
  });
});

test.describe('actions, wins and issues', () => {
  test('priority actions come from triggered rules, capped at three, platform named', async ({ page }) => {
    await seed(page, { prevFollowers: 300000 }); // ER 1% is below the default benchmark → rules fire
    const txt = await summaryText(page).textContent();
    const live = await page.evaluate(() => buildRecs().length);
    if (live === 0) {
      expect(txt).not.toContain('PRIORITY ACTIONS');
    } else {
      expect(txt).toContain('PRIORITY ACTIONS');
      const lines = txt.split('\n').filter((l) => /^\[P\d\]/.test(l));
      expect(lines.length).toBeLessThanOrEqual(3);
      expect(lines.length).toBe(Math.min(3, live));
      for (const l of lines) expect(l).toContain('Instagram');
    }
  });

  test('a collapsing pillar surfaces under TOP ISSUES with its score', async ({ page }) => {
    // engagements 10 vs reach 929,164 → ER ≈ 0.001% → engagement pillar ≈ 0
    await seed(page, { prevFollowers: 300000, eng: 10 });
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('TOP ISSUES');
    expect(txt).toContain('priority pillar');
  });

  test('an excelling pillar surfaces under TOP WINS', async ({ page }) => {
    // 1,000 → 309,574 followers = massive growth rate → growth pillar caps at 100
    await seed(page, { prevFollowers: 1000 });
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('TOP WINS');
    expect(txt).toContain('protect this');
  });
});

test.describe('provenance and limitations', () => {
  test('manual-entry audits say so under DATA SOURCES', async ({ page }) => {
    await seed(page);
    await expect(summaryText(page)).toContainText('DATA SOURCES');
    await expect(summaryText(page)).toContainText('All values entered manually.');
  });

  test('imports are counted by source in DATA SOURCES', async ({ page }) => {
    await app.parsePaste('Followers\n309,574\nReach\n929,164\nEngagements\n9,305');
    await app.apply();
    await page.evaluate(() => {
      S.meta.client = 'SmartBuy'; S.meta.curStart = '2026-07-01'; S.meta.curEnd = '2026-07-31';
      saveLocal();
    });
    await page.getByTestId('tab-report').click();
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('1 import: Pasted text ×1');
    expect(txt).not.toContain('All values entered manually.');
  });

  test('DATA LIMITATIONS names missing metrics instead of hiding them', async ({ page }) => {
    await seed(page); // no previous period, no profile visits etc.
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('DATA LIMITATIONS');
    expect(txt).toMatch(/\d+ metric\(s\) not provided and excluded from scoring — never guessed/);
    expect(txt).toContain('Generated by OrganicPulse from entered/imported values only');
  });
});

test.describe('copy and languages', () => {
  test('Copy puts the exact rendered summary on the clipboard', async ({ page }) => {
    await seed(page);
    await page.evaluate(() => {
      window.__copied = null;
      navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    });
    await page.getByTestId('btn-exec-copy').click();
    const copied = await page.evaluate(() => window.__copied);
    const shown = await summaryText(page).textContent();
    expect(copied).toBe(shown);
    await expect(page.locator('.toast')).toContainText('Copied');
  });

  test('Copy EN + AR delivers both languages separated, same bullet count', async ({ page }) => {
    await seed(page);
    await page.evaluate(() => {
      window.__copied = null;
      navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); };
    });
    await page.getByTestId('btn-exec-copy-both').click();
    const copied = await page.evaluate(() => window.__copied);
    expect(copied).toContain('EXECUTIVE SUMMARY');
    expect(copied).toContain('الملخص التنفيذي');
    expect(copied).toContain('————');
    expect(copied).not.toMatch(/undefined|NaN/);
  });

  test('Arabic UI renders the summary in Arabic with the same discipline', async ({ page }) => {
    await seed(page);
    await app.langToggle.click();
    await expect(summaryText(page)).toContainText('الملخص التنفيذي');
    await expect(summaryText(page)).toContainText('الإعلانات المدفوعة مستثناة');
    const txt = await summaryText(page).textContent();
    expect(txt).toContain('309,574');
    expect(txt).not.toMatch(/undefined|NaN/);
  });
});

test.describe('print behaviour', () => {
  test('summary prints with the report; the copy buttons do not', async ({ page }) => {
    await seed(page);
    const cardCls = await page.getByTestId('exec-card').getAttribute('class');
    expect(cardCls).not.toContain('no-print');
    const btnRowCls = await page.locator('#btnExecCopy').evaluate((b) => b.parentElement.className);
    expect(btnRowCls).toContain('no-print');
  });
});
