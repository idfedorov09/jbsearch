# Spec Delta

## Purpose

Give the user a compact floating dialog over the editor, with an internal preview
and a way to open the same session's snapshot in a VS Code tab. The separate
Find Window layout is described in change implement-find-window. This is the
contract of the change being implemented; platform checks are tracked separately.
Opening depends on an internal command; stock VS Code 1.143.1/1.144.1 Linux/X11
has been tested, while macOS and Windows still require verification.

## ADDED Requirements

### Requirement: Floating search window
The product SHALL provide a compact, movable, resizable dialog over the current
VS Code window on macOS, Windows, and Linux, like JetBrains Find in Files.
A separate editor window does not satisfy this requirement.

#### Scenario: User opens search
- **WHEN** the user presses Cmd+Shift+F on macOS in a configured, supported context
- **THEN** a compact search dialog appears over the current editor, with results and preview inside
- **AND** the query field receives focus

#### Scenario: Existing session
- **WHEN** the user invokes search again from the same instance
- **THEN** the existing session appears without losing the query or filters

#### Scenario: Workbench size changes
- **WHEN** the user shrinks the VS Code window while the dialog is open
- **THEN** the dialog and its primary actions remain reachable within the workbench

### Requirement: Standard extension installation
The product SHALL work as an ordinary extension in stock VS Code of a supported
version, without a separate application, an installation patch, or enabling a debugger.

#### Scenario: VSIX installation
- **WHEN** the user installs the VSIX in a supported VS Code version
- **THEN** the extension command can open the required dialog without development mode
- **AND** the UI belongs to the original VS Code window

#### Scenario: Remote client setup
- **WHEN** the first preview opens in a Remote workspace without the client component
- **THEN** the main extension installs its bundled UI extension on the client through VS Code's native mechanism
- **AND** setup requires no separate application, debugger, theme download to the server, or manual transport configuration

#### Scenario: Client setup unavailable
- **WHEN** client component installation fails or the component is disabled
- **THEN** the preview explicitly explains the limitation and keeps match highlighting
- **AND** rerendering does not trigger an installation loop; the user can retry setup with Set Up Client Preview

#### Scenario: Client update
- **WHEN** the installed client component has a different build from the nested package
- **THEN** the extension detects the mismatch and makes a bounded update attempt
- **AND** if old client code is still loaded, the user is offered Reload Window

### Requirement: Session transfer
The product SHALL open a session snapshot in a VS Code tab while preserving its
query, filters, and selected result. The tab uses a separate results tree and a
native editor on the right under the Find results window contract; a new tab
creates an independent session. The read-only preview below belongs to the modal.

#### Scenario: Open in editor tab
- **WHEN** the user clicks “Open in tab”
- **THEN** a tab in the original VS Code window shows the same session
- **AND** the dialog hides only after the tab is ready
- **AND** the tab does not repeat the modal form or Open in Find Window button
- **AND** the selected file is open in a native editable editor on the right

#### Scenario: Edit originating search
- **WHEN** the user clicks the Find tab's gear
- **THEN** the modal opens with a draft of its query/options/scope
- **AND** confirmation updates the original tab, while Esc leaves its snapshot unchanged

#### Scenario: Independent session
- **WHEN** the user selects “New tab”
- **THEN** a new session receives a copy of the query/filters
- **AND** subsequent query changes do not affect the original session

#### Scenario: Reload view
- **WHEN** the webview reloads while the extension host is running
- **THEN** the query, filters, and available selection are restored
- **AND** restoration does not require writing queries or source code to disk

### Requirement: Result preview and navigation
In the modal, the product SHALL show a read-only preview of the selected match
with the active theme's TextMate syntax highlighting, path, line numbers, and
match highlighting; opening a result targets the original VS Code instance.
Language server semantic tokens are not part of the modal contract. Find Window
uses the native TextEditor described in implement-find-window and preserves its
ordinary highlighting and editing.

#### Scenario: Change selected modal result
- **WHEN** the user selects another match in the modal
- **THEN** the preview corresponds to the selected result
- **AND** a late response for the previous selection does not replace the preview

#### Scenario: Match spans syntax tokens
- **WHEN** one found range in the preview spans several TextMate tokens
- **THEN** the background and border cover the entire continuous line range without internal token boundaries
- **AND** syntax token colors and styles are preserved, while the selected and other matches use the corresponding theme colors
- **AND** adjacent separate matches are not merged, a multiline match is highlighted on each line, and a zero-width match remains a visible marker

#### Scenario: Translucent match fill
- **WHEN** the theme defines a match background fill in results or preview
- **THEN** the fill preserves the theme color with reduced opacity, including the original alpha channel
- **AND** text, syntax style, and border opacity are not reduced
- **AND** a transparent current-match background remains transparent

#### Scenario: Open result
- **WHEN** the user presses Enter on a result or double-clicks it
- **THEN** the file opens at the match range in the original VS Code instance

#### Scenario: Deleted or changed file
- **WHEN** the file is deleted or the range is stale by the time it is opened
- **THEN** the user sees an understandable state and an option to refresh results
- **AND** the old range is not treated as reliable

#### Scenario: Theme installed only on client
- **WHEN** Remote preview opens with the client component and the active theme is installed only on the client
- **THEN** the preview uses that theme's rules, its includes, and editor.tokenColorCustomizations without a server copy of the theme
- **AND** search and reading found files remain on the server; queries and source text are not sent to the client component

#### Scenario: Grammar installed only on client
- **WHEN** a language grammar is absent from the server but available to the client component
- **THEN** the preview obtains and uses the client grammar through VS Code commands
- **AND** an available server grammar keeps priority for the same language or scope

#### Scenario: Modal preview resources unavailable
- **WHEN** a required grammar or theme is unavailable on both hosts or resource limits are exceeded
- **THEN** the preview explicitly reports the limitation of available highlighting and continues highlighting matches

#### Scenario: Client theme changes
- **WHEN** the user changes the theme, token customizations, or extension set on the client while Remote preview is open
- **THEN** the resource snapshot and selected preview update without a separate palette selection or theme reinstallation on the server
- **AND** updating the preview does not move focus from the query or replace a newer selection with an old response

### Requirement: Keyboard access
In the modal, the product SHALL support Tab/Shift+Tab, Space for toggles, newline
input, arrow navigation in results, and closing with Esc without losing the session.

#### Scenario: Options and multiline input
- **WHEN** the user tabs to Match Case and presses Space
- **THEN** the state toggles and is accessible to a screen reader
- **AND** Shift+Enter in the query inserts a newline; arrows move the caret

#### Scenario: Input method composition
- **WHEN** the user confirms IME composition with Enter
- **THEN** the action completes input and does not accidentally open a file

#### Scenario: Escape
- **WHEN** the user presses Esc with no menu open in the dialog
- **THEN** the window hides, while the query and filters remain in the session

### Requirement: Visual integration and accessibility
The product SHALL use the native VS Code modal editor container and inherit the
current theme in webview controls, including high contrast, with visible focus,
accessible control names, and an adjustable results/preview ratio.

#### Scenario: Theme inheritance
- **WHEN** the user changes the VS Code theme while the dialog is open
- **THEN** the dialog styling follows the theme without a separate palette selection

#### Scenario: Layout and zoom
- **WHEN** the user resizes the window or changes the UI zoom
- **THEN** the query, filters, and primary actions remain available without overlap
- **AND** the preview sits below results, with a divider to change its height

#### Scenario: Compact controls
- **WHEN** the user opens the dialog at ordinary zoom
- **THEN** the window and UI rows are compact relative to the workbench and close in density to the supplied reference
- **AND** filters and settings have distinct icons with accessible names and sufficient click targets

### Requirement: Find and Replace modes
The product SHALL open Find with Cmd/Ctrl+Shift+F and Replace with Cmd/Ctrl+Shift+R
in a compact JetBrains layout with a preview below. Both modes share query,
options, and scopes; Replace adds replacement, preserve case, and replacement actions.

#### Scenario: Replace shortcut
- **WHEN** the user presses Cmd/Ctrl+Shift+R
- **THEN** Replace in Files opens with an additional replacement field
- **AND** the current session's query and filters are preserved

### Requirement: Host availability
The product SHALL explicitly report unavailable support for the search UI,
connection loss, and unsupported environments without imitating successful search.

#### Scenario: Unsupported dialog host
- **WHEN** the environment provides no supported way to open the required dialog
- **THEN** the user receives an explanation of the limitation
- **AND** another container is not presented as implementing the required dialog

#### Scenario: Modal editors disabled
- **WHEN** the user has disabled modal editors in VS Code settings
- **THEN** the extension explains the limitation before opening
- **AND** it does not silently change the setting or present an ordinary tab as an opened dialog

#### Scenario: Other editors
- **WHEN** JB Search is invoked with the native modal editors mode some
- **THEN** the extension does not enable mode all
- **AND** ordinary files retain standard tab-opening behavior

#### Scenario: Connection lost
- **WHEN** the connection to the original VS Code instance is lost
- **THEN** results are marked stale and opening actions are unavailable until the connection is restored

#### Scenario: Unsupported virtual or browser host
- **WHEN** search is invoked in an environment without implemented support
- **THEN** an explicit limitation is shown
- **AND** remote paths are not used to search the local disk
