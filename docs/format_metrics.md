# Per-format metrics — Reel / Carousel / Static / Video / Story (2026-08-03)

Suite at this milestone: 308 passing. Closes the brief's requirement for Reel, Carousel, Video and
Story metric sections, previously covered only as format-mix percentages.

## What the tool holds

S.platforms[p].formats.{current|previous}.<format> = { posts, views, reach, eng }
Formats: reel, video (in-feed), carousel, static, story, text — filtered per platform.

## Where the numbers come from

- Meta post export: every row classified by Post type and aggregated. Posts, views, engagements per
  format are exact and reconcile with the account totals from the same import (asserted in tests).
- Manual entry: a table in step 2, current and previous side by side.

Reach per format is never imported — a post export only has per-post reach, and summing it is not
deduplicated unique reach. ER per format is therefore computed against views, which are additive.
The reach field exists for manual entry from a source that reports it properly.

## Derived figures

| Figure | Formula | Status |
|---|---|---|
| Avg views per post | views ÷ posts | standard |
| ER by views | eng ÷ views × 100 | standard |
| ER by reach | eng ÷ reach × 100 | manual reach only |
| Share of output % | posts ÷ all format posts × 100 | standard |
| Share of engagement % | eng ÷ all format eng × 100 | standard |
| Format index | share of engagement ÷ share of output | defined by this tool, labelled as such |

Missing inputs return null, never a fabricated zero.

## Report & recommendations

Per-platform "Content format performance" card: posts (with delta), shares, avg views/post, ER by
views, index chips, and a one-line best/worst read. Two rules: format_underused (P1, index ≥ 1.3 at
< 40% of output) and format_overused (P2, index ≤ 0.7 at ≥ 30%). Thresholds are tool constants and
say so. Neither fires on a single format or balanced formats.

## Bug caught during this change

Caching the review table's option list accidentally deleted existingValue() between the helpers;
the Meta import silently rendered an empty panel. Seven tests failed immediately and named the
cause. Restored; caching kept.
