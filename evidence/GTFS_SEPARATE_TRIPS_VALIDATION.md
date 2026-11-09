# Explicit separate-trips projection validation

Local-only extension of the PR7 baseline (`e03584d6`), November 8, 2026. No remote writes, browser/model changes or real-feed claims. All existing files and immutable v1 fixtures remain; edits are confined to adapter policy, receipt replay dispatch, CLI option, documentation and tests.

## Contract

Default imports retain receipt1 / adapter1.0.0 bytes and block refusal. Explicit `--block-policy separate-trips` produces receipt2 / adapter1.1.0. Exact original trip IDs and every intra-trip adjacent leg remain. No inter-trip in-seat link or synthetic connection is created. Same-block trip changes use ordinary same-stop transfer buffer and transfer count. A zero buffer permits a zero-gap scheduled transfer only when the transfer count allows it. Existing within-trip continuation remains.

Receipt evidence enumerates all supplied active/inactive members of blocks touched by selected active trips, including out-of-scope members, exact route/service/trip IDs, scope/selection, omission reasons and service activation evidence. Unrelated blocks are not summarized; their source bytes are still hashed. No assertion of source completeness, block chronology, vehicle allocation or practical feasibility is made. Lost in-seat paths may change coverage and rankings.

## Checks completed

- `npm test`: 754 passed, zero failed (740 pre-existing tests, 14 new tests).
- `npm run check`: passed.
- Explicit `node --check` on adapter, receipt verifier and import CLI: passed.
- All original synthetic expected scenario/receipt bytes unchanged; existing legacy replay suite passes. Version1 explicitly dispatches to `reject-blocks`, never a future default.
- New tests cover route/trip scope, exceptions, out-of-scope active/inactive partners, singleton and blank blocks, complete untouched trip chains, malformed block IDs, nonempty transfers/frequencies/boarding/safe-duration refusal, transfer buffer/count behavior, policy/version/membership tampering, no overwrite/source edits, all-or-nothing rejection and oversized membership receipt/source bounds.

## Reproducible synthetic retained run

`gtfs-separate-trips/` contains an entirely synthetic source/template, generated artifacts, successful `verification.json`, and terminal `report.txt`. The synthetic source differs from the existing baseline fixture only by explicit block identities.

```
node scripts/import-gtfs-subset.mjs --feed evidence/gtfs-separate-trips/feed --date 2026-11-12 --route R --template evidence/gtfs-separate-trips/template.json --out NEW_OUTPUT_DIRECTORY --block-policy separate-trips
node scripts/verify-gtfs-receipt.mjs --feed evidence/gtfs-separate-trips/feed --template evidence/gtfs-separate-trips/template.json --scenario NEW_OUTPUT_DIRECTORY/scenario.json --receipt NEW_OUTPUT_DIRECTORY/receipt.json
node scripts/decision-sheet.mjs NEW_OUTPUT_DIRECTORY/scenario.json
```

Retained result: 3 stops, 2 selected trips, 4 original adjacent legs; receipt replay succeeds as version2/1.1.0. Successful synthetic conversion does not validate a real feed or demonstrate real-world travel usefulness. Browser/report receipt enforcement remains unchanged (absent); run replay separately against the exact files used.

## Independent review

The [independent source review](separate-trips-independent/REVIEW.md) passed the full 754-test suite, syntax checks and 170 separately authored synthetic checks, including 120 exact comparisons against baseline `e03584d6`. Without an explicit baseline checkout the portable probe runs 50 checks and clearly skips those 120 comparisons. Three isolated controlled regressions were detected. The reviewed candidate was unchanged by the reviewer. This is bounded evidence, not an exhaustive proof or browser/physical acceptance.
