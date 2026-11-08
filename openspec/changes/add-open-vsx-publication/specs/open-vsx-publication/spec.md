# Spec Delta

## Purpose

Prepare a controlled GitHub Actions workflow for publishing the verified stable
extension package to Open VSX without enabling automatic releases.

## ADDED Requirements

### Requirement: Manual stable-branch publication

The Open VSX publication workflow SHALL run only on manual dispatch, and its
jobs SHALL be restricted to `master` in `idfedorov09/jbsearch`.

#### Scenario: Push or pull request
- **WHEN** a commit is pushed or a pull request is opened
- **THEN** the Open VSX publication workflow does not start

#### Scenario: Dispatch from another ref or repository
- **WHEN** the workflow is dispatched from another ref or repository
- **THEN** neither validation nor a publication job executes

### Requirement: Validation and verified package

Publication SHALL depend on successful checks and SHALL upload the prepared
VSIX from the publication runner after package verification.

#### Scenario: Failed validation
- **WHEN** installation, checks, tests, specification validation, or packaging fails
- **THEN** neither publication job runs

#### Scenario: Successful publication preparation
- **WHEN** a publication job runs after successful validation
- **THEN** it builds and verifies the main VSIX including the bundled client before upload

### Requirement: Separate bootstrap and trusted credentials

The workflow SHALL provide mutually exclusive token and trusted-publishing
modes protected by the `open-vsx` GitHub Environment.

#### Scenario: Bootstrap token
- **WHEN** token mode is selected and the Environment secret is missing
- **THEN** publication fails without requesting an OIDC token

#### Scenario: Trusted publishing
- **WHEN** trusted mode is selected
- **THEN** the job requests an OIDC token, requires trusted publishing, and receives no PAT secret

### Requirement: Explicit immutable version

The workflow SHALL attempt to publish the version in `package.json` and SHALL
not commit, tag, bump, or replace a published version.

#### Scenario: Duplicate version
- **WHEN** Open VSX rejects an already published version
- **THEN** the publication job fails rather than reporting a replacement
