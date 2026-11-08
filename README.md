# OpenReturn

**Opening hours only work if the bus home does.**

OpenReturn is an original, local-first prototype for a food-pantry operator comparing opening windows with the **same staffed duration**. It checks the complete scheduled journey: leave an origin, reach the pantry, finish a visit while it is open, and return within the stated time budget. It displays who gains and who loses in the supplied scenario rather than hiding a loss inside a better total.

The built-in timetable is entirely synthetic. No result is evidence that real people can reach a real pantry. The tool counts **origin scenarios**, not beneficiaries, households served, or equitable outcomes.

![OpenReturn comparing two equal-duration opening windows in the synthetic example](evidence/desktop-comparison.jpg)

## Run

Node 24+ is used for tests. The application is buildless and has no third-party runtime dependencies.

```sh
npm test
npm run check
npm run serve
```

Open http://localhost:4193 in an available browser. The app uses JavaScript modules and must be served over HTTP rather than opened as a file. A deployed preview is not yet established by this README.

## Try the synthetic example

1. Compare the 09:00–11:00 baseline with candidate two-hour windows.
2. Inspect the best window's complete journeys and the explicitly listed lost origin.
3. Open South Wharf to see why an outbound bus alone is not enough.
4. Raise the transfer buffer from 5 to 10 minutes. Hilltop stays on the same vehicle through its interchange; West End changes vehicles and may lose its connection.
5. Export the scenario or decision sheet. Invalid input must not replace the current scenario.

All figures are computed from the input, not a claimed measured impact or forecast.

## Input and privacy

The scenario format is documented in [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md). Paste JSON to replace a complete scenario, or select CSV to replace only its timetable connections while retaining its existing stops, origins and settings. Both modes require validation and confirmation before replacement. CSV must describe an already selected service-day timetable; it does not infer or verify the retained service-day label. **This is not a GTFS importer.** Do not paste an unfiltered GTFS feed and assume its service calendars, pickup restrictions or transfers have been interpreted.

Application code makes no network requests, uses no analytics, and does not store scenario content in localStorage. The server hosting the app may receive ordinary page requests. Keep anonymous stop labels and scenario IDs, not client names, home addresses, or sensitive demographic information. Explicit exported files remain on the device where they are saved. Reloading discards unsaved work.

## Model and limitations

The engine evaluates every start time on the user-selected finite grid. It does not optimize continuously outside that grid or assert that a transit route is a safe real journey. Each origin has its own earliest departure, latest return and maximum time away. A same-vehicle continuation uses no interchange buffer; a vehicle change does. Transfer caps apply separately to the outbound and return legs.

A feasible journey is a **schedule witness**, conditional on the supplied timetable and assumptions. There is no walking, stop access, fare, wheelchair access, boarding capacity, real-time delay, food availability, queue-length, eligibility, holiday, timezone or weather model. The user selects active service before input. The pickup duration is a scenario assumption, not a measured wait. Delays can invalidate every planned connection, even with a buffer.

Coverage alone is not a policy recommendation. An operator must consider the listed losses, staffing, consultation, accessibility and service constraints before changing hours. No operating hours are changed by this tool.

## Origin and evidence

New project work began November 8, 2026 for Code for Change, after its November 5 opening. See [docs/EVENT_AND_PRIOR_ART.md](docs/EVENT_AND_PRIOR_ART.md) for eligibility checks, source links and prior-art boundaries. AI-assisted implementation and review are disclosed. No new routing or fairness algorithm is claimed.

See [evidence/INDEPENDENT_REVIEW.md](evidence/INDEPENDENT_REVIEW.md) for the independent routing checks and [evidence/BROWSER_ACCEPTANCE.md](evidence/BROWSER_ACCEPTANCE.md) for actual Chromium workflow, keyboard, export and narrow-layout checks. All 357 automated tests pass. Browser coverage is limited to the documented environment; physical phones, assistive technology, real timetables and field usefulness remain untested.

This is a prototype, not a submitted event entry or a completed operational pilot.
