// tests/interactions.spec.js — Instagram's segmented Interactions screen:
// per-content-type tabs must ADD UP, not collide; ads-inclusive totals must be
// split into their organic remainder.
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');
const REAL = require('./fixtures/real-ocr-interactions.json').text;

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

const REELS = `By interaction
Posts Reels Stories
Likes 1,459
Comments 49
Saves 230
Shares 951
Reposts 52`;

const POSTS = `By interaction
Posts Reels Stories
Likes 1,619
Comments 23
Saves 485
Shares 811
Reposts 26`;

const STORIES = `By interaction
Posts Reels Stories
Replies 127
Shares 224`;

test.describe('content-type tabs are summed, not conflicting', () => {
  test('two tabs of the same metric add up', async () => {
    await app.parsePaste(REELS + '\n' + POSTS);
    const likes = await app.findRow('metric:likes');
    expect(likes.value).toBe(3078);            // 1,459 + 1,619
    expect(likes.quality).toContain('EXACT');
    expect(likes.include).toBe(true);
    expect(likes.evidence).toContain('1,459 + 1,619 = 3,078');
  });

  test('every engagement component sums independently', async () => {
    await app.parsePaste(REELS + '\n' + POSTS);
    expect((await app.findRow('metric:comments')).value).toBe(72);   // 49 + 23
    expect((await app.findRow('metric:saves')).value).toBe(715);     // 230 + 485
    expect((await app.findRow('metric:reposts')).value).toBe(78);    // 52 + 26
  });

  test('three tabs sum, including Stories', async () => {
    await app.parsePaste(REELS + '\n' + POSTS + '\n' + STORIES);
    const shares = await app.findRow('metric:shares');
    expect(shares.value).toBe(1986);           // 951 + 811 + 224
    expect(shares.evidence).toContain('3 content-type tabs');
  });

  test('no CONFLICT rows are produced by the tab split', async () => {
    await app.parsePaste(REELS + '\n' + POSTS + '\n' + STORIES);
    const rows = await app.reviewRows();
    expect(rows.some((r) => r.quality.includes('CONFLICT'))).toBe(false);
    expect(rows.filter((r) => r.target === 'metric:likes')).toHaveLength(1);
  });

  test('applying stores the summed totals', async () => {
    await app.parsePaste(REELS + '\n' + POSTS + '\n' + STORIES);
    await app.apply();
    expect(await app.metric('instagram', 'current', 'likes')).toBe(3078);
    expect(await app.metric('instagram', 'current', 'shares')).toBe(1986);
    expect(await app.metric('instagram', 'current', 'reposts')).toBe(78);
  });

  test('a single tab is flagged as only part of the total', async () => {
    await app.parsePaste(REELS);
    const likes = await app.findRow('metric:likes');
    expect(likes.value).toBe(1459);
    expect(likes.quality).toContain('APPROX');
    expect(likes.note).toContain('single content-type tab');
  });

  test('Reposts is its own metric, no longer folded into Shares', async () => {
    await app.parsePaste(REELS);
    expect((await app.findRow('metric:shares')).value).toBe(951);
    expect((await app.findRow('metric:reposts')).value).toBe(52);
  });

  test('Stories Replies map to story replies', async () => {
    await app.parsePaste(STORIES);
    expect((await app.findRow('metric:story_replies')).value).toBe(127);
  });

  test('a tab reading and an account-level reading still conflict', async () => {
    // the second Likes sits outside the By-interaction panel, so it is an
    // account total, not another tab — those two genuinely contradict
    await app.parsePaste(REELS + '\nProfile activity\nLikes 9,999');
    const rows = (await app.reviewRows()).filter((r) => r.target === 'metric:likes');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.quality.includes('CONFLICT'))).toBe(true);
    expect(rows.every((r) => r.include === false)).toBe(true);
  });
});

test.describe('ads-inclusive totals', () => {
  const DONUT = `Interactions
24,616
62.2% from ads`;

  test('the total is switched off and the organic remainder staged', async () => {
    await app.parsePaste(DONUT);
    const rows = (await app.reviewRows()).filter((r) => r.target === 'metric:engagements');
    expect(rows).toHaveLength(2);
    const total = rows.find((r) => r.value === 24616);
    const organic = rows.find((r) => r.value === 9305);   // 24,616 × 37.8%
    expect(total.quality).toContain('RISKY');
    expect(total.include).toBe(false);
    expect(total.note).toContain('62.2%');
    expect(organic.include).toBe(true);
    expect(organic.quality).toContain('APPROX');
    expect(organic.evidence).toContain('(100 − 62.2%)');
  });

  test('the pair is not reported as a conflict', async () => {
    await app.parsePaste(DONUT);
    const rows = await app.reviewRows();
    expect(rows.some((r) => r.quality.includes('CONFLICT'))).toBe(false);
  });

  test('applying takes the organic figure, not the ads-inclusive one', async () => {
    await app.parsePaste(DONUT);
    await app.apply();
    expect(await app.metric('instagram', 'current', 'engagements')).toBe(9305);
  });

  test('views split the same way', async () => {
    await app.parsePaste('Views\n11,108,286\n85.9% from ads');
    const organic = (await app.reviewRows())
      .filter((r) => r.target === 'metric:impressions').find((r) => r.include);
    expect(organic.value).toBe(1566268);      // 11,108,286 × 14.1%
  });

  test('a stray ads line with nothing above it is not applied to anything', async () => {
    await app.parsePaste('62.2% from ads');
    const rows = await app.reviewRows();
    expect(rows).toHaveLength(0);
  });

  test('an out-of-range percentage is ignored rather than inverted', async () => {
    await app.parsePaste('Interactions\n24,616\n0% from ads');
    const rows = (await app.reviewRows()).filter((r) => r.target === 'metric:engagements');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(24616);
    expect(rows[0].include).toBe(true);
  });
});

test.describe('headline tiles and new labels', () => {
  test('a value printed above its label is still read', async () => {
    await app.parsePaste('309,574\nFollowers');
    expect((await app.findRow('metric:followers')).value).toBe(309574);
  });

  test('a comparison caption never becomes the value', async () => {
    await app.parsePaste('309,574\nFollowers\n+0.5% vs Jun 30');
    const rows = (await app.reviewRows()).filter((r) => r.target === 'metric:followers');
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(309574);
  });

  test('the Growth block maps Overall, Follows and Unfollows', async () => {
    await app.parsePaste('Growth\nOverall 1514\nFollows 4827\nUnfollows 3313');
    expect((await app.findRow('metric:net_followers')).value).toBe(1514);
    expect((await app.findRow('metric:follows_gained')).value).toBe(4827);
    expect((await app.findRow('metric:unfollows')).value).toBe(3313);
  });

  test('"Overall" outside the Growth block maps to nothing', async () => {
    await app.parsePaste('Overall 1514');
    expect(await app.findRow('metric:net_followers')).toBeFalsy();
  });

  test('Viewers maps to reach', async () => {
    await app.parsePaste('Viewers 929,164');
    expect((await app.findRow('metric:reach')).value).toBe(929164);
  });

  test('External link taps map to link clicks', async () => {
    await app.parsePaste('External link taps 2,409');
    expect((await app.findRow('metric:link_clicks')).value).toBe(2409);
  });
});

test.describe('locations chip', () => {
  test('Towns/cities on the left means the rows are cities', async () => {
    await app.parsePaste('Top locations\nTowns/cities Countries\nAmman\n41.4%\nIrbid\n2.7%');
    const rows = await app.reviewRows();
    expect(rows.filter((r) => r.target === 'city:')).toHaveLength(2);
    expect(rows.filter((r) => r.target === 'country:')).toHaveLength(0);
  });

  test('Countries on the left means the rows are countries', async () => {
    await app.parsePaste('Top locations\nCountries Cities\nJordan\n89.6%');
    expect((await app.reviewRows()).filter((r) => r.target === 'country:')).toHaveLength(1);
  });

  test('the choice is declared as an assumption', async ({ page }) => {
    await app.parsePaste('Top locations\nTowns/cities Countries\nAmman\n41.4%');
    await expect(page.getByTestId('ing-notes')).toContainText('[ASSUMPTION]');
    await expect(page.getByTestId('ing-notes')).toContainText('Towns/cities');
  });

  test('a place name with a comma survives', async () => {
    await app.parsePaste('Top locations\nTowns/cities Countries\nRuseifa, Az Zarqa\n1.8%');
    const rows = (await app.reviewRows()).filter((r) => r.target === 'city:');
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('Ruseifa, Az Zarqa');
  });
});

test.describe('the full ten-screenshot batch', () => {
  test('every engagement component is summed and nothing conflicts on them', async () => {
    await app.parsePaste(REAL);
    const get = async (k) => (await app.findRow('metric:' + k)) || {};
    expect((await get('likes')).value).toBe(3078);
    expect((await get('comments')).value).toBe(72);
    expect((await get('saves')).value).toBe(715);
    expect((await get('shares')).value).toBe(1986);
    expect((await get('reposts')).value).toBe(78);
    for (const k of ['likes', 'comments', 'saves', 'shares', 'reposts']) {
      expect((await get(k)).quality, k).toContain('EXACT');
    }
  });

  test('the account-level figures survive the batch intact', async () => {
    await app.parsePaste(REAL);
    const get = async (k) => (await app.findRow('metric:' + k)) || {};
    expect((await get('followers')).value).toBe(309574);
    expect((await get('follows_gained')).value).toBe(4827);
    expect((await get('unfollows')).value).toBe(3313);
    expect((await get('net_followers')).value).toBe(1514);
    expect((await get('profile_visits')).value).toBe(31170);
    expect((await get('link_clicks')).value).toBe(2409);
    expect((await get('reach')).value).toBe(929164);
  });

  test('follows minus unfollows reconciles with the stated net', async () => {
    await app.parsePaste(REAL);
    const g = async (k) => (await app.findRow('metric:' + k)).value;
    expect((await g('follows_gained')) - (await g('unfollows'))).toBe(await g('net_followers'));
  });

  test('both ads-inclusive tiles are off and their organic rows are on', async () => {
    await app.parsePaste(REAL);
    const rows = await app.reviewRows();
    const eng = rows.filter((r) => r.target === 'metric:engagements');
    const views = rows.filter((r) => r.target === 'metric:impressions');
    expect(eng.find((r) => r.value === 24616).include).toBe(false);
    expect(eng.find((r) => r.value === 9305).include).toBe(true);
    expect(views.find((r) => r.value === 11108286).include).toBe(false);
    expect(views.find((r) => r.value === 1566268).include).toBe(true);
  });

  test('applying the batch lands organic-only engagement in the audit', async () => {
    await app.parsePaste(REAL);
    await app.apply();
    expect(await app.metric('instagram', 'current', 'engagements')).toBe(9305);
    expect(await app.metric('instagram', 'current', 'impressions')).toBe(1566268);
    expect(await app.metric('instagram', 'current', 'likes')).toBe(3078);
  });
});
