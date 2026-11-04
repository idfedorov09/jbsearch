# Spec Delta

## MODIFIED Requirements

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
