# ADR 0002: Native modal editor as the search container

- Status: Accepted
- Date: 2026-11-03
- Related change: [design-floating-search](../../openspec/changes/design-floating-search/design.md)
- Evidence: [research and a real test run](../research/modal-editor-feasibility.md)

Addendum: the minimum VS Code version was changed to 1.143.1, and the order of
view recreation was revised after Remote SSH testing; see
[ADR 0004](0004-source-registration-and-vscode-compatibility.md).

## Context and confirmed requirements

Cmd+Shift+F should open a compact floating dialog over the current VS Code window,
like JetBrains Find in Files: drag/resize, familiar VS Code controls, inherited
theme, and results and preview inside. Moving the same search to a tab is an
additional action. Delivery is a normal extension for stock VS Code. The target
platforms for the first product iteration are macOS, Windows, and Linux. A companion
application and a detached editor are not approved substitutes for the required UI.

The previous conclusion that VS Code had to be modified was too categorical:
native modal editors have existed since 1.110. Testing a separate VSIX on official
VS Code 1.144.1 Linux/X11 confirmed a custom editor inside this dialog, drag/resize,
Esc, live theme updates, and moving to a tab. The user's VS Code was not patched;
no proposed API or separate application was used.

## Decision

Use a read-only CustomEditorProvider for the search session URI. Its webview is
hosted in a native modal editor. The open command goes through a small adapter to
the internal `_workbench.openWith`, `MODAL_GROUP = -4`, and modal options; other
operations use the public API. This is **not a stable public way to open a modal**:
`ViewColumn.Modal` does not yet exist.

With `workbench.editor.useModal: some`, ordinary files stay in tabs. This is the
default in the tested version; enabling `all` is unnecessary. With `off`, the route
silently produces a tab, so the adapter must stop opening and explain the limitation,
without silently changing the setting or presenting a tab as the required window.

The frame and window controls are VS Code's own components. The internal UI is a
webview with semantic HTML controls and `--vscode-*`, without a third-party
component library. Internal workbench widgets are not exported through the public
API. A native TextEditor cannot be embedded in a webview; the chosen implementation
is the read-only TextMate renderer with match decorations described in
[ADR 0003](0003-search-engine-and-session.md). Persistent preferences use the native
Settings UI.

In the first implementation, the adapter closed the previous view on reopening
and resolved a new custom editor for the session URI. On 1.144.1, moving a retained
webview directly from a tab back to the modal left the iframe at `(0, 0)` with a
size of `300 × 150`; disabling retainContextWhenHidden did not fix it. Recreating
the view through the public `WebviewPanel.dispose()` preserved host state and
restored the layout locally. Remote SSH revealed a race in the order of closing
and opening: the new view is now created before the old one is closed, with a new
URI and the same session. Details and verification are in ADR 0004.

## Options

| Option | Result | Limitation |
| --- | --- | --- |
| Modal editor + CustomEditorProvider + internal adapter | Verified dialog over the editor; one VSIX; theme and native window controls | Internal command and experimental mechanism; version compatibility must be checked |
| Documented stable API only | Webview, QuickPick, editor tabs | No public arbitrary modal target; QuickPick cannot provide the required preview |
| Webview + detached editor window | One VSIX and a separate editor window | Not a compact dialog over the workbench |
| Electron/Tauri companion | Separate system window | Separate delivery and complex focus, theme, and window integration; unnecessary for the discovered approach |
| Inspector/DOM injection, as in IntelliJ Styled Search | Very similar UX in an existing extension | Heavy dependence on Electron/Monaco internals; neither adopted nor run |

## Consequences and acceptance conditions

- The user approved implementation on 2026-11-03 after a demonstration. The internal
  API is accepted as a bounded dependency, not a compatibility guarantee; search
  readiness is determined by testing.
- Compatibility was verified on 1.144.1 Linux/X11; this version was chosen as the
  minimum in the manifest and adapter. Windows/macOS and later versions need
  separate checks; do not infer compatibility from the version that introduced
  the feature.
- Keep all undocumented arguments in one adapter; check supported versions/the
  setting, errors, reopening, and moving to a tab. Prepare to migrate to a public
  modal API when one becomes available.
- Do not enable `all`, silently change `off`, or install a companion as an unnoticed
  substitute when the modal is unavailable.
- SearchSession lives in the extension host: Esc destroys the view but must not
  lose the query. Moving to the editor uses a native command; it does not export
  a string into the built-in Search Editor.
- The UI stays within the workbench, without a separate window in Alt+Tab. Modality,
  multiple windows, fullscreen, IME, HC/zoom, and keys need separate checks.
- Do not claim Remote/web support solely from desktop testing.

## Sources

- [Modal editors, release notes 1.110](https://code.visualstudio.com/updates/v1_110#_modal-editors-experimental)
- [Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [Webviews and themes](https://code.visualstudio.com/api/extension-guides/webview)
- [Command route and other source references](../research/modal-editor-feasibility.md#sources)
