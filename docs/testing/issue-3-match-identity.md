# Issue #3: tracked match identity verification

> Historical local-branch evidence. The later controlled composition and its
> actual check/acceptance boundaries are recorded in
> [the combined issue #3 regression report](issue-3-integrated-regressions.md).

This report covers the independent `feature/issue-3-track-matches` worktree.
It does not claim that the independent event-routing, order/scroll, or Replace
All branches have been integrated. The original issue reports Windows + WSL;
no Windows or WSL execution is established by the tests below.

## Current local verification

On 2026-11-11, using Node 22.23.2 and npm 12.0.2 on Linux, `npm run check`
passed and `npm test` passed **309/309 tests** (278 top-level tests, including
nested adversarial cases; zero failed, cancelled, skipped or todo). These are
local Node/controller tests, real temporary-filesystem checks and search-worker
checks, not joint branch or native workbench verification. `npm run spec:check`
validated **29/29 items**; `npm run package` verified an **86-entry VSIX**, its
bundled 31-entry client and matching runtime resources; `git diff --check`
passed. The generated packages remain ignored by Git and were not published.

- The tests cover external duplicate insertion without an edit delta,
  collapsed occurrences, known Undo/Redo, content/version changes, closed
  documents, worker cancellation and incomplete validation, captures, result
  revision races, CRLF interior positions, surrogate pairs, unpaired-surrogate
  hashing, and zero-width lookahead/lookbehind edits. Large multi-edit events
  have a tested fail-closed bound instead of unbounded synchronous mapping.
- New authority tests exercise observed versus unobserved Save, atomic-save
  inode replacement, another same-text writer, stale document binding,
  generation/request/epoch/row-revision/URI/version/hash/encoding/clean-state
  changes, Close and obsolete Save tickets. Unknown anchors cannot recover
  through equal saved bytes. Dirty-buffer text is deliberately different from
  its independent raw disk observation in working replacement cases.
- Initial authority tests find real disk matches hidden by a stale clean
  zero-match Open Editors buffer, reject oversized snapshots before `getText`,
  preserve visible but blocked dirty matches when disk provenance is unavailable,
  and check explicit clean Unicode codecs versus unsupported/conflicting codecs.
  Missing, oversized and symlinked explicitly selected clean inputs cannot be
  silently accepted as a complete zero-match scope.
- Lossless disk tests include UTF-8/BOM, UTF-16LE/BE, CRLF, malformed Unicode,
  chunk-boundary surrogate pairs, a final-component symlink swap, raw-byte
  changes and a simulated missing no-follow capability. Physical FS tests hold
  capacity through caller timeouts and actual late read/close settlement,
  suppress expired queued jobs, and prevent late `applyEdit` after preparation
  cancellation. Capability simulation is not native Windows acceptance.

## Implemented source authority and remaining boundaries

- Initial clean local files use disk authority. The Open Editors adapter does
  not read or send cached clean text, including when it has zero matches.
  Its explicitly supported Unicode codec can inform disk decoding; unopened
  workspace discovery remains strict UTF-8. Unsupported legacy clean codecs
  are blocking, not guessed. Dirty files use bounded current text plus an
  independent stable raw-byte disk baseline, with no dirty-text/disk comparison.
  Missing/oversized/unavailable required disk observations block replacement;
  untitled buffers need no disk overwrite baseline. Worker buffer validation
  cannot replace source provenance or erase its unavailable status.
- A known continuously bound current buffer may retain occurrence identity
  across watcher notifications, while independent disk checks remain mandatory.
  Close, unknown history and destroyed/colliding/ambiguous zero-width anchors
  cannot recover from old coordinates or equal text. Captures are recomputed
  from full current context in the worker.
- Observed Save records a ticket without disk I/O. Lazy rebase requires the
  same bound document object/URI/version/hash/encoding and clean state, current
  generation/search fingerprint/known occurrence revisions, and an unchanged
  operation event epoch across asynchronous waits. Disk text must decode
  losslessly and equal that saved state. Atomic Save may change inode, and a
  same-text external writer is accepted only as state equality, not author
  provenance. A dirty edit after Save but before accepted lazy rebase may need
  another clean Save or Rerun; it is not silently compared with disk.
- Baselines retain their recorded `linkPolicy`. Strict `no-follow` uses
  `O_NOFOLLOW` where available. Explicit initial `identity-validated` observes
  lstat/open/fstat/post-read fstat/lstat, regular identity/metadata and raw hashes;
  it is not a no-follow guarantee where the native flag is absent. Observed-Save
  rebase always requires strict no-follow and refuses without downgrade, with
  Rerun guidance, on a host lacking it. This does not disable unchanged initial
  portable baselines, trusted dirty edits or untitled buffers wholesale.
  Neither policy covers every parent-directory/junction race, establishes
  authorship or provides external-filesystem compare-and-swap.
- Snapshots inspect EOF length before materializing whole text, then enforce
  the configured UTF-8 byte budget with a 128 MiB hard cap. Stable disk reads
  stream through at most 64 KiB scratch space, check the observed bounded size
  plus one byte, and close the handle. Only built-in fatal Unicode decoders are
  used; no runtime `iconv-lite` dependency or lossy legacy conversion was added.
- A separate controller-owned FS lane caps complete baseline operations at four
  active and 512 queued. A caller timeout cannot release a physical slot before
  the actual read and close settle, or interrupt a hung syscall. This does not
  bound unrelated worker-search I/O. The document-open lane and unified
  Save/Close/metadata route belong to the independent lifecycle change; the
  local Save adapter must be replaced, not duplicated, on integration.
- Local Single Replace preparation retains a 60-second default budget; the
  independent replacement change owns the integrated setting and complete
  preflight accounting. Before submission, expiration suppresses late dispatch.
  After submission, the replacement lock remains until VS Code's actual
  `applyEdit` outcome; timeout/failure cannot promise zero modifications.
- The approved immutable full-snapshot/action protocol, exceptional frozen
  review and native action binding are independently implemented and still need
  joint integration. OpenSpec tasks **2.2 and 3.1 remain unchecked**. Mutable
  TreeView provider state, a sent TreeItem or a refresh is not evidence of the
  previously represented client row; no physical-paint acknowledgment is claimed.

See [ADR 0012](../adr/0012-tracked-occurrence-identity.md) and the
[pinned JetBrains/source-authority research](../research/issue-3-occurrence-authority.md)
for actual source methods, the chosen adaptation and platform limitations.

## Earlier checks, not rerun browser or platform acceptance

- Before the new authority/gate changes, on 2026-11-11, `npm run check` passed;
  `npm test` passed 272 tests; `npm run spec:check` validated 29 items; and
  `npm run package` verified an 83-entry VSIX and its bundled client. Those
  historical results do not verify the later source-authority changes.
  `npm ci` reported three moderate dependency vulnerabilities; no new install
  or separate vulnerability audit is claimed in this continuation.
- A headless **Chromium 141.0.7390.37** run exercised the real modal HTML, CSS,
  and JavaScript using a synthetic VS Code webview bridge. The isolated profile,
  `HOME`, XDG directories, loopback HTTP server, and workspace were under a unique
  temporary directory; Chromium required `--no-sandbox` in this environment.
  It checked valid Replace message revisions; visible Checking/INVALID and
  disabled Replace; stale preview generation/revision rejection; background
  preview scroll preservation; and 1,000-result list virtualization/scroll.
- This browser harness is **not** an Extension Development Host, a VS Code
  workbench, a native TreeView test, or a Remote/WSL test.
- No VS Code or Extension Development Host was launched for this check: a
  coordinator precaution paused those launches pending a verified isolated
  profile recipe. The browser result does not substitute for that workbench test.
- An isolated Node 22.23.2/Linux warm-cache microbenchmark of two consecutive
  disk-origin baseline checks took 3.5–6.1 ms for 1 MiB and 89.8–92.8 ms for
  32 MiB over three runs. This is neither a cold-disk, WSL, Remote nor GUI
  benchmark, and does not measure the new initial dirty-buffer baseline,
  observed-Save decoding or an unresponsive filesystem.
- Full command results and any real VS Code run are reported separately in the
  task handoff; this document does not claim tests on unobserved platforms.

## Separate real-workbench acceptance checklist

The following are proposed checks, not statements that they have been run:

1. In an isolated VS Code Extension Development Host, search and change a known
   source document before, inside, and after a match; verify order, selection,
   pending/INVALID and each individual Replace, followed by Undo and Redo.
2. Exercise duplicate and collapsed matches, then close/reopen the document;
   unknown identity must not become replaceable merely by equal coordinates.
3. Exercise zero-width and multiline regex, captures and lookaround, emoji,
   LF/CRLF, and attempted edits with boundaries inside CRLF.
4. Delay validation, change the source again or close it, and check that neither
   stale preview nor an old Replace action applies text.
5. On Windows with a WSL extension host, repeat against files under the WSL
   filesystem and `/mnt/c`, including external changes, dirty buffers, rename,
   deletion, recreation and watcher exclusions. Record VS Code and extension
   versions, filesystem, actual events and whether the document was dirty.
6. Test Remote SSH separately on an actual remote host; verify client preview
   resources and that replacement remains on the workspace host. Do not infer
   physical Remote, Windows or WSL support from Linux or synthetic browser tests.
7. With the integrated unified lifecycle route, verify normal and atomic Save,
   metadata-only Save/encoding changes, Close while a validation open is pending,
   and a new dirty edit before lazy rebase. On native Windows, separately verify
   unchanged identity-validated baselines versus the strict-rebase refusal;
   record actual native capability rather than inferring it from Linux simulation.
