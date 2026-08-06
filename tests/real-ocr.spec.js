// tests/real-ocr.spec.js — the mapper run against genuine Tesseract output
// (tests/fixtures/real-ocr.json is the literal OCR of the seven supplied
// Instagram Insights screenshots, bar artefacts and all).
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');
const REAL = require('./fixtures/real-ocr.json').text;

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

test.describe('genuine OCR text', () => {
  test('reads the headline numbers off the real screenshots', async () => {
    await app.parsePaste(REAL);
    const get = async (t) => (await app.findRow(t)) || {};
    expect((await get('metric:followers')).value).toBe(47527);
    expect((await get('metric:impressions')).value).toBe(3803119);
    expect((await get('metric:engagements')).value).toBe(5354);
    expect((await get('metric:net_followers')).value).toBe(645);
    expect((await get('metric:reach')).value).toBe(498967);
    expect((await get('metric:profile_visits')).value).toBe(46877);
    expect((await get('metric:link_clicks')).value).toBe(630);   // "(4 Bio link taps 630"
  });

  test('the three-tile row keeps its reading order', async () => {
    await app.parsePaste(REAL);
    // "Views  Net followers  Interactions" over "3,803,119  +645  5,354"
    expect((await app.findRow('metric:impressions')).value).toBe(3803119);
    expect((await app.findRow('metric:net_followers')).value).toBe(645);
    expect((await app.findRow('metric:engagements')).value).toBe(5354);
    // and Followers keeps its own, much smaller, value from the Audience tab
    expect((await app.findRow('metric:followers')).value).toBe(47527);
  });

  test('net followers is flagged as net, not gross new followers', async () => {
    await app.parsePaste(REAL);
    const net = await app.findRow('metric:net_followers');
    expect(net.quality).toContain('APPROX');
    expect(net.note).toContain('NOT gross');
  });

  test('gender, ages and countries survive the progress-bar artefacts', async () => {
    await app.parsePaste(REAL);
    expect((await app.findRow('gender:female')).value).toBe(63.5);   // "=D 63.5%"
    expect((await app.findRow('gender:male')).value).toBe(36.5);     // "EEE 36.5%"
    expect((await app.findRow('age:13-17')).value).toBe(0.9);        // "0 0.9%"
    expect((await app.findRow('age:25-34')).value).toBe(42.5);       // "I 42.5%"
    expect((await app.findRow('age:45-54')).value).toBe(11.0);       // "oo. 11.0%"
    expect((await app.findRow('age:55+')).value).toBeCloseTo(4.8, 2);// 3.6 + 1.2
    const rows = await app.reviewRows();
    const countries = rows.filter((r) => r.target === 'country:');
    expect(countries.map((c) => c.source)).toEqual(
      ['Jordan', 'Saudi Arabia', 'United States', 'United Arab Emirates', 'Iraq']
    );
    expect(countries[0].value).toBe(89.6);                           // "OO) 89.6%"
    expect(countries[4].value).toBe(0.8);                            // continues on the next screenshot
  });

  test('age shares still add up', async () => {
    await app.parsePaste(REAL);
    const rows = await app.reviewRows();
    const total = rows.filter((r) => r.target.startsWith('age:')).reduce((a, r) => a + r.value, 0);
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });

  test('"13.6% followers" never becomes the follower count', async ({ page }) => {
    await app.parsePaste(REAL);
    const rows = await app.reviewRows();
    expect(rows.filter((r) => r.target === 'metric:followers')).toHaveLength(1);
    expect(rows.find((r) => r.target === 'metric:followers').value).toBe(47527);
    await expect(page.getByTestId('ing-unmapped')).toContainText('percentage cannot fill');
  });

  test('the locations-chip ambiguity is declared as an assumption', async ({ page }) => {
    await app.parsePaste(REAL);
    await expect(page.getByTestId('ing-notes')).toContainText('[ASSUMPTION]');
    await expect(page.getByTestId('ing-notes')).toContainText('locations switch');
    // this batch shows "Countries Cities" — leftmost chip wins
    await expect(page.getByTestId('ing-notes')).toContainText('Countries');
  });

  test('per-post rows and time-of-day charts produce no metrics', async () => {
    await app.parsePaste(REAL);
    const rows = await app.reviewRows();
    // the Content tab lists dozens of per-post view counts; none may become a metric
    expect(rows.filter((r) => r.target === 'metric:posts')).toHaveLength(0);
    expect(rows.every((r) => Number.isFinite(r.value))).toBe(true);
    // nothing absurd slipped through
    expect(rows.filter((r) => r.target.startsWith('gender:'))).toHaveLength(2);
    // the Content tab's per-post view counts must not collide with account views
    expect(rows.filter((r) => r.target === 'metric:impressions')).toHaveLength(1);
    expect(rows.some((r) => r.quality.includes('CONFLICT'))).toBe(false);
    // "24m" is 24 minutes ago, not 24 million
    expect(rows.every((r) => r.value < 4_000_000)).toBe(true);
  });

  test('applying the whole batch lands correct values in the audit', async () => {
    await app.parsePaste(REAL);
    await app.apply();
    expect(await app.metric('instagram', 'current', 'followers')).toBe(47527);
    expect(await app.metric('instagram', 'current', 'reach')).toBe(498967);
    expect(await app.metric('instagram', 'current', 'engagements')).toBe(5354);
    const s = await app.state();
    expect(s.platforms.instagram.audience.gender.female).toBe(63.5);
    expect(s.platforms.instagram.audience.countries.length).toBeGreaterThanOrEqual(1);
  });

  test('derived rates computed from the imported values are right', async ({ page }) => {
    await app.parsePaste(REAL);
    await app.apply();
    const d = await page.evaluate(() => derive('instagram', 'current'));
    // ER by reach = 5,354 / 498,967 × 100
    expect(d.er_reach).toBeCloseTo((5354 / 498967) * 100, 4);
    // reach rate = 498,967 / 47,527 × 100
    expect(d.reach_rate).toBeCloseTo((498967 / 47527) * 100, 3);
  });
});
