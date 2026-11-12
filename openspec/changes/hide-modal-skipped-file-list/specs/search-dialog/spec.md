# Spec Delta

## Purpose

Keep the modal search dialog focused on matches and preview while communicating
exclusion counts and incomplete searches without a per-file diagnostic list.

## ADDED Requirements

### Requirement: Compact modal skip diagnostics
The modal search dialog SHALL display only aggregate exclusion and incomplete-input
diagnostics. It MUST NOT render skipped-file paths, per-file reasons, or omitted-path
messages in its diagnostic area. General error, stale-result, and Rerun messages
SHALL remain available.

#### Scenario: Mixed skipped inputs
- **WHEN** a modal search encounters binary exclusions and inputs that could not be searched
- **THEN** its diagnostics distinguish aggregate binary exclusions from incomplete inputs
- **AND** no skipped-file path, per-file reason, or omitted-path message is displayed
- **AND** Replace All remains blocked while results are incomplete

#### Scenario: Only intentional exclusions
- **WHEN** the search completes with confirmed binary exclusions and otherwise valid complete results
- **THEN** the modal shows the binary-exclusion count without a file list
- **AND** intentional exclusions alone do not disable Replace All

#### Scenario: New search generation
- **WHEN** the modal resets its query or starts a new search generation
- **THEN** it clears the previous diagnostic summary immediately
- **AND** a late completion of an old generation does not restore old diagnostics

### Requirement: Preserve detailed review and replacement checks
The native Find Panel SHALL retain bounded representative skipped-file paths and
reasons. Compact modal presentation MUST NOT change search eligibility,
completeness classification, stale-result handling, or replacement admission.

#### Scenario: Open the existing Find Panel
- **WHEN** a completed modal search with skipped inputs is transferred to Find Panel
- **THEN** the panel retains the search's detailed path-and-reason diagnostics
- **AND** the search's incomplete and replacement-guard state is unchanged

#### Scenario: Failed transfer
- **WHEN** a transfer to Find Panel fails and restores an existing search
- **THEN** both its detailed diagnostics and modal summary correspond to the restored search
- **AND** no unrelated search's summary is presented

#### Scenario: Inconsistent statistics
- **WHEN** skipped-input statistics are inconsistent or cannot be classified safely
- **THEN** the search remains incomplete and Replace All is blocked
- **AND** hiding per-file details does not classify those inputs as safe exclusions
