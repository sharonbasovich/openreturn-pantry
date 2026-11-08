# Responsive-calculation source preview: November 8, 2026

This receipt covers the cancelable module-worker preview based on public v0.2.2 commit `1ad541faeec7ffde5fe7775b7fc11089fb7ebea7`. It is source-preview evidence, not a deployed update or event submission. The earlier cumulative receipt remains unchanged and describes the earlier runtime.

## Source and automated checks

- The pure routing model, decision audit, import/export serializers, synthetic sample and synchronous command-line report are unchanged from v0.2.2. The browser application delegates comparison and assumption calculations to disposable module workers. Parsing, validation, structured-clone transfer, rendering and exports still involve the main thread.
- `npm test` passes 470 tests. `npm run check` passes. Application-handler tests use an explicitly synthetic DOM and synthetic workers, including held replies, cancellation, failure, retry, stale callbacks and initial recovery.
- Independent protocol probes pass overlapping-work exclusion, ignored wrong IDs, late canceled callbacks, reported errors, runtime/message errors, malformed responses, constructor retry and postMessage clone failure.
- Genuine Node worker threads execute the production worker through a small browser-message bridge. Sample comparison and sensitivity outputs equal the synchronous APIs. A maximum-count synthetic fixture with 1,200 connections, 24 origins and 48 starts also has identical comparison output. All created workers and callbacks are disposed. Run `npm run verify:workers` to repeat these checks.
- A bounded Node cancellation experiment observed host timer activity while a job was pending, termination and successful retry. This is not browser latency evidence, a worst-case resource bound or proof that cancellation occurred at a particular instruction inside routing.

## Actual Chromium checks

The ten runtime files match [runtime-sha256.json](responsive-20261108/runtime-sha256.json). A first browser pass exposed a focus-transfer defect; the final application records focus ownership before disabling controls. The corrected runtime was retested.

1. The default scenario displays 3/7 at current hours and 5/7 at 10:30–12:30, with three assumption cards after checking.
2. A synthetic fixture with 1,200 connections, 24 distinct origin-constraint combinations and 48 starts runs in a module worker. During lower-page imports, the fixed Cancel control remains visible and enabled while conflicting controls are disabled.
3. Raw Return cancels import, settings and repeated assumption calculations on the final runtime. Focus moves to Cancel while busy and returns to the initiating control afterward. Applied comparisons, previous checks, selected journey/window, dirty settings, the complete 119,227-character input draft and previous copyable export remain unchanged.
4. Repeating import completes and opens replacement confirmation. Keep my work preserves the full state. A later confirmed import installs the heavy scenario, creates 48 bars and clears stale checks. Fresh comparison/check jobs succeed after cancellation without a visible stale-result overwrite. Arbitrary adversarial message ordering is tested separately by the controller tests.
5. An actual saved decision-sheet TXT after the heavy comparison and checks exactly matches the original synchronous audit/report output. Both SHA-256 values are `c140b3fc9fd97bca88cbe35acb25b59a2dd959f1515f5a32b1d7f440003e2167`. This is a saved-file comparison, not just fallback-text inspection. New JSON/CSV saved bytes were not separately tested in this pass.
6. At actual 390×844 and 320×844 CSS-pixel frames, lower-page Cancel remains focused, readable and keyboard-operable. Document widths of 375 and 305 pixels account for scrollbars and show no horizontal overflow. The 320-frame Cancel is 245×44 pixels and fits within that frame. These are browser frames, not physical phones.

## Explicit QA variants

The exact small default initializes and resets too quickly for reliable observation of its cancellation window. Initial and reset cancellation were instead exercised with a separate synthetic QA copy whose only data change makes SAMPLE the heavy fixture. Canceling initialization leaves results empty, dependent actions disabled and Reset usable. A subsequent Reset succeeds. After dirty edits and an export, confirmed Reset followed by Cancel preserves the full before-state. This is not a claim that the original default is slow.

A second QA copy temporarily omitted the worker module. Its real module-load failure leaves a clear error, unchanged/empty applied state and a usable Reset action. Restoring the fixture resource and selecting Reset recovers. Browser security settings were not changed. The full source runtime was otherwise unchanged.

## Limits

No universal responsiveness, latency, memory or browser-compatibility guarantee follows from one bounded workload. Worker unavailability, clone/message errors and arbitrary late delivery were not all injected into Chromium; their automated tests are separate evidence. Physical devices, screen readers, exhaustive accessibility, native print, browser leave-warning behavior, deployment-specific CSP/worker loading and real operator usefulness remain unverified. Print hiding is implemented in CSS, not accepted by a native-print test here.

Private screenshots and raw QA records are not distributed in this source preview. No real timetable or personal data was used for these checks. No operating hours were changed, no field impact was measured, and the submitted-entry status did not change.
