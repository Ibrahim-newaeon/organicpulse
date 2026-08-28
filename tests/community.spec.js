// tests/community.spec.js — community management module (roadmap item 3):
// response-rate math, 0-vs-blank discipline, pillar blend + fallback,
// benchmark row, rec rules (quant supersedes qual), exec bullet, AR, persistence.
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

/** Seed instagram with core metrics plus optional community inputs. */
async function seed(page, {
  comments = 400, dms = 100, responses = 350, art = null,
  followers = 309574, reach = 929164, eng = 9305, posts = 20,
} = {}) {
  await page.evaluate(([c, d2, r2, a2, f, re, g, po]) => {
    S.meta.client = 'SmartBuy'; S.meta.curStart = '2026-07-01'; S.meta.curEnd = '2026-07-31';
    S.platforms.instagram.enabled = true;
    setMetric('instagram', 'current', 'followers', f);
    setMetric('instagram', 'current', 'reach', re);
    setMetric('instagram', 'current', 'engagements', g);
    setMetric('instagram', 'current', 'posts', po);
    if (c !== null) setMetric('instagram', 'current', 'comments', c);
    if (d2 !== null) setMetric('instagram', 'current', 'dms_received', d2);
    if (r2 !== null) setMetric('instagram', 'current', 'responses_sent', r2);
    if (a2 !== null) setMetric('instagram', 'current', 'avg_response_time', a2);
    saveLocal();
  }, [comments, dms, responses, art, followers, reach, eng, posts]);
}

const derived = (page) => page.evaluate(() => derive('instagram', 'current'));

test.describe('response-rate math', () => {
  test('rate = responses ÷ (comments + DMs) × 100, from entered values only', async ({ page }) => {
    await seed(page); // 350 / (400+100) = 70%
    const d = await derived(page);
    expect(d.inbound).toBe(500);
    expect(d.response_rate).toBeCloseTo(70, 6);
  });

  test('a blank input blocks the rate — never computed against comments alone', async ({ page }) => {
    await seed(page, { dms: null }); // DMs unknown
    const d = await derived(page);
    expect(d.inbound).toBeNull();
    expect(d.response_rate).toBeNull();
  });

  test('blank responses blocks the rate even with full inbound', async ({ page }) => {
    await seed(page, { responses: null });
    expect((await derived(page)).response_rate).toBeNull();
  });

  test('an entered zero is a value, not a gap — 0 DMs still computes', async ({ page }) => {
    await seed(page, { dms: 0, responses: 200 }); // 200/400 = 50%
    const d = await derived(page);
    expect(d.inbound).toBe(400);
    expect(d.response_rate).toBeCloseTo(50, 6);
  });

  test('zero inbound yields no rate (0÷0 is not 0%)', async ({ page }) => {
    await seed(page, { comments: 0, dms: 0, responses: 0 });
    const d = await derived(page);
    expect(d.inbound).toBe(0);
    expect(d.response_rate).toBeNull();
  });

  test('a rate above 100% is shown as computed, not capped', async ({ page }) => {
    await seed(page, { comments: 100, dms: 0, responses: 150 });
    expect((await derived(page)).response_rate).toBeCloseTo(150, 6);
  });
});

test.describe('community pillar', () => {
  test('with the rate computable the pillar blends quant (60) + qual (25) + comment share (15)', async ({ page }) => {
    await seed(page); // rate 70% vs bench 75 → normScore = 70/75*75 = 70
    await page.evaluate(() => { S.platforms.instagram.qual.response_time = 2; saveLocal(); });
    const { community, expected } = await page.evaluate(() => {
      const r = scorePlatform('instagram');
      const rr = normScore(derive('instagram', 'current').response_rate, S.benchmarks.instagram.response_rate);
      const q = qualScore('instagram', ['response_time']);
      const cs = Math.min(100, (400 / 9305) * 100 * 7.5);
      return { community: r.pillars.community, expected: (rr * 60 + q * 25 + cs * 15) / 100 };
    });
    expect(community).toBeCloseTo(expected, 6);
  });

  test('without the quantitative inputs the pillar falls back to the original qual blend', async ({ page }) => {
    await seed(page, { comments: null, dms: null, responses: null });
    await page.evaluate(() => { S.platforms.instagram.qual.response_time = 1; saveLocal(); });
    const { community, expected } = await page.evaluate(() => {
      const r = scorePlatform('instagram');
      return { community: r.pillars.community, expected: qualScore('instagram', ['response_time']) };
    });
    // no comments entered → comment share null → pillar reweights to qual alone
    expect(community).toBeCloseTo(expected, 6);
  });

  test('the missing list names the response rate with its required inputs', async ({ page }) => {
    await seed(page, { dms: null });
    const missing = await page.evaluate(() => scorePlatform('instagram').missing);
    expect(missing.join('; ')).toContain('Community response rate (needs comments + DMs received + responses sent)');
  });

  test('a computable rate does not appear in the missing list', async ({ page }) => {
    await seed(page);
    const missing = await page.evaluate(() => scorePlatform('instagram').missing);
    expect(missing.join('; ')).not.toContain('Community response rate');
  });
});

test.describe('report rendering', () => {
  test('community KPI tiles appear only when their inputs exist', async ({ page }) => {
    await seed(page, { art: 42 });
    await page.getByTestId('tab-report').click();
    const card = page.getByTestId('scorecard-instagram');
    await expect(card).toContainText('Response rate');
    await expect(card).toContainText('70%');
    await expect(card).toContainText('Avg response (min)');
    await expect(card).toContainText('42');
  });

  test('no community inputs → no community tiles, no dash padding', async ({ page }) => {
    await seed(page, { comments: null, dms: null, responses: null });
    await page.getByTestId('tab-report').click();
    const card = page.getByTestId('scorecard-instagram');
    // the KPI grid stays clean; the benchmark table may still list the target row
    await expect(card.locator('.kpi-grid')).not.toContainText('Response rate');
    await expect(card).not.toContainText('Avg response (min)');
  });

  test('benchmark table gains a Response rate row against the editable target', async ({ page }) => {
    await seed(page);
    await page.getByTestId('tab-report').click();
    const card = page.getByTestId('scorecard-instagram');
    await expect(card).toContainText('Response rate %');
    await expect(card).toContainText('75'); // default benchmark placeholder
  });

  test('the benchmarks step exposes the editable response_rate target per platform', async ({ page }) => {
    await seed(page);
    await page.getByTestId('tab-bench').click();
    const input = page.getByTestId('bench-instagram-response_rate');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('75');
    await input.fill('90');
    await input.dispatchEvent('input');
    expect(await page.evaluate(() => S.benchmarks.instagram.response_rate)).toBe(90);
  });

  test('data step renders the Community section with the three new inputs', async ({ page }) => {
    await page.evaluate(() => { S.platforms.instagram.enabled = true; saveLocal(); });
    await page.getByTestId('tab-data').click();
    await page.getByTestId('acc-instagram').click();
    await expect(page.getByTestId('in-instagram-dms_received-cur')).toBeVisible();
    await expect(page.getByTestId('in-instagram-responses_sent-cur')).toBeVisible();
    await expect(page.getByTestId('in-instagram-avg_response_time-prev')).toBeVisible();
  });
});

test.describe('recommendation rules', () => {
  test('below-benchmark rate fires the quantitative rule with full arithmetic evidence', async ({ page }) => {
    await seed(page); // 70% < 75 default
    const rec = await page.evaluate(() =>
      buildRecs().find((r) => r.rule.id === 'response_gap'));
    expect(rec).toBeTruthy();
    expect(rec.evidence).toContain('70%');
    expect(rec.evidence).toContain('75%');
    expect(rec.evidence).toContain('350');
    expect(rec.evidence).toContain('500');
  });

  test('rate at/above benchmark fires nothing', async ({ page }) => {
    await seed(page, { responses: 400 }); // 80% ≥ 75
    const ids = await page.evaluate(() => buildRecs().map((r) => r.rule.id));
    expect(ids).not.toContain('response_gap');
  });

  test('the quantitative rule supersedes the qualitative one', async ({ page }) => {
    await seed(page); // rate computable
    await page.evaluate(() => { S.platforms.instagram.qual.response_time = 0; saveLocal(); });
    const ids = await page.evaluate(() => buildRecs().map((r) => r.rule.id));
    expect(ids).toContain('response_gap');
    expect(ids).not.toContain('qual_response');
  });

  test('without quantitative data the qualitative rule still works', async ({ page }) => {
    await seed(page, { comments: null, dms: null, responses: null });
    await page.evaluate(() => { S.platforms.instagram.qual.response_time = 0; saveLocal(); });
    const ids = await page.evaluate(() => buildRecs().map((r) => r.rule.id));
    expect(ids).toContain('qual_response');
  });
});

test.describe('executive summary integration', () => {
  test('the community bullet quotes responses, inbound and the target check', async ({ page }) => {
    await seed(page);
    await page.getByTestId('tab-report').click();
    const txt = await page.getByTestId('exec-summary-text').textContent();
    expect(txt).toContain('Community response: 350 of 500 inbound interactions answered — 70% (target 75%: not met).');
  });

  test('no community inputs → no community sentence, never padded', async ({ page }) => {
    await seed(page, { comments: null, dms: null, responses: null });
    await page.getByTestId('tab-report').click();
    const txt = await page.getByTestId('exec-summary-text').textContent();
    expect(txt).not.toContain('Community response:');
  });

  test('Arabic summary carries the same numbers', async ({ page }) => {
    await seed(page);
    await app.langToggle.click();
    await page.getByTestId('tab-report').click();
    const txt = await page.getByTestId('exec-summary-text').textContent();
    expect(txt).toContain('استجابة المجتمع');
    expect(txt).toContain('350');
    expect(txt).toContain('500');
    expect(txt).not.toMatch(/undefined|NaN/);
  });
});

test.describe('persistence and docs', () => {
  test('community metrics survive JSON save/load and localStorage', async ({ page }) => {
    await seed(page, { art: 33 });
    const saved = await app.state();
    await page.evaluate((st) => { S = hydrate(st); saveLocal(); }, saved);
    expect(await app.metric('instagram', 'current', 'dms_received')).toBe(100);
    expect(await app.metric('instagram', 'current', 'avg_response_time')).toBe(33);
  });

  test('an old save without community keys hydrates with the new benchmark default', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(() => {
      S = hydrate({ v: 1, platforms: { instagram: { enabled: true, metrics: { current: { followers: 10 } } } } });
      saveLocal();
    });
    expect(await page.evaluate(() => S.benchmarks.instagram.response_rate)).toBe(75);
    expect(await page.evaluate(() => derive('instagram', 'current').response_rate)).toBeNull();
    expect(errors).toEqual([]);
  });

  test('the Calculations tab documents the formula, the 0-vs-blank rule and the blend', async ({ page }) => {
    await page.getByTestId('tab-calc').click();
    const body = page.locator('#calcBody');
    await expect(body).toContainText('responses_sent ÷ (comments + dms_received) × 100');
    await expect(body).toContainText('a real zero must be entered as 0');
    await expect(body).toContainText('60% response rate vs benchmark');
    await expect(body).toContainText('Avg response time is reported with its trend (lower is better) but is not scored');
  });

  test('CSV template includes the community metric keys', async ({ page }) => {
    await page.evaluate(() => { S.platforms.instagram.enabled = true; saveLocal(); });
    const csv = await page.evaluate(() => csvTemplate());
    expect(csv).toContain('dms_received');
    expect(csv).toContain('responses_sent');
    expect(csv).toContain('avg_response_time');
  });

  test('pasted text maps DMs and responses through the review table', async ({ page }) => {
    await app.parsePaste('Messages received\n1,204\nResponses sent\n980');
    const dms = await app.findRow('metric:dms_received');
    const resp = await app.findRow('metric:responses_sent');
    expect(dms.value).toBe(1204);
    expect(resp.value).toBe(980);
  });
});
