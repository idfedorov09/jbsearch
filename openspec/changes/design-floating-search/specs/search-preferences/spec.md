# Spec Delta

## Purpose

Separate persistent preferences from the current search's in-memory state,
without duplicating the native Settings UI or saving query history to disk.

## ADDED Requirements

### Requirement: Settings interface
The extension SHALL provide persistent settings through the VS Code Settings UI
and JSON; the search window contains quick session filters and a settings action.

#### Scenario: Open settings
- **WHEN** the user selects JB Search settings
- **THEN** the native Settings UI opens with the extension filter
- **AND** limit settings are validated against their allowed ranges

#### Scenario: Session filter
- **WHEN** the user changes Match Case, scope, or mask in the current search
- **THEN** that session updates without automatically writing to settings.json

### Requirement: Shortcut ownership
The extension SHALL provide Find/Replace commands and enabled-by-default
Cmd/Ctrl+Shift+F and Cmd/Ctrl+Shift+R bindings, while allowing users to disable
the override and assign custom shortcuts.

#### Scenario: Default keybinding
- **WHEN** the extension is installed with default settings
- **THEN** Cmd/Ctrl+Shift+F opens JB Search Find, and Cmd/Ctrl+Shift+R opens Replace
- **AND** the user can disable the override in Settings

#### Scenario: User enables keybinding override
- **WHEN** the user enables the override setting
- **THEN** the shortcut invokes JB Search in a supported VS Code context
- **AND** disabling the setting restores native behavior without rewriting keybindings.json

#### Scenario: Customize shortcuts
- **WHEN** the user configures Find or Replace shortcuts through the extension settings
- **THEN** they can open the native Keyboard Shortcuts editor for the corresponding command and assign a shortcut there
- **AND** the extension does not present an ordinary settings.json string as a working shortcut setting

### Requirement: Saved scopes
The extension SHALL allow named include/exclude scopes to be defined for the
workspace and selected in the UI, with an explicit message for invalid configuration.
The current query's include narrows the selected scope; disabling ignore does not
remove its include/exclude rules.

#### Scenario: Scope selection
- **WHEN** the user selects a saved scope
- **THEN** its include/exclude patterns apply together with the current mask and ignore policy

### Requirement: Session persistence
The product SHALL keep query/options between closing and reopening the dialog
in extension host memory, without writing query history to disk.

#### Scenario: Reopen in the same extension host
- **WHEN** the user closes the dialog with Esc and invokes search again
- **THEN** query/options are restored from the session

#### Scenario: Extension host restart
- **WHEN** the extension host restarts
- **THEN** query history is not restored from disk and old results are not treated as current

### Requirement: Safe configuration boundary
The product SHALL run an external search backend only from a verified distribution,
not from workspace content or a path defined in the workspace. A separate GUI
application is not part of the chosen solution.

#### Scenario: Workspace supplies an executable path
- **WHEN** workspace configuration specifies an external program path to run
- **THEN** that path is not used to launch the program

### Requirement: Local search data
The product SHALL process queries, snippets, and file contents locally;
ordinary diagnostic logs contain no query text or source code.

#### Scenario: Search and diagnostics
- **WHEN** the user runs a search and opens the diagnostic log
- **THEN** search does not send content to an external service
- **AND** the log contains statuses/error codes without queries or snippets
