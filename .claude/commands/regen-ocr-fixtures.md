Regenerate the OCR test fixtures from the screenshots in `tests/fixtures/shots/`.

The fixtures (`tests/fixtures/real-ocr.json`, `tests/fixtures/real-ocr-interactions.json`) must be
LITERAL Tesseract output — bar artefacts, icon debris and OCR garbage included. Never hand-clean
them: the whole point is that the mapper is tested against what OCR actually produces.

1. Requires the `tesseract` binary (v5.x) with English data installed.
2. For each screenshot group, run in the documented logical order (overview screens before
   audience screens, so cross-screenshot continuations are exercised):
   `tesseract <file> - -l eng --psm 6`
3. Concatenate with a blank line between files, JSON-encode as `{"text": ...}`, and write over the
   fixture.
4. Run `npx playwright test tests/real-ocr.spec.js tests/interactions.spec.js --project=desktop`.
   Expected-value assertions in the specs encode the true numbers visible in the screenshots — if
   a regenerated fixture changes a mapped value, verify against the image before touching any
   expectation.

$ARGUMENTS
