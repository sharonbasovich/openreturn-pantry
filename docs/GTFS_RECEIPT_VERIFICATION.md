# Offline receipt replay check

Use Node 24+. This optional check-only command requires the original local feed and template as well as the scenario/receipt pair:

```sh
node scripts/verify-gtfs-receipt.mjs \
  --scenario tests/fixtures/gtfs-synthetic/expected/scenario.json \
  --receipt tests/fixtures/gtfs-synthetic/expected/receipt.json \
  --feed tests/fixtures/gtfs-synthetic/feed \
  --template tests/fixtures/gtfs-synthetic/template.json
```

It emits one JSON object and exits 0 on success or 1 on failure. `--help` prints usage. It writes no files, requests no network access and does not follow any paths or URLs from receipt content. Errors contain fixed codes, not source records, local paths or IDs. Success includes the exact supplied scenario and receipt SHA-256 digests and a limited assurance statement.

## Gate a terminal report

Use the same scenario path for both commands, and keep all inputs unchanged:

```sh
node scripts/verify-gtfs-receipt.mjs \
  --scenario gtfs-example-output/scenario.json \
  --receipt gtfs-example-output/receipt.json \
  --feed tests/fixtures/gtfs-synthetic/feed \
  --template tests/fixtures/gtfs-synthetic/template.json && \
node scripts/decision-sheet.mjs gtfs-example-output/scenario.json
```

Here `gtfs-example-output` is the output from the adapter example. `&&` runs the report only if verification succeeds. These are separate processes: this is not atomic against intervening file changes and is not report-embedded enforcement.

## What is checked

The command accepts only CLI-produced receipt format 1 / adapter 1.0.0, including `templateInput`. It replays the existing adapter with the receipt's declared date and route/trip selection and the explicitly supplied local files. Every receipt field must equal the replay result, including input hashes/lengths/row counts, template hashes, selections, services, metadata, stop calls, connection mappings, output hash/counts and limitations. Unknown or missing fields fail. This is intentionally a full replay check, not a weaker pair-only mode. API receipts lacking exact template-file evidence are rejected.

The scenario must equal the exact exported replay bytes, including the final LF. `SCENARIO_BYTES_MISMATCH` means those bytes differ: even valid JSON reformatting, a BOM or changed line endings fails. Do not replace a receipt hash manually; retain the original artifact pair or regenerate both with the adapter. Receipt JSON may be reformatted or its object keys reordered because all fields are compared structurally; its reported SHA-256 changes with its exact bytes. Array order remains significant. Template JSON reformatting changes its original-byte hash and fails, even when it parses to the same object.

Inputs must be strict UTF-8. JSON rejects duplicate keys (including escaped aliases), unpaired surrogates and nesting deeper than 32. Scenario and receipt limits are 4,000,001 and 4,000,000 bytes, respectively; template and feed bounds are unchanged from [the adapter](GTFS_SUBSET.md). Leaf symlinks and nonregular files, a symlink feed directory, unsupported entries and oversized inputs fail. Reads are bounded even if a file grows. This is not a filesystem sandbox: caller-supplied parent directories may contain symlinks, and files should not be modified concurrently. The check describes the bytes actually read, not an atomic snapshot of a mutable directory.

## Producer consistency

The importer now uses the same pure strict JSON parser as replay for the template and the exact serialized output pair, before creating the output directory. This rejects duplicate keys (including escaped aliases and duplicates in values a later key would otherwise discard), malformed Unicode and excessive nesting. Ordinary, CRLF and UTF-8-BOM templates remain accepted; their original bytes still determine `templateInput`. Unambiguous accepted artifact bytes, receipt format 1 and adapter version 1.0.0 are unchanged.

The receipt limit is **4,000,000 UTF-8 bytes including the final LF**, not characters. A feed within the source limits can still produce an oversized receipt, for example through many inactive scoped trip IDs. Generation rejects that pair instead of trimming source records, dropping receipt evidence or writing an unverifiable artifact. Scenario output is checked against the existing 4,000,001-byte replay bound too. The object-based adapter API remains unchanged; callers serializing API results are responsible for their own artifact contract.

The requested output must be outside the source feed. Before nonrecursive directory creation, the importer compares the canonical existing output parent with the canonical feed directory, including ancestor symlink aliases. Existing child directories are already invalid feed entries. This prevents generation itself from adding an unsupported subdirectory to the source used for replay. It does not provide an atomic filesystem snapshot or protection against concurrent path replacement; keep source files and ancestor directories unchanged during generation and verification.

Earlier importer output could succeed and subsequently fail replay on these three conditions. Regenerate from unambiguous template text into a fresh directory outside the feed; do not prune a source or rewrite hashes merely to force acceptance. See [the bounded producer consistency checks](../evidence/GTFS_GENERATION_CONSISTENCY.md). These checks do not broaden GTFS support or add receipt enforcement to browser import or reports.

## What is not checked

The date and selection come from the receipt. Success confirms **internal replay consistency**, not that this is the user's intended service date/scope. Review those fields separately before using the scenario. A consistently replaced scenario, receipt and sources can pass. Hashes are not signatures and there is no trusted external expected digest or authenticity claim. It does not establish source completeness, currentness, licensing permission, practical transit access or real-world efficacy. A pruned source cannot be recognized as incomplete from its own receipt.

Browser import and both existing report paths are unchanged: they do not read or enforce the receipt. Run this check separately before using the exact scenario checked, and retain all source inputs privately. Neither successful synthetic tests nor a passing receipt turns the scheduled-service projection into real-feed validation.

## Local tests

```sh
node --test tests/verify-gtfs-receipt.test.mjs
npm test
npm run check
node --check src/verify-gtfs-receipt.mjs
node --check scripts/verify-gtfs-receipt.mjs
```
