# Spec Delta

## Purpose

Provide a stable tree of found occurrences for sequential review and manual
file editing, with a return to the original search parameters.

## ADDED Requirements

### Requirement: Dedicated results presentation
Find Window SHALL display a dedicated results tab with a tree of roots,
directories, files, and matches, a query summary, and actions for refresh,
navigation, and returning to parameters. There is no repeated Open in Find Window button.

#### Scenario: Transfer from dialog
- **WHEN** the user confirms Open in Find Window in the modal
- **THEN** a dedicated tree tab opens with the same query, filters, and selected result
- **AND** it does not show a repeated transfer button or a bottom read-only preview

#### Scenario: Stable ordering
- **WHEN** the same search returns results in a different order across batches
- **THEN** the completed tree has the same ordering by root, path, and position in the file
- **AND** collapsed groups and the selected result are preserved during change validation

#### Scenario: Close results tab
- **WHEN** the user closes the last panel of a Find tab
- **THEN** its snapshot and scheduled checks are released
- **AND** subsequent file edits do not trigger searches for the closed tab

#### Scenario: Keyboard after rerun
- **WHEN** a new run or parameter confirmation selects the first result in the new results
- **THEN** Enter opens that visibly selected result
- **AND** intermediate empty results and final sorting do not retain focus on the old row

### Requirement: Editable source alongside results
When a match is selected, the product SHALL display a real editable file to the
right of the tree, with the theme, language features, ordinary save and Undo,
highlighting current matches without the search itself writing to disk. Stock
VS Code uses a right editor group; the exact Secondary Side Bar is not emulated.

#### Scenario: Select and edit
- **WHEN** the user selects a match and edits the displayed file
- **THEN** changes occur in the real VS Code document and are available to other tabs
- **AND** the editor inherits the theme, language, and extensions, and changes remain unsaved until ordinary save
- **AND** a single result selection does not steal focus from the tree, while Enter transfers focus to the editor

#### Scenario: Switch results quickly
- **WHEN** the user quickly selects several results
- **THEN** the last selected file and its range remain on the right
- **AND** the tree and original tabs are not replaced by the preview file

### Requirement: Retained invalid occurrences
A completed search SHALL retain its result set until an explicit rerun. Ranges
are tracked when a document changes; an occurrence that no longer matches is
marked INVALID at its previous tree position instead of disappearing.

#### Scenario: Edit before occurrence
- **WHEN** the user adds lines before a found occurrence
- **THEN** the position and navigation to the occurrence shift to the current text without reordering the tree

#### Scenario: Edit invalidates occurrence
- **WHEN** an edit violates the original search condition for an occurrence
- **THEN** the row remains in the tree as INVALID and is unavailable for automatic replacement
- **AND** new occurrences are not added until an explicit rerun

#### Scenario: Undo restores occurrence
- **WHEN** the user undoes the edit that made an occurrence INVALID
- **THEN** after validation, that same occurrence is available again with its current range

#### Scenario: Deleted file or validation error
- **WHEN** the source file is unavailable or validation has not completed
- **THEN** the result is not considered trustworthy, its state is explicit, and replacement is blocked

#### Scenario: Explicit rerun
- **WHEN** the user clicks Rerun Search
- **THEN** the search rebuilds the tree using the saved parameters, accounting for new and missing occurrences

### Requirement: Edit originating search
The Find Window gear button SHALL open the modal with this search's parameters.
Confirmation updates the original tab; cancellation retains the previous
snapshot, and explicit New Tab creates an independent result.

#### Scenario: Change query and confirm
- **WHEN** the user changes the query through the gear button and confirms it
- **THEN** the same Find tab updates with new parameters and results
- **AND** a second instance of that tab is not created

#### Scenario: Cancel query changes
- **WHEN** the user changes the query in the modal and closes it with Esc
- **THEN** the original tab and its parameters remain unchanged

#### Scenario: New result tab
- **WHEN** the user confirms Open results in new tab
- **THEN** the new search has an independent tab and state without replacing the existing one

### Requirement: Guarded replacement
Replacements from Find Window SHALL use current validated ranges and ordinary
WorkspaceEdit/Undo, blocking INVALID, pending, and incomplete results.

#### Scenario: Unsafe occurrence
- **WHEN** the selected occurrence is INVALID or is still being validated after editing
- **THEN** a single replacement is not applied using the old range
- **AND** Replace All is not applied while the set contains unverified or invalid occurrences
