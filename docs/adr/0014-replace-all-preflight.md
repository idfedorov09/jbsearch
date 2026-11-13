# ADR 0014: Verify the search scope before Replace All

- Status: Accepted
- Date: 2026-11-11

## Context

Completed Find results are a stable snapshot, not a live inventory of a workspace.
New matches can appear without entering the snapshot. The user approved a fresh
scope check before bulk replacement, with no extra confirmation when the target
set is unchanged. See ADR 0003 and the `fix-issue3-replace-preflight` change.

## Decision

Search the same effective scope independently before Replace All. Apply only the
previously displayed, verified occurrences if the fresh complete result set and
replacement semantics agree. An incomplete check, detected conflict or difference
must apply no edit, retain the displayed snapshot and direct the user to rerun.
Retain the editor's text-only WorkspaceEdit, leaving changes unsaved. Validate
document text and versions consistently across asynchronous work for both single
and bulk replacement. Treat missing event information as uncertainty, not proof
that no external change occurred.

Use `jbsearch.search.timeoutMs` for the independent worker search and a separate
`jbsearch.replace.prepareTimeoutMs` budget for cumulative document/file
preparation. The latter defaults to 60000 ms, with bounds of 100–300000 ms.
This avoids making a short search deadline a new deadline for Single Replace.
The preparation budget is paused during worker execution and resumed afterward;
the budgets bound the pre-dispatch operation together. Timeout/cancellation must
not release an already submitted WorkspaceEdit as if its outcome were known.

Bind actions to a separately deep-frozen full client model using an opaque
`actionBinding` descriptor. It includes the session/generation/effective request,
full result and replacement meaning, not only mounted virtual rows. Selection
and status echoes cannot become approval of newer targets. A stale supplied
binding refuses; missing binding opens a genuine frozen read-only review with
an explicit action, never Edit Search or a new searching draft. Normal reliably
bound actions gain no mandatory confirmation. The token attests model/action
correspondence, not physical painting or reading. A partial/invalid/pending full
model can still bind Single on a valid different occurrence; All remains strict.

Use one bounded controller-owned gate for physical document opens and a separate
bounded preparation lane for disk checks. A caller timeout does not release a
physical slot until the actual underlying request and cleanup settle. Earlier
completed-scope events may be resolved by fresh full equality; initial-search
races remain conservatively partial without silently rerunning. Save/Close and
zero-content/zero-match events still invalidate in-flight preparation.

Keep occurrence identity and source authority separate. Use the shared UTF-16
hash and representable-range assertion; unknown history cannot be revived by
equal current text. Search clean files from disk without reading their stale
clean buffers; dirty/untitled text remains buffer-authoritative. A dirty file
needs an independent raw-byte baseline, not dirty-text equality with disk.
Before Single/All/review preparation, validate every recorded baseline's disk
origin, canonical URI, complete hash, metadata and explicit safe-open policy.
Missing or malformed provenance cannot be adopted merely because Save occurred.

An observed clean Save may lazily rebase a verified **changed** baseline under
strict document/row/request/epoch guards and no-follow lossless state equality.
Only the typed changed-baseline result permits that path; permission, missing
path, timeout and unsupported-policy errors do not. Keep the prepared baseline operation-local until final guarded admission of a
private current raw observation; keep historical rows and the approved manifest
immutable even after that admission. This is state equality, not
writer provenance or disk CAS. On a platform without strict no-follow support,
Save rebase refuses without silently downgrading the recorded policy.

## Consequences

The additional scan can increase latency and memory use, and an active workspace
can require another explicit rerun. Excluded binary inputs retain the existing
text-search policy; unreadable or uncertain eligible inputs block bulk replace.
The operation cannot provide a globally atomic snapshot across filesystem writes,
remote hosts and editor buffers. VS Code's all-or-nothing strategy for text-only
WorkspaceEdit application does not cover the preceding scope enumeration.
The independent preparation budget is a new setting; slow filesystems or very
large searches can require a higher value or a narrower scope. The timer can
stop waiting and prevent a late pre-dispatch edit, but cannot guarantee that an
operating-system filesystem call has stopped.
Physical document/disk leases remain occupied until their underlying promises
and cleanup settle; this does not establish a bound on physically exited worker
threads. The combined controller composes the unified lifecycle/preview route
and retains original validation deadlines through ownership transfer. See the
[combined regression report](../testing/issue-3-integrated-regressions.md).
Source/controller/provider tests and Chromium mocks do not satisfy real EDH or
physical native rendering checks; those remain a separately gated acceptance step.

## Alternatives

- Replacing only the saved snapshot misses newly eligible occurrences and would
  require a differently named, explicitly scoped action.
- Replacing fresh matches without comparing them could modify occurrences the
  user never saw. A global workspace transaction is unavailable in this API.

## Sources

- [VS Code 1.145.0 WorkspaceEdit application contract](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L14357-L14376)
- [Search engine and replacement architecture](0003-search-engine-and-session.md)
- [Binary search exclusion](0010-binary-search-exclusion.md)
- [Pinned JetBrains source inspection and adaptation](../testing/issue3-action-binding-research.md)

## Candidate-2 admission and late-outcome refinement

Loading an unchanged clean UTF-8 file into VS Code's document cache does not
change project/folder/directory search authority. Final request comparison uses
effective in-scope dirty/untitled inputs and non-default clean disk codecs, not
irrelevant clean cache membership/version/EOL. Actual Open Editors membership
remains in the immutable request fingerprint. New/changed dirty zero-match inputs
still conflict; every selected document's final version/hash/clean state/EOL/
encoding and independent raw disk observation is checked unchanged.

Global Find/Replace creates an ordinary independent search when a frozen review
is current; it never reuses or schedules discovery on the review object. Search,
schedule and reset also refuse review-only sessions as defense in depth. The
normal reliably bound path still requires no extra confirmation.

A replacement operation has explicit ownership. Its real apply lock is released
only when the actual submitted promise settles, even after reset/close/reopen.
Result/status/error/feedback mutations require the same session, generation,
lifetime and operation in both success and failure paths, including modal/native
message catches. An obsolete submitted failure may be reported separately; it
cannot make a newer search erroneous or imply zero modifications. See the
[candidate-2 regressions](../testing/issue-3-candidate2-review-repairs.md).
