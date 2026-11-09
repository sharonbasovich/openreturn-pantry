# Independent receipt verification review

Accepted for the documented, optional offline full-replay scope. No blocking defects found.

Reviewed the Node-only verifier, read-only CLI, author tests, README and receipt-verification guide. The implementation compares every receipt field against the unchanged adapter and requires exact exported scenario bytes. It rejects unsupported/missing schema fields, rather than treating the receipt's output digest as trusted evidence.

Independent verification on Node 24.22.1:

- 77 synthetic CLI cases passed. Coverage includes all receipt evidence families, stale/rehashed scenario mutations, changed feed/template bytes, malformed UTF-8, duplicate and escaped duplicate JSON keys, unpaired surrogates, nesting/byte limits, leaf and feed-directory symlinks, FIFOs, and argument errors.
- Every independent case preserved the complete input tree's file bytes. Every case avoided disclosure of fixture private sentinels or absolute case paths in stdout/stderr.
- Untouched fixtures, reordered receipt fields and receipt BOM passed; scenario BOM/reformatting and template reformatting failed as documented.
- Existing aggregate suite: 724 tests passed, zero failures. Existing syntax check passed; both new modules also separately passed syntax checks.
- Existing oracle mutation verification detected all five mutants. Sample decision report and routing cache benchmark completed successfully.

The portable independent runner takes an optional repository root and a new result-directory argument. Its default result directory is temporary and outside the repository. It uses only committed synthetic fixtures, performs no network operations and never changes source files. Run from a checkout with:

    node path/to/verify-receipt-independent.mjs .

Assurance limits are explicit and accurate: the date/scope come from the receipt, not independent user intent; a self-consistent replacement can pass. Feed completeness, authenticity, freshness, licensing and real-world effectiveness are not established. Standard reports/browser do not enforce receipts. The documented verification-and-report shell chain is not atomic. Concurrently modified directory inputs are not a filesystem snapshot. CLI-produced v1 receipts with templateInput are required; API-only receipts are intentionally unsupported.

No browser/download, credentials, publication, merge, deployment, Actions or submission testing was performed or implied.
