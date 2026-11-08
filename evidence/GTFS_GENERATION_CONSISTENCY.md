# GTFS CLI producer consistency, 2026-11-08

This records bounded local validation of the GTFS CLI producer consistency correction based on PR 7 snapshot `b616ea52446df31e38b61897ca6105524b0fda2e`. The starting snapshot had 724 tests. These checks do not establish real-feed validation or browser acceptance.

## Reproduced before and after

[Recorded CLI results](generation-consistency/before-after.json) compare the original and candidate against the same generated synthetic inputs:

- Duplicate template title: original importer exit 0, replay exit 1 `DUPLICATE_JSON_KEY`; corrected importer exit 1 before creating any output.
- 50,000 additional inactive scoped trips with Unicode IDs: 4,300,074-byte `trips.txt`, below its 8,000,000-byte limit and below row/cell bounds. The complete feed remains below 32,000,000 bytes. Original importer emitted a 4,256,251-byte receipt and replay failed `INPUT_SIZE_LIMIT`. Corrected importer rejects before output. Character count alone would miss this case. No source trimming was introduced.
- Output directly inside feed: original importer created the pair and thereby changed the feed; replay failed `UNSUPPORTED_FEED_ENTRY`. Corrected importer rejects the output location before writing. Canonical ancestor-alias paths are covered too.

## Implementation and compatibility

`src/gtfs-artifact-json.mjs` contains the unchanged strict parser and replay limits, extracted into a pure Node module with no file I/O. `src/verify-gtfs-receipt.mjs` imports and reexports the same public names for compatibility. The importer validates the original template text, then both exact serialized outputs (including final LF), before reserving a fresh output directory. It checks the canonical output parent against the canonical feed directory before nonrecursive mkdir.

Receipt format 1, adapter version 1.0.0, adapter API, model, browser, package commands and committed expected fixture outputs are unchanged. The ordinary, CRLF, BOM and Unicode template tests compare each generated pair against the prior serialization formula, including original-template byte hashing, and then run importer → verifier → terminal report. Existing expected synthetic fixture tests still pass. JSON rejection errors now expose the fixed shared JSON code rather than permissive parsing; no discarded source value is echoed.

## Checks on candidate

- `npm test`: **740 passed, 0 failed**, up from 724, with 16 new tests. [Full log](generation-consistency/npm-test.log).
- `npm run check`: passed. [Log](generation-consistency/npm-check.log).
- Additional syntax checks: shared JSON module, adapter, verifier, both GTFS CLIs and new tests passed. [Log](generation-consistency/syntax-check.log).
- New regressions cover exact/escaped/nested/discarded-value duplicate keys, malformed escaped Unicode values/keys, malformed UTF-8 bytes, excessive nesting, no new output or overwrite on failure, ordinary/CRLF/BOM/Unicode valid templates, exact receipt UTF-8 limit minus one/at/plus one, oversized real adapter evidence, successful generation/replay/report, and source placement through an ancestor alias.

## Boundaries

The output-parent check is sufficient for the supported nonrecursive output creation and regular-file-only feed. It is not a generalized filesystem sandbox, race defense or atomic snapshot. Sources and path ancestors must remain unchanged during the commands. Pre-existing output remains non-overwritable. The pure object API can still return a receipt too large for CLI replay; it has not been silently tightened. This correction aligns CLI production with replay's existing JSON/byte and feed-directory contracts, not with authenticity, intended selection, freshness, complete-source or real-world feasibility guarantees. Reports and browser import still do not enforce receipt verification. No real feed, policy, hosted demo, permissions or Actions were changed.
