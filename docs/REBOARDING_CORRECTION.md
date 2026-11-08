# Correctly classify same-vehicle reboarding

## Reproduced defect
A valid continuous vehicle trip can visit the same stop twice. A selected journey may alight at its first visit, wait while that vehicle loops away, and board it again at the second visit. Routing already applied the transfer/reboarding buffer and transfer cap correctly, but the audit and timeline compared only trip IDs. They incorrectly labeled the off-board wait as on-board dwell and omitted the corresponding buffer headroom.

The synthetic regression has A–B at 08:00–08:10, B–C at 08:15–08:25, C–B at 08:30–08:40, and B–P at 08:50–09:00 on one trip. The selected outbound witness skips the middle two legs. With a five-minute buffer, its 40-minute wait at B has 35 minutes of arithmetic buffer headroom. It is not 40 minutes spent on board. This describes the retained schedule witness, not a recommendation to leave a vehicle.

## Correction
A shared classifier recognizes on-board continuation only when the prior witness connection is the immediate predecessor of the next connection within that trip's complete normalized timetable. It compares connection IDs, so copied result records work. Both journey directions use this rule; pickup resets boarding. Timeline and buffer labels include reboarding. The routing model, importer, serializer, sample and report construction code are unchanged. Chosen paths, reachability, total waits, riding and optimization remain unchanged; the wait breakdown and transfer headroom are corrected.

## Validation on November 8, 2026
- All 456 Node tests and eight syntax checks passed. Eleven additional test results cover loop classification, buffer/cap boundaries, sensitivity, interleaved input order, copied-object matching and real app-handler text using the existing minimal DOM double.
- Separate reviewer reproduced the original bug and independently checked outbound/return cases, 16 order/interleaving/buffer/cap variants, same-ID pickup reset, zero headroom and sensitivity. No blocking finding remained.
- Actual Chromium local preview confirmed outbound off-board wait 40/headroom 35; max-transfers zero retained the complete vehicle chain and 20 minutes genuine dwell; the return-loop mirror showed off-board wait 20/headroom 15.
- An actual 320 CSS-pixel iframe showed the corrected label and timeline. Its document client/scroll widths were both 305 pixels, accounting for the scrollbar. Desktop and narrow screenshots were inspected; no horizontal clipping of the revised label was observed.
- Normal synthetic reset was verified after testing. The original demonstration counts and routes remain unchanged.

This is bounded source and local-browser acceptance, not a fresh native saved-download byte comparison, physical-device, touch, screen-reader, print, deployed-host, real-timetable or operator study. Older evidence files remain historical and have not been rewritten. No hosted CI pass is claimed. This correction is separate from the cancelable-calculation feature branch.
