# Proposal

## Why

CONTRIBUTING already states the generic SemVer patch/minor/major rule, but it
leaves `0.x`, materially changed workflows, the first `1.x` commitment, mixed
batches, and independent package/channel versions ambiguous. The user
explicitly requested research and a clearer project policy while a release
candidate remains under review.

## What Changes

- Document how to assess user-visible compatibility and select a version,
  including project-specific `0.x` rules and the deliberate first-`1.x` gate.
- Explain numeric pre-release/stable ordering, immutable published artifacts,
  separately versioned client packages, and the applicable external guidance.
- Point AGENTS.md and CONTRIBUTING.md to one canonical policy, without changing
  their branch or publication authorization requirements.

## Capabilities

### New Capabilities

None. This is a repository process and documentation change.

### Modified Capabilities

None. No product or publishing behavior is changed; `skip_specs: true` is set.

## Impact

Only project policy, references, and this OpenSpec change are affected. No
runtime, version, dependency, CI, platform-acceptance, registry, or branch
change is authorized or implied. Previously recorded platform boundaries remain.
