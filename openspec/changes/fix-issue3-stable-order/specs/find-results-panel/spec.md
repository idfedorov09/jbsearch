# Spec Delta

## ADDED Requirements

### Requirement: Update existing Find rows without an unrelated full refresh
The Find panel SHALL retain its logical result identities, logical selection, and ordering when
an update changes only existing rows in the same search generation. It SHALL
update affected row and ancestor statuses without requesting an unrelated
whole-tree refresh.

Native presentation/action handles MAY change when action semantics change;
they MUST NOT be confused with logical occurrence IDs or reused for a new action.

#### Scenario: Existing result becomes invalid
- **WHEN** an existing result is marked INVALID without changing tree membership or order
- **THEN** the result and its ancestor status counts are updated
- **AND** unrelated branches and the current selection remain intact

#### Scenario: Session metadata changes without a tree change
- **WHEN** only the search status or other session presentation changes
- **THEN** the panel updates that presentation without refreshing the results tree

#### Scenario: Result membership or order changes
- **WHEN** a batch or final deterministic sort changes the tree structure or row order
- **THEN** the provider may refresh the affected tree structure
- **AND** the completed result ordering remains deterministic

### Requirement: Native viewport limitation is explicit
The product MUST NOT claim precise native viewport preservation for structural
changes that the public VS Code TreeView API cannot anchor.

#### Scenario: Final sort changes a streaming tree
- **WHEN** results arrive in a different order from the completed snapshot
- **THEN** the completed snapshot retains its deterministic order
- **AND** the native viewport may move as the tree order changes

### Requirement: Native actions are bound to immutable client descriptors
Native row commands SHALL capture immutable generation, occurrence revision, and
backend-issued full-snapshot action descriptors. A changed request, generation,
row action, or full-snapshot binding SHALL receive a new native match handle.
Delayed commands and context arguments MUST NOT resolve to a newer target by
looking up an old logical result ID or reusing a native TreeItem ID.

#### Scenario: A native refresh has not yet been painted
- **WHEN** an action-relevant result update replaces a row model
- **THEN** its old command and context handle are refused before and after asynchronous waits
- **AND** neither a provider event, getTreeItem call, selection nor reveal is treated as a paint acknowledgement

#### Scenario: A title-bar replacement has no client snapshot argument
- **WHEN** a native toolbar replacement has no immutable incoming binding
- **THEN** the coordinated backend requires a genuine frozen read-only approval review
- **AND** it does not infer approval from the latest provider state or an Edit Search draft

#### Scenario: A status-only update does not change action semantics
- **WHEN** the action request, row identity and full-snapshot descriptor are unchanged
- **THEN** existing provider objects and native handles may be reused
- **AND** only changed presentations and ancestor counts are notified

#### Scenario: Result IDs are ambiguous
- **WHEN** result IDs are missing or duplicated in a snapshot
- **THEN** the provider displays a diagnostic and exposes no actionable rows
- **AND** explicit Rerun and Close Search remain available when not busy
