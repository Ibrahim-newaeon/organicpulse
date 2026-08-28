// tests/competitors.spec.js — competitor benchmark (roadmap item 4):
// entry CRUD + persistence, provenance enforcement (undated = never compared),
// visible-engagement basis parity, share math, growth window flags, rec rule, AR.
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

/** Client seed: 309,574 followers; likes 8,000 + comments 400 over 20 posts → 420 visible eng/post. */
async function seedClient(page, { likes = 8000, comments = 400, posts = 20, prevFollowers = 300000 } = {}) {
  await page.evaluate(([li, co, po, pf]) => {
    S.meta.client = 'SmartBuy'; S.meta.curStart = '2026-07-01'; S.meta.curEnd = '2026-07-31';
    S.platforms.instagram.enabled = true;
    setMetric('instagram', 'current', 'followers', 309574);
    if (pf !== null) setMetric('instagram', 'previous', 'followers', pf);
    if (li !== null) setMetric('instagram', 'current', 'likes', li);
    if (co !== null) setMetric('instagram', 'current', 'comments', co);
    if (po !== null) setMetric('instagram', 'current', 'posts', po);
    saveLocal();
  }, [likes, comments, posts, prevFollowers]);
}

/** One dated competitor: 150,000 followers, 30 posts, 10-post sample with 5,500+500 → 600 eng/post. */
async function addComp(page, over = {}) {
  return page.evaluate((o) => {
    const c = {
      id: 'c_test' + (S.competitors || []).length, name: 'RivalOne', handle: '@rival',
      platform: 'instagram',
      cur: { capturedAt: '2026-07-31', followers: 150000, posts: 30, sample_posts: 10, likes_total: 5500, comments_total: 500 },
      prev: { capturedAt: '2026-07-01', followers: 140000 },
    };
    Object.keys(o).forEach((k) => { if (k !== 'cur' && k !== 'prev') c[k] = o[k]; });
    if (o.cur) c.cur = Object.assign({}, c.cur, o.cur);       // merge, never replace
    if (o.prev === null) c.prev = {}; else if (o.prev) c.prev = Object.assign({}, c.prev, o.prev);
    S.competitors = S.competitors || []; S.competitors.push(c);
    saveLocal();
    return c.id;
  }, over);
}

const stats = (page) => page.evaluate(() => compStats('instagram'));

test.describe('stats math — entered values only', () => {
  test('visible eng/post uses the same likes+comments basis on both sides', async ({ page }) => {
    await seedClient(page);
    await addComp(page);
    const st = await stats(page);
    const client = st.rows.find((r) => r.isClient);
    const rival = st.rows.find((r) => !r.isClient);
    expect(client.engPerPost).toBeCloseTo((8000 + 400) / 20, 6); // 420
    expect(rival.engPerPost).toBeCloseTo((5500 + 500) / 10, 6);  // 600
  });

  test('follower share is exact and sums to 100 across included accounts', async ({ page }) => {
    await seedClient(page);
    await addComp(page);
    const st = await stats(page);
    const shares = st.rows.map((r) => r.folShare);
    expect(shares[0]).toBeCloseTo(309574 / 459574 * 100, 4);
    expect(shares[1]).toBeCloseTo(150000 / 459574 * 100, 4);
    expect(shares[0] + shares[1]).toBeCloseTo(100, 6);
  });

  test('engagement share is an estimate: engPerPost × posts over the tracked set', async ({ page }) => {
    await seedClient(page);
    await addComp(page);
    const st = await stats(page);
    const client = st.rows.find((r) => r.isClient);
    // client 420×20 = 8,400 · rival 600×30 = 18,000 → client share 31.8%
    expect(client.engEst).toBeCloseTo(8400, 6);
    expect(client.engShare).toBeCloseTo(8400 / 26400 * 100, 4);
  });

  test('competitor growth needs two dated captures', async ({ page }) => {
    await seedClient(page);
    await addComp(page); // 140,000 → 150,000 = +7.14%
    let st = await stats(page);
    expect(st.rows[1].growth).toBeCloseTo((150000 - 140000) / 140000 * 100, 4);
    await page.evaluate(() => { S.competitors = []; saveLocal(); });
    await addComp(page, { prev: { capturedAt: '', followers: 140000 } }); // undated previous
    st = await stats(page);
    expect(st.rows[1].growth).toBeNull();
  });

  test('a capture window ≠ audit period (±3 days) flags the growth', async ({ page }) => {
    await seedClient(page);
    await addComp(page); // 07-01 → 07-31 = 30 days vs 31-day period → within tolerance
    let st = await stats(page);
    expect(st.rows[1].growthFlag).toBe(false);
    await page.evaluate(() => { S.competitors = []; saveLocal(); });
    await addComp(page, { prev: { capturedAt: '2026-06-15', followers: 140000 } }); // 46 days
    st = await stats(page);
    expect(st.rows[1].growthFlag).toBe(true);
  });
});

test.describe('provenance enforcement — no date, no comparison', () => {
  test('an undated current capture is listed but its values never compared', async ({ page }) => {
    await seedClient(page);
    await addComp(page, { cur: { capturedAt: '' } });
    const st = await stats(page);
    const rival = st.rows.find((r) => !r.isClient);
    expect(rival.missingDate).toBe(true);
    expect(rival.followers).toBeNull();
    expect(rival.engPerPost).toBeNull();
    expect(rival.folShare).toBeNull();
    await page.getByTestId('tab-report').click();
    await expect(page.getByTestId('comp-nodate')).toBeVisible();
  });

  test('the report stamps every dated competitor with its capture dates', async ({ page }) => {
    await seedClient(page);
    await addComp(page);
    await page.getByTestId('tab-report').click();
    const prov = page.getByTestId('comp-provenance');
    await expect(prov).toContainText('RivalOne — captured from public profile on 2026-07-31');
    await expect(prov).toContainText('previous capture 2026-07-01');
    await expect(prov).toContainText('2026-07-01 → 2026-07-31'); // client basis line
  });
});

test.describe('no proxy filling', () => {
  test('client without likes/comments is excluded from the engagement share and named', async ({ page }) => {
    await seedClient(page, { likes: null }); // total engagements may exist elsewhere — never substituted
    await page.evaluate(() => { setMetric('instagram', 'current', 'engagements', 9305); saveLocal(); });
    await addComp(page);
    const st = await stats(page);
    const client = st.rows.find((r) => r.isClient);
    expect(client.engPerPost).toBeNull();
    expect(client.engShare).toBeNull();
    expect(st.excludedEng).toContain('SmartBuy');
    await page.getByTestId('tab-report').click();
    await expect(page.getByTestId('comp-excluded')).toContainText('SmartBuy');
  });

  test('a competitor with hidden likes shows — cells, keeps follower comparison', async ({ page }) => {
    await seedClient(page);
    await addComp(page, { cur: { likes_total: null } });
    await page.evaluate(() => { delete S.competitors[0].cur.likes_total; saveLocal(); });
    const st = await stats(page);
    const rival = st.rows.find((r) => !r.isClient);
    expect(rival.engPerPost).toBeNull();
    expect(rival.folShare).not.toBeNull();
    expect(st.excludedEng).toContain('RivalOne');
  });

  test('single-account shares are never shown (100% of itself is meaningless)', async ({ page }) => {
    await seedClient(page, { likes: null, comments: null });
    await page.evaluate(() => {
      setMetric('instagram', 'current', 'followers', null); saveLocal();
    });
    await addComp(page);
    const st = await stats(page);
    const rival = st.rows.find((r) => !r.isClient);
    expect(rival.folShare).toBeNull(); // only account with followers
    expect(rival.engShare).toBeNull(); // only account with engagement
  });
});

test.describe('report card', () => {
  test('appears only when the platform has competitors', async ({ page }) => {
    await seedClient(page);
    await page.getByTestId('tab-report').click();
    await expect(page.getByTestId('comp-card-instagram')).toHaveCount(0);
    await addComp(page);
    await page.evaluate(() => renderReport());
    await expect(page.getByTestId('comp-card-instagram')).toBeVisible();
  });

  test('client row is marked and the assumption is printed literally', async ({ page }) => {
    await seedClient(page);
    await addComp(page);
    await page.getByTestId('tab-report').click();
    await expect(page.getByTestId('comp-row-client')).toContainText('SmartBuy');
    await expect(page.getByTestId('comp-row-client')).toContainText('client');
    await expect(page.getByTestId('comp-assumption')).toContainText('[ASSUMPTION]');
    await expect(page.getByTestId('comp-card-instagram')).toContainText('likes + comments only');
  });

  test('another platform\'s competitors never leak into the card', async ({ page }) => {
    await seedClient(page);
    await addComp(page, { platform: 'facebook', id: 'c_fb' });
    await page.getByTestId('tab-report').click();
    await expect(page.getByTestId('comp-card-instagram')).toHaveCount(0);
  });
});

test.describe('entry UI', () => {
  test('add, fill, and the values land in state', async ({ page }) => {
    await seedClient(page);
    await page.getByTestId('tab-data').click();
    await page.getByTestId('btn-comp-add').click();
    const id = await page.evaluate(() => S.competitors[0].id);
    await page.getByTestId(`comp-name-${id}`).fill('RivalTwo');
    await page.getByTestId(`comp-${id}-capturedAt-cur`).fill('2026-07-30');
    await page.getByTestId(`comp-${id}-followers-cur`).fill('98000');
    const c = await page.evaluate(() => S.competitors[0]);
    expect(c.name).toBe('RivalTwo');
    expect(c.cur.capturedAt).toBe('2026-07-30');
    expect(c.cur.followers).toBe(98000);
  });

  test('deleting needs a second confirming click', async ({ page }) => {
    await seedClient(page);
    await addComp(page);
    await page.getByTestId('tab-data').click();
    const id = await page.evaluate(() => S.competitors[0].id);
    await page.getByTestId(`comp-acc-${id}`).click(); // open the accordion
    const del = page.getByTestId(`btn-comp-del-${id}`);
    await del.click();
    await expect(del).toContainText('Sure?');
    expect(await page.evaluate(() => S.competitors.length)).toBe(1);
    await del.click();
    expect(await page.evaluate(() => S.competitors.length)).toBe(0);
  });

  test('clearing a field deletes the key instead of storing an empty string', async ({ page }) => {
    await seedClient(page);
    await addComp(page);
    await page.getByTestId('tab-data').click();
    const id = await page.evaluate(() => S.competitors[0].id);
    await page.getByTestId(`comp-acc-${id}`).click(); // open the accordion
    await page.getByTestId(`comp-${id}-followers-cur`).fill('');
    expect(await page.evaluate(() => 'followers' in S.competitors[0].cur)).toBe(false);
  });
});

test.describe('recommendation rule', () => {
  test('a faster-growing competitor fires the rule with both growths and capture dates', async ({ page }) => {
    await seedClient(page); // client +3.19%
    await addComp(page);    // rival +7.14%
    const rec = await page.evaluate(() => buildRecs().find((r) => r.rule.id === 'competitor_growth_gap'));
    expect(rec).toBeTruthy();
    expect(rec.evidence).toContain('RivalOne');
    expect(rec.evidence).toContain('7.14%');
    expect(rec.evidence).toContain('3.19%');
    expect(rec.evidence).toContain('2026-07-01 → 2026-07-31');
  });

  test('no rule when the client grows faster, when growth is flagged, or without client growth', async ({ page }) => {
    // client faster
    await seedClient(page);
    await addComp(page, { prev: { capturedAt: '2026-07-01', followers: 149000 } }); // rival +0.67%
    let ids = await page.evaluate(() => buildRecs().map((r) => r.rule.id));
    expect(ids).not.toContain('competitor_growth_gap');
    // flagged window
    await page.evaluate(() => { S.competitors = []; saveLocal(); });
    await addComp(page, { prev: { capturedAt: '2026-05-01', followers: 100000 } }); // huge but ≠ days
    ids = await page.evaluate(() => buildRecs().map((r) => r.rule.id));
    expect(ids).not.toContain('competitor_growth_gap');
    // client growth unknown
    await page.evaluate(() => { setMetric('instagram', 'previous', 'followers', null); saveLocal(); });
    await page.evaluate(() => { S.competitors = []; saveLocal(); });
    await addComp(page);
    ids = await page.evaluate(() => buildRecs().map((r) => r.rule.id));
    expect(ids).not.toContain('competitor_growth_gap');
  });
});

test.describe('persistence and language', () => {
  test('competitors ride through JSON save/load and old saves hydrate clean', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await seedClient(page);
    await addComp(page);
    const saved = await app.state();
    await page.evaluate((st) => { S = hydrate(st); saveLocal(); }, saved);
    expect(await page.evaluate(() => S.competitors.length)).toBe(1);
    expect(await page.evaluate(() => S.competitors[0].cur.followers)).toBe(150000);
    // old save without the key
    await page.evaluate(() => {
      S = hydrate({ v: 1, platforms: { instagram: { enabled: true, metrics: { current: { followers: 10 } } } } });
      saveLocal();
    });
    expect(await page.evaluate(() => Array.isArray(S.competitors) && S.competitors.length)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('Arabic report renders the card with the same numbers', async ({ page }) => {
    await seedClient(page);
    await addComp(page);
    await app.langToggle.click();
    await page.getByTestId('tab-report').click();
    const card = page.getByTestId('comp-card-instagram');
    await expect(card).toContainText('مقارنة المنافسين');
    await expect(card).toContainText('150,000');
    await expect(card).toContainText('[ASSUMPTION]');
    const txt = await card.textContent();
    expect(txt).not.toMatch(/undefined|NaN/);
  });

  test('the Calculations tab documents the competitor rules', async ({ page }) => {
    await page.getByTestId('tab-calc').click();
    const body = page.locator('#calcBody');
    await expect(body).toContainText('Competitor benchmark');
    await expect(body).toContainText('captured on DATE');
    await expect(body).toContainText('visible eng/post = (likes + comments) ÷ sampled posts');
    await expect(body).toContainText('never estimated');
  });
});
