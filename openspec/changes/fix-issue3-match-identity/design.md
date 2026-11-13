# Design

## Context

The native panel already tracks UTF-16 document events and revalidates a file with the same worker. Its reconciliation by offset and length alone cannot establish identity after an untracked or ambiguous edit. Modal UI and the panel share the controller but have different rendering adapters. See the proposal and ADR 0012.

## Goals / Non-Goals

**Goals:** Shared conservative occurrence identity; full-query worker validation; representable and current individual replacement; observable minimal stale statuses.

**Non-Goals:** Changing query/reset behavior, owning the independently coordinated unified filesystem/document event route, streaming/load-more, or implementing the independent full-search Replace All preflight. Do not claim that a hash or a heuristic diff proves historical identity.

## Decisions

1. Keep stable result IDs and array order within a snapshot. Track exact editor deltas; mark destroyed, conflicting, or externally untrackable identities unknown. Unknown is not cleared by the worker finding another match at the same offset. A known Undo/Redo may restore a cached known state only with reliable provenance; otherwise require Rerun. This prefers conservative rejection over matching by proximity.
2. Revalidate with the existing worker and full document, retaining generation, task and document lifecycle/version guards. Captures are those of the revalidated match, not the old displayed text. The combined file-event route calls the shared identity invalidation interface.
3. Validate exact representability at both edit endpoints and reject boundaries inside CRLF or surrogate pairs. Compare the UI action's result revision, content/hash/version and query generation before invoking the existing replacement path. Do not assume the public WorkspaceEdit API is an external-filesystem compare-and-swap.
4. Keep current tracked buffer state separate from a source disk baseline. Initial clean file/Open Editors searches use disk authority, including stale clean zero-match buffers. Dirty files use bounded current text plus an independent raw-byte disk observation, without comparing the texts; untitled snapshots need none. Missing, oversized, unavailable or unsupported inputs remain blocking. `buffer-validation` cannot overwrite source provenance.
5. Record an observed Save ticket without disk I/O. Lazily rebase only under exact same-document/URI/version/hash/clean/encoding, generation/search fingerprint, known-row/revision and asynchronous event-epoch guards. Strict bounded lossless disk decoding must equal the clean saved state. An atomic Save may change inode; this is state equality, never author provenance, unknown-identity recovery or filesystem CAS.
6. Preserve an explicit frozen baseline `linkPolicy`. Initial `identity-validated` observations and strict `no-follow` are separate policies; strict observed-Save rebase cannot downgrade. Missing native no-follow capability only disables that rebase, not unrelated unchanged-baseline, dirty or untitled actions. A physical FS gate retains active slots until the complete read/close really settles. The shared document-open gate and unified lifecycle route belong to the coordinated event change.
7. Expose identity-unknown as existing INVALID styling with an explanation; avoid redesign. Preserve query reset and the current virtualized rows. Background validation must not move selection or scroll by itself.

VS Code APIs document [UTF-16 positions](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L197-L213), [document versions](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L137-L152), and [text-only WorkspaceEdit behavior](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L14359-L14376).

## Risks / Trade-offs

- Unknown changes may require Rerun even when the same logical occurrence survived → show a precise reason, do not silently choose another match.
- Revalidation and coordinate histories use time and memory → retain existing limits and cancellation; fail closed on incomplete results.
- Filesystem events and dirty buffers may disagree → do not infer a reliable delta from a watcher event; test actual Remote/WSL separately.
- The combined staging implementation composes the independently developed identity, lifecycle, presentation and preflight paths; see [joint regression evidence](../../../docs/testing/issue-3-integrated-regressions.md). Local branch checks alone do not establish that composition.
- Immutable full-manifest/action binding, exceptional frozen review and non-reused native handles remain distinct from occurrence validity. Mutable provider state is not evidence of a previously represented row; no physical-paint acknowledgment or unperformed native/platform verification is claimed.
- A zero-width anchor touched by an edit is conservatively unknown, and a very large multi-edit exceeding one million row/change pairs fails closed instead of blocking the extension host with unbounded synchronous mapping.
- The shared content hash encodes exact UTF-16 code units. An open document's state and disk can nevertheless diverge before watcher delivery; this design does not claim an atomic compare-and-swap.

## Pinned comparison and current limitations

See [the pinned JetBrains/source-authority comparison](../../../docs/research/issue-3-occurrence-authority.md) and ADR 0012. Ordinary watcher notifications do not prove Save authorship. A known same-object current buffer may preserve its occurrence identity while independent disk checks still refuse external divergence. A dirty edit after Save but before lazy rebase may need another clean Save or Rerun. Legacy/unknown Save encodings and strict rebase without native no-follow fail closed; this is not Windows/WSL/Remote acceptance.

## Candidate-1 review refinements

A guarded accepted Save rebase can become a private current raw disk observation
without altering historical row/approval provenance. Known same-document deltas
expire Save evidence but preserve that observation for surviving known rows;
later actions always recheck raw bytes. Different-owner transfer positively
renews document/Save/current-observation authority and fails closed explicitly
when proof cannot be renewed. Modal rendering now bounds the actual text read
after asynchronous theme loading. See
[the candidate-2 record](../../../docs/testing/issue-3-candidate2-review-repairs.md).
