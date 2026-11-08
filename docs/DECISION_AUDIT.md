# Decision audit contract

This is a reporting layer over the existing routing model. It does not modify the feasible-origin definition, route selection, best-window tie break or scenario format.

## Scheduled quantities

For a retained feasible journey, waiting is decomposed into time before the visit, after the visit before return boarding, true vehicle-change gaps, and same-vehicle dwell. Their sum equals the model's waiting total. Riding plus waiting plus the visit equals time away. No claim is made that waiting is minimal; the unchanged model minimizes time away and then home-arrival time under its documented retained-path rules.

Headroom is arithmetic for that witness:

- Away: supplied maximum away minus actual scheduled time away.
- Home: supplied home deadline minus scheduled arrival home.
- Closing: closing time minus end of visit.
- Return departure: first return departure minus end of visit; absent for a pantry-stop origin.
- Vehicle change: the minimum of each true vehicle-change gap minus the required transfer buffer, considering both legs; absent when no vehicle changes occur. Same-vehicle dwell is not a transfer.

These margins are not summed, treated as independent, or converted to a delay tolerance, reliability score, safety guarantee or policy recommendation. Zero is distinguished from not applicable. A positive margin in one dimension does not mean a journey tolerates that much delay.

## Sensitivity comparison

The fixed reference is the **applied best grid window**, independent of the currently inspected bar. Each variant retains the supplied timetable, origins, search grid and staffed duration, changing only the named assumptions. The original scenario and editor draft remain unmodified.

Each valid variant reports three distinct comparisons:

1. Fixed applied-best hours versus their original feasible origins.
2. Reoptimized hours versus the original applied-best origins, including identity changes at equal totals.
3. Reoptimized hours versus current hours under the same changed assumptions.

All highest-coverage grid starts are retained. An off-grid current baseline is evaluated separately and is not inserted into that list. Changed assumptions can make a hypothesis invalid, such as a visit longer than the opening window. This is a visible not-applicable result, not a successful check or a clamped input.

Exports reject sensitivity results belonging to different normalized applied data. A new applied scenario clears sensitivity results. Unapplied drafts and canceled/invalid replacement operations do not invalidate checks for the still-current applied data. The terminal export always runs the checks; the interactive export explicitly identifies checks not yet run.

## Limits

The three variants are illustrative, uncalibrated hypotheses, not operational observations or exhaustive uncertainty analysis. They do not model cancellations, actual delays, accessibility, service calendars, safe waiting conditions, client demand or pantry queues. Headroom is not a route-robustness algorithm. Reoptimization changes opening hours and must not be presented as preserving the original proposed hours. No operator or community consultation is implied.
