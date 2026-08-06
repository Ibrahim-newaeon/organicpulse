# Roadmap

Selected 2026-08-06. Ordered by suggested build sequence — each item is scoped to land with tests,
following the data-integrity rules in CLAUDE.md (no invented numbers, evidence on every value).

## 1 · Monthly trend archive

Snapshot each finished audit (client + period + metrics + scores) into an archive; draw trend
lines across months for followers, reach, engagements, ER and pillar scores.

- Storage: `S.archive[]` in localStorage + included in JSON save/load; a "Close this month" action
  freezes the current audit into a snapshot.
- Report gains a Trends card once ≥2 snapshots exist for the same client.
- Guards: a snapshot is immutable; re-closing the same period asks before replacing; trend deltas
  only ever compare equal-length periods.

## 2 · Executive summary generator (EN/AR)

One click builds a bilingual executive summary from computed values only — headline deltas, top
wins, top issues, missing-data list — following the structure of the agency's monthly report
template. Copy button; text appears in the printed report.

- Strictly template-filled from `S` + derived values. If an input is missing the sentence is
  omitted, never padded.
- Every figure in the summary must be traceable to a metric in the audit (same rule as
  recommendations).

## 3 · Community management module

Quantified community metrics (the brief requires them; today only a qualitative checklist item):
comments received, DMs received, responses sent, avg response time, response rate = responses ÷
(comments + DMs). Manual entry per period; Community pillar scoring extended to use the
quantitative rate when present, falling back to the qualitative answer when not.

## 4 · Competitor benchmark tab

Side-by-side comparison of the client vs 2–3 competitor accounts: followers, growth, posting
cadence, per-post engagement where observable, share-of-voice within the tracked set.

- Manual entry first (see item 5 for how the data is captured).
- Every competitor value carries a "captured from public profile on DATE" provenance stamp.
- Comparisons only on metrics both sides actually have — no proxy filling.

## 5 · Competitor capture kit — what's collectable **without** any API

Research + tooling for the practical question: which competitor stats can be gathered with no API
integration.

**Honest framing first:** automated scraping of Instagram/Facebook violates Meta's Terms of
Service and gets accounts/IPs blocked — this tool will not ship a scraper. What IS legitimately
available with no API:

| Observable on a public profile (manual or screenshot) | NOT available without account access |
|---|---|
| Follower / following counts | Reach, impressions, views |
| Post count and posting cadence (dates are visible) | Saves, shares (IG hides them publicly) |
| Format mix (reel / carousel / static, visible per post) | Story metrics of any kind |
| Per-post likes + comment counts where the account shows them | Audience demographics |
| Bio, link, hashtags, caption strategy | Profile visits, link taps |

**Build:** a competitor preset in the screenshot importer — the existing in-browser OCR pointed at
public-profile screenshots (grid + counters), mapping follower count, post count and visible
per-post likes/comments into the competitor tab from item 4. Same review-and-confirm table, same
evidence rules. Third-party trackers (paid) remain the only route to competitor reach/impressions,
and the UI must say so rather than estimate.

---

### Also open (smaller)

- **Arabic-UI screenshot OCR verification** — the label dictionary already carries Arabic synonyms,
  but the OCR path has only been tested against English-UI captures. Needs 2–3 Arabic-UI
  screenshots to fixture.
- **`Az Zarqa'` OCR gap** — trailing apostrophe mangles the place-name match; currently lands in
  Not-mapped (visible, not lost).
- **Live OCR CI job** — a scheduled workflow running `npm run test:live-ocr` on a network-enabled
  runner, so the CDN path is exercised regularly.
