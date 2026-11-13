# Find results panel delta

## MODIFIED Requirements

### Requirement: Retain and validate snapshot
Completed results SHALL retain deterministic ordering and existing occurrence identities when source files change. Results whose condition or identity cannot be verified SHALL remain visibly INVALID or pending and SHALL NOT be replaced.

#### Scenario: Edit and Undo
- **WHEN** a source edit violates the search condition
- **THEN** the corresponding row remains in place as INVALID and is not replaced
- **AND** INVALID appears before the snippet with a native error icon in the active theme's `errorForeground` color
- **AND** Undo allows the same occurrence to recover after validation when its tracked identity can be established
- **AND** the error icon and INVALID label disappear when validity is restored

#### Scenario: Unsafe replacement
- **WHEN** the user invokes replacement of INVALID/pending/identity-unknown results or Replace All on incomplete results
- **THEN** source modification is blocked with an explanation
- **AND** Rerun Search explicitly builds fresh results

#### Scenario: Untracked file change
- **WHEN** a file change does not supply a reliable edit delta and the old occurrence cannot be identified unambiguously
- **THEN** the old row retains its identity and position in the snapshot but cannot be replaced merely because another match has the same coordinates
