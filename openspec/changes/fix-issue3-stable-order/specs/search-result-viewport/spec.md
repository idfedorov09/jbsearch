# Modal search result viewport

## Purpose

Keep the modal result list usable while its existing background search delivers
updates and while the user browses already collected matches.

## ADDED Requirements

### Requirement: Modal results remain virtualized
The modal SHALL render a bounded window of collected results and MUST NOT start
or continue a search as a consequence of scrolling.

#### Scenario: Browse a long collected list
- **WHEN** the user scrolls through an existing search's results
- **THEN** the result list shows the appropriate collected rows
- **AND** scrolling does not start another search or request a results page

### Requirement: Preserve a modal viewport across compatible updates
While the search generation is unchanged, the modal SHALL retain the identity
and relative offset of the first visible result when that result remains present.

#### Scenario: Results arrive or move around a visible occurrence
- **WHEN** a same-generation update changes the result array without removing the first visible occurrence
- **THEN** that occurrence remains at the same offset within the results viewport
- **AND** the current selection is not changed by viewport restoration

#### Scenario: Explicit query change
- **WHEN** the user changes the query, mask, or scope
- **THEN** the existing immediate result, selection, preview, and scroll reset is retained

#### Scenario: Explicit navigation
- **WHEN** the user navigates to another occurrence
- **THEN** the viewport MAY move as necessary to display the selected occurrence

#### Scenario: Existing rows are revalidated
- **WHEN** same-generation pending, INVALID, revision, or session status changes preserve the anchor's logical ID
- **THEN** its relative viewport offset and logical selection remain unchanged
- **AND** the update does not request a new search

### Requirement: Staleness has one explicit Rerun action
The modal SHALL show exactly one Rerun Search action when either `scopeStale` or
`needsRerun` is set. It SHALL guard against pending parameter patches, search or
replacement work, and duplicate clicks awaiting a generation reset. Immediate
parameter reset SHALL hide both old staleness flags along with the old rows.

#### Scenario: Both staleness sources are present
- **WHEN** `scopeStale` and `needsRerun` are both true
- **THEN** one Rerun button is presented
- **AND** clicking it once requests an explicit generation-bound refresh
- **AND** scrolling and status updates do not request a search
