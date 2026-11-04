# Proposal

## Why

People need clear, lightweight ways to contribute, report bugs, and disclose
security or community concerns privately. The repository currently lacks these
community files and GitHub templates.

## What Changes

- Add a Contributor Covenant code of conduct with the maintainer's existing
  public contact address for confidential reports.
- Add a security policy with supported-version guidance and a private email
  reporting channel. Do not claim that GitHub private vulnerability reporting
  is enabled.
- Add concise bug-report and feature-request issue forms and a pull request
  template, adapted to a VS Code extension and its remote environments.
- Link contributors to the new guidance and document GitHub's default-branch
  and repository-settings prerequisites.

## Capabilities

### New Capabilities

- `github-community-contributions`: Repository guidance and templates for
  community participation, private reports, issues, and pull requests.

### Modified Capabilities

None.

## Impact

The work affects repository documentation, GitHub template files, and OpenSpec
artifacts only; it adds no extension runtime dependencies. The user approved
implementation, commit, and push to `dev`. GitHub About, private vulnerability
reporting, the default branch, and `master` remain outside the authorized scope.
GitHub cannot expose the templates until they reach its default branch. No
platform-specific editor behavior is changed or needs a manual VS Code check.
