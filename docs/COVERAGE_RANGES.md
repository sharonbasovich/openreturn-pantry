# Integer-minute coverage audit

This optional terminal tool checks every integer opening-start minute within the
scenario's existing earliest/latest bounds. It does not modify the browser,
the scenario, the applied settings, or the existing grid optimizer. It requires
Node 24+ and no installation or new dependency.

```sh
node scripts/coverage-ranges.mjs
node scripts/coverage-ranges.mjs your-scenario.json > coverage-audit.txt
```

## Why a second audit is useful

The main app evaluates at most 48 grid starts. A coarse grid can skip a narrow
feasible range entirely. The new audit computes complete coverage intervals
under the same existing schedule model, and compares its best count with both
the sampled-grid best and the current window. It identifies gained and lost
origin IDs, so a higher total does not hide a different set of feasible origins.

The built-in synthetic example has five feasible origins for every opening
start from 10:20 through 10:30 inclusive. The existing half-hour grid selects
10:30. The complete integer-minute audit selects 10:20 under the same
closest-to-current, then earlier-start tie-break. This does **not** increase the
example's coverage count or establish that 10:20 is operationally preferable.

A separate entirely synthetic regression has a two-minute visit and opening,
arrival at minute 11, and a return departing at minute 13. Only opening start
11 works; a grid at 0, 10 and 20 misses it. This is a test of the model, not
evidence of a real transit or pantry problem.

Range endpoints in the report are inclusive **opening-start times**, not
opening and closing times. Adjacent rows with equal counts may cover different
origins and are retained separately. A zero-count range is explicit. Journey
selection, waiting and headroom can change inside a range: one witness is not
claimed to work for the entire range.

To inspect a range start in the existing browser app, set **Current start** to
that minute, apply, and inspect the **Current opening** card. A current window
may be off-grid. Export the normal decision sheet for its actual witness and
constraints. Do not describe the new terminal output as browser acceptance.

## Interval derivation

For one origin and retained outbound departure `d` with earliest arrival `a`,
the return must finish by `D = min(homeBy, d + maxAwayMinutes)`. Let `R` be the
latest ready minute for which the unchanged routing engine can return from the
pantry by `D`, respecting the same transfer and vehicle-continuation rules.

Later readiness can only remove return options. Binary search therefore finds
`R` exactly over integer minutes from zero through `D`. A failed ready-zero
query establishes that no return exists for that stop/deadline. Results are
cached per stop and deadline within this one audit only.

For visit duration `v`, opening duration `L`, and start `s`, the earliest visit
ends at `max(s, a) + v`. It fits closing and return readiness exactly when
`a + v <= R` and `a + v - L <= s <= R - v`. Intersect this inclusive interval
with the configured start bounds. Union intervals across retained outbound
departures. Using earliest outbound arrival is complete for coverage because
it cannot remove a later feasible pickup or return.

For an on-site origin, the interval is
`leaveAfter + v - L <= s <= homeBy - v`, provided the visit fits both availability
and maximum time away. An event sweep across all interval boundaries produces
maximal ranges with identical covered-origin sets, including empty ranges.

The existing model's finite integer-minute semantics and input bounds remain
authoritative. This is not continuous-time optimization, a new GTFS importer,
or independent verification of real-world travel.

## Scope, performance and verification

The existing model functions are unchanged; the new export is appended.
Browser modules, template, styling, imports and the existing report are unchanged.
No UI or offline HTML distribution is added. The tool invokes the same routing
engine, so its direct full-minute comparisons alone do not independently prove
routing correctness. The inherited routing tests and separately written path
enumerator provide distinct additional checks.

There is no universal runtime guarantee. For each distinct origin stop/return
deadline, at most one initial and twelve binary-search route checks are needed
within the 0–2879-minute model. Outbound searches and path construction still
consume time. Distinct origin constraints reduce cache sharing. This is an
optional terminal analysis, not a promise of responsive browser execution.

See the exact test and independent-review receipts in
`evidence/coverage-ranges/`. No operator study, native-browser interaction,
real-service-day fixture import, deployment or event submission occurred in
this work. Existing event, publication and feature-approval gates are unchanged.
