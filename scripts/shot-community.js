// scripts/shot-community.js — screenshot the community management additions
const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  await page.goto('file://' + path.resolve(__dirname, '../organicpulse.html'), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('html[data-ingest-ready]', { state: 'attached' });
  await page.evaluate(() => {
    S.meta.client = 'SmartBuy'; S.meta.curStart = '2026-07-01'; S.meta.curEnd = '2026-07-31';
    S.meta.prevStart = '2026-06-01'; S.meta.prevEnd = '2026-06-30';
    S.platforms.instagram.enabled = true;
    setMetric('instagram', 'current', 'followers', 309574);
    setMetric('instagram', 'previous', 'followers', 300000);
    setMetric('instagram', 'current', 'reach', 929164);
    setMetric('instagram', 'current', 'engagements', 9305);
    setMetric('instagram', 'current', 'posts', 20);
    setMetric('instagram', 'current', 'comments', 400);
    setMetric('instagram', 'current', 'dms_received', 100);
    setMetric('instagram', 'current', 'responses_sent', 350);
    setMetric('instagram', 'current', 'avg_response_time', 95);
    setMetric('instagram', 'previous', 'comments', 380);
    setMetric('instagram', 'previous', 'dms_received', 90);
    setMetric('instagram', 'previous', 'responses_sent', 290);
    setMetric('instagram', 'previous', 'avg_response_time', 130);
    S.platforms.instagram.qual.response_time = 1;
    saveLocal();
  });
  await page.getByTestId('tab-report').click();
  await page.waitForSelector('[data-testid="scorecard-instagram"]');
  await page.getByTestId('scorecard-instagram').screenshot({ path: 'docs/community_card.png' });
  await browser.close();
  console.log('shot ok');
})();
