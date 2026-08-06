# OrganicPulse

**Single-file organic social media audit tool.** Open `organicpulse.html` in any modern browser —
no server, no install, works offline after first load. Built for agency monthly reporting on Meta
platforms (Instagram, Facebook; TikTok, LinkedIn, YouTube, Snapchat, X also supported), bilingual
English/العربية with full RTL.

Theme follows the [REVacity2](https://eman-salameh87-hub.github.io/REVacity2/) design system.

## What it does

A 6-step audit workflow: **Setup → Data → Benchmarks → Calculations → Report → Recommendations.**

- **Four ways to get data in**, all landing in one review-and-confirm table — nothing enters the
  audit until you press Apply, and every value keeps the raw source text it came from:
  - 📱 **Screenshots** of Instagram/Facebook Insights — OCR runs *inside your browser*
    (Tesseract.js); images never leave your machine. Separate Current / Previous drop zones with
    SHA-256 duplicate blocking.
  - 📊 **Meta Business Suite exports** (.csv / .xlsx) — rows bucketed into current/previous by
    publish time, per-format performance computed exactly, organic-only by default.
  - 📋 **Pasted text** — same mapper as OCR; EN + AR labels, Arabic-Indic digits, `1.3M`/`45K`.
  - ⬇ **CSV template** for fully manual pipelines.
- **Evidence-first honesty:** quality flags on every imported value (`EXACT` / `APPROX` / `RISKY` /
  `CONFLICT`), printed `[ASSUMPTION]` notes, ads-inclusive totals split into their organic
  remainder, missing data excluded from scoring — never guessed.
- **Scoring** against editable benchmarks across five weighted pillars, with every formula
  documented in the Calculations tab. Per-format performance (Reels vs Carousel vs Static vs
  Video) with an engagement-vs-output index.
- **Rule-based recommendations** — each one states the metric observed, the evidence, and the
  action. No metric, no recommendation.
- **Report** with charts, audience breakdowns, data provenance, and a print-ready PDF export.
  Client branding (logo + colors) built in.

Data stays in your browser (localStorage) with JSON save/load for portability.

## Development

```bash
npm i
npx playwright install chromium
npm test          # ~370 tests, desktop + mobile profiles
```

See **CLAUDE.md** for the architecture map, the data-integrity rules the code enforces, and the
testing conventions. See **ROADMAP.md** for what's planned.

## Repository layout

```
organicpulse.html        ← the product (source AND artifact — no build step, by design)
tests/                   ← Playwright suite, Page Object Model
tests/fixtures/shots/    ← real Insights screenshots (both IG layouts)
tests/fixtures/meta/     ← real Meta Business Suite exports
tests/fixtures/*.json    ← literal Tesseract output of the screenshots
docs/                    ← per-milestone engineering notes
.claude/commands/        ← Claude Code slash commands (/test, /regen-ocr-fixtures)
```

## License

No license granted. All rights reserved — internal agency tooling.
