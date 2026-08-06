# Monthly trend archive (2026-08-06, roadmap item 1)

Suite at this milestone: 412 passing (22 new archive tests × 2 profiles).

## Model

`S.archive[]` — each snapshot:

```
{ id, client, key (normalized client), curStart, curEnd, days, savedAt,
  platforms: { [p]: { metrics (deep copy of current period),
                      derived {er_reach, er_followers, reach_rate, eng_per_post, posts_per_week},
                      growth, scores {overall, pillars} } } }
```

Frozen AT CLOSE TIME: later benchmark or metric edits never rewrite archived scores — this is the
core honesty property, and tests assert it by slashing benchmarks after a close and checking the
archived score is byte-identical while the live score moved.

## Flow

- **Close this month** (Report tab, screen-only card). Preconditions enforced with specific
  toasts: client name set, current-period dates set, ≥1 enabled platform with any current metric.
- **Replace guard:** same client+period → inline warning banner; Replace overwrites (still one
  snapshot), Cancel keeps the original untouched.
- **Delete:** two-click confirm (button flips to "Sure?" for 3s).
- Snapshots ride through JSON Save/Load via `hydrate()` (missing key → empty array, no crash).

## Trends card (printable)

Rendered when ≥2 snapshots share the active client key. Line chart per platform across snapshot
period-ends, metric picker (Followers / Reach / Engagements / ER by reach / Overall score), and a
latest-vs-previous table with Δ%.

**Equal-length rule:** `days` is stored per snapshot; when the two compared periods differ,
period-TOTAL metrics (reach, engagements) get a `≠ days` chip — totals are not directly
comparable across a 30-day and a 31-day month, while point-in-time (followers) and rates
(ER, scores) remain valid. Documented for clients in Calculations §6.

Offline fallback: if the Chart.js CDN never loaded, the chart area explains itself instead of
rendering dead space — the delta table carries the same numbers.

## Bug caught by the new tests

`<div hidden class="banner">` was visible: `.banner{display:flex}` overrides the UA's
`[hidden]{display:none}`. Global `[hidden]{display:none!important}` added — hidden now always wins.
