# ADR 0011: Retain search snapshots across source events

Status: **Accepted**

Date: 2026-11-11

## Context

File watcher and document events can interrupt the search and rebuild its
results, including when an unrelated workspace file changes. A stable snapshot
also needs to fail closed when the identity of a changed occurrence is unknown.
This decision extends the snapshot approach in [ADR 0007](0007-find-window-and-native-editor.md)
to the modal while retaining the native panel in [ADR 0008](0008-native-find-panel.md).

## Decision

File and document events do not themselves replace the displayed search
generation. Existing occurrences are checked conservatively; new occurrences
require an explicit Rerun. Events affecting scope membership are tracked
separately from an initially incomplete search so a separate Replace All
preflight can compare the displayed snapshot with a fresh full-scope search.
Query, mask, and scope edits still reset immediately.

The combined implementation uses one controller-owned, reusable physical opening
gate across initial search preparation, validation, modal preview/activation,
native preview, and local replacement document preparation. Its defaults are
four physical opens and 512 FIFO waiters; the total controller validation
backlog is separately bounded at 512, including debounce and running checks.
Caller deadlines include waiting; timeout, cancellation, Close and disposal do
not release a physical slot until the actual host request settles. Late or
overdue responses cannot start a worker or revive rows. Hot requeues and
pending-validation transfers retain their original absolute admission deadline;
expired or missing transfer tickets fail closed rather than leaving Checking
forever. Canceled running validation callers remain accounted until logical
settlement; this is not a bound on physically exited worker threads.

Four permanently hung openings make further physical document progress
impossible for that controller, including unrelated sessions. Callers fail
within their budgets instead of starting unlimited replacement requests. A
later actual settlement can free a slot; neither Rerun nor synthetic tests prove
native host recovery. Other host operations and disk handles have separate
ownership. The combined authority/preflight path uses a separately owned physical
FS gate with the same limits; neither lane counts a timed-out underlying operation
as physically finished. See the [combined regression report](../testing/issue-3-integrated-regressions.md).

A relevant delivered event during initial enumeration conservatively marks
initial `partial`; it is uncertainty, not evidence of a specific lost match.
After completion, events set `scopeStale` without changing initial completeness.
Only explicit Rerun creates a fresh displayed generation. This adapts the
per-item checking and explicit saved-view rerun patterns in the
[pinned JetBrains source inspection](../research/issue-3-file-event-snapshot-sources.md),
without pretending VS Code has IntelliJ read/write actions, PSI or smart ranges.

No watcher is treated as a complete transactional filesystem journal. Event
delivery, scope membership, per-occurrence identity, replacement preflight,
and native viewport rendering have separate contracts and integration tests.
The detailed change is [fix-issue3-stable-snapshot](../../openspec/changes/fix-issue3-stable-snapshot/).

## Alternatives and consequences

Unconditional reruns cause avoidable cancellation and viewport changes. Fully
live insertion introduces scope, identity, ordering, and scrolling semantics
that the user did not choose. A frozen snapshot can be stale; an explicit
contextual Rerun and replacement guards make that limitation visible. Accepted
records the decision, not proof that every integration or platform is verified.
Conservative events can require another scan even when the match set has not
changed; that costs I/O/CPU, a generation reset and temporary Replace All refusal.
This is preferable to hiding retries or claiming watcher silence proves scope
equality. Exact duplicate/excluded Open Editors membership is filtered without
notifying the native root.

## Candidate-2 transfer transaction refinement

Modal-to-panel ownership transfer is a provisional transaction bound to exact
source/destination session objects, generations, lifetimes and parameters.
Acknowledged parameter changes or explicit Rerun cancel its continuation rather
than being overwritten. A Close/removal/disposal cannot be undone by a late
reveal/close/focus callback. Only an explicitly admitted native close may be
reopened on rollback; an unrelated last-panel lifetime break is never inferred
as permission to resurrect a modal. Already dispatched host calls are not
revocable, and their completion is not a paint acknowledgment.

Rollback never rewinds delivered scope epochs or restores old approval tokens.
If source events intervened and cannot be replayed for an old destination model,
its old rows become non-pending identity-unknown INVALID with an explicit Rerun
reason. A conservative controller-wide delivered-event watermark also covers
old scopes hidden by the provisional new parameters; unrelated delivered events
can therefore cause a fail-closed rollback. Static rollback can renew positively
verified private authority and original pending deadlines. Same-owner rollback
changes presentation only and retains its actual progressed rows/checks.

Modal Rerun carries a unique client request ID. A busy/stale-generation refusal
acknowledges only that request, releasing its latch without accepting duplicate
refreshes from ordinary same-generation state echoes. See the
[candidate-2 regression record](../testing/issue-3-candidate2-review-repairs.md).

## Candidate-3 source coverage through rollback

Independent candidate-2 reviews found one remaining composed gap: after an
admitted modal close, a different-owner source with no panels stopped receiving
events during final native focus and the actual rollback reopen. A failed focus
could therefore restore verified-looking old source rows. Replacement still
refused the stale authority, but that did not make the displayed status correct.

The source now temporarily retains its own normal event and validation route,
bound to its exact session object and lifetime, from admitted close through
ownership commit or completed rollback reopen. Source and destination each apply
known deltas, Save, Close and scope epochs to their own rows and private authority;
neither borrows the other's records. There is no new event journal, replay,
full search, unbounded queue or replacement confirmation. Original pending-check
deadlines and the shared validation/open accounting remain unchanged. Old source
approval is retired at the admitted close.

Rollback uses a one-shot resource token and lifetime-bound provider admission.
Expired, closed or disposed rollback resources cannot create a fallback owner,
and a custom document acquired before Close cannot attach after that lifetime
ends. A host open which returns without a live source panel retires its callbacks,
checks and authority, marks retained rows unknown/INVALID with Rerun guidance,
and does not leave the dead source selected. A newer accepted query or Rerun is
preserved, not replaced with saved transfer state. Temporary coverage and resource
records are released after the actual host promise settles; this does not claim
that an already submitted host open can be revoked or must eventually settle.

See the [candidate-3 rollback repair and regression record](../testing/issue-3-candidate3-rollback-repair.md).
