# Tracked search occurrences

## Purpose

Keep individual search occurrences safe and understandable when source documents change before replacement.

## ADDED Requirements

### Requirement: Preserve and validate known occurrences
The product SHALL retain occurrence identity and order within a completed snapshot while tracking reliable document edits, and SHALL validate the original search condition on the current document before allowing replacement.

#### Scenario: Context changes outside a match
- **WHEN** a document edit changes regex context while leaving the matched text intact
- **THEN** affected occurrences remain in the snapshot and are not replaceable until checked against the full current document
- **AND** a successful check refreshes the current captures and replacement data

#### Scenario: An occurrence changes but continues to match
- **WHEN** an edit preserves an unambiguous tracked occurrence but changes its text
- **THEN** the occurrence retains its identity and order and is checked before it can be replaced

### Requirement: Block unknown occurrence identity
The product MUST NOT use matching old coordinates or matching text alone as proof that an occurrence survived an ambiguous or untracked change.

#### Scenario: External insertion with duplicate text
- **WHEN** an external change without a reliable edit delta inserts a duplicate match at the old position
- **THEN** the old occurrence is marked unverified and cannot be replaced without a new search

#### Scenario: Several occurrences collapse
- **WHEN** a single change makes it ambiguous which of several old occurrences corresponds to a current match
- **THEN** none of the ambiguous old occurrences can be replaced merely because the new match occupies their tracked range

### Requirement: Reject unverified or unrepresentable replacement
The product MUST block individual replacement for pending, invalid, unavailable, or identity-unknown occurrences and for ranges that cannot be represented exactly as editor ranges.

#### Scenario: Half of a CRLF sequence
- **WHEN** an occurrence boundary lies between CR and LF and is not representable as an editor position
- **THEN** replacement is blocked with an explanation and no source text is modified

#### Scenario: Validation failure or obsolete action
- **WHEN** validation fails or a replacement action refers to an obsolete displayed result or document revision
- **THEN** the action does not modify source text and the user is told to retry or rerun the search

### Requirement: Separate initial source authority from current buffer validity
Initial clean file searches SHALL use disk authority, including Open Editors, while dirty file searches SHALL use a bounded current buffer snapshot and an independent stable raw-byte disk baseline. Buffer revalidation MUST NOT replace that source disk provenance or silently compare dirty text with disk.

#### Scenario: Stale clean zero-match editor
- **WHEN** an initially clean Open Editors buffer has no matches but its actual disk file has matches
- **THEN** initial search finds the disk matches rather than trusting the cached clean text
- **AND** a later buffer check does not treat equal old coordinates as proof of unknown occurrence identity

#### Scenario: Known dirty buffer and independent disk observation
- **WHEN** a dirty file has known tracked occurrences and the independently observed disk bytes remain unchanged
- **THEN** full-context validation can keep those occurrences usable even though the dirty text differs from disk
- **AND** a changed or unavailable independent disk baseline blocks replacement without substituting the buffer text as disk evidence

#### Scenario: Bounded or unavailable input
- **WHEN** a document cannot be bounded before a whole-text read, exceeds the configured size budget, or its required disk baseline cannot be obtained
- **THEN** the search reports blocking incompleteness or unavailable provenance instead of inventing an empty complete snapshot
- **AND** visible dirty-buffer matches without the required baseline remain nonreplaceable
- **AND** untitled buffers do not require a disk overwrite baseline

#### Scenario: Unsupported or conflicting encoding
- **WHEN** an initial clean opened file declares an unsupported codec or a supported Unicode codec conflicts with its disk BOM
- **THEN** search reports a blocking encoding skip rather than guessing a legacy codec or using lossy conversion

### Requirement: Rebase only an observed clean saved state
A changed disk baseline SHALL be eligible for lazy rebase only after an observed Save when strict bounded lossless disk reading equals the current clean saved document and all generation, request, event-epoch, row-revision, known-identity, same-document-object, URI, version, exact UTF-16 hash and encoding guards remain current across asynchronous preparation. This contract establishes state equality, not writer provenance, historical identity recovery or filesystem compare-and-swap.

#### Scenario: Atomic Save changes inode
- **WHEN** a continuously tracked document is observed saved and an atomic Save replaces its inode with the same current clean saved text
- **THEN** guarded lazy preparation can return a new immutable disk baseline without changing the approved occurrence set
- **AND** another writer producing exactly that saved state is not claimed distinguishable by authorship

#### Scenario: Save evidence becomes stale
- **WHEN** the document closes, changes object binding, URI, version, content, encoding or clean state, or its request, generation, event epoch or occurrence revision changes during preparation
- **THEN** stale Save evidence cannot authorize replacement
- **AND** unknown occurrence identity is not revived by equal disk bytes

#### Scenario: Explicit link policy cannot downgrade
- **WHEN** a disk baseline is captured with a recorded no-follow or identity-validated policy
- **THEN** subsequent checks preserve that policy
- **AND** observed-Save rebase requires strict no-follow reading and refuses with Rerun guidance when the host lacks that capability
- **AND** this refusal does not disable unrelated unchanged identity-validated baselines or untitled buffers

### Requirement: Bound physical baseline preparation independently of callers
Baseline preparation SHALL use a controller-owned bounded physical-operation lane whose active capacity is retained until the complete underlying read and close actually settle. Caller cancellation or a preparation deadline MUST suppress late dispatch but MUST NOT be represented as cancellation of the underlying filesystem operation.

#### Scenario: Timed-out filesystem call settles later
- **WHEN** a baseline operation outlives its caller's preparation deadline
- **THEN** the caller stops waiting and cannot submit a late edit
- **AND** the operation continues occupying its bounded physical slot until actual cleanup settles
- **AND** expired queued operations do not start later

### Requirement: Retain accepted raw observations separately from historical provenance
A finally guarded accepted Save rebase SHALL be eligible as private current raw
disk authority for later continuously known occurrences without mutating historical
row or approval provenance. Later actions MUST still verify its actual raw bytes.

#### Scenario: A second surviving Single follows accepted Save rebase
- **WHEN** a first Single accepts an observed clean Save baseline and produces a known document delta
- **THEN** a surviving separately verified occurrence can use that accepted raw observation while its disk bytes remain unchanged
- **AND** the Save ticket expires normally and a destroyed first occurrence never revives

#### Scenario: Completed authority changes owners
- **WHEN** confirm or Keep as new transfers completed known rows to a different session
- **THEN** same-document bounded version/hash/encoding and known history evidence is positively renewed into destination-owned records
- **AND** eligible Save and accepted raw observations are distinct from original pending validation deadlines
- **AND** unrenewable proof is explicitly INVALID with Rerun guidance

### Requirement: Bound the actual modal preview source read
The modal renderer MUST bound a whole-document read with its configured/hard
snapshot limit after asynchronous resource loading, before copying or splitting
source text, including when inspecting INVALID rows.

#### Scenario: A document grows while theme loading awaits
- **WHEN** a retained source exceeds the preview snapshot limit before the renderer's actual read
- **THEN** preview reports unavailable without requesting the unbounded whole text
- **AND** bounded INVALID inspection remains available without authorizing replacement
