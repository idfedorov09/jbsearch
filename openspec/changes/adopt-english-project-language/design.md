# Design

## Context

The initial scan found Russian prose in 74 tracked text files, mainly Markdown.
Before this change, OpenSpec context required Russian artifacts, while README
policy already required English. A few test literals deliberately exercise
Cyrillic text and localized theme names. The working tree was clean on `dev`
before this change.

## Goals / Non-Goals

Translate authored text and make English the consistent language of future
repository work. Preserve technical content, maturity/status distinctions,
verification limits, existing checkboxes, and source identifiers. User-facing
conversation stays Russian. Runtime behavior and historical binary evidence
are outside this editorial change.

## Decisions

- Translate documents in place so existing paths remain valid. Repair heading
  fragments if translation changes their targets. Keep requirement/scenario
  names aligned between main specs and deltas.
- Update AGENTS.md, CONTRIBUTING.md, openspec/README.md, and config context to
  apply the English policy throughout the repository. Describe prior language
  choices as historical decisions superseded by this user request.
- Preserve data that tests Unicode and localization using JavaScript Unicode
  escapes. Translating those values into ASCII would remove test coverage.
- Keep JSON evidence, screenshots, recorded hashes, versions, dates, command
  identifiers, package names, and Git history unchanged. Translate explanatory
  prose around that evidence without claiming that earlier tests were rerun.
- Use `skip_specs: true`: existing specifications change language only, with
  no new product capability or requirement semantics.

## Risks / Trade-offs

- Translation could change a constraint or imply completion → preserve modal
  verbs, status labels, unchecked tasks, and platform limitations; review diffs.
- Heading translation could break links → inspect and validate local targets
  and heading fragments after all translations are complete.
- A blanket Cyrillic removal could weaken Unicode tests → compare evaluated
  string literals and run the existing suite after escaping the fixtures.
- Historical notes could conflict with the new policy → retain their context
  and explicitly record the superseding repository-wide language decision.

## Migration Plan

Translate and review the files, then run check, tests, and strict OpenSpec
validation. Scan tracked text for remaining Cyrillic and review any intentional
non-English data. No packaging or GUI rerun is needed for editorial changes;
existing platform and validation evidence retains its original scope.
