# Data ingestion upgrade + audit of the original file (2026-07-26, updated 2026-08-03)

Suite at this milestone: 236 passing (desktop + Pixel 7), 2 opt-in live-OCR tests skipped.

## 1 · What was added

Three new ways to get data in, all landing in one review-and-confirm table. Nothing is written
into the audit until the user presses Apply. Every staged value keeps the raw source string it came
from as evidence, and carries a quality flag.

| Route | Input | Notes |
|---|---|---|
| 📱 Screenshots | PNG/JPG of Instagram / Facebook Insights | Two drop zones — Current period and Previous period. OCR runs in-browser (Tesseract.js, lazy-loaded from CDN, multi-host fallback). Images never leave the browser. |
| 📊 Meta report | Business Suite post-level export, .csv or .xlsx | XLSX read via SheetJS, lazy-loaded. Rows bucketed into current/previous by Publish time, then summed. |
| 📋 Paste text | Typed or pasted Insights text | Same mapper as OCR. Also the documented fallback when the OCR engine cannot load. |

The existing CSV-template route is unchanged and still present.

### Screenshot buckets and the anti-duplication guards

Screenshots are filed under the period they were taken for, and each bucket is OCR'd and mapped
independently — a Current capture can never contribute a value to the Previous period.

- Each bucket shows its own date range from Setup, or "no dates set" if none exist.
- The same image is refused outright, in either bucket, identified by a SHA-256 of its bytes
  (falling back to name + size + mtime where crypto.subtle is unavailable).
- Overwrite warning in the review table: any row whose target already holds a different value shows
  "Already in the audit: X — applying replaces it". A row re-importing the same value says so
  instead, so the warning stays meaningful.
- Audience data is not period-scoped: one audience profile per platform. A previous-period
  gender / age / location reading is flagged RISKY and switched off. Previous-period metrics are
  unaffected.

### Quality flags on every staged row

| Flag | Meaning | Default |
|---|---|---|
| EXACT | Direct read or an exact aggregation | ticked |
| APPROX | A close proxy — stated in the row's note | ticked |
| RISKY | Methodologically unsafe for this audit | unticked |
| CONFLICT | Same field read more than once with different values | unticked, all readings kept |

### Judgement calls encoded (each surfaced in the UI)

- Summed per-post reach is RISKY — not deduplicated unique reach; note points to the account-level
  "Accounts reached" figure instead.
- Facebook defaults to organic-only ("from Organic posts" columns); a checkbox switches to totals.
- "Follows" from a post export is APPROX — post-attributed only, undercounts total new followers.
- "Net followers" maps to a net_followers metric flagged as net (not gross); descriptive only.
- Instagram's non-follower split is APPROX — measured against views, not reach.
- Age bands 55-64 and 65+ are summed into the tool's 55+ band, shown in the evidence column.
- Date order is verified from the data; when unverifiable the MM/DD assumption prints as
  [ASSUMPTION].
- Rows outside both periods are counted and reported, never silently dropped.
- A Data provenance table appears at the top of the Report for every import.

## 2 · Defects found in the original file and fixed

| # | Defect | Impact |
|---|---|---|
| 1 | parseCSV split on newlines before handling quotes | Data corruption — Meta exports carry multi-line captions in quoted fields. Replaced with an RFC4180 parser that sniffs , ; tab and strips the BOM. |
| 2 | JSON "Load Audit" shallow-assigned with no per-platform guard | A saved file missing a platform crashed the render. Both load paths now share one hydrate(). |
| 3 | Audience location inputs rendered a fixed 5 rows | Imported countries beyond the 5th were stored but invisible. Now renders max(5, actual). |
| 4 | No net_followers metric | Instagram's headline "Net followers" had nowhere to go. |

## 3 · Bugs caught by the tests during development

1. Loose label matching — "Top content by views" proposed the Impressions metric. Exact-match only now.
2. Range labels torn apart — "13-17" became label "13-" + value 17.
3. Tile labels mis-ordered — "Net followers" shadowed by "Followers"; now longest-first, reading order.
4. "24m" parsed as 24,000,000 — it means 24 minutes ago. Single-letter multipliers must be uppercase.
5. Mangled per-post table rows treated as labels leaked values into account metrics.
6. "13.6% followers" became the follower count — a percentage can no longer fill a count metric.
7. The app's own tab bar was read as a section heading, orphaning continuation rows.
8. Select-all checkbox re-rendered mid-click and always showed checked.

## 4 · Verified against the real files

Seven Instagram Insights screenshots via genuine Tesseract 5.3.4 output: Views 3,803,119 ·
Net followers +645 · Interactions 5,354 · Accounts reached 498,967 · Profile visits 46,877 ·
Bio link taps 630 · Followers 47,527 · gender 63.5/36.5 · six age bands · five countries.
Two Meta CSV exports (June 2026): IG 27 rows with engagement components reconciling to the total;
FB 32 rows with organic-only views and native combined engagement column.

## 5 · Known limitation

The in-browser OCR engine downloads from a CDN on first use; the CI sandbox blocks those hosts, so
the engine-load step is covered by the opt-in live spec only:
LIVE_OCR=1 npx playwright test tests/ocr-live.spec.js --project=desktop
