# Fixed parameters and limitations

This describes the combined issue #3 staging implementation, not a released or
newly native-verified build. Values with a VS Code setting are defaults.
[Combined regression evidence and remaining acceptance gates](testing/issue-3-integrated-regressions.md)
are separate from the earlier local and historical platform reports.

## Appearance and controls

- The modal editor starts at 820 × 640 CSS px; the window can be moved and resized.
  A divider also changes the list/preview ratio. There is no separate initial-size
  setting; VS Code controls the position and size.
- Result rows are 24 CSS px high, and the initial list height is 160 CSS px;
  spacing, icon sizes, responsive breakpoints, and control styling are defined in
  `media/search.css`. These dimensions apply to the modal. In Find Panel, the client
  workbench determines the native TreeView's row sizes, fonts, icons, and styling.
  Modal colors and fonts come from VS Code theme variables.
- Match fills in the modal and native editor use the theme color with 70% of its
  original opacity; the original alpha is also respected through CSS `color-mix`.
  The factor has no separate setting. Syntax token colors and opacity are
  unchanged; borders use theme colors with a transparent fallback when a color
  is missing. The Find Panel tree uses standard VS Code label highlights without
  custom fill CSS.
- There are five scope buttons: In Project, Folder, Directory, Open Editors, and
  Scope; named sets are configured through `jbsearch.scopes`. File mask suggestions
  `*.js;*.ts`, `*.go`, `*.java`, `*.py`, and `*.json` are examples only; other masks
  are allowed.
- Window labels are currently in English; there is no separate UI localization.
- Find initially uses Cmd/Ctrl+Shift+F, and Replace uses Cmd/Ctrl+Shift+R; these are
  VS Code bindings that can be changed in Keyboard Shortcuts. One toggle,
  `jbsearch.keybindings.overrideFindInFiles`, enables both by default. Local
  Shift+Enter, arrows, Space, and Cmd/Ctrl+Enter are handled by the UI itself.

## Find Panel and the central editor

- This is a native “root → directories → file → occurrence” TreeView in a contributed
  Panel beside Terminal/Problems. The panel contains no search form or read-only
  preview; **Open in Find Panel** remains a modal action. Line snippets are plain
  text with native label highlights, without syntax tokenization in the tree.
  The workbench handles rendering, virtualization, and node expansion.
- The client workbench chooses file and directory icons through `resourceUri` and
  explicit `ThemeIcon.File` / `ThemeIcon.Folder`. This also uses the client-installed
  file icon theme and extension language icons under Remote; the icon theme need
  not be transferred to the server or a webview. The tree needs no additional
  client installation.
- When a search finishes, its order is determined by root name, parent directory
  URI, file URI, and UTF-16 offset; additional coordinates/IDs break ties. String
  comparison is independent of the OS locale and ripgrep output order. The initial
  order is then preserved even if positions shift.
- Clicking an occurrence opens the source through `showTextDocument` in the active
  central editor group. No new groups or splits are created, and existing tabs are
  not moved. Opening the panel, background batches, and Rerun do not themselves
  change the open document. The user changes the Panel position through normal
  VS Code controls; the extension does not rearrange the layout.
- The center contains a real document with language extensions, the theme, and
  semantic tokens if the language provides them; editing, dirty state, saving,
  and Undo use ordinary VS Code mechanisms. A modified preview tab is not closed
  when moving to another file. Closing a search removes its highlighting but
  leaves source files and unsaved tabs open.
- A click preserves tree focus; **Open and Focus Editor** / Cmd/Ctrl+Enter moves
  focus to the source and pins the tab. Native tree arrows move focus and expand
  nodes; Enter selects an occurrence and opens the source. F4/Shift+F4 with Find
  focus move between occurrences. Native **Collapse All** collapses the tree.
  Replacement commands apply to the selected occurrence.
- One view shows the selected search; independent query/options/scope and snapshots
  are switched through **Switch Saved Search** (QuickPick). **Edit Search** creates
  a separate draft of the selected search. Confirmation updates the same session,
  Esc leaves the original parameters and snapshot, and **Keep as a new search**
  creates an independent search. **Hide Panel** preserves sessions; **Close Search**
  releases the selected snapshot and stops its checks. The **JB Search Settings**
  gear in the modal opens VS Code Settings.

## File changes and a stable snapshot

- After a search finishes, new matches are not added automatically. Existing rows
  keep their IDs and tree positions. An open document edit shifts ranges through
  VS Code UTF-16 events; all rows for that file are then marked Checking and
  revalidated by the same worker with the original query, flags, regex context,
  and captures.
- An occurrence that no longer matches remains with INVALID, its original line
  snippet, and its current position. The **INVALID** prefix appears before the
  snippet, next to a native error icon using the active theme's `errorForeground`.
  On a selected row, the workbench overrides the icon color for contrast while
  preserving its shape and prefix. Undo can restore the same ID's validity and
  remove both markers. Coordinate tracking keeps the last 128 states and the
  file's initial state; full document text copies are not stored in this history.
  There is no separate history-depth setting.
- During initial preparation/enumeration, a relevant delivered event conservatively
  marks the result partial/unverified without silently restarting the search. A
  bounded URI journal invalidates affected rows, or the entire initial snapshot
  when membership/ignore/configuration is uncertain or the journal overflows.
  This is not evidence that a particular match was lost. After completion,
  relevant events set scope staleness without retroactively setting initial
  partial. New matches require explicit Rerun or changed search parameters.
  Query, mask, scope and other search-affecting parameters clear old rows,
  selection, accessibility reference and preview immediately, before ACK.
- An external edit to a closed file has no old text or TextDocumentChangeEvent,
  so the exact movement of old ranges cannot be reconstructed. Validation uses
  the current full regex context but cannot revive unknown identity merely from
  matching text/coordinates. A full recalculation requires Rerun Search. A
  deleted or closed source remains unavailable/identity-unknown INVALID.
- File revalidation is limited to 50000 matches; the size limit and timeout come
  from the shared `jbsearch.search.maxFileSizeMiB` and `jbsearch.search.timeoutMs`.
  An error, timeout or incomplete response settles non-pending INVALID with an
  explanation and Rerun guidance. The delay after document edits is 150 ms, and
  after file-system events 250 ms, with a 1000 ms maximum debounce age. The
  original absolute caller deadline includes debounce, FIFO, opens and worker
  waiting; hot requeues or pending-row owner transfer cannot extend it. At most
  four logical validation callers and 512 admitted entries are retained across
  sessions, including debounce, FIFO and canceled running operations until
  logical settlement. This is not a four-physically-live-worker guarantee.
- INVALID and Checking block replacement of the corresponding row; Replace All
  requires the entire set to be valid and verified, and the search to be complete.
  After the extension's own replacement, snapshot rows are preserved and rechecked,
  so replaced occurrences may become INVALID. Rerun Search gathers a new set.
  Replacements use WorkspaceEdit and do not save files to disk.

## Configurable search limits

| Setting | Default | Allowed range |
| --- | --- | --- |
| `jbsearch.search.debounceMs` | 150 ms | 0–2000 ms |
| `jbsearch.search.maxResults` | 5000 matches | 1–50000 |
| `jbsearch.search.maxFileSizeMiB` | 2 MiB per file | 0.01–128 MiB |
| `jbsearch.search.timeoutMs` | 10000 ms | 100–300000 ms |
| `jbsearch.replace.prepareTimeoutMs` | 60000 ms | 100–300000 ms |
| `jbsearch.search.respectExcludes` | enabled | `true` / `false` |

The replacement preparation deadline is cumulative across document and file
preparation and does not include the independent worker search. A timeout before
edit submission applies no edit; the limit can be increased or the scope
narrowed. After a WorkspaceEdit is submitted, its outcome must be awaited instead
of assuming the timeout can revoke it. This deadline does not promise to
interrupt a kernel-blocked filesystem operation.

Physical document opens share a controller-owned limit of four active requests
and 512 FIFO waiters; a separate lane gives whole disk-read/assertion/close jobs
the same limits. Caller timeout/cancellation does not free an unresolved physical
slot. Four permanently hung operations can stall their shared lane even for
unrelated sessions; later actual settlement permits FIFO progress. Exhaustion
refuses further work rather than bypassing safety checks. These
limits are not a guarantee about the number of physically exited worker threads.

Replacement binds an immutable full client model, not just visible virtual rows
or the latest mutable native provider state. A reliably bound action adds no
confirmation; an action with no reliable binding opens a separate frozen
read-only review with an explicit action, not Edit Search. A stale supplied
binding refuses instead of adopting current targets. Complete fresh-scope
equality is required for All; mismatch preserves the old results and offers
explicit Rerun. Observed Save can lazily rebase a verified changed disk baseline
only with exact current known document/row/request/epoch and lossless no-follow
state-equality guards. Unknown history, unsupported encoding, permission/resource
errors or missing safe-open support do not take that path. The approved source
baseline stays immutable. See [combined evidence and boundaries](testing/issue-3-integrated-regressions.md).

Replace All is not applied to incomplete results, for example due to a result
limit, timeout, unreadable input, unsupported encoding, or an unclassified file
exceeding the text-size limit. Inputs identified as binary are excluded from text
search without blocking solely for that reason; their contents are not searched
or replaced. The status lists up to 20 representative excluded/skipped paths and
reasons, prioritizing blocking inputs, and reports how many details were omitted.

Detection uses content, not extensions: structurally recognized ZIP, common
binary signatures, and NUL bytes are binary evidence. Without an explicit known
clean-document codec, UTF-16/32 BOMs and likely BOM-less UTF-16/32 patterns are
treated as unsupported before the generic NUL rule. Explicit clean UTF-16 LE/BE
documents can use lossless disk decoding; conflicting BOMs and known unsupported
codecs remain blocking. These are heuristics, not a perfect distinction between
arbitrary binary and text: binary bytes that look like UTF-8 can still be searched,
and text (including unsupported encodings) can be mistaken for binary and excluded.
Ambiguous binary data can also be treated as a blocking encoding error. Review the
reported exclusions before bulk replacement.
For oversized files, the generic binary probe is bounded to 8192 bytes; an
unclassified oversized input remains blocking. VS Code editor snapshots are
already decoded: they are searched as text except for literal NUL-containing
snapshots, which are excluded as binary.

ZIP32 structural recognition additionally inspects bounded directory and local
headers without extraction or full integrity validation (at most 2048 entries and
a 1 MiB central directory). ZIP64 and other unsupported structures still use
the general binary checks. Document change handling additionally uses a 150 ms
delay, and file-system handling uses 250 ms; these are not separately configurable.

## Other fixed boundaries

- Opening automatically seeds the query with the selection if it is up to 2000
  UTF-16 code units long. Query and replacement input in messages is limited to
  20000 UTF-16 code units; masks and include/exclude input to 4000.
- The read-only preview **in the modal** shows approximately 8 lines before the
  selected line and 34 after it; a long multiline match expands this range.
  At most 5000 preceding lines are parsed to restore grammar context. Lines of
  20000 code units or more are not tokenized. A line parse has a 20 ms limit;
  interrupted parsing restarts from the original state with a 100 ms limit.
  One preview has a total tokenization budget of 250 ms, checked between lines.
  After a second timeout, a long line, or budget exhaustion, remaining lines are
  shown as plain text with an explicit message; incomplete grammar state is not
  carried to the next line. Match highlighting remains.
- The list displays a limited line fragment around the match; navigating to a
  result shows the full file. The list is virtualized; worker communication uses
  batches of up to 80 matches. The Node worker's old-generation heap has a 256 MiB
  limit. Cancellation requests worker termination after a 40 ms grace period,
  but the engine does not await physical exit before logical settlement; this
  is not a hard live-worker or whole-worker-I/O resource bound.
- Search uses ECMAScript regex in a worker and bundled ripgrep for file enumeration,
  supports UTF-8, does not traverse symlinks, and does not search browser or virtual
  workspaces. These limitations are not UI toggles.
- Modal preview uses TextMate; semantic tokens are not implemented inside it.
  These limitations do not apply to Find Panel's native editor. Under Remote, the
  client UI component reads the active theme, includes, and token customizations,
  as well as client grammars. VS Code commands transfer the snapshot; queries and
  search files stay on the server. The server grammar has priority for the same
  language/scope. Limitations and installation are described in the
  [README](../README.md#requirements--limitations).
- For the modal preview's client channel, each resource is limited to 4 MiB,
  total grammar text to 24 MiB, grammar count to 1024, and the theme include graph
  to 64 files. Exceeding a limit or a missing resource is reported in the preview.
  Resources are read only within the extension's installation URI; server `fs`
  does not open client paths.
- Obtaining a client snapshot is limited to 10 s, and waiting for installation
  to 45 s. Automatic installation is attempted at most once per activation.
  **JB Search: Set Up Client Preview** can retry it. The protocol version is 1;
  a client build mismatch is detected by hash and may require Reload Window.
  These technical limits have no separate user settings.
- Opening the floating window uses an internal VS Code command and requires
  `workbench.editor.useModal` to differ from `off`. Compatibility with future
  versions needs separate testing. The user confirmed macOS and Linux use;
  Windows execution has not been reported. See
  [platform acceptance](testing/platform-acceptance.md).

Queries and results live in the current extension host's memory and reset when it
restarts; search history is not written to disk. The `view=findWindow` marker in
an old editor URI redirects the restored tab to an empty Find Panel after
Reload Window, without restoring the query or results. A source registration
update does not need an extension version bump: **Developer: Reload Window** is
enough. Find Panel server source changes require neither rebuilding `client/`
nor reinstalling the client component.

The earlier Find Panel implementation was tested in stock VS Code 1.143.1 from source and 1.144.1
from an installed VSIX on Linux/X11: 13 GUI scenarios each, including native icons,
dark/light themes, INVALID/Undo, and no split. Scenario details and verification
boundaries are in the [Find Panel report](testing/native-find-panel.md).
[Checks of the former HTML Find Window](testing/find-window.md), including high
contrast, a narrow window, and 5000 occurrences, are preserved as history and do
not replace testing of the new panel. Linux checks do not establish compatibility
with other platforms or Remote SSH between different physical machines. The
later user-reported macOS/Linux acceptance is recorded separately in
[platform acceptance](testing/platform-acceptance.md); Windows and Wayland
execution remain unverified.
Find Panel over physical Remote still needs separate acceptance testing; the
earlier loopback modal test does not confirm it. Those historical GUI runs do
not verify the combined issue #3 runtime. No VS Code binary was launched or
probed for the combined staging checks recorded here; any new EDH run requires
separately approved disposable HOME/XDG/data/extensions/runtime isolation.


## Presentation boundaries

- While a Find Panel search is still streaming, the final deterministic sort can
  reorder rows that were already shown. Structural updates and native workbench
  scrolling can also move the viewport; the public TreeView API does not provide
  a precise viewport anchor. Status-only changes with unchanged action semantics
  retain provider identities and use localized notifications, although a changed
  ancestor can refresh its visible subtree. Stable logical occurrence IDs are
  distinct from native action handles: request, occurrence revision or full
  manifest binding changes renew those handles, refreshing existing file
  parents. This renewal may also move native selection/scroll; neither a refresh
  nor a requested TreeItem acknowledges that new pixels were painted.
- Native row commands capture immutable descriptors and reject stale or expired
  context arguments instead of rebinding by logical ID. Missing/duplicate result
  IDs produce a diagnostic and no actionable tree. A whole-manifest token change
  renews all row actions, even if only one file changed; its local CPU/retained
  memory cost and test limits are in the
  [issue #3 presentation report](testing/issue-3-scroll-order.md).
- Current native row actions carry the immutable full-manifest descriptor into
  actual backend admission. Missing toolbar binding opens a genuine frozen
  read-only review, not Edit Search; stale supplied bindings refuse without
  adopting new targets. Programmatic/provider tests do not prove frontend
  context-handle receipt, delayed painting or physical user approval.
- Across a same-generation modal update, the first visible occurrence and its
  relative row offset are retained when that occurrence remains present. A new
  search generation or pending query, mask, or scope change still resets the
  list; scrolling does not request another search or results page.
