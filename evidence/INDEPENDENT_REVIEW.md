# Independent routing and optimizer review

Reviewed November 8, 2026. Scope: `src/model.mjs` and its public validation, window evaluation, and optimization contract. This is engine evidence, not browser acceptance, real-world transit verification, accessibility certification, or a guarantee of service.

## Method and independence

The reviewer wrote `tests/oracle.test.mjs` before reading `src/model.mjs`. The reference solver explicitly enumerates chronological connection sequences and every integer pickup-start minute within each opening window. It does not use the implementation's event-order dynamic programming, earliest-arrival labels, or cache structure. All inputs are synthetic and deterministic. No dependencies, network, installations, Actions, or external changes were used.

For each origin and opening window, the oracle independently determines whether any complete round trip satisfies departure availability, home deadline, maximum time away, pickup duration, opening deadline, transfer buffer, and separate outbound/return transfer caps. It also independently derives minimum time away and earlier-home tie breaking. Every emitted witness is checked against original timetable legs, chronological continuity, pickup times, transfer count/buffer, availability, time away, travel/wait accounting, and the oracle optimum.

## Results

Command: `node --test tests/oracle.test.mjs`

- 328 tests passed; zero failures.
- 240 deterministic 14-leg tiny timetables plus 80 deterministic shared-vehicle timetables.
- All permitted grid starts and an off-grid baseline are checked; random schedules include next-day minutes.
- 2,142 evaluated windows and 8,442 origin/window comparisons (including repeat checks).
- 456 feasible nonzero-transit witnesses and 6,020 infeasible origin/window cases.
- Optimizer winner independently compared with maximum reachable-origin count, least absolute shift from baseline, then earliest start.
- Baseline, grid enumeration, gained/lost origin sets, and input-order invariance checked.
- Explicit adversaries cover a later departure needed for maximum-away feasibility, same-vehicle continuation versus missed transfer buffer, transfer-cap reset after pickup, exact closing/home/away boundaries and one-minute failures, no return service, and a disconnected origin.
- Invalid objects, duplicate stop/origin/connection identifiers, non-positive leg duration, out-of-range times, missing stops, invalid transfer caps, zero grid step, oversized visit, invalid baseline bounds/date, reversed availability, and broken/overlapping trip chains are rejected by all three public operations.

## Inspection conclusions and limitations

No mismatch in reachability, minimum time away, earlier-home tie breaking, or opening-window optimum was found. Positive leg durations make the exhaustive reference finite; shared-trip chain validation supports the implementation's immediate predecessor continuation logic. Public functions validate and clone inputs before routing.

Two scope details were reported to the coordinator:

1. Validation requires at least one connection and at least two stops. Consequently a timetable containing only an on-site pantry origin and no transit legs is rejected, even though on-site origins work in otherwise valid scenarios. This is an input restriction, not a failed routing calculation.
2. The implementation selects earliest outward arrival for a given first departure. Its path tie selection is deterministic but is not necessarily globally shortest-then-lexicographic among every equal-away/equal-home journey. For example, a two-leg outward journey arriving earlier can be retained over a direct outward journey with the same first departure when both catch the same return. Reachability and primary journey objectives are unchanged. Wording should not promise global shortlex optimization unless this is added explicitly.

The independent oracle intentionally asserts minimum-away and earlier-home objectives, not a global path-order objective. Tiny exhaustive fixtures are strong regression evidence but not a proof for every bounded large input. Browser interaction, importing files, visual layout, realistic dataset assumptions, and worst-case performance are outside this review.

## Follow-up review: diagnostics, CSV documentation and dialog focus

Rechecked the later source revision on November 8, 2026. `npm test` passes 357/357 total tests, including the same 328 independent oracle tests; `npm run check` passes all three module syntax checks. These totals describe different scopes, not additional independent schedules.

The oracle now also independently checks every unreachable result's diagnostic stage. It enumerates all outward paths, all permitted integer pickup times, and return paths, rather than using the implementation's retained earliest-arrival labels. All 6,020 infeasible origin/window comparisons produce the corresponding supported reason. Inspection confirms that stage flags aggregate across every outward departure, avoiding a misleading reason based only on the last failed option. Reasons identify a failed combination of supplied constraints; they do not assert a unique underlying real-world cause.

Source inspection of `src/app.mjs` confirms that import captures its initiating button before asynchronous preparation temporarily disables controls. Confirmation exits restore that explicitly captured element, including Cancel/Escape; other replacement dialogs also receive their initiating controls. Cancel is initially focused. This is a source-level finding only. Native dialog behavior, actual keyboard focus, and assistive-technology acceptance remain the separate browser review's responsibility. General focus restoration after every calculation is not established by this review.

Corrected README and DATA_FORMAT documentation to describe both browser import modes. CSV replaces connections in the applied scenario, retains existing stops/origins/settings and the informational service-day label, and marks data as user-supplied. It does not merge unapplied settings or infer active service from the CSV. Both formats validate the complete resulting scenario and require replacement confirmation. No source-runtime or dist files were changed during this follow-up.

## Later correction to the test verifier, November 8, 2026

A subsequent review found that this historical oracle's path enumerator and witness checker classified a transfer only when the trip ID changed. It could therefore accept a fabricated witness that skipped a looping vehicle's intermediate legs without the required transfer allowance or buffer. Matching reachability, minimum-away and earlier-home values did not expose this: riding the complete loop remains feasible with those same values. The historical run counts above remain accurate, but its witness-validation claim was incomplete for this case.

The corrected helper separately checks the complete trip chain and adds literal witness, invalid-witness and mutation controls. This later work was performed after source inspection and is not a new blinded oracle. Runtime source is unchanged. Current evidence, commands and limits are in [ORACLE_REBOARDING_REVIEW.md](ORACLE_REBOARDING_REVIEW.md).
