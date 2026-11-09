# Independent GTFS generation contract review

**GO within the bounded Node CLI scope.** Reviewed the frozen producer-consistency candidate against the supplied PR 7 baseline. No publication, deployment, merge, browser acceptance or real-feed validation was performed by this review.

## Verified

- Independently reproduced permissive duplicate-template generation followed by `DUPLICATE_JSON_KEY` replay failure on the baseline.
- Independently built a supported synthetic feed with 50,000 additional inactive 80-character trip IDs. Baseline generation wrote a 4,506,251-byte receipt; unchanged replay failed `INPUT_SIZE_LIMIT`. Candidate rejects before creating output, without removing source records.
- Frozen candidate: full suite **740/740 passed**, `npm run check` passed, and additional syntax checks for both GTFS CLIs, the shared JSON module and verifier passed.
- The accompanying portable runner passed **21 independent end-to-end cases**: ordinary generation/replay; exact, escaped, nested and unknown duplicate keys; escaped lone surrogate and invalid UTF-8; valid BOM/CRLF; exact 1,000,000-byte template acceptance and one-byte excess refusal, including multibyte UTF-8; direct and ancestor-alias output-inside-feed rejection; nonexistent deeper descendant refusal; sibling output acceptance; no overwrite; large receipt refusal; and actual generated receipt acceptance/replay at exactly 4,000,000 bytes versus rejection at 4,000,001. Rejections leave no output directory. New JSON diagnostics disclose neither the sentinel source text nor the temporary path.
- Three independent removal controls were effective: restoring permissive template parsing resurrected `DUPLICATE_JSON_KEY`; removing the receipt guard resurrected `INPUT_SIZE_LIMIT`; removing the placement guard allowed generation followed by `UNSUPPORTED_FEED_ENTRY`.
- A pre-change version-1 CLI artifact from prior synthetic interoperation checks still replayed successfully without alteration.
- The strict parser was extracted byte-for-byte. Browser app, routing/model, adapter, existing import/report/decision modules, verifier CLI, package commands and HTML remained byte-identical. Documentation accurately limits guarantees and preserves receipt version 1 / adapter version 1.0.0.

## Reproduce independent cases

From the repository root, run:

`node evidence/generation-consistency/independent-generation-check.mjs .`

Node 24+ is required. The runner uses only repository synthetic fixtures and temporary local files, with no network or dependencies. It removes its temporary tree after success and prints `{"ok":true,"cases":21}`. On failure it leaves the temporary evidence for inspection. The runner does not modify repository sources.

## Limits

The canonical output-parent check is appropriate because output creation is nonrecursive and existing feed subdirectories are already invalid. It is not a sandbox or defense against concurrent file or ancestor replacement. The object-based adapter API remains unchanged and can return receipt objects whose serialized size exceeds the CLI bound. No broader GTFS, authenticity, source completeness, freshness, real-world feasibility, browser receipt enforcement or atomic filesystem guarantee is asserted. Full baseline reproductions and mutation-control copies are intentionally separate from this portable deliverable.
