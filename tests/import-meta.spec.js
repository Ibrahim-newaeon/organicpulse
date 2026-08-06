// tests/import-meta.spec.js — Meta Business Suite export → review → apply
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

test.describe('Instagram post-level export', () => {
  test('detects the platform, splits by publish time and sums exactly', async () => {
    // June file: current = June 2026, previous = May 2026 (no rows expected in May)
    await app.setPeriods('2026-06-01', '2026-06-30', '2026-05-01', '2026-05-31');
    await app.importMeta('ig');

    await expect(app.page.getByTestId('ing-notes')).toContainText('Instagram');

    const posts = await app.findRow('metric:posts');
    expect(posts).toBeTruthy();
    expect(posts.platform).toBe('instagram');
    expect(posts.value).toBe(27);              // all 27 rows publish in June 2026
    expect(posts.quality).toContain('EXACT');

    const eng = await app.findRow('metric:engagements');
    const likes = await app.findRow('metric:likes');
    const comments = await app.findRow('metric:comments');
    const shares = await app.findRow('metric:shares');
    const saves = await app.findRow('metric:saves');
    // engagements must equal the sum of its own components, not an independent guess
    expect(eng.value).toBeCloseTo(likes.value + comments.value + shares.value + saves.value, 2);
  });

  test('format mix is computed from Post type and totals 100%', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    const video = await app.findRow('metric:pct_video');
    const carousel = await app.findRow('metric:pct_carousel');
    const stat = await app.findRow('metric:pct_static');
    expect(video.value + carousel.value + stat.value).toBeCloseTo(100, 1);
    // 8 reels of 27 rows
    expect(video.value).toBeCloseTo((8 / 27) * 100, 1);
    expect(video.evidence).toContain('8/27');
  });

  test('summed per-post reach is flagged RISKY and unchecked by default', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    const reach = await app.findRow('metric:reach');
    expect(reach.quality).toContain('RISKY');
    expect(reach.include).toBe(false);
    expect(reach.note.toLowerCase()).toContain('overstates');
    await expect(app.page.getByTestId('ing-risky')).toBeVisible();
  });

  test('post-attributed follows are flagged APPROX with an explanation', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    const follows = await app.findRow('metric:follows_gained');
    expect(follows.quality).toContain('APPROX');
    expect(follows.note).toContain('undercounts');
  });

  test('applying writes only checked rows into state', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    await app.apply();
    expect(await app.metric('instagram', 'current', 'posts')).toBe(27);
    // reach was RISKY → unchecked → must NOT be in state
    expect(await app.metric('instagram', 'current', 'reach')).toBeNull();
    const s = await app.state();
    expect(s.platforms.instagram.enabled).toBe(true);
    expect(s.importLog).toHaveLength(1);
    expect(s.importLog[0].platforms).toContain('instagram');
  });

  test('rows outside both periods are excluded and reported, never silently dropped', async () => {
    // a window that contains none of the June rows
    await app.setPeriods('2026-07-01', '2026-07-31');
    await app.importMeta('ig');
    await expect(app.page.getByTestId('ing-notes')).toContainText('outside');
    const rows = await app.reviewRows();
    expect(rows).toHaveLength(0);
  });

  test('with no dates set, everything lands in current and the assumption is stated', async () => {
    await app.importMeta('ig');
    await expect(app.page.getByTestId('ing-notes')).toContainText('[ASSUMPTION]');
    const posts = await app.findRow('metric:posts');
    expect(posts.period).toBe('current');
    expect(posts.value).toBe(27);
    await expect(app.page.getByTestId('btn-meta-range')).toBeVisible();
  });

  test('the filename range button sets the current period', async () => {
    await app.importMeta('ig');
    await app.page.getByTestId('btn-meta-range').click();
    const s = await app.state();
    expect(s.meta.curStart).toBe('2026-06-01');
    expect(s.meta.curEnd).toBe('2026-06-30');
  });
});

test.describe('Facebook Page export', () => {
  test('detects Facebook and defaults to organic-only columns', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('fb');
    await expect(app.page.getByTestId('ing-notes')).toContainText('Facebook');
    await expect(app.page.getByTestId('ing-notes')).toContainText('Organic');
    const views = await app.findRow('metric:impressions');
    expect(views.evidence).toContain('Views from Organic posts');
  });

  test('unchecking organic-only switches to the total columns and a bigger number', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('fb');
    const organic = (await app.findRow('metric:impressions')).value;
    await app.page.locator('#metaOrganic').uncheck();
    await app.page.waitForTimeout(200);
    const total = (await app.findRow('metric:impressions')).value;
    expect(total).toBeGreaterThan(organic);   // boosted delivery is additive
    expect((await app.findRow('metric:impressions')).evidence).not.toContain('Organic');
  });

  test('Facebook-only metrics appear and Instagram-only ones do not', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('fb');
    expect(await app.findRow('metric:negative_feedback')).toBeTruthy();
    expect(await app.findRow('metric:video_3s_views')).toBeTruthy();
    expect(await app.findRow('metric:saves')).toBeFalsy();  // no Saves column in the FB export
  });

  test('engagements come from the native combined column', async () => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('fb');
    const eng = await app.findRow('metric:engagements');
    expect(eng.evidence).toContain('Reactions, Comments and Shares');
  });
});

test.describe('negative cases', () => {
  test('a non-Meta CSV is refused with an explanation, not a bad mapping', async ({ page }) => {
    await app.btnMeta.click();
    await app.dialog.waitFor();
    await page.evaluate(() => {
      const rows = parseDelimited('foo,bar\n1,2\n');
      const res = ingestMetaRows(rows, 'random.csv', {});
      stageReset('test'); STAGE.findings = res.findings; STAGE.unmapped = res.unmapped; STAGE.notes = res.notes;
      renderReview();
    });
    await expect(page.getByTestId('ing-notes')).toContainText('Post ID');
    await expect(page.getByTestId('btn-ing-apply')).toBeDisabled();
  });

  test('an empty file produces no findings and no crash', async ({ page }) => {
    const res = await page.evaluate(() => ingestMetaRows([], 'empty.csv', {}));
    expect(res.findings).toHaveLength(0);
    expect(res.ok).toBe(false);
  });

  test('select-all reflects the RISKY row being off, and toggling it off disables apply', async ({ page }) => {
    await app.setPeriods('2026-06-01', '2026-06-30');
    await app.importMeta('ig');
    // one row (summed reach) is intentionally unchecked, so the header box is not "all"
    await expect(page.locator('#rvAll')).not.toBeChecked();
    await page.locator('#rvAll').check();      // select every row, including the flagged one
    await expect(app.applyBtn).toBeEnabled();
    await page.locator('#rvAll').uncheck();    // clear every row
    await expect(app.applyBtn).toBeDisabled();
  });
});
