// scripts/shot-competitors.js — screenshot the competitor benchmark card
const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
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
    setMetric('instagram', 'current', 'likes', 8000);
    setMetric('instagram', 'current', 'comments', 400);
    setMetric('instagram', 'current', 'posts', 20);
    setMetric('instagram', 'current', 'reach', 929164);
    setMetric('instagram', 'current', 'engagements', 9305);
    S.competitors = [
      { id: 'c_a', name: 'RivalOne', handle: '@rivalone', platform: 'instagram',
        cur: { capturedAt: '2026-07-31', followers: 150000, posts: 30, sample_posts: 10, likes_total: 5500, comments_total: 500 },
        prev: { capturedAt: '2026-07-01', followers: 140000 } },
      { id: 'c_b', name: 'RivalTwo', handle: '@rivaltwo', platform: 'instagram',
        cur: { capturedAt: '2026-07-31', followers: 480000, posts: 12, sample_posts: 8, likes_total: 3600, comments_total: 200 },
        prev: {} },
      { id: 'c_c', name: 'RivalThree', handle: '@rival3', platform: 'instagram',
        cur: { followers: 90000, posts: 18 }, // no capture date on purpose — shown, not compared
        prev: {} },
    ];
    saveLocal();
  });
  await page.getByTestId('tab-report').click();
  await page.waitForSelector('[data-testid="comp-card-instagram"]');
  await page.getByTestId('comp-card-instagram').screenshot({ path: 'docs/competitor_card.png' });
  await browser.close();
  console.log('shot ok');
})();
