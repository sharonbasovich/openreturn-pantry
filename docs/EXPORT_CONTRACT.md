# Exact JSON recovery and the optional CSV subset

## Why this correction exists

The earlier model accepted valid scenarios whose own exports could not be imported again. Normalized 1,200-leg ASCII JSON was 566,410 bytes against a 500,000-byte import cap; ASCII CSV was 404,454 characters against a 250,000-character import cap. Quoted and Unicode IDs widened the mismatch. JSON-valid edge whitespace, line breaks and tabs could also be exported to CSV that its own importer refused.

Independent review found a byte-level loss that a string-only test missed: an unpaired UTF-16 surrogate survives a JavaScript CSV-string round trip, but `Blob` serialization changes it to the replacement character. JSON serialization escapes the surrogate and preserves its exact code unit. Formula-leading IDs were emitted verbatim into CSV; CSV quoting does not reliably neutralize spreadsheet formula interpretation.

## Current contract

- JSON is the complete applied-state backup. No ID rewriting, trimming, normalization, formula-prefixing or replacement is performed. Its normalized serialized text, including lone-surrogate escapes, reimports exactly.
- JSON input and output use a 4,000,000-byte UTF-8 cap. Unknown input fields are still discarded by the existing v1 schema. Source formatting and unknown fields are not part of the normalized backup contract.
- CSV is an optional connections-only helper, capped at 2,000,000 UTF-8 bytes. Full-scenario validation is still required to check known stops and vehicle chains. It is not GTFS.
- Every CSV ID column requires 1–80 UTF-16 code units, no leading/trailing whitespace, no C0/C1 control character, no unpaired UTF-16 surrogate, and no leading `=`, `+`, `-` or `@`. Restrictions also apply to quoted fields. Quoted commas and double quotes remain supported. Astral Unicode with complete surrogate pairs is supported.
- Unsupported CSV IDs cause an actionable failure directing the user to JSON. No partial CSV is emitted and no identifier is altered. Serialization checks record counts, ID uniqueness and increasing integer service-day times through its own parsing contract.
- The CSV policy reduces formula exposure but does not promise general spreadsheet safety or exactness after third-party editing. Spreadsheet applications may convert dates, scientific notation or zero-padded numbers. Import IDs as text and verify them, or keep JSON.
- A rejected CSV format change occurs before discard confirmation and leaves the format, draft, results and sensitivity checks intact. A rejected export preserves the previous fallback. If automatic-download setup fails after serialization, the complete new copyable export is still available.

## Capacity argument

A UTF-16 code unit needs at most six JSON output bytes when escaped. A deliberately conservative upper bound for every model-valid normalized pretty JSON is:

- Connections: 1,200 × (4 × 80 × 6 string bytes + 256 syntax, number and indentation bytes).
- Stops: 64 × (240 × 6 + 128 bytes).
- Origins: 24 × (320 × 6 + 256 bytes).
- Root fields, title, date and settings: 4,096 bytes.

Total: **2,767,872 bytes**, below the 4,000,000-byte cap. This is an engineering bound on the current schema, not an unlimited-file promise; revisit it if counts, lengths or fields change.

For supported CSV IDs, UTF-8 uses at most three bytes per UTF-16 code unit; doubled quotes use fewer. Four 80-unit IDs cost at most 960 bytes. Adding 27 bytes for quote pairs, separators, times and CRLF gives 987 bytes per connection. With the 54-byte header, **1,184,454 bytes** safely covers 1,200 records, below 2,000,000. BOM input is included in the input byte cap.

## Verification and limits

The 438-test suite includes six maximal JSON fixture families and four supported maximal CSV families, using actual Node Blob text serialization before import; unsupported CSV IDs fail while exact JSON remains available. It also tests all four CSV ID columns, shared length limits, malformed/duplicate records, actual UTF-8 caps, draft/result/fallback retention, canceled/repeated format changes and simulated download-setup failure. The maximum astral fixture generator initially split a surrogate pair; the rejection was correct, and the fixture was corrected to create complete pairs. Final checks pass.

Node Blob checks establish standardized string-to-byte serialization, not an actual browser download saved to disk. The DOM double verifies real handler state and text, not native keyboard, focus, layout, accessibility or download behavior. Those checks were completed before actual browser acceptance. The later cumulative [browser receipt](../evidence/CUMULATIVE_ACCEPTANCE_20261108.md) records five synthetic saved-download byte checks, cancellation and recovery flows, and the remaining limits.

Model, routing, decision calculations, report generation, synthetic sample, HTML and CSS are unchanged from the reviewed decision-audit candidate. Historical screenshots and native receipts apply only to the earlier public version.
