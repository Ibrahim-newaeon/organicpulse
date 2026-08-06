// tests/parsers.spec.js — unit-level behaviour of the ingestion parsers
const { test, expect } = require('@playwright/test');
const { AuditPage } = require('./pages/AuditPage');

test.beforeEach(async ({ page }) => {
  const app = new AuditPage(page);
  await app.goto();
});

test.describe('parseNum — number normalization', () => {
  const positive = [
    ['3,803,119', 3803119, false],
    ['47,527', 47527, false],
    ['+645', 645, false],
    ['1.3M', 1300000, true],
    ['45K', 45000, true],
    ['1.0K', 1000, true],
    ['63.5%', 63.5, false],
    ['0.9%', 0.9, false],
    ['٤٥', 45, false],            // Arabic-Indic 45
    ['١٬٢٣٤', 1234, false], // ١٬٢٣٤
    ['12 ألف', 12000, true], // 12 ألف
    ['(120)', -120, false],
    ['-15', -15, false],
  ];
  for (const [input, expected, approx] of positive) {
    test(`parses ${JSON.stringify(input)} → ${expected}`, async ({ page }) => {
      const r = await page.evaluate((s) => parseNum(s), input);
      expect(r).not.toBeNull();
      expect(r.v).toBeCloseTo(expected, 4);
      expect(r.approx).toBe(approx);
    });
  }

  const negative = ['', '   ', 'Views', '06/01/2026', '13-17', 'abc', 'N/A', '--', '1.2.3.4'];
  for (const input of negative) {
    test(`rejects ${JSON.stringify(input)}`, async ({ page }) => {
      const r = await page.evaluate((s) => parseNum(s), input);
      expect(r).toBeNull();
    });
  }

  test('percent flag is set only for percent inputs', async ({ page }) => {
    const [a, b] = await page.evaluate(() => [parseNum('63.5%'), parseNum('63.5')]);
    expect(a.pct).toBe(true);
    expect(b.pct).toBe(false);
  });
});

test.describe('parseDelimited — RFC4180', () => {
  test('keeps newlines inside quoted fields (the old parser corrupted these)', async ({ page }) => {
    const rows = await page.evaluate(() =>
      parseDelimited('a,b,c\n1,"line one\nline two",3\n')
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveLength(3);
    expect(rows[1][1]).toBe('line one\nline two');
    expect(rows[1][2]).toBe('3');
  });

  test('handles escaped double quotes and embedded commas', async ({ page }) => {
    const rows = await page.evaluate(() => parseDelimited('h1,h2\n"say ""hi"", now","x,y"\n'));
    expect(rows[1][0]).toBe('say "hi", now');
    expect(rows[1][1]).toBe('x,y');
  });

  test('strips the UTF-8 BOM Meta exports carry', async ({ page }) => {
    const rows = await page.evaluate(() => parseDelimited('﻿Post ID,Views\n1,2\n'));
    expect(rows[0][0]).toBe('Post ID');
  });

  test('sniffs semicolon and tab delimiters', async ({ page }) => {
    const semi = await page.evaluate(() => parseDelimited('a;b;c\n1;2;3\n'));
    const tab = await page.evaluate(() => parseDelimited('a\tb\tc\n1\t2\t3\n'));
    expect(semi[1]).toEqual(['1', '2', '3']);
    expect(tab[1]).toEqual(['1', '2', '3']);
  });
});

test.describe('date order detection', () => {
  test('detects DMY when a first component exceeds 12', async ({ page }) => {
    const r = await page.evaluate(() => detectDateOrder(['25/06/2026 10:00', '01/06/2026 09:00']));
    expect(r).toEqual({ order: 'DMY', certain: true });
  });
  test('detects MDY when a second component exceeds 12', async ({ page }) => {
    const r = await page.evaluate(() => detectDateOrder(['06/25/2026 10:00']));
    expect(r).toEqual({ order: 'MDY', certain: true });
  });
  test('falls back to MDY but marks it uncertain when ambiguous', async ({ page }) => {
    const r = await page.evaluate(() => detectDateOrder(['06/01/2026 04:07']));
    expect(r.order).toBe('MDY');
    expect(r.certain).toBe(false);
  });
  test('ISO stamps parse regardless of order', async ({ page }) => {
    const ms = await page.evaluate(() => parseStamp('2026-06-15', 'DMY'));
    expect(ms).toBe(Date.UTC(2026, 5, 15));
  });
  test('rejects a nonsense stamp', async ({ page }) => {
    const ms = await page.evaluate(() => parseStamp('not a date', 'MDY'));
    expect(ms).toBeNull();
  });
});

test.describe('filename range detection', () => {
  test('reads Jun012026_Jun302026 from a Meta export name', async ({ page }) => {
    const r = await page.evaluate(() =>
      rangeFromFilename('Jun012026_Jun302026_1746403806561899_1.csv')
    );
    expect(r.fromISO).toBe('2026-06-01');
    expect(r.toISO).toBe('2026-06-30');
  });
  test('returns null for an unrelated name', async ({ page }) => {
    const r = await page.evaluate(() => rangeFromFilename('export.csv'));
    expect(r).toBeNull();
  });
});

test.describe('post type classification', () => {
  const cases = [
    ['IG reel', 'video'], ['IG image', 'static'], ['IG carousel', 'carousel'],
    ['Videos', 'video'], ['Photos', 'static'], ['Stories', 'story'], ['Mystery', 'other'],
  ];
  for (const [input, expected] of cases) {
    test(`${input} → ${expected}`, async ({ page }) => {
      expect(await page.evaluate((s) => classifyPostType(s), input)).toBe(expected);
    });
  }
});

test.describe('label lookup', () => {
  test('maps English and Arabic labels to the same metric', async ({ page }) => {
    const en = await page.evaluate(() => lookupMetric('Accounts reached').k);
    const ar = await page.evaluate(() => lookupMetric('الوصول').k);
    expect(en).toBe('reach');
    expect(ar).toBe('reach');
  });
  test('does not invent a mapping for an unknown label', async ({ page }) => {
    expect(await page.evaluate(() => lookupMetric('Top content by views'))).toBeNull();
    expect(await page.evaluate(() => lookupMetric('Follower active times'))).toBeNull();
  });
});
