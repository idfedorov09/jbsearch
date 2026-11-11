# Spec Delta

## Purpose

Provide verifiable publication of new extension versions from stable-branch
source with restricted access to VS Code Marketplace.

## ADDED Requirements

### Requirement: Publication from the stable branch

The stable release process SHALL use only a `master` commit from the
`idfedorov09/jbsearch` repository and shall not publish stable releases from
other branches or pull requests. Beta publication is specified separately in
`add-beta-publication`.

#### Scenario: Push to master
- **WHEN** a new commit is pushed to `master` in the allowed repository
- **THEN** the process validates that commit's source and, if validation succeeds,
  attempts to publish the version it contains

#### Scenario: Changes in another branch
- **WHEN** changes are pushed to another branch or a pull request is opened
- **THEN** the stable publication process does not run

### Requirement: Validation before publication

The process SHALL run validation and packaging before contacting Marketplace.

#### Scenario: A check fails
- **WHEN** dependency installation, code checks, tests, specification validation,
  or packaging fails
- **THEN** the release fails and publication does not occur

### Requirement: Explicit version

The process SHALL publish the version from the validated `package.json` and
shall not modify repository files, commits, or Git tags.

#### Scenario: New version
- **WHEN** a version that has not yet been published is specified and all checks pass
- **THEN** the process attempts to publish that version

#### Scenario: Repeat of an already published version
- **WHEN** the specified version already exists in Marketplace
- **THEN** repeat publication is skipped without overwriting that version

### Requirement: Trusted authorization

The process SHALL use temporary OIDC credentials with a trusted workflow and a
GitHub Environment restricted to the `master` and explicitly authorized `beta`
branches, without storing a PAT.

#### Scenario: Trust configured
- **WHEN** the restricted environment and publisher policy are configured for the workflow
- **THEN** the publication job receives temporary credentials for Marketplace

#### Scenario: Trust not configured
- **WHEN** issuing or exchanging temporary credentials fails
- **THEN** the process does not publish the extension and reports an error

### Requirement: Failed publication

The process SHALL report publication errors other than an already existing version.

#### Scenario: Marketplace unavailable or release rejected
- **WHEN** publication fails for a reason other than an existing version
- **THEN** the job fails and the error is visible in GitHub Actions
