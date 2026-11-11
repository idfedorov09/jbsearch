# Design

## Context

See the proposal. Existing contributor guidance already has the general SemVer
rule. The Marketplace and Open VSX guides describe distinct numeric versions,
pre-release markers, reviewed beta PR provenance, and separate authorization;
[ADR 0015](../../../docs/adr/0015-beta-push-publication.md) records the beta
publishing decision. Neither a Git tag nor a draft OpenSpec change is a release.

## Goals / Non-Goals

**Goals:** Make the decision reproducible and distinguish source guidance from
project choices. Preserve first-`1.x` as an explicit compatibility commitment.

**Non-Goals:** Change a version or workflow, expand platform claims, create a
new product capability, or decide that any candidate is published or accepted.

## Decisions

- Use `docs/versioning.md` as the policy and short references in AGENTS.md and
  CONTRIBUTING.md instead of duplicating mutable rules in multiple documents.
- Apply SemVer's post-`1.0` compatibility rules and explicitly adopt a more
  conservative project convention for `0.x`; a bug label or change size alone
  does not determine the bump. Assess the broadest applicable change in a batch.
- Treat channel marking as separate from numeric versioning. Microsoft's
  minor-number parity is a recommendation, not a requirement; requiring it here
  could distort the semantic bump. Keep later stable greater than published beta.
- Require an owner-reviewed public contract and evidence-based scope before the
  first stable `1.x`; do not invent a SemVer requirement to test every platform.
  A marked numeric `1.x` pre-release can gather evidence but is not acceptance.
- Keep the bundled client on an independent version; a main-only change does
  not by itself require a new client artifact.
- Set `skip_specs: true`: changing contributor policy does not alter product or
  automated publishing behavior. Existing product specs stay untouched.

## Risks / Trade-offs

- A more cautious `0.x` rule can produce a larger bump than SemVer requires →
  identify it as a project convention and describe compatible pure fixes as patch.
- A safety change may be mistaken for compatible → review action admission and
  migration impacts rather than assuming compatibility from intent.
- A numeric `1.0.0` pre-release can look stable to SemVer-only tools → explain
  the separate marker and require an explicit owner decision.
- Published-version reuse or an unreviewed beta merge could have external effects
  → preserve immutable versions and the existing PR/environment/release gates.

## Migration Plan

Review the policy and source attributions, validate OpenSpec and documentation
links, then report the change for review. No Git operation, release, or package
migration is part of this documentation task.
