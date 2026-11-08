# GTFS subset adapter: synthetic validation

Date: November 8, 2026. Environment: Node v24.22.1, Linux. This receipt covers the optional offline projection only. It does not claim general GTFS conformance, real-feed acceptance, safe travel, accessibility, deployment or field usefulness.

## Checked source

The work adds a separate Node module/CLI, synthetic fixtures, tests and documentation. Existing `src/model.mjs`, `src/import.mjs`, browser runtime, package commands and all other pre-existing implementation/test files are byte-identical to the supplied base. Only the README changes among existing files.

SHA-256 at the author verification checkpoint:

| File | SHA-256 |
| --- | --- |
| `src/gtfs-subset.mjs` | `f8687d15f458682ae65d036907e1652e60b619ac858f14b630388621ddac87fd` |
| `scripts/import-gtfs-subset.mjs` | `829df12691091db949e973f2be5133143274386f91ef7c2356fccf42d7a24a99` |
| `tests/gtfs-subset.test.mjs` | `1206bcb57a2d7e570cf64d108153869e62757d5ea74d8462d60b98db719a333c` |

## Executed checks

- `node --test tests/gtfs-subset.test.mjs`: **112 tests passed**, zero failures/skips.
- `npm test`: **698 tests passed**, zero failures/skips, including the unchanged previous regression suite.
- `npm run check`: passed. Existing package command remains unchanged.
- `node --check src/gtfs-subset.mjs`: passed.
- `node --check scripts/import-gtfs-subset.mjs`: passed.
- `node scripts/verify-oracle-mutations.mjs`: unmodified control passed; all five existing deliberately faulty oracle/runtime copies were detected. This is not mutation completeness.
- The actual CLI generated both files, and the unchanged terminal decision-sheet command consumed the generated JSON successfully. The deterministic outputs match the committed synthetic expected files byte-for-byte.

## What the new tests exercise

Author tests cover date/calendar/exception resolution; route and trip selection; sorted sequence with gaps and repeated stops; dwell; next-service-day-hour notation; exact identity and quoted Unicode; no source mutation; deterministic scenario IDs; agency timezone and explicit service-day basis; unsupported frequency, block, transfer, boarding, continuous and flexible-service semantics; malformed/oversized input; model validation; file/scenario/template hashes; strict UTF-8; symlink refusal; exclusive output creation; existing-output preservation; and failure before output creation on rejected input.

Actual CLI tests run local child Node processes, not a shell or browser simulation. Source read and output checks use temporary directories cleaned up by the tests. The synthetic expected receipt retains full source call and generated-leg mappings. No real transit feed, account, API key or remote dependency is used.

## Limits

The tests are deliberately synthetic and bounded, not exhaustive validation or an operational pilot. No new browser/device acceptance run was needed or claimed because browser code is unchanged. No network download, credentials, new package installation, publication or real-data upload was exercised in these checks.

The CLI validates before reserving a new output directory and attempts cleanup after ordinary write errors. Process termination, power failure, adversarial concurrent filesystem changes and platform-specific filesystem behavior are not proven safe or crash-atomic. Treat files as a usable pair only after successful exit and verification of the scenario hash. Unsupported source features must not be removed just to force acceptance.

See [the exact supported input contract and limitations](../docs/GTFS_SUBSET.md).
