# ADR 0012: Tracked occurrence identity before replacement

- Status: Accepted
- Date: 2026-11-11
- Refines the snapshot and validation decisions in [ADR 0007](0007-find-window-and-native-editor.md) and [ADR 0008](0008-native-find-panel.md).

## Context

A result's offset and matched text are not enough to prove that it is the same
occurrence after an untracked edit. A duplicate can occupy the old position, or
several occurrences can collapse into the same tracked range. A valid UTF-16
offset may also lie inside a CRLF pair and be unrepresentable as an editor
position. Search, preview, and replacement are asynchronous.

## Decision

Keep result IDs and initial ordering within a completed snapshot. Track reliable
text-document changes and validate the complete current document with the same
search worker and query. Record unknown identity when the original anchor is
fully destroyed, collides with another known occurrence, the document lifecycle
or an external change breaks its provenance, or a required check cannot be
trusted. An insertion exactly at a zero-width anchor, or a deletion touching
it, is ambiguous because no single left/right affinity works for both lookbehind
and lookahead. Unknown identity cannot be restored by a worker match at the same
offset. Rerun creates a new snapshot. A known immediate Undo/Redo can restore a
saved anchor when both the inverse change and the complete previous content hash
are verified; otherwise an unknown identity remains blocked.

Before replacement, reject pending, invalid, unavailable, or identity-unknown
results. The modal sends its client model's result revision for comparison with the live result;
verify content and document versions, and reject boundaries which cannot be
represented exactly through editor positions, including CRLF and surrogate-pair
interiors. Recheck after asynchronous preparation and immediately before the
text edit. No check claims an atomic compare-and-swap against external disk
changes. Avoid highlighting unverified modal preview matches or moving its scroll
position merely because validation completed.

## Alternatives

- Refresh every search after every file event: rejected because it discards the
  user's snapshot and position.
- Reassociate by nearest matching text or old coordinates: rejected because
  duplicates do not prove identity.
- Store full document histories and use diff heuristics: rejected as a required
  mechanism because ambiguity remains and resource cost increases.
- Treat every changed file as permanently invalid: safe but needlessly rejects
  unambiguous editor deltas that can be checked against the original query.

## Consequences and boundaries

Some genuine surviving occurrences require an explicit Rerun, particularly after
untracked external edits or complex Undo sequences. Hashes and exact inverse
changes are safeguards rather than universal proofs of historical identity.
Worker timeouts and incomplete checks continue to block affected rows, settling
as explained INVALID rather than indefinite Checking. No new runtime dependency
is needed. The combined controller composes one lifecycle route, tracked identity,
stable presentation and full-scope preflight; the [joint regression report](../testing/issue-3-integrated-regressions.md)
distinguishes real filesystem/controller, synthetic native timing, Chromium and
unperformed native/platform verification.

The approved shared action protocol binds an immutable full backend manifest to a
client-origin token, with exceptional frozen review only when a binding is
missing. A native provider's mutable current element is not evidence of what the
client action represented; public TreeView APIs do not acknowledge physical
paint. The combined controller uses that protocol with the unified event/open route and
these helpers. Preview requests separately bind generation, row revision and an
explicit request ticket. Pending admission and invalidation retire old row
revisions even without a text delta. Close cancels acquisition before document
version binding; the native adapter checks closure and the immutable current
binding immediately before dispatching a new show request. Already dispatched
host calls cannot be recalled, and source/Chromium checks are not native GUI proof.

Content hashes cover UTF-16 code units, avoiding UTF-8 replacement of unpaired
surrogates. Very large multi-edit events are conservatively marked unknown when
the product of affected rows and changes exceeds one million: this bounds the
existing synchronous per-range mapping instead of claiming exact tracking at
unbounded cost. This can require a Rerun even when exact tracking was possible.
Open-document and disk state can also diverge before watcher delivery; checking
the editor snapshot does not make disk reads or WorkspaceEdit atomic.

A file-backed buffer snapshot also needs an independent disk observation. Initial
clean files, including Open Editors buffers, use disk search authority instead of
a cached clean buffer, even when that buffer has no matches. Dirty files use a
bounded buffer snapshot plus a separate raw-byte disk baseline; the texts are not
silently compared. Untitled buffers need no disk baseline. Missing/oversized or
unsupported inputs fail closed with a blocking completeness/provenance status.
Worker revalidation refreshes buffer state, not the source disk observation.

A continuously bound same-object buffer retains its occurrence identity across a
watcher notification when its current version/hash are established; a watcher is
not a text-document delta. An unchanged independent disk baseline still has to
be checked. Closed/unbound/unknown histories do not recover through equal bytes.

After an observed Save, record a session-local ticket and lazily rebase the disk
baseline only during guarded preparation. Require the same current document
object/URI, version, exact UTF-16 hash, clean state and explicit encoding, a
matching generation/search fingerprint, current known occurrence revisions, and
an unchanged operation event epoch across asynchronous waits. Fatal bounded
Unicode decoding must equal the saved clean buffer. Atomic Save may change the
inode: the chosen contract is state equality, not writer provenance, historical
identity recovery, or external-filesystem CAS. A dirty edit before the lazy rebase
can conservatively require another clean Save or Rerun.

Record a baseline's `linkPolicy` and preserve it in later checks and immutable
action provenance. `no-follow` protects the final path component on capable
hosts, not all ancestor paths. The explicitly separate initial
`identity-validated` policy verifies a stable regular descriptor/path, metadata,
and raw hash on platforms without that flag; it must never be called strict
no-follow. Observed-Save rebase requires strict no-follow and does not downgrade
on error. Native Windows Node lacks that flag: this rebase refuses with Rerun
guidance, while unchanged initial baselines and trusted dirty/untitled actions
are not disabled wholesale. No native Windows acceptance is established here.
Legacy/unknown Save encodings are not guessed; UTF-8/BOM and UTF-16LE/BE use
built-in fatal decoders without a new runtime codec dependency.

Bound document snapshots before whole-text reads and stream size-limited baseline
reads through a stable handle. A separate controller-owned physical FS gate
retains each active slot through actual read/close settlement even when a caller
has timed out; a deadline only suppresses late dispatch, not a kernel operation.
The same reusable gate mechanism is shared with the separate document-open lane.
Once WorkspaceEdit is submitted, keep the replacement lock until its actual
response, without claiming it can be recalled.

The pinned JetBrains comparison, initial source-policy matrix, exact helper
boundaries and platform rationale are in
[the occurrence-authority research](../research/issue-3-occurrence-authority.md).
These are compatible adaptations, not an imitation of IntelliJ's unavailable
PSI, write-action or Save-origin VFS guarantees.

The public editor API documents [UTF-16 offsets](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L197-L213),
[document versions and closure](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L137-L152),
and [WorkspaceEdit behavior](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L14359-L14376).
This decision does not establish Windows, WSL, or Remote acceptance.

## References

- [OpenSpec change](../../openspec/changes/fix-issue3-match-identity/proposal.md)
- [Issue #3](https://github.com/idfedorov09/jbsearch/issues/3)

## Accepted disk observations and owner renewal

A successfully prepared clean observed-Save rebase is committed only after the
final action/generation/request/epoch/document/version/hash/encoding and raw disk
guards. The accepted raw disk observation is private session/URI authority,
separate from immutable historical row/approval provenance and the expiring Save
ticket. Known continuous deltas of the same document expire the Save ticket but
can retain this accepted observation for a surviving known occurrence; each
later action still checks the actual raw bytes. Unknown/lifecycle/encoding or
owner breaks discard authority. A destroyed sibling remains INVALID and cannot
be revived by another occurrence's accepted bytes.

A different-owner transfer positively captures and re-admits document histories,
eligible Save evidence and accepted observations into new destination-owned
records. It verifies the same document object, URI, bounded version/hash/encoding
and known row geometry/history; no source symbol or authorization token is copied.
The destination then owns its own event/delta chain, including after the modal
closes. Unrenewable proof is explained non-pending INVALID, not an apparently
verified row with missing private authority. Original deadlines remain separate
from this completed-authority renewal.

The actual modal renderer bounds its whole-document read after awaited theme
loading, using the configured/hard snapshot limit, before copying/splitting text.
Oversized INVALID inspection reports preview unavailable without materializing a
huge buffer. Bounded INVALID inspection remains read-only and does not authorize
replacement. See the [candidate-2 tests](../testing/issue-3-candidate2-review-repairs.md).
