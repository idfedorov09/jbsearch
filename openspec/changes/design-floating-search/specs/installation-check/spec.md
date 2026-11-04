# Spec Delta

## MODIFIED Requirements

### Requirement: Installation check command
The extension SHALL provide the `jbsearch.checkInstallation` command titled
`JB Search: Check Installation` and report the available Find/Replace commands.
The notification SHALL include the version and location of the extension actually
loaded, from `ExtensionContext.extension`.

#### Scenario: User invokes the command
- **WHEN** the user runs the installation check command
- **THEN** the extension shows `JB Search <version> is ready. Use Find in Files or Replace in Files. Loaded from <path>` with the actual version and path
- **AND** the command itself does not start a search

#### Scenario: Source registration
- **WHEN** the user registers the source folder once through Developer: Install Extension from Location and saves source changes
- **THEN** after Developer: Reload Window, VS Code loads the changed code from that folder
- **AND** rebuilding and reinstalling the VSIX are unnecessary
