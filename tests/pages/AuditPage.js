// tests/pages/AuditPage.js — Page Object Model for OrganicPulse
const path = require('path');
const APP_URL = 'file://' + path.resolve(__dirname, '../../organicpulse.html');

const FIXTURES = {
  ig: path.resolve(__dirname, '../fixtures/meta/63f7b7d5-Jun012026_Jun302026_1746403806561899_1.csv'),
  fb: path.resolve(__dirname, '../fixtures/meta/039f2036-Jun012026_Jun302026_2843457646009769.csv'),
};

class AuditPage {
  constructor(page) {
    this.page = page;
    this.tabSetup = page.getByTestId('tab-setup');
    this.tabData = page.getByTestId('tab-data');
    this.tabReport = page.getByTestId('tab-report');
    this.btnShots = page.getByTestId('btn-ingest-shots');
    this.btnMeta = page.getByTestId('btn-ingest-meta');
    this.btnPaste = page.getByTestId('btn-ingest-paste');
    this.dialog = page.getByTestId('ingest-dialog');
    this.reviewTable = page.getByTestId('ing-review-table');
    this.applyBtn = page.getByTestId('btn-ing-apply');
    this.metaInput = page.locator('#metaFileInput');
    this.metaStatus = page.getByTestId('meta-status');
    this.pasteBox = page.getByTestId('paste-box');
    this.langToggle = page.getByTestId('lang-toggle');
  }

  static get URL() { return APP_URL; }
  static get FIXTURES() { return FIXTURES; }

  /** Loads the tool with every external request blocked — this is also the
   *  offline test: fonts, Chart.js and the OCR/XLSX CDNs must all be optional. */
  async goto({ offline = true } = {}) {
    if (offline) {
      await this.page.route('**://**', (route) =>
        route.request().url().startsWith('file:') ? route.continue() : route.abort()
      );
    }
    await this.page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
    await this.page.evaluate(() => localStorage.clear());
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.tabSetup.waitFor();
    // the app sets this only after the ingestion wizard's listeners are attached
    await this.page.waitForSelector('html[data-ingest-ready]', { state: 'attached' });
  }

  async setPeriods(cs, ce, ps, pe) {
    await this.page.getByTestId('input-cur-start').fill(cs);
    await this.page.getByTestId('input-cur-end').fill(ce);
    if (ps) await this.page.getByTestId('input-prev-start').fill(ps);
    if (pe) await this.page.getByTestId('input-prev-end').fill(pe);
    await this.page.getByTestId('input-cur-end').blur();
  }

  /** Apply() leaves the user on the Data tab, so the Setup-view buttons that
   *  open the wizard are hidden until we come back. */
  async ensureSetup() {
    const active = await this.page.locator('#view-setup').evaluate((e) => e.classList.contains('active'));
    if (!active) await this.tabSetup.click();
    await this.page.locator('#view-setup').waitFor({ state: 'visible' });
  }

  async importMeta(fixtureKey, { organicOnly = true, platform = '' } = {}) {
    await this.ensureSetup();
    await this.btnMeta.click();
    await this.dialog.waitFor();
    if (platform) await this.page.locator('#metaPlatform').selectOption(platform);
    if (!organicOnly) await this.page.locator('#metaOrganic').uncheck();
    await this.metaInput.setInputFiles(FIXTURES[fixtureKey]);
    await this.reviewSettled();
  }

  async parsePaste(text, { platform = 'instagram', period = 'current' } = {}) {
    await this.ensureSetup();
    await this.btnPaste.click();
    await this.dialog.waitFor();
    await this.page.locator('#pastePlatform').selectOption(platform);
    await this.page.locator('#pastePeriod').selectOption(period);
    await this.pasteBox.fill(text);
    await this.page.getByTestId('btn-parse-paste').click();
    await this.reviewSettled();
  }

  /** The review panel renders notes/unmapped even when there are zero findings,
   *  so wait on the panel having content rather than on the table existing. */
  async reviewSettled() {
    await this.page.waitForFunction(
      () => document.querySelector('[data-testid="ing-review"]').children.length > 0,
      null, { timeout: 20000 }
    );
  }

  /** Rows of the review table as plain objects. */
  async reviewRows() {
    return this.page.$$eval('table.review tbody tr', (trs) =>
      trs.map((tr) => ({
        include: tr.querySelector('[data-rv="inc"]').checked,
        source: tr.querySelector('td:nth-child(2) b').textContent.trim(),
        evidence: (tr.querySelector('.rv-ev') || {}).textContent || '',
        note: (tr.querySelector('.rv-note') || {}).textContent || '',
        target: tr.querySelector('[data-rv="target"]').value,
        platform: tr.querySelector('[data-rv="platform"]').value,
        period: tr.querySelector('[data-rv="period"]').value,
        value: parseFloat(tr.querySelector('[data-rv="value"]').value),
        quality: tr.querySelector('td:last-child').textContent.trim(),
      }))
    );
  }

  async findRow(target, period = 'current') {
    const rows = await this.reviewRows();
    return rows.find((r) => r.target === target && r.period === period);
  }

  async apply() {
    await this.applyBtn.click();
    await this.dialog.waitFor({ state: 'hidden' });
  }

  /** Persisted state, straight out of the app. */
  state() {
    return this.page.evaluate(() => JSON.parse(JSON.stringify(S)));
  }

  metric(platform, period, key) {
    return this.page.evaluate(
      ([p, per, k]) => getMetric(p, per, k),
      [platform, period, key]
    );
  }
}

module.exports = { AuditPage, APP_URL, FIXTURES };
