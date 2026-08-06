// tests/regression.spec.js — existing behaviour must survive the new code
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
});

test('no console errors on load', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // external CDNs are deliberately blocked in these runs; only JS errors matter
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.reload();
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
});

test('all six step tabs still switch views', async ({ page }) => {
  for (const v of ['data', 'bench', 'calc', 'report', 'recs', 'setup']) {
    await page.getByTestId(`tab-${v}`).click();
    await expect(page.locator(`#view-${v}`)).toHaveClass(/active/);
  }
});

test('manual metric entry still writes state and recalculates', async ({ page }) => {
  await page.getByTestId('tab-data').click();
  await page.getByTestId('acc-instagram').click();
  await page.getByTestId('in-instagram-followers-cur').fill('1000');
  await page.getByTestId('in-instagram-reach-cur').fill('500');
  await page.getByTestId('in-instagram-engagements-cur').fill('50');
  await page.waitForTimeout(150);
  expect(await app.metric('instagram', 'current', 'followers')).toBe(1000);
  await expect(page.locator('#derived-instagram')).toContainText('10%'); // ER by reach 50/500
});

test('save → load round-trips through the JSON file path', async ({ page }) => {
  await app.parsePaste('Followers\n1,234');
  await app.apply();
  const saved = await app.state();
  // simulate a load of a *partial* older file: only one platform present
  const partial = { v: 1, meta: saved.meta, platforms: { instagram: saved.platforms.instagram } };
  await page.evaluate((p) => { S = hydrate(p); saveLocal(); renderSetup(); }, partial);
  const after = await app.state();
  expect(Object.keys(after.platforms).sort()).toEqual(
    ['facebook', 'instagram', 'linkedin', 'snapchat', 'tiktok', 'x', 'youtube']
  );
  expect(after.platforms.instagram.metrics.current.followers).toBe(1234);
  // and every view still renders without throwing
  for (const v of ['data', 'report', 'recs']) await page.getByTestId(`tab-${v}`).click();
});

test('a partial state that predates a metric does not break scoring', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    S = hydrate({ v: 1, platforms: { instagram: { enabled: true, metrics: { current: { followers: 10 } } } } });
    saveLocal();
  });
  await page.getByTestId('tab-report').click();
  await page.getByTestId('tab-recs').click();
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test('CSV template import still works and now survives quoted newlines', async ({ page }) => {
  const csv = 'platform,period,metric_key,value\n' +
              'instagram,current,followers,"5,000"\n'.replace('"5,000"', '5000') +
              'instagram,current,"reach",2500\n' +
              'instagram,audience,"country:Jor\ndan",50\n';
  const res = await page.evaluate((t) => importCSV(t), csv);
  expect(res.ok).toBeGreaterThanOrEqual(2);
  expect(await app.metric('instagram', 'current', 'followers')).toBe(5000);
});

test('CSV import rejects out-of-range percentages instead of storing them', async ({ page }) => {
  const res = await page.evaluate(() =>
    importCSV('platform,period,metric_key,value\ninstagram,current,pct_video,150\n')
  );
  expect(res.ok).toBe(0);
  expect(res.skipped.join(' ')).toContain('invalid value');
  expect(await app.metric('instagram', 'current', 'pct_video')).toBeNull();
});

test('the report shows a provenance table after an import', async ({ page }) => {
  await app.parsePaste('Followers\n47,527');
  await app.apply();
  await page.getByTestId('tab-report').click();
  await expect(page.getByTestId('report-provenance')).toBeVisible();
  await expect(page.getByTestId('report-provenance')).toContainText('Pasted text');
});

test('imported countries beyond the default five rows are still editable in step 2', async ({ page }) => {
  await app.parsePaste(
    'Top locations\nCountries\nJordan\n50%\nSaudi Arabia\n10%\nEgypt\n9%\nIraq\n8%\nKuwait\n7%\nQatar\n6%'
  );
  await app.apply();
  await page.getByTestId('tab-data').click();
  await page.getByTestId('acc-instagram').click();
  await expect(page.getByTestId('aud-instagram-countries-name-5')).toHaveValue('Qatar');
});

test.describe('RTL / Arabic', () => {
  test('the wizard renders right-to-left in Arabic', async ({ page }) => {
    await app.langToggle.click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await app.btnShots.click();
    await expect(app.dialog).toBeVisible();
    await expect(page.getByTestId('ing-tab-meta')).toContainText('Meta');
    await expect(page.locator('#ingTitle')).toContainText('استيراد');
  });

  test('Arabic labels and Arabic-Indic digits map correctly', async ({ page }) => {
    await app.langToggle.click();
    await app.parsePaste('المتابعون\n٤٧٥٢٧\nالوصول\n٤٩٨٩٦٧');
    expect((await app.findRow('metric:followers')).value).toBe(47527);
    expect((await app.findRow('metric:reach')).value).toBe(498967);
  });
});

test.describe('accessibility & touch targets', () => {
  test('primary wizard controls meet the 56px / 44px minimums', async ({ page }) => {
    await app.btnShots.click();
    await app.dialog.waitFor();
    const tabH = await page.getByTestId('ing-tab-meta').evaluate((e) => e.getBoundingClientRect().height);
    expect(tabH).toBeGreaterThanOrEqual(56);
    for (const id of ['shot-drop', 'shot-drop-previous']) {
      const h = await page.getByTestId(id).evaluate((e) => e.getBoundingClientRect().height);
      expect(h, id).toBeGreaterThanOrEqual(56);
    }
  });

  test('the dropzone is keyboard reachable and labelled', async ({ page }) => {
    await app.btnShots.click();
    const dz = page.getByTestId('shot-drop');
    await expect(dz).toHaveAttribute('tabindex', '0');
    await expect(dz).toHaveAttribute('role', 'button');
    await expect(dz).toHaveAttribute('aria-label', /screenshot/i);
  });

  test('the step tab bar still exposes exactly six tabs', async ({ page }) => {
    await expect(page.locator('.tabs .tab')).toHaveCount(6);
  });
});
