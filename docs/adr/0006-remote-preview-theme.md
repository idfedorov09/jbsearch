# ADR 0006: Preview highlighting boundary over Remote SSH

Status: **Accepted**

Date: 2026-11-04

## Context

Before the client channel was introduced, JB Search obtained highlighting resources
only from the workspace extension host on the remote machine. `vscode.extensions.all`
exposed that host's contributions, but not necessarily the client theme and client
grammars. The webview received VS Code control colors and fonts, but not the active
theme's TextMate rules. Tokenizing the server grammar separately could not restore
the colors of a theme available only on the client: the preview explicitly reported
the limitation and continued highlighting matches. Local preview with an available
theme and grammar already worked through TextMate. OpenSpec records this original
limitation; the client channel solution adopted and verified below addresses it.

The tested VS Code 1.143.1 has the proposed API
`vscode.languages.computeFullSyntaxHighlighting`: its result contains tokens and
the editor color map. However, the calling extension is checked for proposed API
permission, so this method cannot be treated as an ordinary stable API. The
**Developer: Generate Color Theme From Current Settings** command creates a visible
document with colors; it is not a transparent API for obtaining the theme in the
background.

## Options considered

1. **Public VS Code API**, if a way to obtain ready-made tokens and the current
   color map becomes available to ordinary extensions. This needs the fewest
   custom components, but availability and timing are not guaranteed and must be
   checked for a specific version.
2. **A native TextEditor beside search in the same modal editor.** It obtains the
   theme from the editor itself. An isolated prototype confirmed BL/TextMate
   highlighting, live theme updates, and match decorations without a server copy
   of GitHub Theme. However, the discovered adapter
   `focusBelowGroup → _workbench.open(-4) → focusAboveGroup` loses input: `return`
   became `retrn`, and one character entered the test source. A read-only snapshot
   protects the source, but the loss of `n` from the query was confirmed separately.
   Moving the modal to main through the native action merges its groups into
   separate tabs and does not preserve a single search/preview layout. This
   adapter is not accepted for interactive search; it has not been proven that
   other native approaches are impossible. See the
   [report](../research/native-preview-feasibility.md). Production was unchanged
   during this experiment.
3. **Client extension component and remote search backend.** Access to client
   grammar/theme resources and server-side search must be coordinated between
   extension hosts. The officially supported channel is asynchronous VS Code
   commands with serializable data; custom sockets or SSH are unnecessary.
   The UI and workspace components have two technical extension IDs:
   `extensionKind` selects one host, rather than running one registration in both
   hosts at once. Source installation and updates on client and server,
   communication, and behavior without the second component must be demonstrated
   separately. Theme includes, customizations, and theme changes need handling.
   Transferring theme rules alone does not provide client grammars or complete
   semantic highlighting. The user accepted this option for autonomous
   implementation on 2026-11-04 after the native probe report.
4. **UI host with search through public workspace APIs.** This may reduce the need
   for a server extension, but requires revisiting file enumeration and reading,
   performance, ignore rules, and client-side extension registration.
5. **Explicit theme export by the user.** This can transfer a token color snapshot,
   but requires manual steps and updates when the theme changes; it is not
   equivalent to automatic theme inheritance. This workaround is not enabled
   automatically.

An arbitrary palette, silent theme switching, DOM/CDP injection, and presenting a
fallback as real highlighting are not accepted solutions.

## Decision

Keep the unified webview in the modal and tab, and add an ordinary UI extension,
`idfedorov09.jbsearch-client`, that obtains the active theme and grammar contributions
on the client. The server-side `idfedorov09.jbsearch` receives a serialized snapshot
through `jbsearch.client.previewResources`. Search files and queries are not sent
to the client component. Server grammars keep priority for matching scopes; client
grammars supply missing ones, including built-in JavaScript.

The UI component reports theme, token customization, and extension changes through
`jbsearch.previewResourcesChanged`. The preview rebuilds its registry and discards
late responses. Server `fs` never accesses client paths.

The client VSIX is bundled with the main extension and installed by a native
VS Code command on the first remote preview. A missing component or installation
failure remains an explicit fallback with the **JB Search: Set Up Client Preview**
command; rebuilding the preview must not trigger an installation loop.
For source registration, the bundled component is prepared through
`npm ci`/`prepare:client`; ordinary server changes still load after Reload Window.
Installation/updates and real GUI behavior are verified separately from unit tests.

Complete semantic highlighting from every language server is not promised: the
chosen contract is TextMate. Native modal opening retains the previously accepted
internal adapter; the channel between extensions uses public VS Code commands.

## Implementation result, 2026-11-04

The channel was implemented and tested in ordinary VS Code 1.143.1 on Linux/X11
over Remote SSH loopback, with server sources registered through the native
VS Code command. GitHub Theme 6.3.5 was present only on the client, and the BL
grammar was on the server; the JavaScript grammar was unavailable to the server
host. On the first search, the bundled UI extension installed and activated
locally without a manual Reload Window. BL and JavaScript previews received
client TextMate colors, updated them on theme and token customization changes,
and kept match highlighting.

75/75 unit tests, `check`, `spec:check`, and 14/14 GUI scenarios passed, including
rapid typing without focus loss, read-only preview, unsaved source, Open Editors,
Replace/Undo, and moving the unified UI to a tab. Reloading server sources reused
the existing client build without reinstallation. See the
[report and matrix](../testing/find-replace.md) and
[machine-readable report](../testing/client-bridge-results.json).
The client VSIX's actual inclusion in the main package was confirmed by a separate
[check of both archives' contents](../testing/client-bridge-package-results.json),
including rejection of packages with a missing helper or a mismatched build.
An additional [GUI run](../testing/client-bridge-upgrade-results.json) confirmed
eight theme switches and automatic upgrading of an intentionally old client VSIX
with the same version number: the explicit Reload Window message remained,
there was no installation loop, and the current build loaded successfully after
reload. All 14 GUI scenarios apply to the main extension running from source.
A separate [smoke test of the installed main VSIX](../testing/client-bridge-installed-results.json)
confirmed automatic installation of the nested helper, BL/JS preview, Replace,
and the unified tab in the same isolated Remote SSH environment.

This result verifies the chosen channel in the tested configuration.
macOS, Windows, and Remote SSH between different machines have not yet been
tested; semantic tokens are not implemented.

## Boundaries of the native preview experiment

The test used an ordinary workspace extension in isolated VS Code 1.143.1,
Linux/X11, over real Remote SSH loopback. GitHub Theme 6.3.5 was present only on
the client; the BL grammar was available on the server. The user's main profile
and neighboring BL project were unchanged. The source-mode failure affected only
a test file, and its changes were discarded without saving. A separate snapshot
run confirmed read-only behavior, current unsaved text, automatic theme use, and
both limitations.

macOS, Windows, real network latency, and semantic highlighting for other languages
were not tested. The snapshot uses a different URI scheme and may not match
semantic provider selectors. The observed problems should not be generalized to
all possible native preview implementations. Acceptance of this ADR selects the
client channel; it does not mean all platform checks have been completed.

## Sources

- [Proposed API contract, VS Code 1.143.1](https://github.com/microsoft/vscode/blob/e646868227c3e3a9e3f24277c8c7220be42c0be7/src/vscode-dts/vscode.proposed.documentSyntaxHighlighting.d.ts)
- [Proposed API check at invocation](https://github.com/microsoft/vscode/blob/e646868227c3e3a9e3f24277c8c7220be42c0be7/src/vs/workbench/api/common/extHost.api.impl.ts)
- [Theme data exported to webviews](https://github.com/microsoft/vscode/blob/e646868227c3e3a9e3f24277c8c7220be42c0be7/src/vs/workbench/contrib/webview/browser/themeing.ts)
- [Report and source of the native preview experiment](../research/native-preview-feasibility.md)
- [Documentation for commands between extension hosts](https://code.visualstudio.com/api/advanced-topics/remote-extensions#communicating-between-extensions-using-commands)
- [UI/workspace extension host locations](https://code.visualstudio.com/api/advanced-topics/extension-host)
