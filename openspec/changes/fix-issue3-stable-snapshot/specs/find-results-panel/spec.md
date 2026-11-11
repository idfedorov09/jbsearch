# Find results panel delta

## ADDED Requirements

### Requirement: Unrelated source events leave the panel unchanged
An unrelated file event MUST NOT rebuild or notify the active result tree when
the snapshot and its visible status have not changed.

#### Scenario: Delete outside the search
- **WHEN** an unrelated file is deleted after a Find Panel search completes
- **THEN** the panel results, selection, and generation remain unchanged
- **AND** the tree is not notified of a change
