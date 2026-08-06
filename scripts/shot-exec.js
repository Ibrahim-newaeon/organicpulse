// scripts/shot-exec.js — screenshot the executive summary card with seeded data
const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
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
    setMetric('instagram', 'previous', 'reach', 900000);
    setMetric('instagram', 'current', 'engagements', 9305);
    setMetric('instagram', 'previous', 'engagements', 9000);
    setMetric('instagram', 'current', 'posts', 20);
    S.platforms.instagram.formats.current = {
      reel: { posts: 5, views: 400000, eng: 6200 },
      carousel: { posts: 8, views: 300000, eng: 2100 },
      static: { posts: 7, views: 150000, eng: 1005 },
    };
    saveLocal();
  });
  await page.getByTestId('tab-report').click();
  await page.waitForSelector('[data-testid="exec-summary-text"]');
  await page.getByTestId('exec-card').screenshot({ path: 'docs/exec_summary_card.png' });
  await browser.close();
  console.log('shot ok');
})();
