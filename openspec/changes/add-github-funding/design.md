# Design

## Context

See proposal.md. On 2026-11-04, GitHub reported repository sponsorships enabled,
an empty funding links list, and `master` as the default branch.

## Goals / Non-Goals

Prepare the exact custom funding URL on `dev` without changing remote settings,
publishing a payment link to `master`, or initiating any payment.

## Decisions

- Use the supported `custom` array in `.github/FUNDING.yml` and preserve the
  user-provided URL and query value exactly. GitHub reads the file from the
  [default branch](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository).
- Keep the GitHub Sponsors setting unchanged because it is already enabled.
- Record the default-branch follow-up without transferring or pushing branches.

No ADR is needed for this repository metadata change; architectural decisions
remain in [docs/adr](../../../docs/adr/README.md).

## Risks / Trade-offs

- A malformed YAML value or changed recipient → parse it and compare the exact
  URL with the existing manifest and README links.
- A `dev` commit alone does not activate the button → state the default-branch
  limitation and leave transfer as a separately authorized action.
