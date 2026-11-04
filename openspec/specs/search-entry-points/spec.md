# Search entry points

## Purpose

JB Search entry points use the Explorer context to open the existing search
dialog with the required scope, without manually choosing a directory or losing
search parameters.

## Requirements

### Requirement: Explorer folder search

The extension SHALL offer **JB Search: Find in Files…** in the Explorer context
menu for a filesystem folder, including a workspace root and a Remote filesystem
workspace. Visibility and Directory MUST be determined by the resource on which
the menu was opened, regardless of how many resources were previously selected.

#### Scenario: Selected nested directory
- **WHEN** the user invokes JB Search: Find in Files… for a workspace folder
- **THEN** the existing Find dialog opens with Directory selected and the exact
  folder path; results are limited to its contents and subfolders

#### Scenario: Workspace root and multiple roots
- **WHEN** the user invokes the action on the root or a folder of a second workspace root
- **THEN** the selected folder becomes the scope, rather than the first root

#### Scenario: File or multiple selection
- **WHEN** the menu is opened on a file, an unsupported filesystem resource,
  or while multiple resources are selected
- **THEN** JB Search: Find in Files… is hidden for files and unsupported
  filesystems, but available on a supported folder regardless of the selection

#### Scenario: Multiple selected resources
- **WHEN** multiple folders or files are selected and the context menu is opened on a folder
- **THEN** JB Search: Find in Files… is available and searches only that folder,
  without combining it with other selected resources

#### Scenario: Distinguishable built-in search
- **WHEN** the built-in Find in Folder is also available in the menu
- **THEN** the extension's item has a visible JB Search prefix and can be
  distinguished without knowing the command category

### Requirement: Search context and saved results remain coherent

Contextual search SHALL preserve the query and search settings, but MUST NOT
change saved Find Panel results or attach the new search to editing those results.

#### Scenario: Existing modal
- **WHEN** the selected folder changes through Explorer while the modal is open or opening
- **THEN** previous results are cleared, the running search is cancelled, and a new search runs for the last
  selected folder while preserving the query text, masks, and flags

#### Scenario: Saved search or its draft
- **WHEN** contextual search starts from a saved Find session or its draft
- **THEN** an independent Find opens with copied parameters and a new Directory;
  the previous snapshot and its draft parameters are preserved

#### Scenario: Default entry points
- **WHEN** the user opens regular Find or Replace with a keyboard shortcut
- **THEN** the existing behavior applies; Explorer does not change the scope unless the action is invoked

### Requirement: Reject an unavailable search directory

The extension MUST validate the URI and the existence of the workspace folder
before changing the search, and SHALL report an error without silently widening
the search scope.

#### Scenario: Invalid command argument
- **WHEN** the command receives an empty argument, a file, a folder outside the workspace, or a stat error
- **THEN** the current session remains unchanged and a clear error is shown

#### Scenario: Replacement in progress
- **WHEN** contextual search is requested while a replacement is running
- **THEN** that replacement's parameters and scope remain unchanged
