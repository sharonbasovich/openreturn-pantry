# Browser acceptance record

Checked November 8, 2026, with final adversarial-label retesting after the main workflow checks. Application files were served locally using the supported static preview and tested in actual cloud Chromium. These are observed browser results, separate from the automated routing oracle. No public deployment, real transit feed, event submission or external account was involved in these checks.

## Passed workflows

- Default example computes 3/7 origins for 09:00–11:00 and 5/7 for the best tested 10:30–12:30 window. Gained origins are West End, Orchard and Eastbank; Maple Court is explicitly lost.
- A 10-minute transfer buffer changes the best count to 4/7. West End's 6-minute vehicle change fails, while Hilltop's same-vehicle 3-minute dwell remains valid. Its complete outbound, visit, return and 95-minute time-away witness is rendered.
- Invalid JSON preserves both the applied comparison and unapplied draft/settings. Valid JSON opens a replacement confirmation. Escape preserves the draft and current scenario and restores focus to the import button. Confirmed replacement applies the new title/settings.
- Reset cancellation preserves the scenario and restores the reset button's focus. Confirmed reset restores the synthetic example and 3/7 versus 5/7 counts.
- Calculation restores keyboard focus to its initiating button after re-enabling controls. Selecting an origin preserves focus on that origin. Tab then Enter moves from Hilltop to Willow and updates the selected journey without losing keyboard position.
- CSV mode exposes the exact six-column header. Confirmed CSV import preserves the supplied connections, computes the same counts, and displays “User-supplied · unverified”. Canceling a format change preserves the CSV draft and selection, with focus returned to the selector. Invalid CSV reports the required columns and leaves both draft and comparison unchanged.
- Decision-sheet, scenario-JSON and timetable-CSV exports completed as real browser downloads. Downloaded bytes were read and checked; a download event alone was not treated as success. Exports include applied data only, excluding unapplied drafts. The copyable fallback also appears.

## Layout and visual checks

- Desktop viewport: 1180 × 757 CSS pixels, document client width 1165 and scroll width 1165. No page-wide horizontal overflow.
- Narrow test frame: width 390, document client and scroll widths both 375. The chart alone scrolls (335-pixel client width, 768-pixel content).
- Smaller test frame: width 320, document client and scroll widths both 305. The chart alone scrolls (265-pixel client width, 768-pixel content). Import confirmation and CSV workflows were exercised here.
- Imported a validated scenario containing maximum-length, 160-character unbroken titles, origin labels and stop names. Before hardening, this produced a 3204-pixel document scroll width. After the fix, the same actual browser import and a complete journey selection keep document client and scroll widths at 305, with metadata, gains/losses, origin buttons and journey text wrapping inside their containers. Reset to the normal sample also retains the correct width and 3/7 versus 5/7 counts.
- The two narrow fixtures in `qa/` render the actual application in browser frames. This tests responsive CSS, not a physical phone, touch handling, a device emulator or mobile assistive technology.
- Actual screenshots are included: `desktop-hero.jpg`, `desktop-comparison.jpg`, `narrow-390.jpg` and `narrow-320.jpg`.

Testing exposed and fixed four defects before this record: focus loss when calculations disabled controls, focus loss when the origin list was rebuilt, intrinsic grid width that caused narrow pages to overflow, and overflow from maximum-length imported labels. Missing-font diagonal-arrow glyphs were replaced or removed. The final browser retests passed. The last browser-log inspection contained no warning/error sourced from the application origin; extension-origin messages are outside the application.

## Download receipts

`native-decision-sheet.txt`: transfer buffer 10, baseline 3/7, best 4/7; applied assumptions and every baseline/best witness or failure reason. SHA-256:

`1cf7f45d6947ccf715def7870bc76368658bed959378e0937bd0dd0e14d01f50`

`native-scenario.json`: exact normalized synthetic scenario with transfer buffer 10; re-evaluates to 4/7. SHA-256:

`43edb2cc4f70869c4b22361557da5d71be83d63db3918deff49e0bdb324b2678`

`native-timetable.csv`: 17 connections, exact round trip against normalized sample connections. SHA-256:

`2f46f936d5dacb3f79f0c3a239a06ac57629a0d4f7291ac64e15f9fcfc939303`

## Limits

No native print dialog, assistive technology, physical mobile device, real timetable, pantry operator or community field trial has been tested. Reduced-motion and print rules exist in CSS but were not exercised through an operating-system preference or native print workflow. No fairness, beneficiary count, reliability, safety or measured real-world impact follows from these synthetic checks.
