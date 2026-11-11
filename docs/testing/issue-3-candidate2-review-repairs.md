# Issue #3 candidate-2: independent-review repair record

Date: **2026-11-11**. Existing combined staging checkout:
`/home/codex/orca/workspaces/jbsearch/issue-3-query-refresh`, branch
`feature/issue-3-query-refresh`, unchanged base/HEAD
`c326bfe72d0fbc6d17b321cb4cd78e55854d6e4c`.

**Candidate-2 is a repaired automated candidate for independent re-review, not
release or native/platform acceptance.** Candidate-1 remains immutable; its nine
P2 findings and original reports are retained outside Git. All peer checkouts and
exports stayed read-only. No commit, push, index/history/branch/version changes,
clean-dev edits, baseline spec sync/archive, installation or publication occurred.

**Historical checkpoint update (2026-11-12):** all three candidate-2 source
reviews completed. A5 passed its assigned scope; A2-C2-R1 and A3-C2-R1 found the
same remaining zero-panel source-event gap during final focus/actual rollback
reopen. The 757-test results below remain real candidate-2 evidence, not proof
that this later counterexample was covered. The focused successor is recorded
in [the candidate-3 report](issue-3-candidate3-rollback-repair.md); candidate-2's
immutable source/runtime and reports remain unchanged outside Git.

## Repair and focused regression matrix

The test fixtures distinguish actual worker/tempfile/raw-byte observations from
synthetic VS Code host/edit/native-delivery adapters. No real WorkspaceEdit was
submitted to VS Code, and no provider mock is a physical-paint acknowledgment.

| Finding | Implemented boundary | Focused composed regression |
| --- | --- | --- |
| A2-R1 | Transfer rollback never rewinds delivered epochs or restores pre-event authority/approval. Old-owner rows fail closed when events cannot be replayed. Same-owner rollback retains its progressed actual rows. | Reveal/close failure × Close/watcher/known edit × original pending/nonpending; monotonic epoch, retained IDs, INVALID/unknown/nonpending, no automatic full rerun; static pending/Save-authority rollback controls |
| A2-R2 | Exact transaction/source/destination objects, generation, lifetime and parameters guard each continuation. Accepted edits/Rerun cancel transfer. Only its acknowledged native close may be reopened; unrelated last-panel close/removal/disposal cannot resurrect an owner. | Confirm/new/same × reveal/close × accepted query/replacement, explicit Rerun, closed destination with success/failure settlement, controller disposal; last-panel close, old pending callbacks and provider ghost checks |
| U1 | Unique Rerun request IDs; busy/stale-generation refusal releases only the refused request, not an accepted/later duplicate guard. | Actual controller refusal, production webview VM Replace→Rerun gap, busy/clear/refusal/retry, late old refusal, same-generation echoes, new generation and optimistic patch controls |
| A5-R1 | Final request compares effective in-scope buffer inputs/non-default clean disk codecs, not harmless clean UTF-8 cache membership. Open Editors membership and every selected-document/raw-baseline check remain. | Actual full worker/tempfile multi-file project All with initially unloaded and preloaded documents; newly admitted/changed dirty zero-match buffers refuse without events, zero dispatch, original list retained |
| A5-R2 | Global Find/Replace creates a separate ordinary session when review is current. Review-only schedule/search/reset refuse discovery. Normal reliable binding still needs no extra confirmation. | Both actually registered global callbacks × opening/retained review; old semantic model/token unchanged, discovery only on independent ordinary search, direct review discovery refused |
| A5-R3 | Submitted lock cleanup belongs to the real operation; status/error/result/feedback publication also needs its original generation/lifetime. False/rejected outcomes and modal/native catches cannot poison a new search. Disposed modal panels lose message admission. | Actual modal receive/native command adapters × false/reject/success × reset/reopen/close; lock held until actual reply, one submitted edit, current status/needsRerun unchanged; old failure separately reported; retained disposed-panel callbacks cannot dispatch or write into a newer panel |
| A3-R1 | A finally guarded prepared Save rebase can become private current raw observation, separate from immutable historical row/approval baseline and expired Save ticket. Surviving known deltas may retain it; every later action verifies actual raw bytes. | Sequential Singles after observed Save, additional known delta/new Save, changed disk, Close, stale prepared proof and unchanged-baseline control; destroyed first row never revives and historical provenance never changes |
| A3-R2 | Positively checked document/history/Save/current-observation capture and destination-owned readmission; no source symbols or owner token copying. Destination receives its own event chain after source close. Unrenewable proof is explained INVALID. | Confirm/new/same × known/Save-pending/Save-complete/accepted observation, original pending deadline, unchanged watcher, intervening watcher/known edit/Close, known edit during final focus after modal close, static Save rollback and missing-proof refusal |
| A3-R3 | Actual PreviewProvider render uses configured/hard bounded snapshot read after awaited theme loading, before whole-text split; no query evaluation moves to the host. | Billion-code-unit declared-length spy with zero getText calls, growth during loading, actual controller→renderer size-limit feedback, bounded INVALID inspection and existing TextMate/client grammar tests |

The controller-wide rollback event watermark is conservative: an unrelated event
while a different owner's provisional parameters are installed may also invalidate
old rows on failure. It is not a transactional journal or watcher-completeness
proof. Static rollback and completed transfer renew authority only through the
same bounded document-object/version/hash/history checks; no inferred dirty/disk
equality is used. Re-admission groups rows by URI rather than rescanning all rows
for every file.

### Deliberate test/contract updates

- The old test that inferred native focus had implicitly disposed a draft and
  therefore reopened it is replaced by a last-panel lifetime regression. VS Code
  gives no cause receipt proving that an unrelated disposal was not a user close;
  the safe behavior is cancellation without resurrection. Failure after this
  transaction's explicitly admitted close still permits guarded rollback reopen.
- Legacy completed buffer-only controller fixtures now bind their synthetic
  document positively, like actual initial buffer search. Two external-history
  watcher tests explicitly advance the document version without a known delta;
  an unchanged continuously bound watcher is not fabricated unknown history.
- Preview mocks now expose bounded EOF APIs. The narrow async-preparation race
  fixture supplies its real session map rather than weakening production lifetime
  checks to support an incomplete mock. No dependency or runtime policy was
  removed to make these tests pass.
- The static Save-authority rollback fixture holds both zero-delay validation
  timers before awaiting either worker. Otherwise the second check can finish
  automatically while the fixture waits for the first; the correction makes
  the intended interleaving deterministic without changing production guards.

## Fresh execution ledger

Linux x86-64; Node **22.23.2**, npm **12.0.2**. Existing candidate-1 installed
runtime dependencies were retained, not reinstalled or relabelled as a new npm ci.

| Check | Actual repair-stage result | Evidence outside Git |
| --- | --- | --- |
| First focused run | 323/326; three fixture/assertion failures retained, not called passes | `candidate2-focused-first.log` |
| Second focused run | 390/390 | `candidate2-focused-second.log` |
| First full repair preflight | 742/746; bounded-preview mock, repeated Explorer opening and narrow session-map failures retained | `candidate2-pre-final-test.log` |
| Third focused run | 413/413 | `candidate2-focused-third.log` |
| Intermediate combined check/full Node | Check passed; 756/756 before the final disposed-panel regression | `candidate2-final-check.log`, `candidate2-final-test.log` |
| Repeat before deterministic timer-fixture correction | 755/756; the static Save rollback fixture's second validation completed during its first await; retained as a failed run | `candidate2-final-test-stable.log` |
| Deterministic timer-fixture retry | 756/756 before the final disposed-panel regression | `candidate2-final-test-complete.log` |
| Final combined syntax and full Node suite | Passed; **757/757**, zero failed/skipped/canceled | `candidate2-verified-check.log`, `candidate2-verified-test.log` |
| Strict OpenSpec | **33/33** passed | `candidate2-verified-spec-check.log` |
| Package after the final controller guard | Verified **90 main entries + 31 bundled client entries** | `candidate2-verified-package.log` |
| Whitespace plus all changed/new text | Passed; exact file count recorded in the external receipt | `candidate2-verified-diff-check.log` |
| Four isolated Chromium harnesses on final runtime sources | All exit 0: query reset (12), full approval/review (4), shared Rerun busy-refusal/retry/late refusal, and modal viewport/selection | `candidate2-verified-browser-*.log`, `candidate2-final-exits.json` |

Evidence lives under `/tmp/jbsearch-issue3-finish-j7aS19`. Earlier genuine failed
runs are preserved with their actual output. Candidate-1's 652 tests/33 specs/
packaging/four Chromium results are historical in the
[joint report](issue-3-integrated-regressions.md), not a substitute for this run.
The repaired stable-snapshot browser harness also exercises matching busy-refusal
and late-old-refusal behavior, in addition to virtualization/scroll/query reset.
Chromium **141.0.7390.37** / external Playwright Core **1.56.1** used disposable
HOME/XDG/browser profiles and an outer Node HOME outside ordinary profiles.
Display, D-Bus, Xauthority, Node preload and Node path variables were removed.
The pre-existing headless mock harnesses use explicit `--no-sandbox`; this is
not a native EDH fallback or an OS sandbox. The production HTML/CSS/JS ran with
a synthetic message bridge, not an actual VS Code frontend.

## Remaining acceptance and real limits

The new frozen source/runtime manifest must receive independent re-review before
integration worker completion. Native EDH remains separately gated: no Code/
Electron/Xvfb/D-Bus/application probe, normal-profile reuse, installation or native
launch is authorized by these automated results. External native-harness review
is a separate gate; no launch approval is created here. Windows/WSL/macOS and
physical Remote/native clicks/painting/focus/scroll/Save/Undo remain unverified.

There is no native paint/read acknowledgment, exact native pixel anchor, writer
provenance or atomic workspace/disk CAS. No-follow does not cover every ancestor.
Caller cancellation never cancels underlying host/kernel work. Four forever-hung
physical document/FS operations retain their lane slots and can stall progress;
four logical validation callers are not a physical-thread-exit guarantee. A host
show/close/WorkspaceEdit already dispatched cannot be recalled, and false/rejected
or late apply does not prove zero modifications. Conservative initial partial,
explicit Rerun costs, source size/codec/policy limits and unknown-identity refusal
remain intentional, not claims that these tests eliminate platform races.
