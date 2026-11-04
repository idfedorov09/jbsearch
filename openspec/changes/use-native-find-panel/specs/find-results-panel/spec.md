# Spec Delta

## Purpose

Provide a native search results tree with VS Code client icons in the bottom
panel and navigation to editable source in the central area.

## ADDED Requirements

### Requirement: Native Find panel
The product SHALL display Find as a native VS Code panel, in the bottom Panel
by default. The tree SHALL use the active icon theme for files and directories
and standard VS Code controls for expansion, selection, and row highlighting.

#### Scenario: Transfer from modal
- **WHEN** the user confirms Open in Find Panel
- **THEN** the modal closes and the panel shows the same search's tree
- **AND** no central tree tab or new editor group is created
- **AND** the active source document does not switch until a result is selected

#### Scenario: Client file icons
- **WHEN** a file or folder has an icon in the active theme or a language extension
- **THEN** the tree uses VS Code's native icon for that resource
- **AND** icon theme changes are applied by the editor without copying the theme to the server

### Requirement: Open source in central editor
Selecting a result SHALL open a real TextEditor in the current editor group,
scroll to the current range, and highlight matches. The product MUST NOT create
an additional right editor group for Find.

#### Scenario: Click occurrence
- **WHEN** the user clicks a match in the tree
- **THEN** the corresponding file opens in the central area at its position
- **AND** focus stays in the tree for sequential navigation

#### Scenario: Explicit edit
- **WHEN** the user invokes Open and Focus Editor for the selected result
- **THEN** focus moves to the real editor with ordinary highlighting, Undo, and save
- **AND** no group is created and no existing tabs are moved

#### Scenario: Fast navigation
- **WHEN** the user quickly selects several results
- **THEN** the editor shows the last selected occurrence
- **AND** background search completion does not switch the open document

### Requirement: Independent saved searches
Find SHALL retain independent searches in memory and allow their selection
through a native switcher. Hiding the panel MUST NOT delete a snapshot; Close
Search SHALL release the selected session and its scheduled checks.

#### Scenario: Create another search
- **WHEN** the user selects Keep as a new search when confirming the modal
- **THEN** an independent search is created and the previous one is available in the switcher
- **AND** no separate results editor tab is created

#### Scenario: Hide and close
- **WHEN** the user hides and reopens the panel
- **THEN** its searches remain available
- **WHEN** the user invokes Close Search
- **THEN** the corresponding snapshot is released and no longer responds to file changes

### Requirement: Edit active search
The gear button SHALL open the modal with the parameters of the search selected
in Find. Confirmation SHALL update that search; Esc SHALL preserve its previous
parameters and results.

#### Scenario: Confirm or cancel draft
- **WHEN** the user edits the query through Edit Search
- **THEN** the previous snapshot does not change until confirmation
- **AND** confirmation updates the same session, while cancellation deletes only the draft

### Requirement: Retain and validate snapshot
Completed results SHALL retain deterministic ordering and changed occurrences
as INVALID/pending until Rerun. Replacements SHALL use the existing range
validation, blocking invalid and incomplete results.

#### Scenario: Edit and Undo
- **WHEN** a source edit violates the search condition
- **THEN** the corresponding row remains in place as INVALID and is not replaced
- **AND** INVALID appears before the snippet with a native error icon in the active theme's `errorForeground` color
- **AND** Undo allows the same occurrence to recover after validation
- **AND** the error icon and INVALID label disappear when validity is restored

#### Scenario: Unsafe replacement
- **WHEN** the user invokes replacement of INVALID/pending results or Replace All on incomplete results
- **THEN** source modification is blocked with an explanation
- **AND** Rerun Search explicitly builds fresh results
