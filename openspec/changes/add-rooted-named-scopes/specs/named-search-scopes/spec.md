# Named search scopes

## Purpose

Named scopes make reusable search filters available across searches, with an
optional workspace folder boundary in multi-root workspaces.

## ADDED Requirements

### Requirement: Select a named scope's workspace folder

A named scope SHALL accept an optional `root` string identifying exactly one
currently open VS Code workspace folder by its case-sensitive `WorkspaceFolder.name`.
When selected, search SHALL use that folder's existing Folder scope behavior.

#### Scenario: Match a workspace folder alias
- **WHEN** a scope sets `root` to the exact displayed name of the second workspace folder, including an alias defined by the workspace
- **THEN** the search uses that folder rather than the first or all folders
- **AND** its search results and replacements use the selected folder boundary

#### Scenario: Preserve nested Folder behavior
- **WHEN** the selected folder contains another workspace folder
- **THEN** rooted named search behaves like selecting that parent with the existing Folder scope, including its established path and exclusion policy

### Requirement: Preserve scopes without a root

A named scope without a `root` property SHALL retain its existing multi-root
search behavior and pattern interpretation.

#### Scenario: Existing configuration
- **WHEN** a named scope omits `root` in a workspace with multiple roots
- **THEN** the scope's existing include and exclude filters apply across the workspace roots as before

### Requirement: Reject an invalid root without widening scope

A specified root MUST be a nonempty string resolving to exactly one open
workspace folder. A malformed, unavailable, or ambiguous root MUST produce a
clear, actionable error and MUST NOT start the affected search or replacement.

#### Scenario: Malformed root value
- **WHEN** a named scope specifies an empty, whitespace-only, null, or non-string `root`
- **THEN** the operation is rejected with an explanation and does not search all roots or modify files

#### Scenario: No exact folder name
- **WHEN** a specified root differs in case or no longer matches an open workspace folder
- **THEN** the operation is rejected with an explanation and does not silently select a different folder

#### Scenario: Duplicate names
- **WHEN** more than one open workspace folder has the specified name
- **THEN** the operation is rejected with an explanation rather than choosing one arbitrarily

### Requirement: Prevent replacing from a stale rooted snapshot

Replacing from a rooted named search MUST verify that the named scope still
resolves to the same selected folder as the search that produced the results.
If not, it MUST block replacement and explain that the search must be rerun.

#### Scenario: Root becomes invalid after a search
- **WHEN** the selected root is removed, renamed, or becomes ambiguous after search results were produced
- **THEN** replacing those results is blocked before any file is modified

#### Scenario: Configuration targets another root
- **WHEN** the named scope changes to a different valid root after results were produced
- **THEN** those stale results cannot be replaced until a fresh search is run

### Requirement: Preserve search and replacement safety

A rooted named scope SHALL retain named include/exclude filtering, search masks,
ignore settings, dirty-document handling, directory safety, and existing
replacement validation; adding a root MUST NOT widen any of those rules.

#### Scenario: Include and exclude filters
- **WHEN** a rooted scope has include and exclude patterns and the user supplies an additional include or mask
- **THEN** the existing intersection and exclusion behavior is applied relative to the selected folder
- **AND** named-scope exclusions remain effective when ignore rules are disabled

#### Scenario: Dirty and out-of-scope files
- **WHEN** matching dirty files exist inside and outside the selected folder
- **THEN** eligible files inside use their unsaved content and files outside are not searched

#### Scenario: Replacement safeguards
- **WHEN** rooted results are incomplete, invalid, pending, or changed since search
- **THEN** the existing replacement safeguards continue to block unsafe edits
