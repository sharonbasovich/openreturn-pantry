# Independent separate-trips review

Reviewed the adapter, pinned replay dispatch, CLI changes, documentation, new tests and retained synthetic evidence against baseline commit `e03584d6`. No release-blocking defect found for the stated restricted scheduled-service projection. This is not approval of block-aware routing, vehicle allocation, a complete GTFS validator or physical travel feasibility.

## Independent results

- Full repository test suite: **754 passed, 0 failed**.
- `npm run check` and explicit syntax checks of the adapter, verifier and import CLI passed.
- Independent synthetic probe: **170 passed**, including **120** exact baseline-vs-candidate comparisons of complete adapter results or rejection messages.
- Candidate-only invocation: **50 passed**, explicitly reporting **120 legacy comparisons skipped**.
- Three isolated controlled regressions were detected: eliminating the transfer buffer, omitting a touched-block member, and replaying v1 under the separate-trips policy. The reviewed candidate was not modified.

The 120-case legacy matrix covers four date values, five route/trip scope choices and six input categories (ordinary, blocks, transfers, restricted pickup, frequency service and unsupported file). It is bounded compatibility evidence, not a proof over all inputs. Existing golden-byte and replay tests also pass.

Additional probes cover exact original trip identity, no automatic scope expansion, active/inactive out-of-scope memberships, service additions/removals, malformed block IDs on unselected trips, block/trip ID collisions, policy/version and provenance tampering, all six transfer types, pickup/drop-off and continuous restrictions, zero-gap same-block transfers under different buffers/count limits, no cross-stop bridging, CLI generation/replay/report, no overwrite and rejection of oversized membership evidence before output creation.

## Reproduce the portable independent probe

The probe uses only the candidate's synthetic fixture; it contains no agency data. It needs Node.js and an extracted source checkout. Candidate path is the first argument; an explicit legacy source checkout is optional:

```
node probe.mjs PATH_TO_CANDIDATE
node probe.mjs PATH_TO_CANDIDATE PATH_TO_E03584D6_BASELINE
```

Without the second argument, all 120 legacy comparisons are explicitly skipped, not silently replaced with another source. A supplied but unavailable baseline fails. The candidate's synthetic fixture and CLI are required. Temporary output is removed after the CLI checks.

## Contract boundaries

Only blocks touched by selected active trips receive expanded membership evidence; unrelated blocks remain represented by source hashes, not membership summaries. All nonempty supplied block IDs are validated in opt-in mode. Selected original trip chains remain separate and every inter-trip change consumes the ordinary transfer count and buffer. No block chronology or vehicle allocation validation is claimed. Consequently contradictory block schedules are not certified, and overlap rejection is not required for this bounded projection. Unselected trips are provenance, not validated route alternatives.

Version 1 remains pinned to reject-blocks; version 2 requires separate-trips. Full receipt replay rejects provenance tampering. CLI receipt limits fail before artifact directory creation. The object API can still construct a receipt larger than CLI serialization limits, as documented; production artifact generation must use the bounded CLI contract.

Lost inter-trip onboard options can change coverage and rankings. A zero buffer can permit a zero-gap scheduled reboarding, but is not a statement of physical practicality. Nonempty transfers and selected boarding restrictions still fail. None of these checks establishes source authenticity, archive completeness, currentness, licensing or real-world travel feasibility. Browser and report commands still do not independently enforce receipt verification.
