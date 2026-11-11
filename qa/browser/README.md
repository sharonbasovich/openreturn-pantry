# Draft browser regression harness

This is isolated test tooling, not an application dependency or a deployed update.
The app has no added dependencies or changed production behavior. The GitHub
workflow is push-only on `preview/cancelable-calculations-20261108`, has read-only
contents permission, no persisted checkout credentials, and a ten-minute limit.
Publishing that workflow will cause external execution; authoring it alone does not.

## Run when browser/server execution and installation are authorized

From `qa/browser`, with Node 24:

```
npm install --ignore-scripts --package-lock=false --registry=https://registry.npmjs.org
npx playwright install --with-deps chromium
npm run check
npm test
```

`@playwright/test` is pinned to 1.56.1. Its transitive dependencies are resolved
from npm on installation; this draft has no generated lockfile because dependency
installation was not permitted during authoring. The local server binds only
127.0.0.1:4198, does not reuse an existing server, and is stopped by Playwright.
Only index.html and production src modules/styles are exposed. The QA control
endpoint is loopback-only, in-memory and never part of the production app.
Tests run serially with fresh browser contexts, no retries and no real data.

## Evidence classification

- **EXACT**: production files are byte-for-byte unchanged. A test compares every
  served runtime resource with checkout bytes and records SHA-256. Chromium native
  module-worker events, ready results (3/7 and 5/7), assumption cards, bounded heavy
  import Keep/Replace, 48 windows, successful apply, and actual browser-saved
  TXT/JSON/CSV bytes are checked. Saved bytes match the existing synchronous model
  and serializer APIs, including TXT both before and after checks. This oracle
  checks worker/UI/export parity, not independent proof of routing correctness.
- **INJECTED**: the server changes only the next worker resource, either returning
  404 or appending a handler that delays computation by 60 seconds. The actual
  browser Worker constructor and production controller are unchanged. Termination,
  Enter-to-cancel, focus restoration, disabled controls, aria-busy, fixed Cancel
  geometry, no horizontal overflow at 320/390px, unchanged result DOM/selection,
  settings/data drafts and prior export are asserted. Reset confirmation checks
  retained dirty state; a fresh exact-source worker proves recovery. Initialization,
  failed applied calculation, reset, import, apply and assumption cancellations are
  covered. A separate case performs these cancellations with heavy data already
  applied and prior heavy checks present.

The held module delays **before calculation**, not after it. It does not prove
cancellation at a particular routing instruction, or native responsiveness during
heavy computation. Exact-mode heavy completion and injected deterministic
cancellation are deliberately separate claims. The fixture matches the existing
worker-thread test exactly: 1,200 connections, 24 origins, 48 starts. Its origins
share constraints; it is not the historical 24-distinct-constraint browser fixture.

Downloaded files, SHA attachments, runtime hashes, narrow screenshots, JSON test
results and failure traces/screenshots are under `evidence/browser-regression/`
(ignored by Git). The workflow uploads this directory even after test failure.
No private GTFS, remote app, account, deployment or live service is accessed.

## Validation status at authoring

Browser tests have **not been executed**. No server was started and no dependency
or browser installed. Static syntax, fixture parity and the existing Node suites
can run without Playwright using `npm run check --prefix qa/browser`, `npm test`,
`npm run check`, and `npm run verify:workers` from the repository root.
A passing Node suite is not a browser pass. Native focus, download and worker
assertions require the future authorized browser run. Physical devices, screen
readers, native print, deployment CSP, arbitrary browser message ordering and
worst-case latency/memory remain outside this harness's claims.

## First hosted run and CSV fallback correction

Run 43024388574 at commit 51445fc0 completed six injected tests successfully but
failed both exact tests on CSV fallback textarea equality. The immediately prior
strict saved-file byte equality passed. The serializer intentionally emits CRLF;
HTML textarea API values normalize CRLF to LF. The harness now checks CSV has
CRLF-only line endings, verifies native textarea normalization with a mixed-ending
probe, and compares fallback text with only the corresponding CRLF-to-LF change.
Actual downloaded bytes remain strictly compared without normalization. TXT/JSON
fallback comparisons are unchanged. The failed run remains evidence; the revised
assertion still needs a new hosted run before claiming an all-green browser pass.

## Distinct-constraint regression addition

The original capacity fixture/tests remain unchanged. A second deterministic,
explicitly synthetic workload keeps 1,200 connections and 48 starts but assigns
24 different `(stopId, leaveAfter, homeBy, maxAwayMinutes)` tuples, including 24
unique home deadlines. These are constraint scenarios, not people or private
schedules. Static checks require the entire coverage-count sequence (4 through
19 and down to zero), baseline 9/24 versus best 19/24, different reachable-origin
sets, and sensitivity changes (8 fixed / 9 reoptimized for the longer visit).
This prevents accidentally reverting to equivalent-origin cache coverage.

The new EXACT completion case at 390px observes actual native Worker responses
with a passive test-only subclass, without changing posting/termination or
production bytes. It compares full comparison and sensitivity results to the
synchronous model, then checks saved TXT before/after assumptions and JSON/CSV
bytes. This remains a worker/UI/serializer parity oracle, not an independent
routing oracle. A completed-results screenshot and fixture SHA are retained.

A second case at 320px captures the busy Cancel geometry **before cancellation**
with the existing INJECTED held worker. Then it starts a separate EXACT native
sensitivity worker and promptly cancels while the UI is busy, asserts worker
closure, focus restoration and full prior state, and runs exact checks again to
prove recovery and saved-export parity. Worker creation and busy UI do not prove
routing has begun or identify the instruction where termination happened. The
exact cancellation test intentionally fails if work completes before Cancel;
it does not silently skip, substitute a held worker, or claim a mid-routing pass.
The held screenshot is explicitly labeled; no production runtime is modified,
no repeated-computation loop or new artificial delay is introduced.

These two additional browser cases have not been executed locally. They require
the authorized hosted workflow before browser acceptance can be claimed. Local
syntax/fixture and Node checks alone do not establish native-browser behavior.
