// tests/ocr-live.spec.js — end-to-end OCR against the real Insights screenshots.
// Needs network (the Tesseract engine loads from a CDN on first use).
// Run with: npx playwright test tests/ocr-live.spec.js --project=desktop
const { test, expect } = require('@playwright/test');
const path = require('path');
const { AuditPage } = require('./pages/AuditPage');

const SHOTS = path.resolve(__dirname, 'fixtures/shots');
const audience = path.join(SHOTS, 'f2bdb149-WhatsApp_Image_20260726_at_1.31.00_PM_1.jpeg');
const followers = path.join(SHOTS, '7e24bb24-WhatsApp_Image_20260726_at_1.31.01_PM.jpeg');
const overview = path.join(SHOTS, '6188dad1-WhatsApp_Image_20260726_at_1.31.01_PM_1.jpeg');

// Opt-in: the OCR engine is fetched from a CDN, which sandboxed CI blocks.
//   LIVE_OCR=1 npx playwright test tests/ocr-live.spec.js --project=desktop
test.describe('live OCR', () => {
  test.skip(!process.env.LIVE_OCR, 'set LIVE_OCR=1 to run (needs network)');
  test.setTimeout(240_000);

  test('reads the real Instagram Insights screenshots end to end', async ({ page }) => {
    const app = new AuditPage(page);
    await app.goto({ offline: false });          // network allowed for the engine
    await app.btnShots.click();
    await app.dialog.waitFor();
    await page.locator('#shotInputCurrent').setInputFiles([audience, followers, overview]);
    await expect.poll(() => page.getByTestId('bk-count-current').textContent()).toBe('3');
    await page.getByTestId('btn-run-ocr').click();

    await page.waitForFunction(
      () => /Done|could not|failed/i.test(document.querySelector('#ocrStatus').textContent),
      null, { timeout: 220_000 }
    );
    const status = await page.locator('#ocrStatus').textContent();
    console.log('OCR status:', status.trim());
    expect(status).not.toMatch(/could not|failed/i);

    const rows = await app.reviewRows();
    console.log('--- staged rows ---');
    rows.forEach((r) => console.log(`${r.target.padEnd(28)} ${String(r.value).padEnd(12)} ${r.quality}  ← ${r.source}`));
    console.log('--- raw OCR ---');
    console.log(await page.locator('.rv-raw').textContent().catch(() => '(none)'));

    expect(rows.length).toBeGreaterThan(5);
    const followersRow = rows.find((r) => r.target === 'metric:followers');
    expect(followersRow, 'follower count should be read').toBeTruthy();
    expect(followersRow.value).toBe(47527);
    expect(rows.find((r) => r.target === 'gender:female').value).toBe(63.5);
  });
});
