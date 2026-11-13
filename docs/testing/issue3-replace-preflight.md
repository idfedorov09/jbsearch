# Issue 3: immutable Replace All preflight verification

> Historical local-branch evidence. The later controlled composition and its
> actual check/acceptance boundaries are recorded in
> [the combined issue #3 regression report](issue-3-integrated-regressions.md).

Date: 2026-11-11. This is local implementation evidence for the uncommitted
`fix-issue3-replace-preflight` change on top of
`c326bfe72d0fbc6d17b321cb4cd78e55854d6e4c`. It is **not** evidence that all
separate issue 3 changes are integrated, or that VS Code/native/Remote testing
has passed. ADR 0014 records the accepted contract; the
[pinned JetBrains source report](issue3-action-binding-research.md) distinguishes
source mechanisms from real IDE GUI testing.

## Immutable full-model approval and complete comparison

`replace-approval.js` retains a separate deep-frozen full manifest and an opaque
`actionBinding` containing session, generation, effective request fingerprint,
result revision, publication event epoch and random snapshot token. The manifest
contains every backend row, including off-screen virtual rows, its URI/ID/range,
text, captures/groups, source provenance, query/options/scope and replacement
meaning. It is not a mutable backend copy taken at invocation. The token attests
client model/action correspondence, **not** physical paint or reading.

Modal actions echo their received full-model binding. Native row Single/All
actions carry immutable binding/command arguments and revision-specific native
handles: a mutable provider revision or a latest-element lookup is not accepted
as prior approval. Status, preview and selection echoes reuse a binding; reset,
replacement-plan changes and saved-search ownership transfer invalidate it.
Admission and the final pre-dispatch boundary compare the entire live semantic
model with the frozen manifest. Intermediate asynchronous guards additionally
check its exact descriptor, request/generation/revisions, array identity/length
and operation/event epochs, avoiding a full-result scan at every per-file await.

A reliably bound action requires no new mandatory confirmation. A supplied stale
or malformed binding refuses with zero dispatched edits and no automatic
adoption. A missing binding, including a native toolbar command without a model
argument, opens a separate frozen read-only review with an explicit action.
This is not Edit Search, a searching draft, or a way to adopt fresh targets.
Query, scope, replacement and results cannot change there; live source preview
is explicitly unavailable. A late review open after source close cannot create
a fallback searching draft. Retention is one current manifest and at most one
review per source; source changes make the old review action refuse.

Replace All independently searches the same complete eligible scope without
publishing its batches to the old session. It compares the full occurrence set
(URI/range/offset/text/captures/groups) and replacement meaning, then the final
EOL-normalized plans. New, removed, changed, duplicate/ambiguous or incomplete
targets refuse without replacing the old list or automatically adopting new
targets. Binary inputs remain deliberate text-scope exclusions; unreadable,
uncertain, truncated, cancelled, timed-out or malformed completion blocks All.
An enumerator warning or unterminated filename is conservatively incomplete.

The full model may bind Single on valid A while B is INVALID/pending or the
discovery was partial. All still requires complete results and every row valid.
An earlier completed-scope `scopeStale` is not a blanket refusal: fresh complete
equality may establish unchanged targets. A new relevant event during preparation
invalidates the operation. An observed initial-enumeration race remains partial/
unverified with explicit Rerun, not an automatic rerun or proof a match was lost.

## Shared occurrence identity and disk authority

Frozen shared helpers supply UTF-16-code-unit content hashing, bounded document
snapshots, identity tracking and `assertReplaceableMatch`. CRLF interiors and
surrogate-pair interiors must round-trip through the document's positions;
unknown, colliding, destroyed or unavailable identities fail closed. Buffer
revalidation uses the real search engine in full regex context and retains the
original disk provenance; matching an old offset/text never revives unknown
history. Exact document identity/version/text/EOL/encoding and operation guards
are checked before dispatch.

Production discovery uses `disk-clean-buffers-dirty`: clean file descriptors do
not read/send editor text, including a stale clean editor with zero matches.
Disk is authoritative there. Dirty and untitled buffers use a bounded snapshot;
a failed snapshot is not silently an empty file. Dirty file text does **not**
have to equal disk. Its independent baseline records complete raw bytes and
stable file identity; untitled buffers require no fabricated disk baseline.
Missing/unverified dirty backing files keep occurrences visible but unusable and
make discovery incomplete. The configured search size limit also bounds buffer
and backing-file preparation (default 2 MiB, maximum 128 MiB); Rerun alone cannot
repair a persistent size, permission, codec or safe-open limitation.

Both Single and All, including the review action, validate every selected row's
recorded baseline **before** any observed-Save rebase: `origin: disk`, matching
canonical URI, complete SHA-256 raw hash, finite identity metadata, safe size and
explicit `no-follow`/`identity-validated` policy. The fresh All rows are checked
independently. Missing, malformed, wrong-origin/URI or unsafe-policy provenance
cannot be laundered into approval by observing a later Save. This admission is a
focused controller/worker adapter; the frozen shared helpers are unchanged.

Save performs no eager disk I/O. A known, continuously bound, clean observed Save
permits lazy **state-equality** rebase only after a typed
`DISK_BASELINE_CHANGED` result, under the same document object, generation,
query/fingerprint, encoding/version/hash, row revision and event epoch. Missing
paths, permission/timeout/resource failures and unsupported policies are not
treated as changed-baseline evidence. Strict rebase uses a stable complete
no-follow read, lossless Unicode decoding and equality with the clean document;
it returns an operation-local immutable baseline without mutating approved rows.
A legitimate atomic Save can change inode. It is not proof who wrote the bytes,
unknown-identity recovery, or a disk compare-and-swap.

Known clean codecs/BOMs are checked explicitly; unsupported/conflicting codecs
block rather than yield a complete empty result. Supported saved-state decoding
is UTF-8/UTF-8 BOM/UTF-16 LE/BE, not guessed legacy decoding. Without a host
`O_NOFOLLOW`, strict Save rebase refuses rather than downgrades. Independent
initial/unchanged-baseline observations may explicitly use identity validation,
recording the actual policy; that is not a no-follow guarantee. Final-component
no-follow does not protect ancestor-directory races or later external writes.

## Deadlines, physical work and dispatch locks

The worker uses `jbsearch.search.timeoutMs`. Replacement preparation separately
uses cumulative `jbsearch.replace.prepareTimeoutMs` (default 60000 ms, bounds
100–300000 ms), including queue waiting and document/file work, paused only for
the independently bounded worker search. Cancellation or timeout before dispatch
suppresses all late edits.

One controller-owned `PhysicalOpenGate` is shared by initial Open Editors
acquisition, validation, preview and replacement. It admits four underlying
document opens and 512 FIFO waiters. A timed-out/aborted caller does **not** free
a physical slot until the actual host promise settles. A separate gate bounds
whole disk-read/assertion jobs through descriptor cleanup, also four active and
512 waiting. Queue exhaustion fails visibly. Tests cover repeated hung callers,
late resolution and delayed close; these are not claims that kernel I/O can be
cancelled. Nor is caller/operation admission a proved bound on physically exited
worker threads: the existing engine does not await every `worker.terminate()`.

After `workspace.applyEdit` dispatch the extension cannot revoke the edit. It
retains the replacement lock until the actual response, including after review
close or cancellation. Failed/late application is not reported as proof of zero
modifications. Text-only WorkspaceEdit application is not a transaction over
scope discovery, external disk writers and all editor buffers; no workspace-wide
atomicity or disk CAS is claimed.

## Local automated evidence and fixture boundaries

`controller-source-authority.test.js` uses temporary real files, real workers,
the production request/source/range/gate/preflight path and a modeled TextDocument;
presentation notification and WorkspaceEdit application are test adapters. It
covers clean disk authority/zero-match stale editors, known dirty deltas,
observed/unobserved Save, atomic Save/inode rebase, unknown watcher history,
Close, missing backing files, untitled buffers, new zero-match-file targets,
real delayed filesystem metadata, repeated physical timeouts, and malformed or
wrong-origin/URI/policy admission on Single/All/review. It checks each row, not
only the first common baseline.

The older `/workspace/...` controller/UI fixtures are intentionally synthetic:
they explicitly select buffer-validation and bypass disk preparation. They test
the actual worker regex/preflight and backend action logic but do not establish
real disk authority. Native provider-to-backend tests cover stale delayed context
actions, changed templates, saved-search ABA, ownership/reset tokens, normal
bound All without review, missing binding with review, review close and events
immediately before/after dispatch. They are not native GUI tests.

Rooted-scope/worker tests use real temporary files and cover masks, Open Editors,
multi-root/nested roots, ignore and conditional exclusion behavior, binary skips,
zero matches, cancellation, limits, malformed completion and a synthetic
enumerator terminated in the second root. Helper tests cover representable
ranges, unknown identities, Save tickets, source codecs and bounded physical
read/cleanup behavior. Final stable check results are recorded below.

## Real Chromium evidence (mock webview bridge only)

`scripts/check-replace-approval-browser.js` serves production HTML/CSS/JavaScript
only on localhost and uses unique temporary HOME/XDG/runtime/browser directories.
Chromium 141.0.7390.37 on Linux ran headless with `--no-sandbox` through Playwright
Core 1.56.1. Four scenarios passed with no page errors or dialogs: a 150-row full
binding with fewer than 60 mounted virtual rows/no extra confirmation; refusal
retaining the old set with exactly one guarded Rerun; replacement-plan ACK before
sending the new token; and frozen review with no query/plan/discovery/live-preview
adoption and an explicit bound action.

This is actual Chromium rendering/event evidence with a **mock** VS Code bridge,
not VS Code/Extension Development Host/native TreeView/disk-edit verification.
The coordinator paused native launches following an ordinary-profile incident;
this continuation did not launch/probe VS Code or reuse any user profile.
Windows, macOS, WSL, SSH and physical Remote verification are not inferred.

## Final stable local checks

Node 22.23.2, npm 12.0.2, Linux/x86-64; final stable local checks passed:

| Check | Actual result |
| --- | --- |
| `npm run check` | Passed JavaScript syntax checks |
| `npm test` | 432/432 passed; no failures, skips or cancellations |
| `npm run spec:check` | 29 passed, 0 failed |
| `npm run package` | Verified 90 main-package entries and matching 31-entry bundled client |
| `git diff --check` | Passed |
| Isolated Chromium harness | Four scenarios passed; zero page errors/dialogs |

Generated `jbsearch-0.3.2.vsix` stays ignored, is not a release candidate and was
not installed or published. Earlier inherited 290-test and intermediate
396/423-test runs are historical, not the result of the final source.
`npm ci` on Node 22.23.2 installed 234 packages/audited 235 and reported three
moderate vulnerabilities; no dependency upgrade or automatic audit fix was made.
The inherited allowScripts policy blocked `@vscode/vsce-sign`'s postinstall;
packaging is independently checked rather than inferred from installation.
The OpenSpec task count is 9/13, not complete: 1.2 retains its delayed native
rendering verification, 2.2 the unified event composition, and 3.3/3.4 the real
EDH and combined-change verification. Local binding/source-helper implementation
and source tests do not satisfy those unchecked runtime/integration tasks.

## Still-required controlled integration and platform verification

- Compose exactly one lifecycle/Save/Close/metadata route with the event owner;
  do not duplicate listeners. Compose the shared global validation budget,
  original absolute deadlines and initial-acquisition cancellation. Local event
  guards are not evidence that every peer route is integrated.
- Repair reviewed destination-transfer pending-check handoff, Close-before-native
  show acquisition, and hot-requeue deadline preservation under one integration
  writer. Destination manifests and private Save/document tickets must not be
  blindly copied; expired/unknown pending work must settle visibly fail-closed.
- Integrate the query/preview owner's strict preview tickets without injecting
  live source into frozen review. Re-run saved-session/transfer/rerun/common
  modal Rerun and stale native action regressions on the composed checkout.
- Run an explicitly approved isolated real EDH/native TreeView replacement
  check, then separate platform/Remote checks. No checkbox for these runs is
  satisfied by source inspection, mocked providers or the Chromium harness.

No baseline spec sync, change archive, commit, version bump, publication or
release is part of this local-ready milestone.
