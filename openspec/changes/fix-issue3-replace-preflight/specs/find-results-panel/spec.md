## MODIFIED Requirements

### Requirement: Retain and validate snapshot
Completed results SHALL retain deterministic ordering and changed occurrences
as INVALID/pending until Rerun. Replacements SHALL use range validation,
blocking invalid and incomplete results. Replace All SHALL additionally verify
the complete current eligible scope against the displayed snapshot.

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

#### Scenario: Preflight differs from the displayed snapshot
- **WHEN** a complete current-scope check finds a different set or replacement meaning
- **THEN** no replacement occurs and the displayed snapshot is preserved
- **AND** the user is directed to Rerun Search
