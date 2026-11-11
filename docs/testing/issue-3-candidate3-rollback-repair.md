# Issue #3 candidate-3: source events through actual rollback

Date: **2026-11-12** (UTC+03). Existing combined staging checkout:
`/home/codex/orca/workspaces/jbsearch/issue-3-query-refresh`, branch
`feature/issue-3-query-refresh`, unchanged HEAD/base
`c326bfe72d0fbc6d17b321cb4cd78e55854d6e4c` (`0.3.2`).

**Focused repaired automated candidate for independent re-review, not issue
completion, release or native/platform acceptance.** All three designated
candidate-2 source reviews completed. A5 passed its assigned scope; A2-C2-R1
and A3-C2-R1 independently confirmed one remaining root cause, not two separate
repairs. Only the existing combined writer resumed. Candidate-1, candidate-2,
peer checkouts and frozen exports stayed read-only. No commit, push, index,
history, branch, version, dependency, baseline-spec, installation or publication
change occurred; clean dev was not used.

## Finding and focused implementation

After an admitted modal close, a different-owner source had no panels and was
excluded from normal event routing. Events during final native focus, and again
during the awaited rollback reopen, reached the provisional destination but not
that source. If focus failed, the source reopened with old verified-looking
rows/epochs and no corresponding current authority. Replacement correctly
refused stale authority; the incorrect displayed status was still a real P2 bug.
Static rollback and same-owner tracked-edit controls separated it from a blanket
transfer failure or a failed replacement guard.

`src/controller.js` now retains the normal source event/validation path through
both waits using a temporary exact-session/lifetime binding. Source and
destination independently track their own edits, Save/Close, scope epochs and
private authority. There is no event replay, new journal, copied action token,
full event-driven search, extra review step or new physical-open lane. Existing
global admission/FIFO limits and original absolute pending deadlines remain.
Old source action approval is retired at admitted close. Commit or actual
rollback completion releases temporary source coverage.

Rollback open uses a one-shot tagged resource and lifetime-bound custom-document
and panel admission. Expired/closed/disposed resources cannot create a fallback
session; a document acquired before Close cannot attach a late panel afterward.
If host open fails or returns without a live panel, its retained source rows
become non-pending identity-unknown INVALID with Rerun guidance, private authority
and callbacks are retired, and the dead source is not left selected. New query
or Rerun acknowledgements during reopening are preserved, not overwritten.
The already submitted host promise is awaited: no physical cancellation or
eventual-settlement guarantee is invented.

## Added composed regression matrix

All fixtures retain production event routes and controller/provider callbacks.
The first group retains production FindTree/show/close adapters with a synthetic
host bridge; the filesystem group retains actual workers, owned raw files,
request/source preparation and disk/authority checks, with resource-free
presentation and captured edit endpoints. None dispatches a real VS Code edit.

| New coverage | Cases and assertions |
| --- | --- |
| Confirm/new/same owner × held final focus/actual reopen × Close/unknown watcher/known edit/static | 24; actual zero-panel source coverage, monotonic epochs, stable IDs, pending→valid known deltas or explicit unknown INVALID, new binding, no full rerun, expired resource rejection, released coverage |
| Confirm/new × both waits with an existing pending check | 4; original firstQueued/deadline and current check identity retained after known edits |
| Confirm/new × failed/declined/no-panel reopen, source Close and controller disposal | 8; no ghost provider or late panel, no pending checks, no dead selection, released resource admission; actual pre-Close custom-document resolution refused afterward |
| Accepted query/Rerun during reopen | 2; accepted generation, patch ACK and cleared model remain current |
| Actual accepted Save baseline and surviving Single × confirm/new/same × both waits × known delta/Close/Save/static | 24; continuous known edit tracks offset 12 and validates; valid survivor remains replaceable, observed Close visibly invalidates and refuses; historical approval/disk origin and destroyed first-row tombstone remain unchanged |
| Open Editors zero-match Save/Close/metadata × confirm/new/same × both waits | 18; relevant epoch advances without a panel, unchanged main-file rows, no zero-row validation work or silent discovery |

Thus **80 additional executed cases**, with all previously retained regressions.
The static, same-owner and sequential-Single positive controls prevent replacing
the gap with a blanket invalidation/refusal. Unknown history still fails closed;
the fix does not infer identity from equal offsets/text or revive destroyed rows.

## Actual execution and evidence boundary

Evidence is outside Git under `/tmp/jbsearch-issue3-finish-j7aS19`.

- The first lifecycle-focused run passed 32/38; six new scaffold failures came
  from a fabricated pre-existing native entry for a modal source. Only the new
  helper was corrected; the log is retained, not counted as a passing run.
  The repeat passed **38/38** (`candidate3-focused-lifecycle-second.log`).
- The first raw-authority run passed 6/24; new assertions incorrectly required
  `false` rather than an absent false flag and assumed the scope was initially
  fresh after an already executed Single. The assertions now preserve the actual
  pre-transfer stale state and compare boolean meaning. No production guard was
  weakened. The retained repeat passed **24/24**
  (`candidate3-focused-authority-second.log`).
- The composed controller/authority files passed **407/407** before the final
  18 zero-match cases (`candidate3-focused-composed.log`). Those final cases
  separately passed **18/18** (`candidate3-focused-zero-match.log`).
- Fresh combined syntax and the full pre-final suite passed **837/837**, zero
  failed/skipped/canceled (`candidate3-pre-final-check.log`,
  `candidate3-pre-final-test.log`). Historical candidate-2's 757 results remain
  separately attributed, not relabelled as this run.
- The stable final-source check ledger is `candidate3-final-exits.json` with
  `candidate3-verified-*.log` and `candidate3-verified-source-hashes.json`.
  It records check/full Node/strict OpenSpec/package/all changed-new text and
  all four isolated Chromium harnesses, and verifies unchanged nonignored bytes
  across those checks. A frozen manifest and separate verification receipt bind
  the delivered source/runtime to that exact ledger; this document alone is not
  a successful exit receipt.

Installed Node/runtime dependencies are retained from the earlier checkpoint;
no new npm ci or installation is claimed. Chromium mock harnesses use separate
HOME/XDG/browser profiles, a synthetic bridge and their existing headless
`--no-sandbox`. They are neither native EDH tests nor an OS sandbox; no ordinary
profile, Code/Electron/Xvfb/D-Bus/native binary or application probe was used.

## Remaining acceptance and true limits

The exact new frozen manifest must receive designated independent re-review.
Native/platform acceptance and any external native-harness approval remain
separate. This automated checkpoint does not authorize an application launch
or verify native painting/click delivery/focus/scroll/Save/Undo, Windows, WSL,
macOS or physical Remote. Existing designated OpenSpec review/native gates stay
open; no baseline sync or archive is performed.

There is no native paint/read acknowledgment, exact native pixel anchor, writer
provenance or atomic workspace/disk CAS. Final-component no-follow does not
secure every ancestor or path ABA. Four permanently hung physical document/FS
jobs retain their lane slots and may stall progress; four logical validations
are not a physical worker-exit cap. Underlying host opens and submitted
show/close/WorkspaceEdit calls cannot be recalled, and false/rejected/late apply
does not prove zero modifications. Conservative initial partial, unknown
identity refusal, bounded-size/codec policy and explicit Rerun costs remain.
