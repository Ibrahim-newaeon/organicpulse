// tests/formats.spec.js — per-format (Reel / Carousel / Static / Video) metrics
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

const stats = (page, p = 'instagram', per = 'current') =>
  page.evaluate(([a, b]) => formatStats(a, b), [p, per]);

test.describe('classification', () => {
  const cases = [
    ['IG reel', 'reel'], ['IG image', 'static'], ['IG carousel', 'carousel'],
    ['Videos', 'video'], ['Photos', 'static'], ['Stories', 'story'],
    ['Text', 'text'], ['Reels', 'reel'], ['Mystery', 'other'],
  ];
  for (const [input, expected] of cases) {
    test(`classifyFormat("${input}") → ${expected}`, async ({ page }) => {
      expect(await page.evaluate((v) => classifyFormat(v), input)).toBe(expected);
    });
  }

  test('the coarse buckets still fold reels into video, so format mix is unchanged', async ({ page }) => {
    expect(await page.evaluate(() => classifyPostType('IG reel'))).toBe('video');
    expect(await page.evaluate(() => classifyPostType('Videos'))).toBe('video');
    expect(await page.evaluate(() => classifyPostType('Text'))).toBe('static');
  });
});

test.describe('Meta import → per-format rows', () => {
  test('the Instagram export produces one row per format with exact counts', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    const rows = await app.reviewRows();
    const fmt = rows.filter((r) => r.target.startsWith('format:'));
    const by = Object.fromEntries(fmt.map((r) => [r.target.replace('format:', ''), r]));
    expect(by.reel.value).toBe(8);       // 8 IG reel rows
    expect(by.carousel.value).toBe(4);   // 4 IG carousel rows
    expect(by.static.value).toBe(15);    // 15 IG image rows
    expect(by.reel.value + by.carousel.value + by.static.value).toBe(27);
    expect(by.reel.quality).toContain('EXACT');
  });

  test('each row carries its views and engagement totals as evidence', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    const reel = (await app.reviewRows()).find((r) => r.target === 'format:reel');
    expect(reel.evidence).toMatch(/views/i);
    expect(reel.evidence).toMatch(/engagements/i);
    expect(reel.evidence).toContain('8 rows');
  });

  test('applying stores the full per-format detail, not just the count', async ({ page }) => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    await app.apply();
    const d = await page.evaluate(() => getFormat('instagram', 'current', 'reel'));
    expect(d.posts).toBe(8);
    expect(d.views).toBeGreaterThan(0);
    expect(d.eng).toBeGreaterThan(0);
    expect(d.reach).toBeUndefined();  // never imported — summing per-post reach is not unique reach
  });

  test('format posts reconcile with the posts metric from the same import', async ({ page }) => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    await app.apply();
    const total = await app.metric('instagram', 'current', 'posts');
    const st = await stats(page);
    expect(st.totals.posts).toBe(total);
  });

  test('format engagements reconcile with the engagements metric', async ({ page }) => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    await app.apply();
    const total = await app.metric('instagram', 'current', 'engagements');
    const st = await stats(page);
    expect(st.totals.eng).toBeCloseTo(total, 2);
  });

  test('the Facebook export splits video and static', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('fb');
    const rows = await app.reviewRows();
    const by = Object.fromEntries(
      rows.filter((r) => r.target.startsWith('format:')).map((r) => [r.target.replace('format:', ''), r.value])
    );
    expect(by.video).toBe(8);    // 8 "Videos" rows
    expect(by.static).toBe(24);  // 24 "Photos" rows
  });

  test('a format row can be re-targeted or skipped like any other', async ({ page }) => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    const target = await page.evaluate(() => {
      const f = STAGE.findings.find((x) => x.target.type === 'format');
      return { id: f.id, key: f.target.key };
    });
    await page.locator(`tr[data-fid="${target.id}"] [data-rv="target"]`).selectOption('skip:');
    await app.apply();
    expect(await page.evaluate((k) => getFormat('instagram', 'current', k), target.key)).toBeNull();
    // the other formats still applied
    const st = await stats(page);
    expect(st.rows.length).toBeGreaterThan(0);
    expect(st.rows.some((r) => r.key === target.key)).toBe(false);
  });
});

test.describe('derived per-format maths', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      setFormat('instagram', 'current', 'reel', { posts: 10, views: 100000, eng: 6000 });
      setFormat('instagram', 'current', 'static', { posts: 30, views: 60000, eng: 2000 });
      saveLocal();
    });
  });

  test('shares, averages and ER are computed from the stored values', async ({ page }) => {
    const st = await stats(page);
    const reel = st.rows.find((r) => r.key === 'reel');
    const stat = st.rows.find((r) => r.key === 'static');
    expect(reel.shareOutput).toBeCloseTo(25, 6);       // 10 / 40
    expect(reel.shareEng).toBeCloseTo(75, 6);          // 6000 / 8000
    expect(reel.avgViews).toBeCloseTo(10000, 6);
    expect(reel.erViews).toBeCloseTo(6, 6);            // 6000 / 100000
    expect(stat.erViews).toBeCloseTo(3.3333, 3);
  });

  test('the index is share of engagement over share of output', async ({ page }) => {
    const st = await stats(page);
    expect(st.rows.find((r) => r.key === 'reel').index).toBeCloseTo(3, 6);      // 75 / 25
    expect(st.rows.find((r) => r.key === 'static').index).toBeCloseTo(0.3333, 3); // 25 / 75
  });

  test('missing fields yield null rather than a fabricated zero', async ({ page }) => {
    await page.evaluate(() => { setFormat('instagram', 'current', 'carousel', { posts: 5 }); });
    const st = await stats(page);
    const c = st.rows.find((r) => r.key === 'carousel');
    expect(c.views).toBeNull();
    expect(c.avgViews).toBeNull();
    expect(c.erViews).toBeNull();
    expect(c.shareEng).toBeNull();
  });

  test('ER by reach appears only when reach was entered manually', async ({ page }) => {
    let st = await stats(page);
    expect(st.rows.find((r) => r.key === 'reel').erReach).toBeNull();
    await page.evaluate(() => setFormat('instagram', 'current', 'reel', { posts: 10, views: 100000, eng: 6000, reach: 50000 }));
    st = await stats(page);
    expect(st.rows.find((r) => r.key === 'reel').erReach).toBeCloseTo(12, 6);
  });

  test('an empty platform reports no data instead of zeros', async ({ page }) => {
    const st = await stats(page, 'youtube');
    expect(st.has).toBe(false);
    expect(st.rows).toHaveLength(0);
  });
});

test.describe('report card', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => {
      S.platforms.instagram.enabled = true;
      setFormat('instagram', 'current', 'reel', { posts: 10, views: 100000, eng: 6000 });
      setFormat('instagram', 'current', 'static', { posts: 30, views: 60000, eng: 2000 });
      saveLocal();
    });
  });

  test('the format table renders with the index and a plain-language read', async ({ page }) => {
    await page.getByTestId('tab-report').click();
    const card = page.getByTestId('format-report-instagram');
    await expect(card).toBeVisible();
    await expect(card).toContainText('3.00');            // reel index
    await expect(card).toContainText('75%');             // reel share of engagement
    await expect(card.locator('.narrative')).toContainText('Reels');
  });

  test('the index is labelled as a tool definition, not a platform metric', async ({ page }) => {
    await page.getByTestId('tab-report').click();
    await expect(page.getByTestId('format-report-instagram')).toContainText('defined in this tool');
  });

  test('no card at all when the platform has no format data', async ({ page }) => {
    await page.evaluate(() => { S.platforms.instagram.formats = emptyFormats(); saveLocal(); });
    await page.getByTestId('tab-report').click();
    await expect(page.getByTestId('format-report-instagram')).toHaveCount(0);
  });

  test('the formulas are documented in the Calculations tab', async ({ page }) => {
    await page.getByTestId('tab-calc').click();
    const body = page.locator('#calcBody');
    await expect(body).toContainText('Format index');
    await expect(body).toContainText('share of engagement % ÷ share of output %');
  });
});

test.describe('format-driven recommendations', () => {
  test('an over-performing minority format triggers a P1 with its numbers', async ({ page }) => {
    await page.evaluate(() => {
      S.platforms.instagram.enabled = true;
      setFormat('instagram', 'current', 'reel', { posts: 10, views: 100000, eng: 6000 });
      setFormat('instagram', 'current', 'static', { posts: 30, views: 60000, eng: 2000 });
      saveLocal();
    });
    await page.getByTestId('tab-recs').click();
    const rec = page.getByTestId('rec-instagram-format_underused');
    await expect(rec).toBeVisible();
    await expect(rec).toContainText('25%');
    await expect(rec).toContainText('75%');
    await expect(rec).toContainText('3.00');
  });

  test('a bloated under-performing format triggers the mirror rule', async ({ page }) => {
    await page.evaluate(() => {
      S.platforms.instagram.enabled = true;
      setFormat('instagram', 'current', 'reel', { posts: 10, views: 100000, eng: 6000 });
      setFormat('instagram', 'current', 'static', { posts: 30, views: 60000, eng: 2000 });
      saveLocal();
    });
    await page.getByTestId('tab-recs').click();
    await expect(page.getByTestId('rec-instagram-format_overused')).toBeVisible();
  });

  test('balanced formats trigger neither rule', async ({ page }) => {
    await page.evaluate(() => {
      S.platforms.instagram.enabled = true;
      setFormat('instagram', 'current', 'reel', { posts: 20, views: 50000, eng: 4000 });
      setFormat('instagram', 'current', 'static', { posts: 20, views: 50000, eng: 4000 });
      saveLocal();
    });
    await page.getByTestId('tab-recs').click();
    await expect(page.getByTestId('rec-instagram-format_underused')).toHaveCount(0);
    await expect(page.getByTestId('rec-instagram-format_overused')).toHaveCount(0);
  });

  test('a single format with no comparison triggers nothing', async ({ page }) => {
    await page.evaluate(() => {
      S.platforms.instagram.enabled = true;
      setFormat('instagram', 'current', 'reel', { posts: 10, views: 100000, eng: 6000 });
      saveLocal();
    });
    await page.getByTestId('tab-recs').click();
    await expect(page.getByTestId('rec-instagram-format_underused')).toHaveCount(0);
  });
});

test.describe('manual entry in step 2', () => {
  test('typing a value stores it and survives a reload', async ({ page }) => {
    await page.getByTestId('tab-data').click();
    await page.getByTestId('acc-instagram').click();
    await page.getByTestId('fmt-instagram-reel-posts-cur').fill('12');
    await page.getByTestId('fmt-instagram-reel-eng-cur').fill('900');
    await page.waitForTimeout(200);
    let d = await page.evaluate(() => getFormat('instagram', 'current', 'reel'));
    expect(d).toEqual({ posts: 12, eng: 900 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('html[data-ingest-ready]', { state: 'attached' });
    d = await page.evaluate(() => getFormat('instagram', 'current', 'reel'));
    expect(d).toEqual({ posts: 12, eng: 900 });
  });

  test('clearing a field removes it rather than storing zero', async ({ page }) => {
    await page.getByTestId('tab-data').click();
    await page.getByTestId('acc-instagram').click();
    await page.getByTestId('fmt-instagram-reel-posts-cur').fill('12');
    await page.waitForTimeout(150);
    await page.getByTestId('fmt-instagram-reel-posts-cur').fill('');
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => getFormat('instagram', 'current', 'reel'))).toBeNull();
  });

  test('the previous-period column is separate from the current one', async ({ page }) => {
    await page.getByTestId('tab-data').click();
    await page.getByTestId('acc-instagram').click();
    await page.getByTestId('fmt-instagram-reel-posts-cur').fill('12');
    await page.getByTestId('fmt-instagram-reel-posts-prev').fill('7');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => getFormat('instagram', 'current', 'reel').posts)).toBe(12);
    expect(await page.evaluate(() => getFormat('instagram', 'previous', 'reel').posts)).toBe(7);
  });

  test('only formats that exist on the platform are offered', async ({ page }) => {
    await page.evaluate(() => { S.platforms.youtube.enabled = true; saveLocal(); });
    await page.getByTestId('tab-data').click();
    await page.getByTestId('acc-youtube').click();
    await expect(page.getByTestId('format-entry-youtube')).toBeVisible();
    await expect(page.getByTestId('fmt-youtube-carousel-posts-cur')).toHaveCount(0);
    await expect(page.getByTestId('fmt-youtube-reel-posts-cur')).toHaveCount(1);
  });
});

test.describe('state safety', () => {
  test('a saved file with no formats key loads without error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.evaluate(() => {
      S = hydrate({ v: 1, platforms: { instagram: { enabled: true, metrics: { current: { followers: 10 } } } } });
      saveLocal();
    });
    await page.getByTestId('tab-data').click();
    await page.getByTestId('tab-report').click();
    await page.getByTestId('tab-recs').click();
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => getFormat('instagram', 'current', 'reel'))).toBeNull();
  });

  test('format data round-trips through save and load', async ({ page }) => {
    await page.evaluate(() => {
      setFormat('instagram', 'current', 'reel', { posts: 4, views: 900, eng: 40 });
      saveLocal();
    });
    const saved = await app.state();
    await page.evaluate((st) => { S = hydrate(st); saveLocal(); }, saved);
    expect(await page.evaluate(() => getFormat('instagram', 'current', 'reel'))).toEqual({ posts: 4, views: 900, eng: 40 });
  });
});
