# OpenReturn v1 scenario

A JSON object contains these fields. Unknown fields have no effect; use the normalized exported form as the supported schema.

- `version`: 1.
- `title`: descriptive text.
- `serviceDay`: a valid `YYYY-MM-DD` date identifying the timetable. It is a label, not an instruction to filter a transit feed.
- `dataKind`: `synthetic` or `user-supplied`. Importing a file does not independently verify its provenance or accuracy.
- `stops`: an array of `{id, name}` records. Use stop IDs, not addresses.
- `pantryStop`: one existing stop ID. No travel between this stop and a physical pantry is modeled.
- `origins`: `{id, stopId, label, leaveAfter, homeBy, maxAwayMinutes}`. An origin is one anonymous scenario, counted once. Do not encode personal identities or sensitive data.
- `connections`: `{id, tripId, from, to, departure, arrival}`. Each record is one adjacent, timed vehicle leg. IDs are unique. Connections sharing a trip ID must form a chronological, continuous non-overlapping chain. Service has already been selected for the declared date. Different IDs represent different vehicles, even when the route name is the same.
- `settings`: `{baselineStart, openMinutes, visitMinutes, earliestStart, latestStart, stepMinutes, transferMinutes, maxTransfers}`. Start times are evaluated on the inclusive range `earliestStart + n * stepMinutes <= latestStart`. A separately evaluated baseline may be between grid points. The transfer limit applies separately in each direction.

All times are integer minutes after the start of the declared service day, from 0 through 2879. For example, 09:30 is 570 and 25:10 is 1510. A next-day service leg is explicitly supplied with the latter notation; the engine never assumes that an arrival earlier than departure means next day. No timezone or daylight-saving conversion is performed. Durations are positive integer minutes, except that a transfer buffer may be zero.

Current bounds: 2–64 stops, 1–24 origin scenarios, 1–1,200 connections and at most 48 candidate windows. Up to three transfers per direction. The validator is authoritative for additional numeric and string bounds. Oversized/invalid inputs are rejected rather than partially accepted. Scenario JSON import/export uses a 4,000,000-byte UTF-8 cap. This exceeds the maximum normalized v1 export size; pretty-printing a valid maximal scenario does not make its own backup unreimportable.

## Optional timetable CSV helper

`src/import.mjs` exports `parseTimetableCsv(text)` and `connectionsToCsv(connections)`. The exact header is:

```csv
id,trip_id,from_stop_id,to_stop_id,departure,arrival
leg-01,bus-01,origin,pantry,09:00,09:20
leg-02,bus-02,pantry,origin,10:30,10:50
```

Times use 00:00–47:59; quoted commas and quotes follow CSV escaping. CSV import and export are capped at 2,000,000 UTF-8 bytes. Each ID is 1–80 UTF-16 code units, with no edge whitespace, C0/C1 control characters, unpaired surrogate or leading `=`, `+`, `-`, `@`. These restrictions also apply inside quoted fields; quotes do not neutralize spreadsheet formulas. IDs are never trimmed, normalized or prefixed. If a full JSON scenario uses an ID outside the CSV subset, use JSON to preserve it exactly. CSV export validates all records and verifies its own parsing contract before returning output. Spreadsheet tools can still alter ordinary IDs such as `001`, so import all IDs as text and verify them; JSON is the authoritative complete-state backup. This helper returns connection records only. Attach them to a full scenario and validate that scenario to check known stops and complete trip chains. The helper does not infer routes, walking, dates, exceptions, transfers, frequencies, pickup/drop-off permissions or vehicle identity. In the browser, select JSON to replace the complete scenario or CSV to replace only the applied scenario's timetable connections. CSV keeps the existing stops, origins, opening settings and informational service-day label, and marks the resulting scenario as user-supplied. Stop IDs must already exist in that scenario. Both modes validate the complete resulting scenario and request confirmation before replacement; invalid or cancelled input preserves the applied comparison and text draft. Unapplied settings are not merged into an import. The service-day label is retained, not inferred or independently verified from CSV.

## Witness semantics

A reported reachable origin has an outbound array, pickup start/end, a return array, first departure, home arrival, total time away and non-riding/non-pickup waiting time. A pantry-stop origin has empty travel arrays and spends only its visit duration away. A vehicle change needs the specified buffer; remaining on the same trip does not. A visit resets vehicle state, so the return's first boarding is new.

The selected per-origin witness minimizes time away, then home-arrival time, followed by stable path ordering. Coverage ties choose the smallest absolute shift from the baseline, then the earlier start. These preferences are deterministic comparison rules, not measures of welfare or fairness.
