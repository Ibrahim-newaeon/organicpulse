# OrganicPulse Project Guide

OrganicPulse is an offline-capable bilingual organic-social audit tool. The product and deployable artifact are the single file **organicpulse.html**. There is intentionally no build step; edit that file directly and use Playwright as the safety net.

## Structure and sources

Within **organicpulse.html**, CSS tokens, page structure, state, analysis, rendering, import/OCR, and localization live together. **tests/** contains the Playwright Page Object Model and real-world fixtures. **README.md** explains user-facing behavior. Dated roadmap/status documents are context, not runtime truth.

## Commands

~~~bash
npm install
npx playwright install chromium
npm run test:desktop
npm run test:mobile
npm test
~~~

The live OCR test is opt-in and uses network access; do not make it part of the offline default without an explicit decision.

## Data-integrity rules

- Never invent a number. Missing values display as missing and are excluded; they are not zero.
- Preserve evidence and provenance for every imported value.
- Imported values enter application state only after the user reviews and applies them.
- Keep EXACT, APPROX, RISKY, and CONFLICT meanings distinct. Unsafe or conflicting readings default off.
- Print assumptions explicitly.
- Never sum per-post reach as unique account reach.
- Prefer organic-only fields; ads-inclusive totals must be labeled and treated conservatively.
- Preserve RFC4180 parsing because captions can contain commas and newlines.
- Hydrate older/partial saved state only through the established hydration path.
- Keep uppercase K/M/B multipliers distinct from lowercase time abbreviations.

## UI and testing rules

Maintain English/Arabic parity, RTL logical properties, offline behavior, print/PDF output, accessible controls, and existing design tokens. External requests are blocked in the default test suite; keep that path working. Do not clean real OCR fixtures into idealized text or loosen reconciliation assertions to make failures disappear.

A change is ready when the affected desktop/mobile tests pass and inline scripts have no syntax errors.
