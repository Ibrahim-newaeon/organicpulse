// tests/capture-kit.spec.js — competitor capture kit (roadmap item 5):
// profile-header + post-screen mapping, all-time-posts RISKY gating,
// summing across post screenshots, review rendering, apply into
// S.competitors with the capture date, honesty panel, AR.
//
// Mapper inputs here are CONSTRUCTED strings in the shapes Instagram's
// public web/mobile UI prints (same approach as the paste-mapper tests).
// The OCR→mapper plumbing itself is exercised by the real-fixture specs.
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

const HEADER = 'rival_profile.jpg';
const POST1 = 'rival_post1.jpg';
const POST2 = 'rival_post2.jpg';

/** Run the mapper in-page. files: [{name,text}] */
function mapShots(page, files, opts = {}) {
  return page.evaluate(([fs, o]) =>
    ingestCompetitorShots(fs, Object.assign({ platform: 'instagram', bucket: 'current', compId: 'c_x', compName: 'RivalOne', capturedAt: '2026-08-28' }, o)),
  [files, opts]);
}

test.describe('profile-header mapping', () => {
  test('horizontal header maps followers EXACT and all-time posts RISKY-off', async ({ page }) => {
    const r = await mapShots(page, [{ name: HEADER, text: '531 posts 152,304 followers 348 following' }]);
    const fol = r.findings.find((f) => f.target.key === 'followers');
    const posts = r.findings.find((f) => f.target.key === 'posts');
    expect(fol.value).toBe(152304);
    expect(fol.flag).toBeNull();
    expect(fol.include).toBe(true);
    expect(posts.value).toBe(531);
    expect(posts.flag).toBe('risky');
    expect(posts.include).toBe(false); // unchecked by default
    expect(posts.note).toContain('ALL-TIME');
  });

  test('value-above-label header (mobile) maps too', async ({ page }) => {
    const r = await mapShots(page, [{ name: HEADER, text: '531\nPosts\n152,304\nFollowers\n348\nFollowing' }]);
    expect(r.findings.find((f) => f.target.key === 'followers').value).toBe(152304);
    expect(r.findings.find((f) => f.target.key === 'posts').flag).toBe('risky');
  });

  test('K/M shorthand: uppercase maps as APPROX, lowercase is refused (timestamp rule)', async ({ page }) => {
    let r = await mapShots(page, [{ name: HEADER, text: '1.2M followers' }]);
    const fol = r.findings.find((f) => f.target.key === 'followers');
    expect(fol.value).toBe(1200000);
    expect(fol.flag).toBe('approx');
    r = await mapShots(page, [{ name: HEADER, text: '24m followers' }]);
    expect(r.findings.find((f) => f.target && f.target.key === 'followers')).toBeUndefined();
  });

  test('following count is surfaced as not-mapped, never silently dropped', async ({ page }) => {
    const r = await mapShots(page, [{ name: HEADER, text: '531 posts 152,304 followers 348 following' }]);
    expect(r.unmapped.join(' ')).toContain('following 348');
    expect(r.findings.some((f) => f.target.key === 'following')).toBe(false);
  });
});

test.describe('post-screen mapping and summing', () => {
  test('sums likes and comments across post screenshots with per-post evidence', async ({ page }) => {
    const r = await mapShots(page, [
      { name: POST1, text: '1,204 likes\nView all 56 comments' },
      { name: POST2, text: '987 likes\nView all 30 comments' },
    ]);
    const likes = r.findings.find((f) => f.target.key === 'likes_total');
    const com = r.findings.find((f) => f.target.key === 'comments_total');
    const sample = r.findings.find((f) => f.target.key === 'sample_posts');
    expect(likes.value).toBe(2191);
    expect(likes.evidence).toContain('1,204 + 987');
    expect(com.value).toBe(86);
    expect(com.flag).toBe('approx'); // visible comment counts can exclude replies
    expect(sample.value).toBe(2);
    expect(sample.evidence).toContain(POST1);
  });

  test('"Liked by X and N others" maps as N+1, APPROX with the inference noted', async ({ page }) => {
    const r = await mapShots(page, [{ name: POST1, text: 'Liked by ahmad.k and 1,233 others\nView all 41 comments' }]);
    const likes = r.findings.find((f) => f.target.key === 'likes_total');
    expect(likes.value).toBe(1234);
    expect(likes.flag).toBe('approx');
    expect(likes.note).toContain('named liker');
  });

  test('hidden likes on some posts → the sum stages RISKY as an understatement', async ({ page }) => {
    const r = await mapShots(page, [
      { name: POST1, text: '1,204 likes\nView all 56 comments' },
      { name: POST2, text: 'View all 30 comments' }, // likes hidden
    ]);
    const likes = r.findings.find((f) => f.target.key === 'likes_total');
    expect(likes.value).toBe(1204);
    expect(likes.flag).toBe('risky');
    expect(likes.include).toBe(false);
    expect(likes.note).toContain('understates');
    expect(r.findings.find((f) => f.target.key === 'sample_posts').value).toBe(2);
  });

  test('a mixed drop (header + posts) maps both kinds from their own files', async ({ page }) => {
    const r = await mapShots(page, [
      { name: HEADER, text: '531 posts 152,304 followers 348 following' },
      { name: POST1, text: '1,204 likes\nView all 56 comments' },
    ]);
    expect(r.findings.find((f) => f.target.key === 'followers').value).toBe(152304);
    expect(r.findings.find((f) => f.target.key === 'sample_posts').value).toBe(1);
    expect(r.findings.find((f) => f.target.key === 'likes_total').value).toBe(1204);
  });
});

test.describe('review and apply', () => {
  /** Stage mapper output exactly as runOCR's competitor branch does, then render. */
  async function stage(page, files, opts = {}) {
    await page.evaluate(([fs, o]) => {
      stageReset('Competitor screenshots');
      const r = ingestCompetitorShots(fs, Object.assign({ platform: 'instagram', bucket: 'current' }, o));
      STAGE.findings = dedupeFindings(r.findings);
      STAGE.unmapped = r.unmapped; STAGE.notes = r.notes;
      renderReview();
    }, [files, opts]);
  }

  test('competitor rows render fixed targets — no re-mapping selects', async ({ page }) => {
    await app.ensureSetup();
    await page.getByTestId('btn-ingest-shots').click();
    await stage(page, [{ name: HEADER, text: '152,304 followers' }],
      { compId: null, compName: 'FreshRival', capturedAt: '2026-08-28' });
    const row = page.locator('table.review tbody tr').first();
    await expect(row.getByTestId('rv-comp')).toContainText('FreshRival');
    await expect(row).toContainText('Current capture');
    await expect(row).toContainText('2026-08-28');
    expect(await row.locator('[data-rv="target"]').count()).toBe(0);
    expect(await row.locator('[data-rv="platform"]').count()).toBe(0);
    // include + value stay editable
    await expect(row.locator('[data-rv="inc"]')).toBeVisible();
    await expect(row.locator('[data-rv="value"]')).toHaveValue('152304');
  });

  test('apply writes into the existing competitor bucket with the capture date', async ({ page }) => {
    await page.evaluate(() => {
      S.competitors = [{ id: 'c_x', name: 'RivalOne', handle: '', platform: 'instagram', cur: {}, prev: {} }];
      saveLocal();
    });
    await app.ensureSetup();
    await page.getByTestId('btn-ingest-shots').click();
    await stage(page, [
      { name: HEADER, text: '152,304 followers' },
      { name: POST1, text: '1,204 likes\nView all 56 comments' },
    ], { compId: 'c_x', compName: 'RivalOne', capturedAt: '2026-08-27', bucket: 'previous' });
    await app.apply();
    const c = await page.evaluate(() => S.competitors[0]);
    expect(c.prev.followers).toBe(152304);
    expect(c.prev.likes_total).toBe(1204);
    expect(c.prev.comments_total).toBe(56);
    expect(c.prev.sample_posts).toBe(1);
    expect(c.prev.capturedAt).toBe('2026-08-27');
    expect(c.cur).toEqual({}); // the other bucket untouched
  });

  test('apply creates a new competitor exactly once for __new imports', async ({ page }) => {
    await app.ensureSetup();
    await page.getByTestId('btn-ingest-shots').click();
    await stage(page, [
      { name: HEADER, text: '152,304 followers' },
      { name: POST1, text: '1,204 likes\nView all 56 comments' },
    ], { compId: null, compName: 'FreshRival', capturedAt: '2026-08-28' });
    await app.apply();
    const comps = await page.evaluate(() => S.competitors);
    expect(comps).toHaveLength(1);
    expect(comps[0].name).toBe('FreshRival');
    expect(comps[0].cur.followers).toBe(152304);
    expect(comps[0].cur.capturedAt).toBe('2026-08-28');
  });

  test('the RISKY all-time posts row does not reach the audit unless enabled', async ({ page }) => {
    await page.evaluate(() => {
      S.competitors = [{ id: 'c_x', name: 'RivalOne', handle: '', platform: 'instagram', cur: {}, prev: {} }];
      saveLocal();
    });
    await app.ensureSetup();
    await page.getByTestId('btn-ingest-shots').click();
    await stage(page, [{ name: HEADER, text: '531 posts 152,304 followers' }],
      { compId: 'c_x', compName: 'RivalOne', capturedAt: '2026-08-28' });
    await app.apply();
    const c = await page.evaluate(() => S.competitors[0]);
    expect(c.cur.followers).toBe(152304);
    expect('posts' in c.cur).toBe(false); // risky row stayed unchecked
  });

  test('an already-stored value shows the overwrite warning', async ({ page }) => {
    await page.evaluate(() => {
      S.competitors = [{ id: 'c_x', name: 'RivalOne', handle: '', platform: 'instagram',
        cur: { capturedAt: '2026-08-20', followers: 150000 }, prev: {} }];
      saveLocal();
    });
    await app.ensureSetup();
    await page.getByTestId('btn-ingest-shots').click();
    await stage(page, [{ name: HEADER, text: '152,304 followers' }],
      { compId: 'c_x', compName: 'RivalOne', capturedAt: '2026-08-28' });
    await expect(page.getByTestId('rv-overwrite')).toContainText('150,000');
  });

  test('competitor import is logged in provenance and feeds the benchmark card', async ({ page }) => {
    await page.evaluate(() => {
      S.meta.client = 'SmartBuy'; S.meta.curStart = '2026-07-01'; S.meta.curEnd = '2026-07-31';
      S.platforms.instagram.enabled = true;
      setMetric('instagram', 'current', 'followers', 309574);
      S.competitors = [{ id: 'c_x', name: 'RivalOne', handle: '', platform: 'instagram', cur: {}, prev: {} }];
      saveLocal();
    });
    await app.ensureSetup();
    await page.getByTestId('btn-ingest-shots').click();
    await stage(page, [{ name: HEADER, text: '152,304 followers' }],
      { compId: 'c_x', compName: 'RivalOne', capturedAt: '2026-08-28' });
    await app.apply();
    const log = await page.evaluate(() => S.importLog[S.importLog.length - 1]);
    expect(log.source).toBe('Competitor screenshots');
    await page.getByTestId('tab-report').click();
    const card = page.getByTestId('comp-card-instagram');
    await expect(card).toContainText('152,304');
    await expect(card).toContainText('captured from public profile on 2026-08-28');
  });
});

test.describe('wizard mode UI', () => {
  test('competitor mode reveals the kit, honesty panel and capture-date fields', async ({ page }) => {
    await app.ensureSetup();
    await page.getByTestId('btn-ingest-shots').click();
    await expect(page.getByTestId('comp-kit')).toBeHidden();
    await page.getByTestId('shot-mode-comp').click();
    await expect(page.getByTestId('comp-kit')).toBeVisible();
    const honesty = page.getByTestId('comp-kit-honesty');
    await expect(honesty).toContainText('violates Meta');
    await expect(honesty).toContainText('will not scrape');
    await expect(honesty).toContainText('third-party trackers');
    // current capture date defaults to today
    const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    await expect(page.getByTestId('ck-date-current')).toHaveValue(today);
    // bucket heads relabeled
    await expect(page.getByTestId('bucket-current')).toContainText('Current capture');
    await page.getByTestId('shot-mode-my').click();
    await expect(page.getByTestId('comp-kit')).toBeHidden();
    await expect(page.getByTestId('bucket-current')).toContainText('Current period');
  });

  test('the competitor picker lists same-platform competitors plus New', async ({ page }) => {
    await page.evaluate(() => {
      S.competitors = [
        { id: 'c_a', name: 'RivalOne', handle: '', platform: 'instagram', cur: {}, prev: {} },
        { id: 'c_b', name: 'FbRival', handle: '', platform: 'facebook', cur: {}, prev: {} },
      ];
      saveLocal();
    });
    await app.ensureSetup();
    await page.getByTestId('btn-ingest-shots').click();
    await page.getByTestId('shot-mode-comp').click();
    const opts = await page.getByTestId('ck-competitor').locator('option').allTextContents();
    expect(opts.join(' ')).toContain('RivalOne');
    expect(opts.join(' ')).not.toContain('FbRival'); // other platform
    expect(opts[opts.length - 1]).toContain('New competitor');
    // switching platform re-filters
    await page.locator('#shotPlatform').selectOption('facebook');
    const opts2 = await page.getByTestId('ck-competitor').locator('option').allTextContents();
    expect(opts2.join(' ')).toContain('FbRival');
    expect(opts2.join(' ')).not.toContain('RivalOne');
  });

  test('Arabic mapper output carries the same numbers and no undefined', async ({ page }) => {
    await app.langToggle.click();
    const r = await mapShots(page, [
      { name: HEADER, text: '531 posts 152,304 followers' },
      { name: POST1, text: '1,204 likes\nView all 56 comments' },
    ]);
    const fol = r.findings.find((f) => f.target.key === 'followers');
    expect(fol.value).toBe(152304);
    expect(fol.srcLabel).toContain('المتابعون');
    const all = JSON.stringify(r);
    expect(all).not.toMatch(/undefined|NaN/);
  });
});
