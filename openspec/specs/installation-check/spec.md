# Installation check

## Purpose

Verify activation of the installed JB Search extension and show the available
commands, actual version, and load directory. Evidence: src/extension.js,
test/extension.test.js, and docs/testing/source-location-results.json.

## Requirements

### Requirement: Installation check command
The extension SHALL provide the `jbsearch.checkInstallation` command titled
`JB Search: Check Installation` and report the available Find/Replace commands.
The notification SHALL include the version and location of the extension actually
loaded, obtained from `ExtensionContext.extension`.

#### Scenario: User invokes the command
- **WHEN** the user runs the installation check command
- **THEN** the extension shows `JB Search <version> is ready. Use Find in Files or Replace in Files. Loaded from <path>` with the actual version and path
- **AND** the command itself does not start a search

#### Scenario: Source registration
- **WHEN** the user registers the source folder once through Developer: Install Extension from Location and saves source changes
- **THEN** after Developer: Reload Window, VS Code loads the updated code from that folder
- **AND** rebuilding and reinstalling a VSIX is unnecessary

### Requirement: Command lifecycle
The extension SHALL register command disposables in the context's subscriptions.

#### Scenario: Extension activation
- **WHEN** VS Code activates the extension
- **THEN** the installation check handler is registered and added to subscriptions
