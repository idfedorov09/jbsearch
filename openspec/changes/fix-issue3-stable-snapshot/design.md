# Design

## Context

Before this change, the watcher restarted modal searches for delivered events
and Find Panel while searching. The panel retained rows after completion, but
delete notifications could rebuild the tree even for unrelated URIs.
See [the proposal](proposal.md) for motivation and the specs for requirements.

## Goals / Non-Goals

**Goals:** Preserve the displayed generation across source events, use the
existing per-file validation boundary for affected rows, and make uncertain
initial-search results fail closed. Keep event routing independent of the
separately developed identity, scrolling, and Replace All preflight changes.

**Non-Goals:** Implement load-more, add new matches automatically, guarantee an
atomic filesystem snapshot, or claim a native TreeView pixel-scroll guarantee.
Query and scope changes retain their existing reset behavior.

## Decisions

1. Track a monotonic `scopeEventRevision` and separate `scopeStale` per session.
   Relevant or uncertain changes increment the revision even during replacement.
   A stale scope is not equivalent to an incomplete initial search; the separate
   full-scope Replace All preflight can use this revision as a race token.
2. During enumeration, collect affected URIs instead of resetting the search.
   If reliable edit deltas cannot be applied to a result produced by the worker,
   mark that result invalid; if membership may have changed, retain a conservative
   incomplete flag rather than claiming that the initial search was complete.
3. After completion, update only existing occurrences. Use the worker to check
   known document changes; an external file change with unknown identity remains
   invalid even if an unrelated match has the same offset. A bounded invalidation
   set falls back to scope-wide uncertainty rather than silently dropping events.
4. Filtering treats a current result, an ancestor directory, open document, ignore
   rule, and configuration/root changes as potentially relevant. Filtering is
   conservative when exact ripgrep eligibility cannot be established. A plain
   prefix or mask alone is not a correct substitute for search enumeration.
5. Existing `queueValidation(session, uri, delay)` and `trackDocumentChanges`
   remain the integration boundary for the identity work. The controller's
   unknown-identity route uses that change's `markDocumentIdentityUnknown` helper
   in the combined staging implementation, retaining per-row revision changes.
6. One context-only modal action sends the existing `refresh` message. It is
   available for either `scopeStale` or the separate preflight's `needsRerun`
   state, and cannot start a refresh while a patch, search, or replacement is
   pending. A new search clears both states. The preflight itself is outside
   this change. There is no new permanent UI and no new search generation until
   the user explicitly reruns or changes search parameters.
7. If activation detects a changed source before or while closing the modal,
   cancel outstanding checks for that file, mark its existing rows invalid,
   and offer Rerun instead of silently starting a new search.
8. Save, close, and metadata-only document events advance the relevant scope
   revision even for files with no saved rows; a close invalidates existing
   occurrences and acquisition even before document-version binding. Save is not evidence that a disk write was caused by this
   document and does not automatically rebase disk provenance. A delivered ignore
   rule change or file creation/deletion during enumeration conservatively
   invalidates the in-flight snapshot because membership can affect other paths.
9. One controller-owned `PhysicalOpenGate` is shared by initial Open Editors
   preparation, per-file validation, modal preview/activation, native preview,
   and local replacement document preparation. The reusable API is
   `open(value, { signal, timeoutMs })`; the controller exposes
   `openDocument(uri, options)` and `request(session, { signal, timeoutMs })`.
   Defaults are four physical openings, 512 FIFO waiters and a 10-second caller
   budget. Timeout/cancellation rejects the caller, but a physical slot stays
   occupied until the underlying operation actually settles. Absolute monotonic
   deadline checks also prevent overdue promise microtasks from overtaking
   delayed timers. Never nest acquisition for the same opening.
10. The controller also admits at most 512 total validation entries across all
    sessions, including debounce timers, queued work and workers, and canceled
    running async checks until their logical operation settles; at most four
    logical validation callers run at once (not a hard physical worker-exit cap). A validation deadline includes time before
    the gate and worker work, so a busy lane cannot leave rows pending forever.
    Requeueing a hot URI preserves its original absolute first-admission
    deadline, including after timeout-configuration changes, and moves behind
    older FIFO entries. Pending checks transferred to a different owner use
    that exact deadline with fresh destination generation/row admission. Missing
    or expired tickets settle non-pending fail-closed; source late work cannot
    revive the destination. Failure leaves affected rows invalid and offers Rerun;
    close/reset/disposal removes logical waiters, never physical leases. Initial
    preparation shares one opening budget across its sequential document opens;
    the search worker then has its separate configured search budget. Independent
    replacement preflight must pass its remaining preparation budget and signal,
    not restart a new full timeout for every file.
11. Initial `partial` is conservative: a relevant delivered preparation/enumeration
    race means possibly incomplete or unverified, not proof of a lost match. It
    remains a Replace All blocker until explicit Rerun. An event after completion
    sets only `scopeStale` and the revision, not retroactive initial `partial`.
    An integrated fresh complete preflight may establish equality for a completed
    stale snapshot but cannot waive partial/INVALID/pending or action-binding
    guards. False positives cost an extra full scan, I/O/CPU, a generation reset,
    and temporary Replace All refusal; no hidden retry is used to obtain silence.
    See the [pinned JetBrains inspection](../../../docs/research/issue-3-file-event-snapshot-sources.md).

Alternatives rejected include unconditional reruns (viewport instability and
starvation), event-only proof of scope freshness (watchers can omit events), and
silently inserting new occurrences into an existing snapshot (changes its meaning).

## Risks / Trade-offs

- [Watcher excludes or coalescing] → A stale marker is only a hint; full-scope
  replacement requires its separate preflight and final per-document guards.
- [High event rates] → Deduplicate by URI and cap the journal; overflow becomes
  conservative uncertainty rather than a lost event or endless restart.
- [Non-cancellable document opens] → Four never-settling opens can block every
  controller-owned document-opening path, across sessions. Waiting callers time out fail-closed; a later open
  may proceed after a physical slot is actually released. No eventual-progress
  or cross-session isolation guarantee is claimed for permanently hung opens.
- [Other host resources] → A document-opening cap is not a cap on disk handles,
  `showTextDocument`, tab-closing, or dispatched edits. The independent authority
  and preflight paths in the combined controller use a separate physical FS gate
  with that reusable mechanism and retain slots through cleanup. The legacy
  local `fs.stat` preparation is not selected for the combined runtime.
- [TreeView APIs] → Stable IDs do not promise pixel scroll; verify the separate
  tree-update change in a real VS Code host.
- [Concurrent tasks] → The combined staging controller is verified separately in
  the [joint regression report](../../../docs/testing/issue-3-integrated-regressions.md).
  Independent branch evidence alone does not verify that composition or native hosts.
- [Delayed or absent source events] → `.git/info/exclude` is routed when it is
  delivered; Git metadata, global and parent ignore files, and Open Editors
  outside the workspace are not guaranteed to be watched. Full-scope preflight
  and per-document protection cannot be replaced by a counter of events.

## Sources

- [ADR 0011](../../../docs/adr/0011-stable-search-snapshots.md)
- [Pinned JetBrains source inspection](../../../docs/research/issue-3-file-event-snapshot-sources.md)
- [VS Code 1.145 watcher and tree API](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts)

## Candidate-1 review refinements

Ownership transfer has explicit transaction/lifetime binding across reveal,
close, focus and rollback. Acknowledged edits/Rerun cancel an obsolete transfer;
closed owners never return to the provider. Rollback does not rewind delivered
scope epochs or restore a pre-event verified model. When replay is unavailable,
old rows fail closed with Rerun. Static rollback can renew checked authority and
original pending deadlines; same-owner rollback retains progressed live rows.
A matching client refresh refusal releases only its refused Rerun request latch.
See the [candidate-2 record](../../../docs/testing/issue-3-candidate2-review-repairs.md).

## Candidate-2 review refinement: source events through actual rollback

The source's admitted panel close is provisional until final focus commits or
rollback actually reopens it. A temporary exact-source/lifetime binding keeps
the normal event and validation route active with no panels throughout both
waits, including after the transfer record is detached for rollback. Both owners
advance independent epochs/history; no event replay or copied private proof is
introduced. The existing global queue limits and original absolute validation
deadlines still apply. Source action approval is retired at admitted close.

Actual rollback open uses an expiring tagged resource and exact lifetime guard
for custom-document acquisition and panel resolution. Close/disposal or expired
admission cannot create a fallback session or attach a late panel. If the host
fails or returns without reopening a panel, retire source work/authority and
mark retained rows unknown/INVALID with an explicit reason. Preserve newer
acknowledged parameters/Rerun and do not restart discovery after an intervening
event. A submitted host promise is still awaited, not declared cancelable.
See the [candidate-3 record](../../../docs/testing/issue-3-candidate3-rollback-repair.md).
