# Optional single-process replay-checked report

Use Node 24+. All source inputs stay local. Run from the project directory:

```sh
node scripts/verified-gtfs-report.mjs \
  --scenario tests/fixtures/gtfs-synthetic/expected/scenario.json \
  --receipt tests/fixtures/gtfs-synthetic/expected/receipt.json \
  --feed tests/fixtures/gtfs-synthetic/feed \
  --template tests/fixtures/gtfs-synthetic/template.json > verified-report.txt
```

This optional command reads the scenario, receipt, template and each feed file once with bounded strict UTF-8 reads, performs the existing full receipt replay, then runs the normal decision audit and all three sensitivity checks on that same captured scenario string. No scenario path is reopened between verification and reporting. There is no pair-only verification shortcut. Receipt versions 1 and 2 use the existing pinned adapter policies and every receipt field must match replay.

The output prepends a local-replay provenance section to the **unchanged ordinary terminal report body**, including its final newline. It states the receipt-declared service date, JSON-encoded agency timezone and time basis, JSON-encoded selection and selected active trips, block policy, exact supplied scenario and receipt SHA-256 digests, replay assurance and adapter limitations. Version 2 explicitly warns that separate-trips is lossy: same-block trips remain separate, changes consume ordinary transfers, omitted onboard options can affect coverage and rankings, and results are not globally conservative or vehicle-feasibility evidence.

Success establishes internal replay consistency only. The feed is **not independently authenticated**. Receipt-declared date/scope are not confirmed user intent. Hashes are not signatures, and a consistently replaced set of inputs can pass. Source completeness, currentness, licensing, physical access and real-world feasibility are not established. Read the ordinary report's warnings too; its generic unverified-schedule language remains unchanged.

## Bounded local input contract and failures

The small CLI loader deliberately mirrors the existing check-only loader without changing it. Scenario, receipt and template bounds are respectively 4,000,001, 4,000,000 and 1,000,000 UTF-8 bytes. Feed files are limited to 8,000,000 bytes each and 32,000,000 combined, with the adapter's basename whitelist and bounded entry count. Leaf symlinks, special files, symlink feed directories, unsupported entries, invalid UTF-8, duplicate JSON keys, malformed Unicode and excess JSON nesting fail. No receipt path or URL is followed, no network is used and no file is written by this command.

Reads happen sequentially. Keep source files and ancestor directories unchanged while loading. This is not an atomic feed-directory snapshot, a filesystem sandbox, or a promise to detect concurrent modifications; caller-supplied parent paths may contain symlinks. Assurance describes the bytes actually read and replayed. The only narrowed race is that the report cannot reread a different scenario after successful replay.

On input, replay or computation failure the process exits 1, stdout contains no report bytes, and stderr contains one fixed-code JSON error without raw records, IDs or paths. Successful report output deliberately includes scenario data, selected IDs and hashes; keep it private if inputs are private. Shell redirection may create or truncate the destination even when the command fails; an empty file is not a successful report. Output-device errors or process termination can interrupt delivery; the command does not promise crash-atomic file publication. `--help` prints usage and exits 0. There is no output-file or overwrite mode.

## Compatibility and validation

The previous check-only and decision-sheet CLIs, public adapter API, browser, model, package commands and golden artifacts remain unchanged. The documented two-process `&&` workflow still works but does not bind verification to the later read. This new opt-in command provides that same-scenario-byte binding and embedded provenance only for its own output. Browser import and existing report paths still do not enforce receipts.

Tests include both receipt versions, exact ordinary CLI body parity, full-replay tampering rejection, sanitized failures with no stdout, immutable captured-string binding, and a subprocess probe that replaces the scenario after its single file read closes and checks the report still matches the captured bytes and hash. See [source validation evidence](../evidence/VERIFIED_GTFS_REPORT_VALIDATION.md). These are synthetic local source checks, not real-feed, browser, device, field-usefulness or operational validation.
