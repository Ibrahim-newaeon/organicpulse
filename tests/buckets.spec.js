// tests/buckets.spec.js — current / previous screenshot buckets and the
// duplicate-and-overwrite guards that go with them.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { AuditPage } = require('./pages/AuditPage');

const SHOTS = path.resolve(__dirname, 'fixtures/shots');
const A = path.join(SHOTS, 'f2bdb149-WhatsApp_Image_20260726_at_1.31.00_PM_1.jpeg');
const B = path.join(SHOTS, '7e24bb24-WhatsApp_Image_20260726_at_1.31.01_PM.jpeg');
const C = path.join(SHOTS, '6188dad1-WhatsApp_Image_20260726_at_1.31.01_PM_1.jpeg');

let app;
test.beforeEach(async ({ page }) => {
  app = new AuditPage(page);
  await app.goto();
  await app.ensureSetup();
  await app.btnShots.click();
  await app.dialog.waitFor();
});

const count = (page, per) => page.getByTestId(`bk-count-${per}`).textContent();
const queue = (page) => page.evaluate(() => ING.files.map((f) => ({ name: f.name, period: f.period })));

test.describe('two buckets', () => {
  test('both dropzones exist and start empty', async ({ page }) => {
    await expect(page.getByTestId('bucket-current')).toBeVisible();
    await expect(page.getByTestId('bucket-previous')).toBeVisible();
    expect(await count(page, 'current')).toBe('0');
    expect(await count(page, 'previous')).toBe('0');
    await expect(page.getByTestId('btn-run-ocr')).toBeDisabled();
  });

  test('images file into the bucket they were dropped on', async ({ page }) => {
    await page.locator('#shotInputCurrent').setInputFiles([A, B]);
    await page.locator('#shotInputPrevious').setInputFiles([C]);
    await expect.poll(() => count(page, 'current')).toBe('2');
    await expect.poll(() => count(page, 'previous')).toBe('1');
    const q = await queue(page);
    expect(q.filter((f) => f.period === 'current')).toHaveLength(2);
    expect(q.filter((f) => f.period === 'previous')).toHaveLength(1);
    await expect(page.getByTestId('btn-run-ocr')).toBeEnabled();
  });

  test('each bucket shows its own date range from Setup', async ({ page }) => {
    await page.getByTestId('btn-ing-cancel').click();
    await app.ensureSetup();
    await app.setPeriods('2026-06-01', '2026-06-30', '2026-05-01', '2026-05-31');
    await app.btnShots.click();
    await expect(page.locator('#bkRangeCurrent')).toHaveText('2026-06-01 → 2026-06-30');
    await expect(page.locator('#bkRangePrevious')).toHaveText('2026-05-01 → 2026-05-31');
  });

  test('with no dates set the range reads as unset rather than inventing one', async ({ page }) => {
    await expect(page.locator('#bkRangeCurrent')).toHaveText(/no dates set/i);
  });

  test('Clear empties both buckets', async ({ page }) => {
    await page.locator('#shotInputCurrent').setInputFiles([A]);
    await page.locator('#shotInputPrevious').setInputFiles([B]);
    await expect.poll(() => count(page, 'previous')).toBe('1');
    await page.getByTestId('btn-shot-clear').click();
    expect(await count(page, 'current')).toBe('0');
    expect(await count(page, 'previous')).toBe('0');
    await expect(page.getByTestId('btn-run-ocr')).toBeDisabled();
  });

  test('a thumbnail can be removed from one bucket without touching the other', async ({ page }) => {
    await page.locator('#shotInputCurrent').setInputFiles([A, B]);
    await page.locator('#shotInputPrevious').setInputFiles([C]);
    await expect.poll(() => count(page, 'current')).toBe('2');
    await page.locator('#shotThumbsCurrent .th-x').first().click();
    expect(await count(page, 'current')).toBe('1');
    expect(await count(page, 'previous')).toBe('1');
  });
});

test.describe('duplicate guards', () => {
  test('the same image cannot be added twice to the same bucket', async ({ page }) => {
    await page.locator('#shotInputCurrent').setInputFiles([A]);
    await expect.poll(() => count(page, 'current')).toBe('1');
    await page.locator('#shotInputCurrent').setInputFiles([A]);
    await page.waitForTimeout(300);
    expect(await count(page, 'current')).toBe('1');
    expect(await queue(page)).toHaveLength(1);
  });

  test('the same image cannot be filed under both periods', async ({ page }) => {
    await page.locator('#shotInputCurrent').setInputFiles([A]);
    await expect.poll(() => count(page, 'current')).toBe('1');
    await page.locator('#shotInputPrevious').setInputFiles([A]);
    await page.waitForTimeout(300);
    expect(await count(page, 'previous')).toBe('0');
    expect(await queue(page)).toHaveLength(1);
  });

  test('a duplicate inside one multi-file selection is dropped once', async ({ page }) => {
    await page.locator('#shotInputCurrent').setInputFiles([A, B, A]);
    await expect.poll(() => count(page, 'current')).toBe('2');
  });

  test('different images are both accepted', async ({ page }) => {
    await page.locator('#shotInputCurrent').setInputFiles([A]);
    await page.locator('#shotInputCurrent').setInputFiles([B]);
    await expect.poll(() => count(page, 'current')).toBe('2');
  });
});

test.describe('overwrite guard in the review table', () => {
  test('a value that would replace an existing one is called out', async ({ page }) => {
    await page.getByTestId('btn-ing-cancel').click();
    await app.parsePaste('Followers\n1,000');
    await app.apply();
    expect(await app.metric('instagram', 'current', 'followers')).toBe(1000);

    await app.parsePaste('Followers\n2,000');
    await expect(page.getByTestId('rv-overwrite')).toBeVisible();
    await expect(page.getByTestId('rv-overwrite')).toContainText('1,000');
    // still the user's call — the row remains actionable
    await app.apply();
    expect(await app.metric('instagram', 'current', 'followers')).toBe(2000);
  });

  test('re-importing the same value says so instead of crying wolf', async ({ page }) => {
    await page.getByTestId('btn-ing-cancel').click();
    await app.parsePaste('Followers\n1,000');
    await app.apply();
    await app.parsePaste('Followers\n1,000');
    await expect(page.getByTestId('rv-same')).toBeVisible();
    await expect(page.getByTestId('rv-overwrite')).toHaveCount(0);
  });

  test('a value going to the other period is not flagged as a collision', async ({ page }) => {
    await page.getByTestId('btn-ing-cancel').click();
    await app.parsePaste('Followers\n1,000');
    await app.apply();
    await app.parsePaste('Followers\n900', { period: 'previous' });
    await expect(page.getByTestId('rv-overwrite')).toHaveCount(0);
    await app.apply();
    expect(await app.metric('instagram', 'current', 'followers')).toBe(1000);
    expect(await app.metric('instagram', 'previous', 'followers')).toBe(900);
  });
});

test.describe('audience data is not period-scoped', () => {
  test('a previous-period audience reading is flagged and switched off', async ({ page }) => {
    await page.getByTestId('btn-ing-cancel').click();
    await app.parsePaste('Gender\nWomen\n63.5%\nMen\n36.5%', { period: 'previous' });
    const rows = await app.reviewRows();
    const female = rows.find((r) => r.target === 'gender:female');
    expect(female.include).toBe(false);
    expect(female.quality).toContain('RISKY');
    expect(female.note).toContain('not per period');
  });

  test('the same reading in the current period applies normally', async ({ page }) => {
    await page.getByTestId('btn-ing-cancel').click();
    await app.parsePaste('Gender\nWomen\n63.5%');
    const rows = await app.reviewRows();
    expect(rows.find((r) => r.target === 'gender:female').include).toBe(true);
    await app.apply();
    const s = await app.state();
    expect(s.platforms.instagram.audience.gender.female).toBe(63.5);
  });

  test('previous-period metrics are unaffected by the audience rule', async ({ page }) => {
    await page.getByTestId('btn-ing-cancel').click();
    await app.parsePaste('Followers\n40,000\nAccounts reached\n300,000', { period: 'previous' });
    const rows = await app.reviewRows();
    expect(rows.every((r) => r.include)).toBe(true);
    await app.apply();
    expect(await app.metric('instagram', 'previous', 'followers')).toBe(40000);
    expect(await app.metric('instagram', 'previous', 'reach')).toBe(300000);
  });
});
