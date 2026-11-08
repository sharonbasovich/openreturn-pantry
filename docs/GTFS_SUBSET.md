# Optional offline GTFS scheduled-service subset adapter

This **Node-only adapter** projects one explicitly selected service date and route-or-trip scope into an OpenReturn v1 scenario. It is separate from the browser's JSON/connection-CSV importer. It adds no dependencies and makes no network requests. It is not a general GTFS importer, full-feed validator, journey planner, accessibility check or evidence of practical travel feasibility.

## Run the reproducible synthetic example

Use Node 24+. From the project directory:

```sh
node scripts/import-gtfs-subset.mjs \
  --feed tests/fixtures/gtfs-synthetic/feed \
  --date 2026-11-12 \
  --route R \
  --template tests/fixtures/gtfs-synthetic/template.json \
  --out gtfs-example-output

node scripts/decision-sheet.mjs gtfs-example-output/scenario.json
node --test tests/gtfs-subset.test.mjs
```

The output directory must not exist; its parent must already exist. Choose a different output directory for a repeat run. The two generated files are:

- `scenario.json`: normalized v1 data accepted by the existing browser JSON importer and terminal decision-sheet command.
- `receipt.json`: selected/excluded scope, service activation, agency timezone, original stop calls, connection-to-sequence mapping, source hashes, output hash and explicit limitations. **Keep this file with the scenario.** The unchanged browser does not import or retain the receipt.

The committed example and expected outputs are entirely synthetic. The fixture intentionally shuffles stop-time rows, revisits a stop, dwells at intermediate calls, crosses 24:00 and adds/removes service through exceptions. Its successful conversion does not validate any real feed.

The CLI reads only local files. It neither downloads nor extracts ZIPs, accesses credentials, calls an external validator, uploads data nor publishes outputs. Use a directory containing the complete extracted source, not a hand-pruned set that conceals unsupported restrictions. If a restriction or file is rejected, do not delete it to force acceptance. Use a capable upstream tool or extend and review this adapter instead.

## Explicit inputs

Required flags are `--feed DIR`, `--date YYYY-MM-DD`, `--template FILE` and `--out NEW_DIR`. Choose exactly one scope kind:

- `--route ID`, repeated for more routes: include every active trip on each requested route. Each route must have at least one active trip. Inactive trips in that scope are named in the receipt.
- `--trip ID`, repeated for more trips: include those exact trips; every requested trip must be active. Unknown, duplicate or empty scope fails.

There is no implicit “all routes,” stop filter, time cutoff or truncated-trip option. IDs are exact, case-sensitive strings; shell-quote values containing spaces or punctuation. The CLI consumes each flag's next argument literally, including an ID beginning with a dash. Do not provide transit-user names, residential addresses or sensitive client data.

The template must contain only these fields:

```json
{
  "title": "Anonymous local planning scenario",
  "timeZone": "America/New_York",
  "timeBasis": "gtfs-service-day-minutes",
  "pantryStop": "P",
  "origins": [
    {"id":"origin-1","stopId":"A","label":"Anonymous origin","leaveAfter":480,"homeBy":960,"maxAwayMinutes":180}
  ],
  "settings": {
    "baselineStart":540,"openMinutes":120,"visitMinutes":15,
    "earliestStart":540,"latestStart":780,"stepMinutes":15,
    "transferMinutes":5,"maxTransfers":2
  }
}
```

`timeZone` must exactly match every selected route's agency timezone and be recognized by Node's timezone database. An omitted route agency ID resolves only when the feed has one agency. The explicit `timeBasis` acknowledges raw GTFS service-day minutes. **Do not enter ordinary wall-clock minutes on a daylight-saving transition day and assume they are equivalent.** This adapter performs no DST or timezone conversion; its output and browser labels remain numeric service-day coordinates. Stop-local timezone metadata is recorded, never applied to scheduled times.

Origins and pantry reference exact `stops.txt` stop/platform IDs, including unserved stops if explicitly requested. No label matching, geocoding, parent-station collapsing, walking or physical pantry access is inferred. Two stops sharing a name remain different. The output's `dataKind` is always `user-supplied`, including when the supplied fixture is synthetic; that label does not certify provenance.

## Accepted projection and deliberate refusals

The source vocabulary was checked against the [official GTFS Schedule Reference](https://gtfs.org/documentation/schedule/reference/) on November 8, 2026 (page revision April 27, 2026). Relevant semantics:

- [Calendars](https://gtfs.org/documentation/schedule/reference/#calendartxt) and [exceptions](https://gtfs.org/documentation/schedule/reference/#calendar_datestxt): weekly service uses inclusive date bounds; dated additions/removals override it. Exception-only calendars are supported.
- [Stop times](https://gtfs.org/documentation/schedule/reference/#stop_timestxt): sequence numbers determine call order; repeated stops remain separate calls. Schedule times use the agency timezone. Values above 24 hours belong to the selected service date. The GTFS time origin is noon minus twelve hours, which differs from local midnight on some DST days.
- [Routes](https://gtfs.org/documentation/schedule/reference/#routestxt) and stop times: regular pickup/drop-off defaults to zero; no continuous boarding/alighting defaults to one at route level. An explicit stop-time continuous value overrides its route default.
- [Frequencies](https://gtfs.org/documentation/schedule/reference/#frequenciestxt), [transfers and linked trips](https://gtfs.org/documentation/schedule/reference/#transferstxt), and [trip blocks](https://gtfs.org/documentation/schedule/reference/#tripstxt) describe additional behavior that this projection rejects rather than approximates.

The implementation's deliberately narrower contract is authoritative for acceptance:

| Area | Adapter behavior |
| --- | --- |
| Required files | Nonempty `agency.txt`, `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`, plus `calendar.txt` and/or `calendar_dates.txt`. Required header subsets are in `src/gtfs-subset.mjs`. |
| Source structure | UTF-8, optional BOM, quoted CSV/escaped quotes, LF or CRLF. Duplicate/unknown headers, malformed rows, field controls (including quoted tabs/newlines) and unknown files fail. No ZIP, subdirectory, symlink or special-file inputs. |
| Optional tables | `frequencies.txt` is inspected: a row for any selected active trip fails, including `exact_times=1`. Any nonempty `transfers.txt` fails, conservatively even outside selected scope. |
| Metadata only | `shapes.txt`, `feed_info.txt`, `attributions.txt` may be present. Their exact bytes are hashed; their contents are not validated or used for routing. No URLs inside them are fetched. |
| Other files | All other files fail, including fare, pathway, flexible-location and extension files. This strict whitelist intentionally rejects many ordinary feeds, including ones it might otherwise partially interpret. |
| Times | Both arrival and departure must be supplied at every selected call, from `0:00:00` to `47:59:00`, with seconds exactly zero. No rounding or interpolation. `timepoint=0` fails. A selected trip may have all flags absent/blank or all `1`; mixing blank and explicit flags fails conservatively. |
| Chains | All supplied calls of each selected trip are sorted by numeric `stop_sequence`. Nonconsecutive repeated stops and nonzero dwell are retained. Every adjacent leg must connect different stops with positive duration. Adjacent identical stops, zero-duration travel, overlaps or backwards time fail rather than being repaired. No intermediate call is skipped. |
| Boarding | Selected pickup/drop-off must be blank or `0`. Effective continuous pickup/drop-off must be `1`; blank inherits route setting. Booking rules, flexible locations/windows and trip safe-duration fields fail. |
| Vehicle identity | Exact `trip_id` is retained. Any selected nonempty `block_id` fails, including singleton blocks. Distinct trips are never silently joined into one vehicle. |
| Stop identity | Exact stop/platform IDs and names are retained. Parent metadata is checked for referenced station hierarchy but does not merge stops. No stop access or accessibility inference. |
| IDs | Maximum 80 UTF-16 code units; nonempty, no edge whitespace, controls or malformed Unicode. No normalization, truncation or delimiter-based ID concatenation. Deterministic short connection IDs are mapped to original trip/sequence pairs in the receipt. |
| Capacity | At most 8,000,000 bytes per source file, 32,000,000 combined, 100,000 records per parsed table, 64 columns and 4,096 code units per cell. Template at most 1,000,000 bytes. Final v1 bounds remain 64 stops, 24 origins, 1,200 legs, 48 grid starts and 0–2,879 minutes. Oversized output fails as a whole. |

Primary-ID uniqueness, calendar syntax, trip route/service references and stop-sequence uniqueness are checked across the core tables, not just selected rows. Detailed boarding/time support is checked for selected active trips. Unselected trips are **not certified valid**. Ignored descriptive fields, coordinates, shapes, accessibility and fare details are not part of the model. This is a bounded projection, not a GTFS conformance assessment.

The model's template transfer buffer is an explicit assumption between identical stop IDs. It does not establish station access, minimum physical interchange time or a guaranteed connection. Selected service excludes adjacent service dates, even when their runs overlap on the calendar clock. Any unselected route or trip might change coverage. Keep those scope limits visible when comparing results.

## Module API and receipt verification

```js
import {adaptGtfsSubset} from './src/gtfs-subset.mjs';
const {scenario, receipt} = adaptGtfsSubset({
  files,                 // object: exact supported basename -> UTF-8 string
  serviceDay: '2026-11-12',
  routeIds: ['R'],        // or tripIds, never both
  template
});
```

This Node-only module performs no filesystem or network operations and does not mutate its inputs. It returns ordinary objects or throws; it never returns a partial scenario. The existing validator and JSON serializer check final output. The CLI supplies the filesystem boundary and strict UTF-8 decoding.

Hashes use SHA-256. Source hashes cover exact UTF-8 bytes, including BOMs and line endings. `templateHash` covers `JSON.stringify(template)`; the CLI additionally records `templateInput` for the original template file's bytes. `output.sha256` covers `exportScenarioJson(scenario)` followed by one LF, exactly matching the CLI file. These are reproducibility checks, not signatures, freshness checks, licensing permission or proof the source is complete. No absolute source paths or generation timestamp are written to outputs; identical inputs reproduce identical bytes.

All validation finishes before the CLI reserves a fresh output directory. Existing files/directories are never overwritten. On a normal write error it removes only files it created; incomplete cleanup is reported. A process kill or power failure can still leave partial files. This is not a crash-atomic filesystem transaction: treat the pair as usable only after a successful exit and matching scenario hash. Keep output outside the source feed directory.

## Verification scope

See [the synthetic adapter validation receipt](../evidence/GTFS_SUBSET_VALIDATION.md). Browser code, routing model, existing import helpers and package commands are unchanged. There is no real-feed, live-transit, field-usefulness, physical-device or new browser acceptance claim for this feature.

### CLI artifact compatibility

The CLI validates template JSON and both serialized outputs against the [offline replay JSON contract](GTFS_RECEIPT_VERIFICATION.md#producer-consistency) before creating a directory. Receipt output must fit 4,000,000 UTF-8 bytes including its final LF; source bounds alone do not guarantee this. Oversized evidence is rejected, never trimmed. Output must be outside the source feed, including through ancestor path aliases. Existing unambiguous accepted output bytes and the object-based adapter API are unchanged.
