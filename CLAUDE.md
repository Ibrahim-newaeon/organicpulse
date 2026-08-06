# OrganicPulse — Claude Code guide

Single-file organic social media audit tool for Meta platforms (Instagram + Facebook first, five
more supported). Bilingual EN/AR with full RTL. Built for agency monthly reporting in Gulf markets.

**The product is `organicpulse.html`. It is both the source and the shippable artifact.**
There is deliberately no build step: a build that assembles the file would eventually drift from
what ships, and portability (email the file, open it anywhere, works offline) is the core feature.
Edit the file directly; the test suite is the safety net.

## Commands

```bash
npm i                                   # installs @playwright/test only
npx playwright install chromium         # once, unless CHROMIUM_PATH is set
npm test                                # full suite, desktop + Pixel 7 (~370 tests, ~5 min)
npm run test:desktop                    # faster iteration loop
CHROMIUM_PATH=/opt/pw-browsers/chromium npm test    # reuse a preinstalled Chromium
npm run test:live-ocr                   # opt-in: real in-browser OCR, needs network
```

Syntax-check the inline scripts without a browser:

```bash
python3 -c "
import io,re
h=io.open('organicpulse.html',encoding='utf-8').read()
for i,b in enumerate(re.findall(r'<script(?![^>]*src=)[^>]*>(.*?)</script>', h, re.S)):
    io.open(f'/tmp/_b{i}.js','w',encoding='utf-8').write(b)
" && for f in /tmp/_b*.js; do node --check "$f" || echo "FAIL $f"; done
```

## Architecture — one file, six parts

`organicpulse.html` contains, in order:

| Part | What lives there |
|---|---|
| `<style>` | Full design system. Tokens in `:root` follow REVacity2 (see Theme below). Print CSS at the bottom renders the Report + Recommendations as a light PDF. |
| Body HTML | Header, 6-step tab nav (Setup → Data → Benchmarks → Calculations → Report → Recommendations), one `<section class="view">` per step, the CSV dialog, and the ingestion wizard `<dialog id="ingestDialog">`. |
| Script A — data layer | `PLATFORMS`, `METRICS` (per-platform catalog), `FORMATS` (reel/video/carousel/static/story/text), `QUAL_ITEMS`, benchmarks + industry presets, i18n table `I18N.ar`, state `S`, `defaultState()`/`hydrate()`/`saveLocal()`, RFC4180 `parseDelimited`, CSV template import. |
| Script B — analysis engine | `derive()` (rates), pillar scoring, `formatStats()` (per-format shares + index), `REC_RULES` (evidence-first recommendation triggers). |
| Script C — UI | `switchView`, all render functions (`renderData`, `renderBench`, `renderReport`, `renderRecs`, `renderCalc`), Chart.js charts, branding, JSON save/load, print flow, i18n applier. |
| Script D + E — ingestion | Screenshot OCR (Tesseract.js, lazy CDN), Meta CSV/XLSX import (SheetJS, lazy), pasted-text mapper, label-synonym dictionary EN/AR, staging model, review-table UI, apply, provenance log. |

State shape (`localStorage` key `organicpulse_v1`):
`S.platforms[p] = { enabled, metrics:{current,previous}, qual, audience, formats:{current,previous} }`
plus `meta`, `benchmarks`, `weights`, `brand`, `importLog`. **Any state read must survive a partial
or older saved file** — `hydrate()` is the single hydration path for both localStorage and JSON
file loads; never `Object.assign` a parsed file straight onto `S`.

## Data-integrity rules (non-negotiable)

This is an evidence-first audit tool. The rules the codebase encodes:

1. **Never invent a number.** Missing data renders as `—` / `[MISSING DATA]` and is excluded from
   scoring — it never counts as zero.
2. **Every imported value carries evidence** — the raw source string it came from, shown in the
   review table and kept through to the provenance card in the Report.
3. **Quality flags:** `EXACT` (direct read / exact aggregation), `APPROX` (stated proxy, note
   required), `RISKY` (methodologically unsafe — default **unchecked**), `CONFLICT` (same field,
   different values — all readings kept, all unchecked, user decides).
4. **Nothing enters `S` without the user pressing Apply** in the review table.
5. **Assumptions are printed** with the literal prefix `[ASSUMPTION]` (date order, active chip on a
   screenshot, single-tab readings…).
6. **Reach is never summed across posts** — per-post reach is not deduplicated unique reach. This
   is why per-format ER is computed against views and why summed reach from a Meta export stages as
   `RISKY`, off by default.
7. **Organic only.** Facebook imports default to the `from Organic posts` columns; ads-inclusive
   Insights tiles (`x% from ads`) stage the total as `RISKY`-off plus a computed organic remainder.
8. **Segments sum, totals conflict.** Readings from Instagram's per-content-type tabs
   (Posts/Reels/Stories `By interaction` panel) are parts of a whole and are added together; two
   account-level readings of the same field with different values are a CONFLICT.
9. **Benchmarks are editable placeholders**, labelled as such in the UI. Industry presets scale
   from a published ordering; they are never presented as verified sector data.
10. **Single-letter K/M/B multipliers must be uppercase** (`45K`, `1.3M`). Lowercase `24m` is a
    timestamp (24 minutes ago) in the same UI. Do not "fix" this.

## Testing

Playwright, Page Object Model (`tests/pages/AuditPage.js`), positive AND negative cases.

- Every run loads the app with **all external requests blocked** — the offline path is always
  exercised. `goto({ offline: false })` only in the opt-in live-OCR spec.
- `tests/fixtures/real-ocr*.json` are **literal Tesseract 5.3.4 output** of the screenshots in
  `tests/fixtures/shots/` — bar artefacts and OCR garbage included, on purpose. Regenerate with
  `for f in tests/fixtures/shots/*.jpeg; do tesseract "$f" - -l eng --psm 6; echo; done` after
  changing screenshots. Never hand-edit them into cleanliness.
- Meta export fixtures in `tests/fixtures/meta/` are real Business Suite exports (June 2026, one IG
  post-level, one FB page-level with 200 columns). Expected values in specs are the true sums.
- `data-testid` on every interactive element; add one to anything new.
- Reconciliation tests are load-bearing: per-format posts/engagements must equal the account totals
  from the same import. Keep them green rather than loosening them.
- `retries: 1` is deliberate — the suite saturates CPU and one arbitrary test may time out per full
  run. Failing **twice** means a real defect. Never raise retries to hide a repeatable failure.

## Theme

REVacity2 design system (https://eman-salameh87-hub.github.io/REVacity2/), applied 2026-08-06:
bg `#030208`, ink `#eef0ff` (cream), accent `#9db4ff` (periwinkle — light, so filled elements use
`--accent-ink` dark text, never white), good `#ffc857` (their pos), bad `#ff4d6d` (their neg),
`--warn #ffa14d` is **derived** (the source palette has no third state color). Fonts: Cormorant
Garamond (display, ≤700 weight), Inter (body), IBM Plex Mono (mono), IBM Plex Sans Arabic +
Alexandria for RTL. All colors flow from `:root` tokens except Chart.js options (rgba literals,
search `rgba(238,240,255,` to find them) and the ARTECH logo SVG strokes.

## UI conventions

- 56px min touch targets (`--touch`), 44px for secondary controls; ≤3 primary nav links per view.
- Bilingual: static text uses `data-i18n` + `I18N.ar`; dynamic strings use `L(en, ar)` resolved at
  render time. Arabic switches `dir=rtl` — use logical CSS properties (`inset-inline-start`,
  `margin-inline-…`), never `left`/`right`, and re-render dynamic views on language switch.
- CSS-only animations. localStorage persistence (this file also ships as a claude.ai artifact
  where localStorage is unavailable — `saveLocal()` is try/caught for that reason).
- Never remove the disclosure banners (benchmark placeholder warning, missing-data notes).

## Gotchas that have already burned us

- `parseCSV` must stay RFC4180 (quoted fields contain newlines — Meta captions).
- Section headings vs the app's own chrome: `"Overview Content Audience"` is a tab bar, not a
  section; treating it as one orphans audience rows that continue on the next screenshot.
- Instagram sometimes prints the value **above** its label (`309,574` then `Followers`) and
  comparison captions (`+0.5% vs Jun 30`) must never be parsed as values.
- The review table's `<option>` list is cached per platform (`_targetOptCache`) — call
  `clearTargetOptCache()` on language switch; `existingValue()` sits between the cache helpers,
  don't delete it when touching them (a refactor once did).
