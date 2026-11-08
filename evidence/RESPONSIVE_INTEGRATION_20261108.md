# Responsive calculation integration: November 8, 2026

This source preview combines cancelable-calculation parent `d72df37f690566114a035fd6603c5c12ac976b11` with main's reboarding correction `c0ee2a87d6756c504b43602e410f7f8c92bbf87a`. It does not merge the feature into main or change any deployed demo, release, video or event entry. Previous receipts describe their original versions and remain unchanged.

## Integration

The package-script conflict retains both worker verification and the journey classifier syntax check. The application-state test conflict retains both parents' complete test families. The automatically merged application preserves both the corrected full-timetable reboarding classifier and the preview's cancellation transactions. The controller and worker are byte-identical to the original preview. Routing, import/export serialization, synthetic sample and report construction are byte-identical to both parents; the decision audit and journey classifier match current main.

## Source and independent verification

- All 481 tests pass, with no failed or skipped tests. Syntax checks pass, including both worker modules and the journey classifier.
- `npm run verify:workers` passes synthetic protocol checks and genuine Node worker-thread checks. The outbound and return loop fixtures each preserve full comparison and sensitivity results across structured cloning. Capacity cancellation and retry pass; all nine workers are disposed.
- Independent comparison across 61 scenario variants preserves main's complete audit, sensitivity and report bytes. Routing matches both parents, as do JSON and CSV export bytes. This is a finite differential comparison, not a general proof.
- Both parents' test files and named application-state tests are retained. Source review found no blocking integration defect.

## Bounded actual Chromium checks

The exact eleven runtime files are identified in [runtime-sha256.json](integration-20261108/runtime-sha256.json).

- Synthetic sample remains 3/7 at current hours and 5/7 at 10:30–12:30; three assumption checks complete.
- The outbound loop shows 40 transfer/reboarding wait minutes, no on-board dwell, and 35 minutes buffer headroom. The return mirror shows 20 reboarding wait minutes and 15 minutes headroom. With maximum transfers zero, the continuous loop ride correctly shows 20 minutes on-board dwell and no applicable transfer buffer.
- Two actual saved TXT reports match both the copyable fallback and synchronous integrated report byte-for-byte. Outbound with checks SHA-256: `8ef1687be26b334fb35b1e889e153582202337ad74eaafb0df4c6a14333d23fe`. Return without checks SHA-256: `fd537cd231af6740f798b5b1b84da8916a92c169b08a16db9081e442d56ab4f3`.
- On a synthetic 1,200-connection, 24-origin, 48-start fixture, import, settings and assumption calculations can be canceled. Import and assumption retry succeed. Exact before/after checks preserve comparison, selected journey and dirty inputs. The settings cancellation also preserves an existing nonempty report fallback. Keyboard focus returns to the initiating control.
- At actual 390×844 and 320×844 CSS-pixel frames, focused Cancel remains visible and keyboard-operable. Document client/scroll widths match at 375/375 and 305/305 pixels, accounting for scrollbars. These are browser frames, not physical phones.

## Limits

No universal latency, memory, browser compatibility or field-usefulness guarantee is made. Physical devices, screen readers, native print, deployment-specific CSP, arbitrary message ordering and browser failure injection are not established by these observations. Initial/reset cancellation, unload warnings and worker-load failure were not rerun on the integrated runtime; earlier preview evidence remains version-scoped. Native JSON/CSV saved bytes were not retested here; only the two TXT downloads were. Source checks and Node workers do not substitute for browser observations.

Screenshots and raw QA records are not distributed in this source update. No real timetable or client data was used. No operating hours were changed and no measured impact is claimed. No hosted CI or Actions pass is claimed.
