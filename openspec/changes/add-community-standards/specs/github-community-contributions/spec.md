## Purpose

Help GitHub visitors contribute useful reports and changes and find private
channels for security and community concerns.

## ADDED Requirements

### Requirement: Private channels for sensitive reports
The repository SHALL provide community conduct and security policies with a private contact method for each type of report.

#### Scenario: Reporting a sensitive concern
- **WHEN** a visitor reads either policy
- **THEN** they can find a private reporting contact without needing to create a public issue

#### Scenario: Choosing a supported version
- **WHEN** a visitor reads the security policy
- **THEN** they can identify which project version or development state receives security fixes

### Requirement: Structured issue reporting
The repository SHALL provide GitHub issue forms for bugs and feature requests while permitting a blank issue.

#### Scenario: Reporting an extension bug
- **WHEN** the bug form is available in the default branch and a visitor opens it
- **THEN** it requests reproduction details, expected and actual behavior, editor and extension versions, operating system, and local or remote context

#### Scenario: Suggesting an improvement
- **WHEN** the feature form is available in the default branch and a visitor opens it
- **THEN** it requests the problem and desired outcome while allowing optional context

### Requirement: Pull request guidance
The repository SHALL provide a pull request template that asks for the change, relevant issue, checks, and applicable manual verification.

#### Scenario: Describing a change
- **WHEN** the pull request template is available in the default branch and a contributor opens a pull request
- **THEN** they can describe what changed and distinguish automated checks from actual manual checks or their absence
