# Platform gallery publication

## Purpose

Distribute and exactly verify a target-specific extension package matrix in
both galleries while preserving controlled publication and safe recovery.

## ADDED Requirements

### Requirement: Gate and overlap target publication
A release MUST preflight every package and confirm the exact universal record
before any platform-specific upload. Platform-specific uploads MUST remain
sequential while their independent exact registry checks MAY overlap.

#### Scenario: Fallback is not confirmed
- **WHEN** universal publication or its exact verification cannot be confirmed
- **THEN** no platform-specific package is attempted

#### Scenario: Checks overlap sequential writes
- **WHEN** a platform-specific upload has unambiguously succeeded and its exact check is still pending
- **THEN** the next platform-specific upload may begin after any prior upload has completed
- **AND** that earlier target is not counted as confirmed until its exact check succeeds

### Requirement: Bound registry verification requests
The publisher MUST limit concurrently active HTTP verification requests and
MUST NOT consume a request slot while waiting for a retry delay.

#### Scenario: Slow registry metadata
- **WHEN** several targets require repeated verification
- **THEN** concurrent in-flight requests do not exceed the configured bound
- **AND** a waiting retry does not prevent another target from using an available request slot

### Requirement: Resolve ambiguous upload outcomes before proceeding
The publisher MUST NOT start a later upload after an ambiguous upload result
until the exact existing registry record for that target is confirmed. A skipped
or failed upload and a success status that can also mean a duplicate skip are
ambiguous without exact proof.

#### Scenario: Conflicting duplicate
- **WHEN** an upload finds an existing target with different bytes or channel
- **THEN** no later upload begins
- **AND** the conflicting target remains uncertain rather than confirmed

#### Scenario: Upload reports failure after acceptance
- **WHEN** an upload reports failure but its exact registry record and digest are subsequently confirmed
- **THEN** the publisher may continue with the next target
- **AND** the recovery is recorded without claiming the CLI succeeded

### Requirement: Drain and report partial outcomes
The publisher MUST stop starting new uploads when it learns of an upload or
verification failure, await every started check, and report confirmed,
uncertain and unattempted targets. It MUST declare the release complete only
after all seven exact checks succeed.

#### Scenario: Verification fails during a later upload
- **WHEN** an earlier target's verification fails while a later upload is already in progress
- **THEN** no additional upload starts
- **AND** the in-progress upload and all started checks are accounted for before reporting the partial result

#### Scenario: Verification finishes late
- **WHEN** all uploads finish but one exact check is still running
- **THEN** the process waits for that check before reporting completion or failure

### Requirement: Report safe publication diagnostics
Diagnostics MUST distinguish CLI completion from exact registry verification
and report elapsed time and safely classified retry reasons without copying
untrusted errors, credentials, or credential-bearing URLs. The token route
MUST continue suppressing untrusted CLI output.

#### Scenario: Sensitive or unexpected failure
- **WHEN** a registry or publisher failure contains a secret or an unknown message
- **THEN** diagnostics contain only an allowlisted classification or a generic category
- **AND** do not include the raw failure or secret

#### Scenario: Retry and eventual confirmation
- **WHEN** an exact registry check retries and later succeeds
- **THEN** its safe retry category, verification duration and confirmation are observable
- **AND** no diagnostic implies an unmeasured registry-only processing duration
