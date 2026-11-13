# Platform gallery publication

## Purpose

Distribute and verify an extension release as target-specific packages and a
universal fallback while retaining controlled gallery publication routes.

## ADDED Requirements

### Requirement: Publish a verified package matrix
Each eligible gallery release SHALL publish the six approved target packages
and a universal fallback using the same extension identity, version, and channel.

#### Scenario: Valid release matrix
- **WHEN** an eligible stable or pre-release publication is authorized and checks pass
- **THEN** the process attempts to publish `win32-x64`, `win32-arm64`, `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, and `universal`
- **AND** each package is checked for the correct target and release marker before publication

### Requirement: Verify exact gallery records
After each publication attempt, the process MUST verify the exact gallery,
extension identity, version, target, channel and package SHA-256 before treating
that target as successful.

#### Scenario: Duplicate skipped
- **WHEN** a publisher skips a package because it is already present
- **THEN** the target succeeds only if its exact published record and digest match the built artifact

#### Scenario: Wrong target or digest
- **WHEN** a gallery returns universal fallback for a target request, or a target's identity, version, channel or digest differs
- **THEN** verification fails rather than treating the target as published correctly

### Requirement: Report partial and uncertain publication
The publication process MUST stop on failure and report that a target may have
been uploaded and that prior targets may already have been published. A bounded
retry SHALL allow for gallery propagation before reporting verification failure.

#### Scenario: Delayed gallery metadata
- **WHEN** valid metadata appears within the retry window
- **THEN** exact target verification succeeds without republishing the package

#### Scenario: Failure after earlier targets
- **WHEN** a package upload or its verification fails after an earlier target succeeded
- **THEN** the process reports the confirmed targets and the uncertain target
- **AND** it does not claim that the seven-artifact release completed

### Requirement: Preserve release and authentication boundaries
The existing branch, event, protected environment and authentication boundaries
MUST remain in force for both galleries. Local packaging and tests MUST NOT
publish artifacts.

#### Scenario: Development or beta pull request
- **WHEN** a development push, pull request, or manual beta dispatch runs
- **THEN** it does not publish a pre-release

#### Scenario: Stable Open VSX route
- **WHEN** a master push occurs without manual Open VSX dispatch
- **THEN** it does not trigger Open VSX stable publication

#### Scenario: Unsafe token request
- **WHEN** a token publication would put a secret in a URL or use an unsupported request form
- **THEN** the request is blocked without exposing the secret in logs

### Requirement: Rebuild for safe duplicate verification
Release builds SHALL use deterministic inputs and timestamps so the same source,
toolchain, and environment can reproduce each target's expected digest.

#### Scenario: Re-run after partial publication
- **WHEN** an unchanged eligible release is rebuilt with the same inputs and toolchain
- **THEN** its matching package digest can be compared to an existing gallery record
- **AND** a digest mismatch is reported rather than silently accepted

### Requirement: Separate release preparation from external evidence
Automated preparation MUST NOT be represented as actual gallery publication,
client selection, or runtime acceptance on untested platforms.

#### Scenario: Local validation succeeds
- **WHEN** tests and local matrix builds pass without an authorized publication
- **THEN** the report identifies gallery and platform acceptance as pending
