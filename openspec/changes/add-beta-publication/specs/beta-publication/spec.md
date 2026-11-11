# Spec Delta

## Purpose

Provide controlled publication of verified opt-in pre-releases while preserving
independent stable publication routes and honest verification evidence.

## ADDED Requirements

### Requirement: Pull request review before beta changes

Changes SHALL reach `beta` only through a reviewed `dev` to `beta` pull request,
linked to the relevant issue without automatically closing it.

#### Scenario: Beta-targeted pull request
- **WHEN** a pull request targets `beta` from `dev`
- **THEN** ordinary validation runs and no prerelease is published until a later eligible beta push

### Requirement: Beta push is the sole prerelease trigger

The process SHALL attempt prerelease publication only for a non-deletion,
non-force `beta` push in the allowed repository, after successful validation and
package checks.

#### Scenario: Authorized beta push
- **WHEN** an eligible `beta` push passes all checks
- **THEN** the process attempts to publish the checked prerelease to both registries

#### Scenario: Other events
- **WHEN** a `dev` push, pull request, tag, manual `beta` dispatch, forced or deleted beta push, or foreign-repository event occurs
- **THEN** neither beta publication job runs

### Requirement: Stable paths remain separate

The process SHALL retain Marketplace stable publication from `master` pushes or
manual dispatch, and Open VSX stable publication only from a `master` manual dispatch.

#### Scenario: Stable push
- **WHEN** an eligible `master` push occurs
- **THEN** Marketplace follows its stable path and Open VSX does not automatically publish

### Requirement: Correct prerelease package identity

The prerelease SHALL use the existing extension ID and a distinct numeric
version, and the uploaded outer VSIX SHALL carry the prerelease marker.

#### Scenario: Missing or wrong marker
- **WHEN** the package identity, version, or prerelease marker is incorrect
- **THEN** package verification fails before publication

### Requirement: Verified immutable publication

The process SHALL verify each registry's exact version, prerelease marker, and
package digest, and SHALL NOT treat a duplicate skip alone as proof of success.

#### Scenario: Matching duplicate
- **WHEN** the exact version is already published with matching identity, prerelease marker, and digest
- **THEN** verification succeeds without replacing the version

#### Scenario: Conflicting duplicate or unavailable registry
- **WHEN** the version metadata or digest differs, or verification remains unavailable
- **THEN** the job fails and reports that publication may already have occurred

### Requirement: Restrict publication authority

Publication SHALL use protected environments and isolated authentication with no
implicit credential fallback or unnecessary job-wide token permission.

#### Scenario: Beta authentication
- **WHEN** a beta push reaches its publication jobs
- **THEN** Marketplace uses its trusted route and Open VSX uses its explicit token route

#### Scenario: Credential-bearing URL or unknown request form
- **WHEN** an Open VSX token publication would send credentials in a URL or use an unsupported request form
- **THEN** it fails before the unsafe request is sent and does not expose the token in logs

### Requirement: Do not infer platform acceptance

A beta release SHALL NOT be represented as proof of Windows, WSL, physical Remote,
or unperformed native editor acceptance.

#### Scenario: Automated checks succeed
- **WHEN** local tests or package checks pass
- **THEN** separately pending real-editor and platform checks remain documented
