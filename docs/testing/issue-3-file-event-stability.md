# File-event snapshot validation

> Historical local-branch evidence. The later controlled composition and its
> actual check/acceptance boundaries are recorded in
> [the combined issue #3 regression report](issue-3-integrated-regressions.md).

Date: 2026-11-11. Scope: the independent `fix-issue3-stable-snapshot`
checkout at base `c326bfe72d0fbc6d17b321cb4cd78e55854d6e4c`.
This is fresh local evidence, not a joint verification of the identity,
query/preview, native presentation, and full-scope replacement branches.
Inherited checkboxes and historical test counts are not used as execution
proof or attributed to a particular author.

## Fresh local checks

Node: 22.23.2. The reproducible commands are the repository scripts below.
`npm ci` completed before verification: 234 packages added, 235 audited,
three moderate advisories, and the configured block on the
`@vscode/vsce-sign@2.1.0` postinstall. No dependency repair or script approval
was performed; client preparation and package verification still succeeded.

| Check | Fresh result |
| --- | --- |
| `npm run check` | Passed |
| `npm test` | 340 tests passed, zero failed/canceled/skipped; 323 top-level tests |
| Focused controller/navigation/preview/gate tests | 164/164 passed |
| `test/validation-open-boundary.test.js` | 15 synthetic gate tests, included above |
| `npm run spec:check` | 29/29 items passed strict validation |
| `npm run package` | Passed; main VSIX 81 entries, bundled client 31 entries, build/runtime resources verified |
| `git diff --check` | Passed |
| Isolated Chromium modal harness | Passed the scenarios below |

The source check, full tests, strict spec validation, packaging, and browser
checks were freshly repeated on this continuation's stable code. The detailed
local handoff contains command logs, execution timestamps, and the frozen file
manifest; none of these runs are combined-branch or native-host evidence.
Generated `*.vsix` and `bundled/` outputs remain ignored by Git. The package
version is unchanged, and no commit, push, publication, tag, or release was made.

## Snapshot and lifecycle coverage

Controller tests cover relevant and unrelated watcher/document/tab/root/config
notifications, ignore-rule admission, conditional sibling exclusions, duplicate
and definitely excluded Open Editors membership, independent sessions, late
initial batches, bounded event bursts, and no automatic source-event rerun.
No root notification is emitted for unrelated/duplicate/excluded membership.

A relevant delivered event during initial preparation/enumeration means
conservative initial `partial`: possibly incomplete or unverified, not proof
that a specific match was lost. Unknown text history invalidates affected rows;
ignore/membership/configuration uncertainty and journal overflow invalidate the
whole in-flight snapshot, including already delivered and late batches. After
completion, an event sets `scopeStale` and advances `scopeEventRevision`, but
never retroactively sets initial `partial`.

Save, Close, and zero-text document notifications advance that revision even
for zero-match scope files and during `replacing`. Close cancels validation
before version binding as well as afterward. Tests verify that late opens and
late workers cannot restore INVALID rows, publish a canceled search, start a
canceled worker, or dispatch an expired replacement. Modal render publication
also checks logical cancellation, disposal, session identity, and closed docs;
the separate stronger row/selection preview protocol must still be integrated.

Save alone does not rebase a disk baseline. A successfully checked, continuously
tracked pending row may become valid without a full rerun; this is distinct
from unknown identity, incomplete initial search, or an expired check, which
require explicit Rerun. New matches are never inserted into the same snapshot.
See the [pinned JetBrains inspection](../research/issue-3-file-event-snapshot-sources.md)
for actual platform behavior, the adaptation, and false-positive Rerun costs.

## Physical resource policy and synthetic evidence

`src/validation-open-boundary.js` exports `PhysicalOpenGate`, the compatibility
alias `ValidationOpenGate`, and frozen `PHYSICAL_OPEN_DEFAULTS`. One controller
owns one document gate and exposes:

```js
controller.openDocument(uri, { signal, timeoutMs });
controller.request(session, { signal, timeoutMs });
// Reusable mechanism for an independently owned resource lane:
const gate = new PhysicalOpenGate(opener, { limit: 4, maxQueue: 512 });
await gate.open(value, { signal, timeoutMs: 10000 });
// gate.active, gate.waiting; gate.dispose()
```

Defaults are four actual physical operations, 512 FIFO waiters, and a
10-second caller budget. Controller budgets use `jbsearch.search.timeoutMs`,
clamped to 100–300000 ms for document preparation. Timeout, abort, and dispose
reject the caller but **never release the physical lease until actual settle**.
Expired queued calls do not start a physical operation, including when an
overdue promise microtask would otherwise beat a delayed timer. Errors use
`GATE_TIMEOUT`, `GATE_ABORTED`, `GATE_FULL`, and `GATE_DISPOSED`.

The gate is shared by all controller document opens: initial Open Editors
preparation, validation, modal preview and activation, injected native preview,
and local replacement preparation. The standalone `FindPreview` fallback
retains its existing raw opener for compatibility; production always injects
the controller gate. Do not add nested acquisition around an already gated open.
The controller disposes its gate; individual sessions cancel only their own
logical callers and never dispose the shared lane.

An independent global validation admission bound is **512 total entries across
all sessions**, including debounce timers, controller FIFO, running checks,
and canceled running async checks until their logical operation actually
settles. Validation workers are capped at four. Overflow fails closed with a
Rerun reason. A hot URI preserves its first-admission deadline and goes behind
older queued work; cancellation removes its timer/queued caller. The end-to-end
validation budget includes debounce, controller FIFO, opening, and worker work.
Initial preparation uses one remaining opening budget across sequential opens;
the search worker has its separate configured search budget. Replacement
preparation passes one remaining budget and checks the event epoch before
edit dispatch. Dispatched `applyEdit` remains awaited and locked to its actual
response; it cannot be revoked by a timeout.

Synthetic tests inject one, two, three, and four deliberately hung promises,
remaining-slot work, FIFO across sessions, bounded admission/overflow, abort,
disposal, late success/rejection, overdue microtasks, Close before version
binding, initial preparation cancellation, shared opening paths, and worker
late completion. They prove the wrapper's counters and fail-closed behavior,
**not real VS Code/Remote starvation recovery**. Four permanently hung host
opens make further physical document progress impossible for that controller,
including other sessions: later callers time out instead of spawning unlimited
replacement opens. Actual later settlement can release a slot; Rerun cannot
repair a permanently hung host. Timers cannot preempt a blocked JavaScript host.

This document gate is not a bound on disk handles, `showTextDocument`, native
tab close, or dispatched edits. An already dispatched native show may still
open an editor after cancellation; its late callback cannot decorate/reveal it.
The legacy local replacement `fs.stat` await is not fully deadline-bounded by
this branch. The authority/preflight peers own the separately agreed
controller-wide disk-read gate, retaining its lease through actual reader
close; it must be composed during controlled integration, not claimed here.

## Isolated Chromium evidence

The browser run used headless Chromium 141.0.7390.37 on Linux with Node 22.23.2
and local `playwright-core` 1.56.1. It used an ephemeral loopback HTTP server,
synthetic results, a new temporary Chromium profile, and isolated HOME/XDG
paths; the process used `--no-sandbox` in this environment. The harness cleans
its browser, server and temporary profile; it does not use a user profile.
Reproduce with existing local tool paths, without adding a project dependency:

```sh
PLAYWRIGHT_CORE=/path/to/playwright-core \
CHROMIUM_PATH=/path/to/chrome \
node scripts/check-stable-snapshot-browser.js
```

It renders the actual modal HTML/CSS/JavaScript with a mock VS Code webview
API, then verifies virtualization, unchanged same-generation scroll offset,
exactly one Rerun for `scopeStale`, `needsRerun`, or both, patch/search/replace
busy guards, INVALID replacement guards, a fresh generation, and query reset.
This is **not** a VS Code Extension Development Host, native TreeView,
Windows, WSL, or Remote run.

## Native checklist and integration boundary

No VS Code binary or EDH was launched for this continuation. Ordinary-profile
runs remain paused; an isolated native launch must be proposed to and approved
by the coordinator first, with separate HOME/XDG, user-data/extensions dirs,
`--new-window`, an explicit development path, and a synthetic workspace.
After authorization, record actual versions/host placement and check:

1. Scroll a long modal list, edit a saved occurrence, and create a matching
   file; retain the generation and viewport until contextual Rerun.
2. Edit/Save/Undo/Close, delete/recreate, and rename a folder; inspect pending,
   INVALID, selection, and replacement refusal, including initial enumeration.
3. Repeat in native Find Panel with irrelevant events, duplicate/excluded
   Open Editors tabs, multiple saved sessions, hide/reopen, and keyboard use.
4. Change query, mask, and scope and verify immediate clearing/reset.
5. Separately exercise Windows/WSL 1/2 and Remote as available; record actual
   filesystem/host placement, watcher exclusions, and internal/external edits.

Until the independent full-scope preflight is integrated, local Replace All
conservatively refuses `scopeStale`. The integrated path may use a fresh
complete equality preflight for a completed stale snapshot, but cannot waive
initial partial, INVALID/pending, identity, or immutable action-binding guards.
The separate authority/identity work owns UTF-16 hashing, representable ranges,
disk-versus-buffer provenance and strict guarded observed-Save state-equality
rebasing. Its unified lifecycle hooks must replace temporary unknown-identity
routing, not add duplicate listeners or revive unknown history by text equality.

The query/preview ticket, native frozen node binding/targeted refresh, frozen
full-manifest/action/review, worker source policy and disk-resource changes
require one controlled integration writer and joint tests. This branch does
**not** establish complete replacement safety or native pixel anchoring.
Delivered `.git/info/exclude` events are routed, but external Git metadata,
parent/global ignore files and outside-workspace Open Editors need not be
watched. Watcher silence is never a scope equality proof, and an ambiguous
ignored path marking scope stale is not proof that search included that file.
