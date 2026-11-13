# Extension distribution

## Purpose

Provide compact, verifiable platform-specific VSIX packages while retaining a
universal fallback with the current native binary inventory.

## ADDED Requirements

### Requirement: Build a platform package matrix
The package build SHALL produce distinct VSIX artifacts for `win32-x64`,
`win32-arm64`, `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, and
an additional universal fallback, without overwriting one artifact with another.

#### Scenario: Build all artifacts
- **WHEN** a maintainer requests a complete matrix build
- **THEN** the build produces six platform-specific VSIX files and one universal VSIX file
- **AND** every file has a distinct output path

#### Scenario: Unknown target
- **WHEN** a maintainer requests an unsupported matrix target
- **THEN** the build fails clearly instead of silently producing a different target

### Requirement: Match target metadata and executable
Each platform-specific VSIX MUST declare its requested target and contain exactly
the matching packaged ripgrep executable from the pinned dependency, with an
executable mode where required by its platform.

#### Scenario: Linux x64 target
- **WHEN** the maintainer builds the `linux-x64` artifact
- **THEN** its target metadata identifies `linux-x64`
- **AND** its only packaged ripgrep binary is the executable `linux-x64/rg`

#### Scenario: Windows ARM target
- **WHEN** the maintainer builds the `win32-arm64` artifact
- **THEN** its target metadata identifies `win32-arm64`
- **AND** its only packaged ripgrep binary is `win32-arm64/rg.exe`

#### Scenario: Incorrect or extra binary
- **WHEN** a candidate target package is missing its matching executable or contains another target's ripgrep executable
- **THEN** verification rejects the package

### Requirement: Preserve the universal binary inventory
The universal VSIX MUST remain eligible as a universal fallback and contain all
12 ripgrep executables bundled by the current pinned dependency.

#### Scenario: Universal package
- **WHEN** the universal artifact is built and verified
- **THEN** its metadata does not declare a platform-specific target
- **AND** the archive contains the existing two macOS, seven Linux, and three Windows ripgrep executables
- **AND** the Unix executables retain executable mode

#### Scenario: Incomplete fallback
- **WHEN** any of the 12 current ripgrep executables is absent from the universal candidate
- **THEN** verification rejects the package

### Requirement: Keep required runtime resources
Each artifact MUST preserve the extension identity, main runtime, icon, UI
resources, declared runtime dependencies, preview resources, and bundled UI client
needed by the existing local and Remote workflows.

#### Scenario: Equivalent package contents
- **WHEN** the seven artifacts from one build are inspected
- **THEN** they contain the same extension ID, numeric version, application resources, and bundled client
- **AND** they differ in target metadata and native ripgrep inventory as specified for their targets

#### Scenario: Missing runtime resource
- **WHEN** a candidate lacks a required icon, runtime dependency, worker, preview resource, or bundled client
- **THEN** verification rejects that candidate

### Requirement: Omit demonstration images from VSIX
VSIX artifacts MUST omit the repository's demonstration GIF and screenshots while
retaining the extension icon and usable README references to the illustrations.

#### Scenario: Packaged illustrations
- **WHEN** any of the seven artifacts is inspected
- **THEN** no file under the repository's `images/` demonstration directory is packaged
- **AND** the packaged README retains HTTPS references to the illustrations
- **AND** the illustrations remain in the repository

### Requirement: Preserve default packaging and release channels
The existing default universal stable and pre-release package commands SHALL
continue to produce their expected universal output path. Matrix artifacts MUST
carry the requested stable or pre-release marker consistently.

#### Scenario: Existing universal command
- **WHEN** an existing default package command is run
- **THEN** it produces and verifies the expected universal VSIX without requiring a platform selection

#### Scenario: Pre-release matrix
- **WHEN** a pre-release matrix is requested
- **THEN** each matrix artifact carries the pre-release marker and the same extension version
- **AND** producing the artifacts does not publish them

### Requirement: Build and verify without modifying source dependencies
Packaging MUST NOT delete or modify the source dependency binaries or packaging
configuration as a side effect, whether a build succeeds or fails.

#### Scenario: Source integrity after a matrix build
- **WHEN** a matrix build completes or fails partway through
- **THEN** the repository's ignore configuration and all 12 installed ripgrep binaries remain intact

#### Scenario: No runtime binary download
- **WHEN** a packaged extension performs a file search
- **THEN** the matching ripgrep executable is available from that package without a runtime binary download

### Requirement: Report package sizes and verification results
The matrix build SHALL report the actual compressed byte size and verification
result for each artifact, including the universal fallback.

#### Scenario: Size comparison
- **WHEN** a complete matrix build succeeds
- **THEN** the report identifies each target, its VSIX size, and its verification result
- **AND** each target-specific VSIX is smaller than the universal fallback from that build

### Requirement: Keep publication separately authorized
Creating or testing artifacts MUST NOT publish them or change an automatic
publication route. Gallery behavior and acceptance MUST be reported separately
from local artifact validation.

#### Scenario: Local package validation
- **WHEN** the maintainer runs the matrix build and automated checks
- **THEN** no registry publication, branch push, tag, or release is performed
- **AND** the result does not claim that either gallery or an untested platform has been validated

#### Scenario: Future distribution
- **WHEN** a maintainer plans to publish the matrix
- **THEN** publication and any change to automatic publication routes require separate authorization
- **AND** target selection, fallback selection, and published artifacts require their own verification

### Requirement: Build artifacts in a non-publishing GitHub Actions matrix
A separate GitHub Actions workflow SHALL build and verify each approved target
and the universal fallback without registry credentials or publication steps.

#### Scenario: Beta build
- **WHEN** the build workflow runs for a `beta` push or a pull request targeting `beta`
- **THEN** every target artifact carries the pre-release marker
- **AND** the workflow does not publish to either extension registry

#### Scenario: Stable or development build
- **WHEN** the build workflow runs for `master`, `dev`, or a pull request not targeting `beta`
- **THEN** every target artifact carries stable metadata
- **AND** the existing stable and pre-release publication workflows are unchanged
