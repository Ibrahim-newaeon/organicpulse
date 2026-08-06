# Segmented Interactions screen + organic/ads split (2026-08-05)

Suite at this milestone: 368 passing. Driven by ten screenshots of the newer Instagram Insights
layout (1–31 Jul period).

## 1 · Per-content-type tabs are summed

Instagram's "By interaction" panel shows one value per tab — Posts, Reels, Stories. Previously the
importer saw Likes three times with different values and flagged a CONFLICT. They are parts of a
whole: readings inside a By-interaction section are tagged as segments and added together, with the
arithmetic printed as evidence (1,459 + 1,619 = 3,078).

Guards: a single tab is APPROX ("a slice, not the account total"); a segment vs a genuine
account-level reading still CONFLICTs; identical images are blocked by the file-hash guard.

## 2 · Ads-inclusive totals are split

The headline tiles state how much came from ads (62.2% under Interactions 24,616; 85.9% under
Views 11,108,286). The importer stages two rows: the ads-inclusive total (RISKY, off) and the
computed organic remainder (APPROX, on) — 9,305 and 1,566,268 here, arithmetic shown. APPROX
because Instagram rounds the percentage. The pair is exempt from conflict detection.

## 3 · New-layout labels

Viewers → reach · Replies (Stories) → story replies · Reposts → new reposts metric (was wrongly
folded into shares) · Growth→Overall → net followers (Growth section only) · Growth→Follows /
Unfollows · External link taps → link clicks · Towns/cities ⟷ Countries chip: leftmost taken as
active, declared as [ASSUMPTION].

## 4 · Bugs the real screenshots exposed

1. Followers became 30 — the tile prints the number above the label, and the caption
   "+0.5% vs Jun 30" was paired as the value. Bare values now look one line ahead; a line with a %
   not at its end is a comparison caption, never a value.
2. Cities imported as countries — chip order differs between layouts; leftmost wins now.
3. Place names with commas were dropped (Ruseifa, Az Zarqa).

## 5 · Verified against the full ten-screenshot batch

Engagement components sum correctly; both ads tiles split; 309,574 followers; 4,827 follows;
3,313 unfollows; 1,514 net (4,827 − 3,313 reconciles); 31,170 profile visits; 2,409 link taps;
929,164 viewers → reach; age bands total ~100; cities correct. Known gap: "Az Zarqa'" (3.2%) — OCR
mangles the trailing apostrophe; it lands in Not-mapped, visible rather than silently lost.
