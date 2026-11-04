# Proposal

## Why

The project currently mixes Russian and English across contributor guidance,
architecture records, specifications, and validation reports. The user requested
English for all repository content and future project work, while keeping our
conversation in Russian.

## What Changes

- Translate existing Russian project prose into English, including historical
  OpenSpec changes, baseline specs, ADRs, research, test reports, and changelog.
- Extend the language policy in AGENTS.md, CONTRIBUTING.md, and OpenSpec context
  from the root README to the entire repository.
- Keep technical meaning, requirement and scenario relationships, task states,
  status history, dates, evidence, commands, paths, and URLs intact.
- Preserve intentional Unicode and localization test data, representing Cyrillic
  fixture values with escapes so source prose remains English.
- Check translated headings and links, OpenSpec validity, and existing tests.

The user explicitly authorized this translation and ongoing language policy.
Product behavior, release version, dependencies, historical Git commits, binary
evidence, and publication are outside this change's scope.

## Capabilities

### New Capabilities

None. This is an editorial and project-process change.

### Modified Capabilities

None. Existing specs are translated without changing their requirements.
This change declares `skip_specs: true`.

## Impact

Repository documentation and language guidance, plus the source representation
of intentional Unicode test fixtures. No runtime implementation changes.
