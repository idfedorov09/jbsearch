# Spec Delta

## Purpose

Define the eligible inputs and completeness of text searches, so bulk replacement
is safe and users can understand exclusions and unresolved skipped files.

## ADDED Requirements

### Requirement: Binary inputs are outside text search
The product SHALL exclude inputs identified as binary from text search without
marking results incomplete solely for those exclusions. File names and extensions
MUST NOT by themselves determine that input is binary. The product MUST NOT search
or replace the contents of excluded binary inputs. Detection SHALL check known
unsupported Unicode byte-order marks and likely BOM-less UTF-16/32 before
classifying generic NUL-containing data as binary.

#### Scenario: ZIP alongside text matches
- **WHEN** a search encounters a confirmed ZIP or ZIP-based DOCX and otherwise completes with current, valid text matches
- **THEN** the search is complete for eligible text inputs and Replace All is available
- **AND** applying Replace All changes matching text documents but not the ZIP container
- **AND** the interface identifies that containers were excluded rather than searched

#### Scenario: Large confirmed container
- **WHEN** a ZIP container can be reliably confirmed despite exceeding the maximum text file size
- **THEN** the container is excluded without making the search incomplete
- **AND** the product does not have to read the entire container into memory

#### Scenario: Other binary inputs
- **WHEN** an eligible input has a recognized binary signature or NUL bytes and is not identified as unsupported UTF-16/32
- **THEN** it is excluded without blocking Replace All and its bytes are not searched or replaced
- **AND** the UI identifies the binary exclusion

#### Scenario: Extension is not evidence
- **WHEN** a UTF-8 text document uses a `.docx` or `.zip` extension but is not a confirmed ZIP container
- **THEN** the document is searched as text under the ordinary search rules

#### Scenario: Suspicious or malformed input
- **WHEN** a file contains a ZIP-like prefix but cannot be reliably recognized as a ZIP container
- **THEN** the product does not classify it as a safe container solely from the prefix or name
- **AND** it follows ordinary text eligibility and incomplete-search safeguards

### Requirement: Incomplete inputs block bulk replacement
The product SHALL consider the search incomplete if an eligible input cannot be
checked as supported text or the search does not finish completely. Replace All
MUST remain blocked for incomplete results, including when confirmed containers
are also present.

#### Scenario: Unsupported or unreadable files
- **WHEN** a file has unsupported encoding, is oversized without binary evidence, or cannot be read
- **THEN** the result is incomplete and Replace All is blocked
- **AND** the user is informed that some inputs were not checked

#### Scenario: Other incomplete conditions
- **WHEN** a result limit, search deadline, or enumeration error prevents a complete search
- **THEN** the result is incomplete and Replace All is blocked

#### Scenario: Other replacement guards remain effective
- **WHEN** a result is stale, invalid, or still being checked even though all eligible inputs were searched
- **THEN** the existing freshness and validation rules prevent unsafe replacement

### Requirement: Bounded skip diagnostics
The product SHALL provide bounded diagnostic details identifying representative
excluded and skipped paths and their reasons, distinguish intentionally excluded
containers from blocking failures, and indicate when additional details are omitted.
Path labels MUST distinguish workspace roots when necessary.

#### Scenario: Mixed exclusions and blockers
- **WHEN** the search encounters both a confirmed ZIP and an unreadable or unsupported input
- **THEN** the user can distinguish the intentional ZIP exclusion from a blocking input and see their paths and reasons
- **AND** the search is reported incomplete

#### Scenario: Many skipped files
- **WHEN** the number of skipped or excluded files exceeds the diagnostic detail limit
- **THEN** diagnostic output is bounded and indicates that additional paths were omitted
- **AND** the total or per-category counts still represent the full search outcome
