# Offline-distribution technical preview

## For a reviewer

This is a technical preview with local-file browser acceptance still pending. Use the generated `dist/openreturn-offline.html`. Save the complete file, then open it in a current desktop browser with JavaScript enabled. No Node installation, server, account, external fonts, images, modules or API calls are required by this artifact. Do not disable browser security. A managed browser that prohibits local files cannot run this distribution route.

The file is a packaging candidate, not a verified cross-browser release. The available cloud browser rejected its `file:` URL before loading it; local-file rendering, CSP compatibility, actual saved downloads and keyboard/dialog behavior remain unverified. No browser-security workaround was attempted. Runtime is still synchronous; large scenarios can block the UI and there is no cancellation control.

Try the synthetic example: current 09:00 serves 3/7 origins; best tested 10:30 serves 5/7. Check three assumptions, inspect gained/lost origins and journeys, then export the decision sheet and complete scenario JSON. Copyable export remains available if automatic downloads are blocked. Before closing, export applied data and separately copy any unapplied drafts; the app is not persistent storage. Never infer real-world access, fairness or operator usefulness from this synthetic example.

## Rebuild from source

Node 24+ and npm are needed only by the builder, not the recipient:

```
npm ci
npm run build:offline
npm test
npm run check
npm run test:offline
node scripts/verify-oracle-mutations.mjs
```

`npm ci` obtains the lockfile-pinned development-only esbuild 0.21.5 and its platform binary from npm. This candidate was built using an already installed official package of that exact version. No packages were downloaded for this build. A fresh network install is not claimed as tested. The package is used only for local bundling, never its development server. There are still no third-party runtime dependencies, and the original tests/source serving need no npm install. The separate offline check requires esbuild and a freshly generated artifact.

`dist/openreturn-offline.html` is the deliverable. `dist/offline-manifest.json` records SHA-256 for every input, the output, the builder version and the complete seven-module input graph. Generated files remain ignored by Git; distribute both through a reviewed free release rather than silently editing source HTML. The build records no time, absolute path or machine-specific identifier. Two consecutive builds must match byte for byte.

## Provenance and implementation

Source base: public main commit `8fcb2462b481b3b49aa1f15b02de00c01a0b1944`, tree `55177cdf638b801f708d1273a8d35f1aa27c4381`, verified through the GitHub connector November 8, 2026:
https://github.com/sharonbasovich/openreturn-pantry/commit/8fcb2462b481b3b49aa1f15b02de00c01a0b1944

Every existing tracked blob initially matched that tree. `src/*` and `index.html` remain byte-identical. The checked-in `evidence/accepted-main-tree.json` is a public GitHub tree response and the offline tests independently compute each runtime input's Git blob hash against it. This is reproducible provenance, not a signature or proof against coordinated malicious changes.

esbuild parses and links the unchanged modules into one inline ES module, retaining top-level await and strict module semantics. No custom import/export rewriting is used. Only the explicit seven local module paths and static import requests are accepted; warnings, additional module paths and remaining output imports fail the build. CSS is embedded verbatim. Simple conservative CSS guards reject URL/import spellings and closing-style markup; these guards are deliberately not advertised as a general CSS parser. Exact asset-tag replacement fails if the source template changes. Script-end safety is checked after esbuild serialization.

A hash-based Content Security Policy permits only the exact embedded JavaScript and stylesheet, with networking, workers, frames, objects and form submission blocked by default. CSP is defense in depth, not a replacement for browser acceptance. No eval, security flags, service worker, fetch shim or persistent credentials are introduced. The accepted application only builds ordinary blob-download links and copyable text exports.

## Validation and limits

The accepted 586-test source suite, syntax checks and five oracle mutation controls pass. Eight packaging checks pass: deterministic bytes and accepted-runtime provenance; the existing 18 application-state tests against the generated bundle using a minimal DOM double; and six rejected-build controls (remote import, dynamic import, undeclared module, syntax error, CSS network URL, CSS closing tag). DOM doubles do not test real layout, CSP enforcement, file loading, assistive technology or download saving.

Before calling this an accepted offline release, a supported browser should open the exact HTML bytes from disk with network disabled, show the expected comparison and assumption results, and verify no source requests. Test import validation and confirmed/cancelled replacement, draft preservation, repeated format changes, all three saved exports against source output, keyboard focus and a narrow window. Record browser/version, artifact hash and failures. HTTP preview acceptance cannot substitute for this local-file check. No release, deployment, event submission or claim of physical-device acceptance is made by this package.
