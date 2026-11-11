# Responsive-calculation preview — November 8, 2026

This preview is based on v0.2.2. Its historical browser receipt does not validate this change. The preview adds no dependencies and does not change the model semantics.

## Transaction contract

Each comparison or assumption check owns a fresh module worker. Only one application operation may run at once. Controls retain their previous disabled states; Cancel remains enabled in a fixed bottom bar, including when import/check controls are below the fold. Initial loading has no applied scenario: result-dependent controls stay disabled until successful initialization; Reset synthetic example retries cancellation or failure.

Apply reads and validates a candidate, computes without changing applied state, then commits on success. Import parses and computes before asking for replacement confirmation. Reset asks for confirmation before computing. Checks compute from applied data only and replace prior checks only on success. Cancel, worker errors, unreadable responses, loading/creation failures and failed validation preserve the applied scenario, comparison, selected journey, prior checks, settings/data drafts and last copyable export. Dirty flags remain intact. Cancellation of import does not open confirmation. Errors never report that pending changes were applied.

Cancel terminates the worker and rejects its promise; completion/failure also terminates and disposes handlers. Each response must match its job ID and active worker. Saved stale callbacks cannot commit or settle another job. Reentrant app operations are ignored while an operation owns the transaction, including import/reset confirmation. There is no synchronous heavy fallback if workers are unavailable. A worker that never replies can be terminated with Cancel; no automatic timeout is imposed.

While controls are disabled, focus moves to Cancel if focus belonged to a control being disabled or to the document. Completion or cancellation restores the connected, enabled initiator only when focus remains on Cancel or the document and no modal owns focus. Focus moved elsewhere is respected. The busy bar hides when idle and in print.

Scenario validation, JSON/CSV parsing, structured-clone transfer, DOM rendering and export serialization still occur on the main thread. This change isolates expensive route searches and repeated assumption searches, not all possible main-thread work. Worker creation and data copying add overhead, particularly for small examples. Reloading still loses unsaved data.

## Verification scope

On November 8, 2026, `npm test` passed 470 tests and `npm run check` passed. The existing application-handler tests now use an explicitly synthetic worker double running the real computation inside Node. Added deterministic tests hold replies and inject cancellation, errors, message errors, unavailable workers, stale replies and retries. These test state/protocol behavior, not browser responsiveness, layout or native focus behavior. Pure model/CLI tests remain unchanged.

A separate actual-Chromium pass accepted the bounded final runtime, including heavy import/settings/check cancellation, preserved state, corrected focus, narrow-frame controls, saved TXT bytes and explicit initial/reset/error QA variants. See the [dated receipt](../evidence/RESPONSIVE_ACCEPTANCE_20261108.md) for exact scope and remaining limits. Node doubles and worker-thread checks are not substitutes for those observations. This is a source preview, not a deployed update.
