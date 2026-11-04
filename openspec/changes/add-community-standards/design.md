# Design

## Context

GitHub currently uses `master` as its default branch while development takes
place on `dev`. The maintainer has a publicly listed GitHub profile email.
Private vulnerability reporting is disabled. See the proposal for scope.

## Goals / Non-Goals

**Goals:** Provide useful, approachable reporting paths and templates that
GitHub can recognize when the files reach the default branch.

**Non-Goals:** Changing repository settings, publishing or transferring
history to `master`, enabling GitHub's private reporting, requiring a public
reproduction repository, or adding extension runtime features.

## Decisions

- Put policies in `.github/` and preserve Contributor Covenant 3.0's
  attribution and CC BY-SA 4.0 notice. Use the maintainer's existing public
  profile email for both types of private report; do not promise a response
  deadline or claim mail delivery was tested. A GitHub private advisory link
  alone would be unusable while that separate setting is disabled.
- Use GitHub issue forms with a small required core and optional logs and
  attachments. Keep blank issues enabled for reports that do not fit. The
  chooser's security link points to the policy, not a public issue.
- Use a Markdown pull request template with free text for actual check results
  and manual checks. A blanket checklist can imply tests ran when they did not.
- Place the proposed About text in the change record for a later separately
  authorized repository-settings change. GitHub About is not controlled by
  `package.json`.

GitHub documents supported locations and default-branch discovery in
[About issue and pull request templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates)
and the distinct setting in
[Configuring private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository).
This change introduces no extension architecture decision requiring an ADR.

## Risks / Trade-offs

- GitHub cannot activate the forms or discover the policies from `dev` while
  `master` remains the default branch → record this and do not claim live UI
  validation.
- A public address can change or stop receiving mail → use the address already
  published by the maintainer and clearly report that delivery was not tested.
- An issue may contain private source or logs → prompt reporters to remove
  sensitive data and use the security policy for vulnerability reports.

## Migration Plan

Commit and push to `dev`. A later separately approved transfer to the default
branch can activate the templates and policies. Verify the GitHub chooser,
policy, PR template, and Community Standards page after such a transfer;
rollback consists of reverting the files on the affected branch.

Suggested GitHub About description for later configuration:

> JetBrains-style Find & Replace for VS Code, with a floating dialog,
> project-wide search, and theme-aware previews.
