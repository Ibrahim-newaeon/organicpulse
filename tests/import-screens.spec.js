// tests/import-screens.spec.js — Insights text mapping (the OCR output path)
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

/* Transcript of the supplied Instagram Insights screenshots, in the layout
   Tesseract produces: label line followed by value line, tiles side by side. */
const OVERVIEW = `Insights
Overview
All content
30 days
Views
3,803,119
13.6% followers
86.4% non-followers
Views by content type
Accounts reached
498,967
Followers Non-followers
Stories
471K
Posts
133K
Reels
102K
Profile activity
Profile visits 46,877
Bio link taps 630`;

const AUDIENCE = `Insights
Audience
Followers
47,527
Gender
Women
63.5%
Men
36.5%
Age range
13-17
0.9%
18-24
12.6%
25-34
42.5%
35-44
28.3%
45-54
11.0%
55-64
3.6%
65+
1.2%
Top locations
Countries
Jordan
89.6%
Saudi Arabia
1.5%
United States
1.3%`;

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

test.describe('Overview screen', () => {
  test('maps the headline account metrics', async () => {
    await app.parsePaste(OVERVIEW);
    expect((await app.findRow('metric:impressions')).value).toBe(3803119);
    expect((await app.findRow('metric:reach')).value).toBe(498967);
    expect((await app.findRow('metric:profile_visits')).value).toBe(46877);
    expect((await app.findRow('metric:link_clicks')).value).toBe(630);
  });

  test('label and value on the same line work as well as stacked lines', async () => {
    await app.parsePaste(OVERVIEW);
    const visits = await app.findRow('metric:profile_visits');   // same line
    const views = await app.findRow('metric:impressions');       // stacked
    expect(visits.value).toBe(46877);
    expect(views.value).toBe(3803119);
  });

  test('content-type breakdowns never become the posts-published count', async () => {
    await app.parsePaste(OVERVIEW);
    // "Posts 133K" and "Reels 102K" are breakdowns, not account totals
    expect(await app.findRow('metric:posts')).toBeFalsy();
    await expect(app.page.getByTestId('ing-unmapped')).toContainText('content-type breakdown');
  });

  test('the non-follower share is mapped but flagged as a different denominator', async () => {
    await app.parsePaste(OVERVIEW);
    const nf = await app.findRow('metric:nonfollower_reach_pct');
    expect(nf.value).toBe(86.4);
    expect(nf.quality).toContain('APPROX');
    expect(nf.note).toContain('VIEWS');
  });

  test('K/M shorthand is marked approximate', async () => {
    await app.parsePaste('Video views\n471K');
    const row = await app.findRow('metric:video_views');
    expect(row.value).toBe(471000);
    expect(row.quality).toContain('APPROX');
  });
});

test.describe('Audience screen', () => {
  test('gender and follower count map correctly', async () => {
    await app.parsePaste(AUDIENCE);
    expect((await app.findRow('metric:followers')).value).toBe(47527);
    expect((await app.findRow('gender:female')).value).toBe(63.5);
    expect((await app.findRow('gender:male')).value).toBe(36.5);
  });

  test('age bands map, and 55-64 + 65+ merge into the tool\'s 55+ band', async () => {
    await app.parsePaste(AUDIENCE);
    expect((await app.findRow('age:25-34')).value).toBe(42.5);
    const top = await app.findRow('age:55+');
    expect(top.value).toBeCloseTo(4.8, 2);          // 3.6 + 1.2
    expect(top.quality).toContain('APPROX');
    expect(top.evidence).toContain('+');
  });

  test('age shares still total 100%', async () => {
    await app.parsePaste(AUDIENCE);
    const rows = await app.reviewRows();
    const total = rows.filter((r) => r.target.startsWith('age:')).reduce((a, r) => a + r.value, 0);
    // Instagram's own shares round to 100.1 here — assert the band, not a fake exactness
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });

  test('top locations become country shares', async () => {
    await app.parsePaste(AUDIENCE);
    const rows = await app.reviewRows();
    const countries = rows.filter((r) => r.target === 'country:');
    expect(countries.length).toBeGreaterThanOrEqual(3);
    expect(countries[0].value).toBe(89.6);
    expect(countries[0].source).toBe('Jordan');
  });

  test('applying writes audience data through to the platform state', async () => {
    await app.parsePaste(AUDIENCE);
    await app.apply();
    const s = await app.state();
    const A = s.platforms.instagram.audience;
    expect(A.gender.female).toBe(63.5);
    expect(A.age['25-34']).toBe(42.5);
    expect(A.countries.find((c) => c.name === 'Jordan').val).toBe(89.6);
    expect(s.platforms.instagram.metrics.current.followers).toBe(47527);
  });
});

test.describe('review table controls', () => {
  test('the period selector routes a value to the previous period', async ({ page }) => {
    await app.parsePaste('Followers\n47,527');
    await page.locator('table.review tbody tr [data-rv="period"]').selectOption('previous');
    await app.apply();
    expect(await app.metric('instagram', 'previous', 'followers')).toBe(47527);
    expect(await app.metric('instagram', 'current', 'followers')).toBeNull();
  });

  test('the platform selector reroutes a value to another platform', async ({ page }) => {
    await app.parsePaste('Followers\n1,000');
    await page.locator('table.review tbody tr [data-rv="platform"]').selectOption('facebook');
    await app.apply();
    expect(await app.metric('facebook', 'current', 'followers')).toBe(1000);
    expect(await app.metric('instagram', 'current', 'followers')).toBeNull();
  });

  test('re-targeting a value to a different metric is honoured', async ({ page }) => {
    await app.parsePaste('Followers\n1,000');
    await page.locator('table.review tbody tr [data-rv="target"]').selectOption('metric:reach');
    await app.apply();
    expect(await app.metric('instagram', 'current', 'reach')).toBe(1000);
    expect(await app.metric('instagram', 'current', 'followers')).toBeNull();
  });

  test('skip discards the value', async ({ page }) => {
    await app.parsePaste('Followers\n1,000');
    await page.locator('table.review tbody tr [data-rv="target"]').selectOption('skip:');
    await expect(app.applyBtn).toBeDisabled();
  });

  test('an edited value is what gets stored', async ({ page }) => {
    await app.parsePaste('Followers\n1,000');
    await page.locator('table.review tbody tr [data-rv="value"]').fill('1234');
    await app.apply();
    expect(await app.metric('instagram', 'current', 'followers')).toBe(1234);
  });

  test('a percent over 100 is rejected rather than stored', async ({ page }) => {
    await app.parsePaste('Gender\nWomen\n63.5%');
    const input = page.locator('table.review tbody tr [data-rv="value"]');
    await input.fill('150');
    await expect(input).toHaveClass(/invalid/);
    await app.apply();
    const s = await app.state();
    expect(s.platforms.instagram.audience.gender.female).toBeUndefined();
  });
});

test.describe('negative cases', () => {
  test('unrecognised text yields no findings and says so', async ({ page }) => {
    await app.btnPaste.click();
    await app.dialog.waitFor();
    await app.pasteBox.fill('Follower active times\nBased on your current time zone (GMT+3)\nSundays\n9PM - 11PM');
    await page.getByTestId('btn-parse-paste').click();
    await expect(page.getByTestId('ing-notes')).toContainText('No recognisable');
    await expect(app.applyBtn).toBeDisabled();
  });

  test('nothing recognised is thrown away silently', async ({ page }) => {
    await app.parsePaste('Top content by views\n1,234\nSome random row\n99');
    await expect(page.getByTestId('ing-unmapped')).toBeVisible();
  });

  test('a metric that does not exist on the chosen platform is refused', async () => {
    await app.parsePaste('Saves\n120', { platform: 'facebook' });
    expect(await app.findRow('metric:saves')).toBeFalsy();
    await expect(app.page.getByTestId('ing-unmapped')).toContainText('facebook');
  });

  test('cancel leaves the audit untouched', async ({ page }) => {
    await app.parsePaste('Followers\n47,527');
    await page.getByTestId('btn-ing-cancel').click();
    await expect(app.dialog).toBeHidden();
    expect(await app.metric('instagram', 'current', 'followers')).toBeNull();
  });
});
