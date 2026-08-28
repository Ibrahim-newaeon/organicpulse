// scripts/shot-capture-kit.js — screenshot the capture-kit wizard mode + a staged review
const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1500 } });
  await page.goto('file://' + path.resolve(__dirname, '../organicpulse.html'), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-ingest-ready]', { state: 'attached' });
  await page.evaluate(() => {
    S.competitors = [{ id: 'c_a', name: 'RivalOne', handle: '@rivalone', platform: 'instagram', cur: {}, prev: {} }];
    saveLocal();
  });
  await page.getByTestId('btn-ingest-shots').click();
  await page.getByTestId('shot-mode-comp').click();
  // stage a mapped result the way runOCR's competitor branch does
  await page.evaluate(() => {
    stageReset('Competitor screenshots');
    const r = ingestCompetitorShots([
      { name: 'rival_profile.jpg', text: '531 posts 152,304 followers 348 following' },
      { name: 'rival_post1.jpg', text: '1,204 likes\nView all 56 comments' },
      { name: 'rival_post2.jpg', text: 'Liked by ahmad.k and 986 others\nView all 30 comments' },
    ], { platform: 'instagram', bucket: 'current', compId: 'c_a', compName: 'RivalOne', capturedAt: '2026-08-28' });
    STAGE.findings = dedupeFindings(r.findings);
    STAGE.unmapped = r.unmapped;
    STAGE.notes = ['[ASSUMPTION] Values were read by OCR from 3 screenshot(s) you took of the PUBLIC profile "RivalOne" (Instagram). Only publicly visible numbers are mapped — reach, impressions and story metrics are not estimated. Check every row against the image before applying.'];
    renderReview();
  });
  await page.waitForSelector('[data-testid="ing-review-table"]');
  await page.locator('#ingestDialog').screenshot({ path: 'docs/capture_kit.png' });
  await browser.close();
  console.log('shot ok');
})();
