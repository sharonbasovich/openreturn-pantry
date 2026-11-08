# Cumulative acceptance: November 8, 2026

This dated receipt covers the decision-audit, export-integrity and routing-cache update. It supersedes earlier pending-browser statements for the bounded checks below; it does not rewrite the original version's historical evidence.

## Exact scope

All eight runtime files were served unchanged during actual Chromium testing. Their SHA-256 values are recorded in `browser-20261108/runtime-hashes.json`. The public-source preparation changes documentation, packaging metadata and portable verification paths, not those runtime bytes. No third-party runtime dependencies, accounts, telemetry or remote data requests were added.

The default input and every fixture and downloaded example included here are synthetic. They represent origin scenarios, not people served or measured outcomes.

## Calculation and serialization checks

- The cumulative suite passes 445 tests, including the inherited routing oracle, application-state tests, audit/report tests, export-integrity tests and seven routing-cache regression tests. Canonical syntax checks pass.
- An independent differential probe passes 6,150 complete-output comparisons across 600 seeded scenarios plus focused cases. It compares old and new engines, not a proof that both are universally correct. Retained path-array mutation isolation also passes. Connection objects retain their documented sharing behavior.
- An independent export probe passes 72 assertions covering maximum-size inputs, exact UTF-8 boundaries, BOM accounting, every CSV ID field and exact JSON preservation.
- Five actual completed browser downloads in `browser-20261108/downloads/` match the canonical serializer bytes: synthetic JSON, CSV, reports with and without checks, and JSON retaining a formula-leading connection ID. JSON and CSV parse back exactly. Run `node evidence/browser-20261108/verify-downloads.mjs` to repeat these byte checks.
- The terminal report adds one trailing newline. Browser downloads match `buildDecisionSheet()` exactly; that framing difference is expected.

## Actual browser workflows

1. The synthetic baseline displays 3/7 at 09:00–11:00, compared with 5/7 at 10:30–12:30. Maple Court is explicitly lost; West End, Orchard and Eastbank are gained.
2. Repeated assumption checks distinguish fixed hours from reoptimization. Combining longer visits and transfers reduces fixed 10:30 hours to 2/7. Reoptimization reaches 3/7 at 09:00, no gain over current hours under the same assumptions.
3. Hilltop displays 95 minutes away and 31 waiting minutes, including 25 before the visit and six on board. Return-departure headroom is zero. An absent vehicle change is Not applicable, not zero. Origin selection retains visible keyboard focus.
4. Invalid JSON preserves the draft, unapplied settings, results and existing checks. Valid replacement warns before discarding edits. Escape cancels and restores focus; a repeated keyboard replacement succeeds and clears stale checks.
5. Invalid CSV reports the required columns. Canceled format changes preserve the mode and draft. Valid CSV replacement was canceled and then accepted; successful import marks the input user-supplied and unverified.
6. JSON preserves a formula-leading ID. CSV export and CSV format conversion refuse it without changing applied results, draft, checks or the previous copyable export. This is not general spreadsheet-safety certification.
7. Canceled reset preserves draft and checks and restores focus. Confirmed reset restores the synthetic example and clears checks. Invalid settings are rejected. Applying a 30-minute visit changes the best result to 4/7 while preserving a separate text draft and warning about its older settings.
8. A small synthetic fixture covers next-day times, an on-site origin, an unreachable origin and an off-grid baseline. Current 00:43 +1d remains inspectable separately from best grid 00:45 +1d. An on-site journey has ten minutes away, zero waiting and Not applicable return/transfer margins. Unapplied edits do not change assumption checks.
9. Desktop and actual 390- and 320-pixel browser frames were inspected with 160-character unbroken labels, expanded results and a replacement dialog. Page scroll width equals client width. The chart scrolls within its own region. Narrow-dialog Escape restores focus. Screenshots were inspected during QA but are not included in this source update. These are browser-frame checks, not physical-phone tests.

The saved artifacts and scope claims received independent review. That review verified runtime parity, downloaded bytes and screenshot evidence; it did not personally repeat every interactive step.

## Separate timetable evidence and data terms

One previously obtained BC Transit Clearwater service-day timetable was also exercised in the browser. It produced a byte-exact decision sheet. The service location, opening hours, visit duration and origin constraints were hypothetical. This is a desk fixture, not operator consultation, evidence of convenient travel, reliability or a recommended change to real pantry hours.

No BC Transit feed, extracted timetable, derived fixture or downloaded real-timetable report is included in this repository or its demo. BC Transit data is separate from the code's MIT license and governed by the [BC Transit data terms](https://www.bctransit.com/open-data/terms-of-use/), including attribution and as-is limitations. See the [official data catalog](https://www.bctransit.com/open-data/) for the source. No new data was downloaded for this browser pass.

## Remaining limits

- Native beforeunload/leave-warning behavior was not established. The bounded check did not confirm a reload; this is unverified, not a failed warning.
- No physical phone, touch-device, assistive-technology, operating-system reduced-motion, native-print or operator-usefulness acceptance is claimed.
- Not every UI regression or input was exercised. The narrow tests do not certify accessibility.
- A bounded page-origin warning/error check returned none. This is not an exhaustive console or security audit.
- The app remains synchronous. Synthetic cache-friendly benchmarks do not establish universal acceleration, worst-case response time or cancellation support.
- No event entry, field pilot or operating-hours change is implied by source delivery.
