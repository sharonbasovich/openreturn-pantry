# Reusing identical route searches

This supplement changes only the routing model's cache keys and copies retained path arrays. It adds no routing objective, new capacity claim, input rule or user-interface feature. It is cumulative with the decision-audit and export-integrity candidates.

## Why it matters

A valid synthetic input with 1,200 connections, 24 origin scenarios and 48 tested opening starts took 4.17 seconds for one initial Node comparison. Every origin in that workload represented a separate scenario at the same stop with identical constraints. The old engine cached searches by origin ID, repeating equivalent work. Assumption checks run further comparisons. This is a reproducible computation bottleneck, not an observed native-browser freeze.

The outward key now contains stop ID, earliest departure, home deadline and away allowance. The return key contains stop ID, pickup end and home deadline. Return searches never used the origin label, earliest departure or away allowance; the complete-trip away check remains separate for every origin. Pantry location, timetable and routing settings are fixed within one prepared context. JSON tuples preserve ID boundaries, including quotes and delimiters. All caches are discarded after each public model invocation.

Results still list each origin separately. The optimization does not deduplicate scenarios or reinterpret their counts as people. Complete selected witnesses, failures, gain/loss arrays, tie-break values and summaries are checked against the frozen previous engine. The frozen baseline file has Git blob ID `a18884acf5616a691079035ad98d79bff6d5bf0e`, matching the public model read during this work. That file read does not establish the repository's current head commit.

## Mutation behavior

Independent review detected that the first version newly shared path arrays between equivalent origins. The final code shallow-copies each retained outbound/return array. Mutating one origin's array no longer changes another origin's path. Normalized connection objects retain their earlier sharing behavior; this is not deep mutation isolation. Some previous sharing of arrays across windows is also removed. No consumer identity contract depended on it.

## Final checks

- 445 tests pass, including all 438 inherited tests and seven added cache regression tests. Syntax checks pass.
- Independent review passes 6,150 complete-output differential comparisons across 600 seeded synthetic scenarios and focused cases. This compares the old and new implementations; it does not independently prove that both are correct for every possible input. The inherited independent routing oracle also passes.
- Cases include distinct leave/home/away constraints at one stop, unchanged labels versus IDs, pantry-stop origins, off-grid baselines, ties, same-vehicle continuations, transfer limits, unusual IDs, ordering and later input/result mutation.
- Independent array-mutation checks cover both public evaluation methods.
- Application, decision, import, report, sample, HTML and CSS bytes remain unchanged from the export-integrity candidate.

## Reproduce the benchmark

Run `node scripts/benchmark-routing-cache.mjs`. It imports the frozen earlier model in `evidence/routing-cache/baseline-model.mjs`, creates one explicitly synthetic 1,200-leg timetable with 24 same-stop origins, and evaluates 48 grid starts. Each recorded comparison uses deep equality for the complete result. It alternates old/new execution order and performs three cache-friendly pairs, then one pair with distinct origin constraints. It has no timing-based pass/fail threshold.

Final observed Linux x64 / Node 24.22.1 measurements, in milliseconds:

| Run | Earlier engine | Candidate | Earlier / candidate |
| --- | ---: | ---: | ---: |
| 1 | 4,298.51 | 281.93 | 15.25 |
| 2 | 4,380.57 | 272.11 | 16.10 |
| 3 | 4,359.94 | 273.02 | 15.97 |
| Distinct constraints | 4,592.91 | 4,244.72 | No gain asserted |

Raw results are in `evidence/routing-cache/benchmark.json`. Exact output SHA-256 for all three equivalent-origin runs is `616a327a7f65ebf99d25df97f6e70b29cf7e68bdb8cb000e20391e6269b26525`; the distinct-constraint output is `db1eb4172977397aee75b8d1700d971d2e43b8ffa5c4bdcdd20473b8bce05fa7`.

This is one machine, one process and two synthetic workload shapes. Timings include ordinary run-to-run variation. No universal acceleration factor, worst-case runtime bound, memory bound, cancellation support or native-browser responsiveness is established. The app remains synchronous; inputs with little equivalent work can still take several seconds. A future responsiveness change needs its own design and acceptance.

## Delivery boundaries

The later cumulative [acceptance receipt](../evidence/CUMULATIVE_ACCEPTANCE_20261108.md) records bounded actual-browser checks of these exact runtime bytes. This does not establish worst-case responsiveness, physical-device compatibility or operator usefulness. No real transit data is included in this repository update.
