# Independent review: single-process replay-checked report

**Result: no defect reproduced in the reviewed final implementation.** The new command meets its narrow claim: full replay completes before report generation, and the report uses the captured scenario string rather than reopening its path. This does not authenticate a feed or establish intended scope, currentness, archive completeness, an atomic directory snapshot or operational feasibility.

## Independently executed checks

Node v24.22.1, November 8, 2026:

- Full candidate test suite: **767 passed, zero failures, zero skips**.
- Existing `npm run check`: passed. Both new modules also separately passed `node --check`; the unchanged package check does not include them.
- Inherited `scripts/verify-oracle-mutations.mjs`: unmodified control passed and all five deliberately faulty local copies were detected. This is inherited routing-oracle coverage, not mutation completeness for the new report.
- Separately authored `probe.mjs`: **47 checks passed** against the final header bytes.
- Separately authored `compatibility.mjs`: all **115 baseline files remain present**, with **113 byte-identical and all modes unchanged**. The only changed baseline files are README and receipt-verification documentation, each an additive link/description. Existing runtime, adapter, verifier, commands, package metadata, tests and golden artifacts remain byte-identical.

These results were executed independently rather than copied from the author's evidence. Candidate source was not edited. Temporary synthetic inputs were created and removed by the probe. No private feed was used or included in this review.

## Adversarial probe coverage

Eight combinations of two valid dates, route versus exact-trip scope, and receipt v1/reject-blocks versus v2/separate-trips passed. Their complete ordinary report bodies, including final newline, equal the original baseline CLI output byte-for-byte. Provenance names the actual receipt-declared date and scope, correct block policy, agency timezone, service-day time basis, and exact supplied scenario/receipt hashes. Different valid declared dates/scopes are accepted as declarations, not misrepresented as externally confirmed intent. The lossy v2 and limited-assurance warnings remain visible.

An independent subprocess hook replaces **every input file** with invalid content immediately after its captured read closes. The output still exactly equals the original captured-input report, all replacement writes are verified, and every supplied file opens exactly once. A second hook grows the scenario after its size check: bounded reading rejects with `INPUT_SIZE_LIMIT` and emits no report. These probes test the promised captured-byte binding without making a stronger directory-atomicity claim.

Input failures exit 1 with empty stdout and fixed-code JSON stderr. Checked cases include:

- Missing, symlinked, directory-valued, malformed UTF-8 and oversized scenario/receipt/template inputs.
- Symlink feed directory and member, directory-valued member, unsupported private-named entry, malformed UTF-8, individual and combined feed byte limits.
- Missing original source, exact source/template byte changes, valid-JSON scenario reformatting, duplicate escaped receipt keys, extra receipt fields, removal of inactive block membership, forged version/policy downgrade, malformed Unicode and excessive JSON nesting.
- Duplicate/unknown/missing argument values and successful standalone help.

A BOM-prefixed/reformatted receipt remains accepted and its digest covers the actual supplied bytes. Error checks also reject disclosure of the temporary input location or synthetic private sentinel. The full-replay cases demonstrate this is not a weaker scenario/receipt-pair hash check.

## Source review

The composition module verifies first, parses the same immutable scenario string, then invokes unchanged decision and sensitivity calculations and the unchanged report builder. It contains no filesystem API, callback or asynchronous gap. The CLI captures bounded strict-UTF-8 inputs, rejects leaf symlinks and unsupported entries, and calls the composition before writing stdout. Errors are mapped to a fixed allowlist with a generic fallback.

Documentation correctly distinguishes the pure composition from CLI reads, discloses sequential reads and possible consistent replacement, retains the ordinary report warnings, and warns that shell redirection may create/truncate an output even when validation fails. Output-device interruption and process death are not represented as atomic delivery. The report intentionally includes supplied scenario information; sanitized errors do not imply successful reports are privacy-redacted.

No changes to production code are recommended from this review.

## Reproduce

Run the portable probes with explicit directories; neither script contains a fixed checkout path:

    node probe.mjs SOURCE_DIRECTORY BASELINE_DIRECTORY > result.json
    node compatibility.mjs SOURCE_DIRECTORY BASELINE_DIRECTORY > compatibility.json

From the candidate source directory:

    npm test
    npm run check
    node --check src/verified-gtfs-report.mjs
    node --check scripts/verified-gtfs-report.mjs
    node scripts/verify-oracle-mutations.mjs

`result.json` lists every independent probe check. `compatibility.json` records relative file names, modes and SHA-256 fingerprints. Test logs are included separately. These are synthetic source/CLI checks, not browser, real-feed, device, field-usefulness or operational acceptance.

## Reviewed implementation fingerprints

- `src/verified-gtfs-report.mjs`: `ba3c178a78ea24fedfbc11768d022ab37585569405ee796adfa65ad3b3b4fd31`
- `scripts/verified-gtfs-report.mjs`: `c6a65c57c808edbe05b14513e48d615ed5b29eaf59c1bd4e07552e542db9124e`

Baseline supplied for comparison: PR 7 head `cb60fbd529fbbcc6cf1c69d27ebd5913ae4c65db`. This review verifies local byte compatibility; remote parity was provided by the coordinator, not independently fetched here.
