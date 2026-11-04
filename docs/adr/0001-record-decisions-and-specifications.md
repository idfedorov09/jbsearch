# ADR 0001: ADRs and OpenSpec

- Status: Accepted
- Date: 2026-11-03
- Basis: the user's explicit request to use and install ADR/OpenSpec tooling.

## Context

The project is a scaffold with no working search yet. It needs durable decision
records that distinguish current capabilities, user requirements, and agent
proposals.

## Decision

Use Markdown ADRs in `docs/adr/` and OpenSpec in `openspec/`.
Pin OpenSpec 1.16.0 as a devDependency and add `npm run spec:check` to CI.
Maintain the baseline only for verified behavior; keep future requirements in
active changes. Keep the generated Codex workflows in `.agents/skills/`.

## Alternatives

- README only: easy to start with, but mixes decisions with the product description.
- Separate ADR CLI: an unnecessary dependency for ordinary Markdown files.
- Global OpenSpec only: its version depends on the machine; a local lockfile was chosen.

## Consequences

Development requires Node.js 22.12+ and a larger toolchain; the extension runtime
is unchanged. Documents and agent workflows are excluded from the VSIX.
`spec:check` validates structure, but does not prove that requirements are met.
Acceptance of this ADR does not authorize implementation of floating search.

Source: [OpenSpec](https://github.com/Fission-AI/OpenSpec).
