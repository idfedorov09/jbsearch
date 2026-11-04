# Spec Delta

## Purpose

Provide Replace in Files with safe freshness checks and native Undo.

## ADDED Requirements

### Requirement: Selected replacement
The product SHALL replace the selected match through WorkspaceEdit without autosaving.

#### Scenario: Replace selected match
- **WHEN** the user clicks Replace on a current match
- **THEN** only the selected range changes and the results update
- **AND** the change can be reverted through Undo in VS Code

### Requirement: Replace all
The product SHALL apply the entire complete, current set of matches in one operation.

#### Scenario: Complete result set
- **WHEN** the user runs Replace All after a complete search
- **THEN** all current matches change through one WorkspaceEdit
- **AND** files are not saved automatically

#### Scenario: Stale or incomplete results
- **WHEN** results are limited by a cap or a document has changed since the search
- **THEN** bulk replacement is not applied and the UI offers to refresh the search

### Requirement: Replacement syntax
The product SHALL support capture substitution in Regex and preserve case.

#### Scenario: Capture groups
- **WHEN** regex has a group and the replacement contains $1 or $<name>
- **THEN** replacement uses the corresponding match's captured value

#### Scenario: Literal replacement
- **WHEN** Regex is off and the replacement contains $1
- **THEN** the literal text $1 is inserted into the document
