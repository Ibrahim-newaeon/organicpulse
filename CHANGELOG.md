# Changelog

Full engineering notes for each milestone live in `docs/`.

## 2026-08-28 (2) — Competitor benchmark (roadmap item 4)

- **Competitors entry card** in step 2: per-competitor accordion (name, handle, platform) with
  two dated captures — followers, posts in the audit period, sampled posts, likes/comments
  totals. Only publicly visible quantities have fields; reach/impressions/saves/stories
  deliberately have none.
- **Per-platform Report card**: client row (highlighted, same likes+comments basis — never
  total engagements) vs competitors: followers, exact follower share, growth (two dated
  captures; windows ≠ audit period ±3 days flagged), posts, visible eng/post (sample size
  shown), estimated engagement share with a printed `[ASSUMPTION]`.
- **Provenance enforced**: every compared value carries "captured from public profile on DATE";
  a dated stamp missing → values listed but never compared. Missing inputs → "—" and named
  exclusion from shares — no proxy filling anywhere.
- New `competitor_growth_gap` P2 rule (fires only on unflagged windows, evidence quotes both
  growths + capture dates). Calculations tab §8. Six-step structure unchanged.
- Suite: **550 passing** (21 new tests × desktop + Pixel 7). Details: `docs/competitor_benchmark.md`.

## 2026-08-28 — Community management module (roadmap item 3)

- Quantified community metrics, manual entry per period: **DMs received**, **responses sent**,
  **avg response time (min)** — the comment side reuses the existing Comments metric, entered
  once, used twice. `response_rate = responses ÷ (comments + DMs) × 100` requires **all three
  inputs** (blank blocks the calculation, an entered 0 counts, 0÷0 is no rate) — never computed
  against comments alone.
- New editable `response_rate` benchmark (placeholder 75%, preset-neutral). Community pillar:
  60% rate-vs-benchmark + 25% responsiveness qual + 15% comment share when the rate exists;
  the original 70/30 qual blend otherwise — quant extends, absence never punishes.
- Scorecard tiles (response-time delta color inverted — lower is better), benchmark row, new
  `response_gap` P1 rule with arithmetic evidence that supersedes the qualitative rule, and an
  executive-summary community bullet (EN/AR). Calculations tab §7 documents the rules.
- Paste-mapper synonyms (exact multi-word only) + CSV template coverage.
- Suite: **508 passing** (27 new tests × desktop + Pixel 7). Details: `docs/community_module.md`.

## 2026-08-06 (3) — Executive summary generator (roadmap item 2)

- New **copy-ready executive summary card** at the top of the Report, EN + AR, following the
  agency monthly-report template: header/scope, "the month in N points", top wins, top issues,
  priority actions, data sources, data limitations, honesty footer.
- Strictly template-filled from entered/imported values: a sentence with a missing input is
  omitted (never padded), cross-platform deltas print only when every counted platform has both
  periods, priority actions are the top-3 triggered recommendation rules verbatim, and the
  missing-metrics list is always printed. Renders only when ≥2 headline bullets exist.
- **Copy** (active language) and **Copy EN + AR** (both, separated) with a `file://`-safe
  clipboard fallback. Buttons are screen-only; the summary text prints with the report.
- Suite: **454 passing** (21 new tests × desktop + Pixel 7). Details: `docs/exec_summary.md`.

## 2026-08-06 (2) — Monthly trend archive (roadmap item 1)

- **"Close this month"** on the Report freezes the current audit — raw current-period metrics,
  derived rates and pillar scores are deep-copied into an immutable snapshot (`S.archive[]`,
  rides through localStorage and JSON save/load). Editing benchmarks or metrics afterwards never
  rewrites archived history (asserted by tests).
- **Trends card** appears once ≥2 snapshots exist for the same client (case/whitespace-insensitive
  match): line chart across months per platform (Followers / Reach / Engagements / ER / Overall
  score picker) + a latest-vs-previous delta table. Prints with the report; the management card
  (close / replace / delete) is screen-only.
- **Guards:** closing the same client+period warns before replacing; deletes need a second
  confirming click; period-total metrics (reach, engagements) are flagged `≠ days` when the two
  periods differ in length — point-in-time and rate metrics stay comparable. Rules documented in
  the Calculations tab (§6).
- **Bug found by the new tests:** the `hidden` attribute was silently defeated by `.banner`'s
  `display:flex` — a global `[hidden]{display:none!important}` now guarantees hidden means hidden.
- Suite: **412 passing** (desktop + Pixel 7).

## 2026-08-06 — REVacity2 theme + repo architecture

- Re-themed the whole tool to the REVacity2 design system: bg `#030208`, cream ink `#eef0ff`,
  periwinkle accent `#9db4ff` (filled elements switched to dark text for contrast), gold `#ffc857`
  as positive, `#ff4d6d` as negative, derived amber `#ffa14d` for warnings. Fonts: Cormorant
  Garamond / Inter / IBM Plex Mono (+ IBM Plex Sans Arabic, Alexandria for RTL). Chart grids,
  banners, chips, gradients, logo strokes and brand-color defaults all swept; print CSS unchanged.
- Repository established: single-file source (no build step, by design), Playwright suite around
  it, CLAUDE.md, CI, roadmap.

## 2026-08-05 — Segmented Interactions screen + organic/ads split

- Instagram's per-content-type tabs (Posts / Reels / Stories "By interaction") now **sum** into
  account totals with the arithmetic shown as evidence, instead of colliding as CONFLICTs.
- Ads-inclusive headline tiles (`x% from ads`) stage two rows: the total (RISKY, off) and the
  computed organic remainder (APPROX, on).
- New: `reposts` metric (was wrongly folded into shares), Viewers→reach, Growth block mapping
  (Overall→net, Follows, Unfollows), Towns/cities vs Countries chip detection (leftmost = active,
  declared as `[ASSUMPTION]`), value-above-label tiles, comparison-caption guard
  (`+0.5% vs Jun 30` can no longer become a value), comma-bearing place names.
- 368 tests at this point. Details: `docs/interactions_screen.md`.

## 2026-08-03 (2) — Per-format metrics

- `FORMATS` catalog + per-platform `formats.{current,previous}` state; exact per-format posts /
  views / engagements aggregated from Meta post exports (reach deliberately excluded — summing
  per-post reach is not unique reach; per-format ER is computed against views).
- Report card with share-of-output, share-of-engagement and the **format index** (share of
  engagement ÷ share of output — defined by this tool, labelled as such); two recommendation rules
  driven by it; manual entry table in step 2. Reconciliation tests: format totals must equal the
  account totals from the same import. Details: `docs/format_metrics.md`.

## 2026-08-03 (1) — Screenshot period buckets + duplicate guards

- Screenshot import split into **Current / Previous drop zones**, each OCR'd and mapped
  independently; SHA-256 content hashing refuses the same image anywhere; overwrite warnings in
  the review table (`already in the audit: X`); audience breakdowns from a previous period flagged
  RISKY because audience state is per-platform, not per-period.

## 2026-07-26 — Data ingestion release

- Ingestion wizard: screenshot OCR (in-browser Tesseract.js), Meta Business Suite CSV/XLSX import
  (RFC4180 parser, date-order verification, organic-only default), pasted-text mapper (EN/AR
  labels, Arabic-Indic digits), all through one review-and-confirm staging table with
  EXACT/APPROX/RISKY/CONFLICT flags and a provenance card in the Report.
- Fixed in the original tool: newline-corrupting CSV parser, crash-prone JSON load path (single
  `hydrate()` now), invisible imported countries beyond row 5, missing net-followers metric.
- Details: `docs/import_changelog.md`.

## Baseline — OrganicPulse audit tool

Six-step bilingual audit workflow: setup, manual metric entry (quantitative + qualitative +
audience), editable benchmarks with industry presets (labelled placeholders), documented
calculations, scored report with charts, rule-based recommendations. Single HTML file,
localStorage persistence, JSON save/load, print-to-PDF.
