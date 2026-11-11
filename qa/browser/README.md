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
