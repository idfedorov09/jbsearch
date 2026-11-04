# Design

## Context

See proposal.md. README currently mixes product description, a detailed manual,
and development history. Verified limitations are already documented in
docs/testing and docs/implementation-limits.md; release status is in
docs/release-readiness.md. The OpenSpec language setting is currently too broad:
All artifacts.

Historical scope note: the language decisions below apply to this original
README-only change. The repository-wide English policy in
adopt-english-project-language supersedes the earlier documentation-language policy.

## Goals / Non-Goals

Preserve the specified section order and provide a concise introduction to
installation and daily use. This change does not alter the internal documentation
language or runtime. No new ADR is needed: there are no architectural decisions,
and implementation rationale remains in the existing ADRs.

## Decisions

1. Make the root README entirely English; establish this rule in AGENTS.md and
   CONTRIBUTING.md, and clarify in the OpenSpec context that Russian applies
   to its artifacts.
2. Mark the Hero and three demos with HTML comments. These are future GIF slots,
   without broken images or generated new media.
3. Install leads to the local Installation section: VSIX packaging is verified,
   but a public Marketplace card is not confirmed. GitHub/bug links come from
   package.json. Use nonfinancial support for Support development because the
   user has not supplied a payment link.
4. Separate Remote capabilities from unfinished physical-connection acceptance;
   do not present Linux checks as evidence for macOS/Windows. Privacy describes
   the absence of an external search service and the client helper boundary,
   without promising the absence of ordinary VS Code/Remote traffic.
5. Preserve icon links from the concurrent change in the new README.

## Risks / Trade-offs

- Condensing the manual → preserve source/VSIX installation, shortcuts, INVALID,
  Rerun, named scopes, and links to technical limitations.
- Unknown Marketplace/donation addresses and future GIFs → keep accurate
  instructions and placeholders; tell the user which materials are still needed.
- Concurrent icon work → edit only README, language rules, and a separate change;
  record these files in a separately authorized commit to `dev`, preserving icon
  changes and build artifacts.
