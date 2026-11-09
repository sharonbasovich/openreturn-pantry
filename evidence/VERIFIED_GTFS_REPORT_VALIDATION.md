# Replay-checked report: local source validation

Date: November 8, 2026. Runtime: Node v24.22.1. Synthetic inputs only.

This is an additive local candidate based on the separate-trips source associated with draft PR 7 head `cb60fbd529fbbcc6cf1c69d27ebd5913ae4c65db`. No publication, release, deployment, browser interaction, credentials, real feed, event draft or submission was involved in these checks.

## Implementation boundary

- New `src/verified-gtfs-report.mjs` invokes the existing full pure replay verifier before computing the ordinary decision audit and sensitivity report from the same captured scenario string.
- New `scripts/verified-gtfs-report.mjs` mirrors the bounded local loader from the check-only command. The old loader was deliberately not factored or changed. It emits the complete composed string only after successful replay and report computation. Input/computation failures emit no stdout and fixed-code stderr. Unknown failures use `VERIFIED_REPORT_FAILED` without raw error details.
- Both receipt versions are supported by the existing verifier, not by new version-dispatch logic that could loosen replay. Header metadata follows successful verification, with JSON-encoded selections and exact input digests. Version 2 explicitly states the lossy separate-trips policy.
- Existing source, adapter output, package scripts, browser/model, report body and golden fixtures are byte-identical to the baseline. Only README and replay-check docs are appended to; all other candidate work is additive. See `verified-report/diff-manifest.json` for exact source identities.

## Executed checks

- `npm test`: **767 passed**, 0 failed. Includes 13 new report tests.
- `npm run check`: passed unchanged.
- `node --check` on all three new `.mjs` files: passed.
- Focused report tests: **13 passed**. Both receipt versions compare the complete ordinary report suffix against the existing terminal CLI's exact bytes including the final LF. Digest checks use independently computed SHA-256. Reformatting the receipt changes its reported digest without invalidating structural replay.
- Negative report controls reject scenario, receipt mapping, template, feed, missing file, duplicate key, policy and block-membership tampering. Real CLI failures cover invalid UTF-8, oversized receipt, malformed private sentinel content, unsupported version, altered scenario, missing input, symlink leaf, directory leaf and unsupported feed entries. All have empty stdout and sanitized fixed-code stderr.
- Same-bytes controls: a changing caller getter is read once; a subprocess preloader records every input open and replaces the scenario file when its first captured read closes. The command opens each input once and emits the report and digest of the captured original bytes despite the now-invalid file on disk. This demonstrates no scenario reread, not protection against arbitrary concurrent feed mutation.
- Inherited oracle controls: unmodified control passes; all five deliberately faulty copies detected (failed-test counts 5, 16, 4, 18, 5). No mutation-completeness claim.
- Inherited independent probes: 77 receipt cases, 21 generation cases, 170 separate-trips checks (including 120 legacy comparisons), and 62 GTFS subset tests passed locally; exact outputs are in `verified-report/`. These scripts predate this candidate and mostly check unchanged dependencies, not independent authorship/review of the new wrapper.

The new author checks are not a substitute for independent review. No actual browser, physical device, assistive technology, real feed or field-usefulness validation is claimed here. The command does not authenticate a feed, confirm user-intended date/scope, promise a filesystem snapshot, or validate operational feasibility. Shell redirection and output-device/process failures remain outside input-error all-or-nothing guarantees.
