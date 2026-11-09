# Independent integer-minute coverage review

Status: accepted within the local, synthetic scope below. No correctness defect found; no production source changed by this reviewer. Browser/publication/field validation not performed.

## Reasoning

For a retained outward journey with departure d and arrival a, the effective home deadline is min(homeBy, d + maxAwayMinutes). Return feasibility is monotone in readiness: every journey boardable at a later ready time is also boardable at an earlier ready time, since the first boarding is not a transfer. The bounded integer binary search therefore finds the latest feasible ready minute R. A visit fits exactly when max(a, start) + visitMinutes <= min(start + openMinutes, R), equivalent to a + visitMinutes <= R and a + visitMinutes - openMinutes <= start <= R - visitMinutes. All equalities are intentionally feasible. Earliest outward arrival for a fixed departure dominates later outward arrivals for coverage, without claiming witness or wait equivalence.

The on-site branch uses the same inequalities with leaveAfter replacing arrival and homeBy replacing latest return readiness, subject to the visit-only away allowance. Inclusive interval merging at last.end + 1 is appropriate only because the claimed domain is integer minutes. Sweep boundaries retain origin identity, not just equal counts. Projection of baselineStart onto each maximal-count interval supplies that interval's closest candidate, so ranking those projections implements the stated closest-then-earlier tie break.

## Verification

- Independently authored exhaustive scheduled-path enumerator, not the production route helper or repository oracle: 209 scenarios, 8,069 integer-start origin sets.
- Covers random continuous vehicle chains and loops, transfer limits 0–3, zero and positive buffers, exact return/visit/home/away boundaries, on-site origins, off-grid current starts, day crossing, and the upper service-minute limit.
- Every minute has exactly one matching coverage range. Per-origin intervals, coverage counts, partition adjacency/maximality, best-start ranking and grid compatibility were checked.
- Deep-frozen input remained usable and unchanged. Mutating a returned range did not affect subsequent invocation results.
- Existing full suite: 657 passed, 0 failed at review time. Syntax check passed; the new CLI was also executed by the suite.

## Performance and limits

The new search caches by destination/deadline and needs at most one initial feasibility check plus ceil(log2(deadline + 1)) bisection checks per distinct key (at most 13 routing calls at the supported bound). It reuses existing outward searches. It does not eliminate the routing engine's own path-copying costs. Partition endpoints are bounded by the finite integer-minute domain. These observations do not constitute a browser runtime or worst-case latency guarantee.

Independent Node v24.22.1 probes with 1,200 connections, 24 origins and 2,760 integer starts measured 157 ms with shared constraints (12 return searches / 1 key), and 1,486 ms with distinct constraints (8,773 return searches / 830 keys). These are synthetic one-run measurements on this executor, not a universal speedup or upper bound.

## Reviewed source hashes

- src/model.mjs SHA-256: ef62f64c5c97be70a44882bc365306d23fca140c92045ae50da3cec85fbae477
- scripts/coverage-ranges.mjs SHA-256: adfeeba1f086f0b1371c3b4bee8f89202cbd78016ad51e13f731811893aa7adb

Evidence is in review.mjs, results.txt, performance.mjs, performance-results.txt, and full-suite.txt alongside this file. Only model.mjs differs inside src/ from the supplied baseline; the original optimizer and browser code remain unchanged.
