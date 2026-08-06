Run the OrganicPulse test suite and report results.

1. If `CHROMIUM_PATH` is set in the environment, pass it through; otherwise assume
   `npx playwright install chromium` has been run.
2. Run `npm test` (full suite, desktop + mobile). For a quick iteration loop while editing,
   `npm run test:desktop` is acceptable — but never conclude work with only the desktop project.
3. A single flaky timeout that passes on retry is expected under CPU contention (see CLAUDE.md).
   A test that fails twice is a real defect: investigate the product first, the test second, and
   never loosen a reconciliation assertion to get green.
4. Report: pass/fail counts per project, and for any failure the spec name, the assertion, and
   your diagnosis before any fix.

$ARGUMENTS
