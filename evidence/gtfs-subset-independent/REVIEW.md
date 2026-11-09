# Independent review: offline GTFS subset adapter

**Accepted, November 8, 2026. No blocking correctness findings remain.**

This accepts the documented, deliberately restricted offline schedule projection. It does not establish general GTFS compliance, real-feed completeness, accessibility, practical travel feasibility or field usefulness.

## Final verification

Using Node v24.22.1 and npm 11.9.0:

- **62/62 independent tests passed**, including hand-computed semantic cases and actual CLI files.
- **698/698 repository tests passed** in a separate complete run.
- Existing `npm run check` passed; separate syntax checks for the adapter, CLI and new repository test file passed.
- Compared all 63 files in the supplied baseline snapshot, main `8fcb2462b481b3b49aa1f15b02de00c01a0b1944`: 62 are byte-identical, only README documentation changed, and none are missing. Existing browser, model, import helpers and package commands are unchanged.

The reviewed implementation SHA-256 values are:

- `src/gtfs-subset.mjs`: `f8687d15f458682ae65d036907e1652e60b619ac858f14b630388621ddac87fd`
- `scripts/import-gtfs-subset.mjs`: `829df12691091db949e973f2be5133143274386f91ef7c2356fccf42d7a24a99`
- `tests/gtfs-subset.test.mjs`: `1206bcb57a2d7e570cf64d108153869e62757d5ea74d8462d60b98db719a333c`
- `docs/GTFS_SUBSET.md`: `d17a42e01713dc6992d59d00e91079f76462e6f4603a89e16dacb2d5be3b923b`

[The manifest](manifest.json) records fixture, probe, README, package and unchanged-baseline file hashes.

## What was checked

The review inspected actual implementation and CLI code against the [official GTFS Schedule reference](https://gtfs.org/documentation/schedule/reference/), displayed revision April 27, 2026. All test data are synthetic.

- A nonconsecutive-sequence **A–B–A–P** trip retains every adjacent leg and dwell. The hand-computed round trip leaves at minute 494 and returns at 530, totaling 36 minutes away. A separate check preserves consecutive same-trip travel through dwell with a 15-minute transfer buffer and no permitted vehicle changes.
- Explicit route/trip scope, inclusive weekly dates, additions/removals, exception-only service, inactive-service reporting and undefined-service rejection. Unknown or inactive requested scope never silently shrinks.
- Exact whole-minute and after-midnight times. Seconds, missing/interpolated times, ambiguous timepoints, backward/zero travel, consecutive identical stops and duplicate numeric sequences, including `1` versus `01`, reject rather than being repaired.
- Continuous pickup/drop-off inheritance and explicit overrides. Unsupported boarding restrictions, frequency service, blocks, flexible service and transfer rules reject.
- Exact stop identities, inherited station timezone metadata without merging, and explicit agency service-day time basis with DST limitations. No wall-clock conversion is claimed.
- Deterministic outputs, unchanged inputs, complete stop-call/sequence mappings and independently recomputed exact input, template and output byte hashes.
- Actual CLI round trips with BOM/CRLF and quoted comma, quote and Unicode stop/trip/route IDs. Invalid UTF-8, symlinks, nested/unknown files, unsupported flags and validation failures create no output. Existing output and input paths are not overwritten.
- File/aggregate/template byte caps, row/cell bounds and model stop/connection limits reject the whole projection instead of truncating it.

One validation hardening item was resolved during review: controls in permitted but ignored CSV descriptions now reject uniformly, including quoted tabs and newlines. An independent regression covers this. No schedule-correctness defect was reproduced.

## Reproduce

From the repository root, without package installation or network access:

```sh
node --test evidence/gtfs-subset-independent/*.test.mjs
npm test
npm run check
node --check src/gtfs-subset.mjs
node --check scripts/import-gtfs-subset.mjs
node --check tests/gtfs-subset.test.mjs
```

The independent CLI probes create temporary files outside the source tree and clean them after the run. No real datasets, personal data, browser actions or external publication are involved.

## Remaining limits

Acceptance is limited to the documented whitelist and supported semantics. Many normal GTFS feeds intentionally fail. Selected trips preserve their complete **supplied** chains, but the adapter cannot prove the source is complete or authentic. Hashes are reproducibility checks, not signatures or licensing checks.

The provenance receipt remains a separate companion that the unchanged browser does not retain. Raw service-day minutes need not be local wall-clock labels on DST transitions. Walking, physical access, fares, accessibility, delays and adjacent service dates remain outside the model. No new browser, real-data or operational acceptance is claimed. Output pairs are not guaranteed crash-atomic after process termination or power loss.
