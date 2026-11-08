# Correct the reboarding test oracle

Date: November 8, 2026. Base: c0ee2a87d6756c504b43602e410f7f8c92bbf87a.

## Result

The historical exhaustive oracle could accept a fabricated witness that skipped intervening legs of the same looping vehicle without a required transfer allowance or boarding buffer. This is a test-verifier defect, not a reproduced runtime defect. No runtime module, UI, scenario, import/export format, decision report, benchmark, published demo, video or event entry changes in this correction.

A complete loop can be ridden instead of skipped, yielding identical reachability, time away and home-arrival time. Consequently, scalar oracle agreement did not guarantee validity of the selected path or its wait accounting. The fix checks witness structure explicitly rather than inferring it from scalar results.

## Implementation and repeatable checks

- Extract historical enumeration and validation into `tests/support/exhaustive-oracle.mjs`. It independently checks the complete supplied trip chain using the intervening departure interval, without the production transition classifier, routing search or cache. Both path enumeration and returned-witness validation use the corrected boarding rule.
- Preserve the historical 328-test corpus and minimum-away/earlier-home objectives. This later correction followed runtime inspection; it does not inherit the original blinded-authorship claim.
- Add 130 tests: literal outbound and return witnesses, exact/insufficient buffer boundaries, cap-zero and valid reboarding, input order, visit reset, two deliberately invalid shortcut witnesses, and 120 deterministic five-leg looping schedules in original and reversed input order.
- The new suite evaluates 974 windows and 3,854 origin/window cases, including repeated cases for ordering. It contains 438 reachable transit witnesses and 2,456 unreachable cases. These are synthetic/repeated comparisons, not people, unique transit systems or real service-day observations.
- Five deliberate faulty copies must fail: legacy trip-ID-only oracle, oracle ignoring buffer, oracle ignoring transfer cap, runtime ignoring buffer, and runtime jumping to an earlier same-trip leg. A clean control must pass. The runner checks complete test enumeration and assertion failures, not arbitrary startup failures. Temporary local copies are removed afterward; original source is never mutated.

Commands from a normal checkout with Node 24 or newer:

```
npm test
npm run check
node scripts/verify-oracle-mutations.mjs
```

Author result: 586 tests passed with zero failures/skips; all eight existing runtime syntax checks passed. The mutation control passed all 130 tests; the five mutants failed 5, 16, 4, 18 and 5 tests respectively. An initial proposed latest-prior mutation had no behavioral effect and was replaced by an actually faulty earlier-prior choice before this final check. This is not a systematic mutation-completeness score.

## Independent review

Independent literal probes were authored separately from the corrected helper and generated corpus. They reproduced the original verifier blind spot and checked both directions, exact leg sequences, waiting totals, buffer boundaries and boarding reset at the visit. Independent review ran the full pre-addition 585-test candidate, all five mutation controls, and 12 separately authored literal probes against the candidate. All passed, and every runtime source byte matched main. Its recommended adjacent-same-trip pickup-reset case (buffer 99, cap 0) was then added to the permanent corpus, bringing the final suite to 586 tests. Final independent recheck passed all 586 tests, syntax checks, the five mutation controls (5/16/4/18/5 failing mutant tests) and 12 independent probes. All runtime source and package commands are byte-identical to main. No blocking finding remained.

## Limits

Tiny finite exhaustive fixtures do not prove arbitrary large inputs correct. The corpus does not establish real-world schedule validity, operator usefulness, fairness, accessibility, browser/device acceptance or performance. The reference does not assert a global shortest/lexicographic path tie-break; it checks the documented minimum-away and earlier-home objectives plus the legality and accounting of the actual witness. Existing historical browser acceptance remains scoped to its recorded versions. No browser rerun is necessary to claim this tests-only correction, and none is claimed.
