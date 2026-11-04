# Proposal

## Why

The user requested an English main README with a specific product-page structure.
Preserve that rule for future edits.

## What Changes

- Rewrite the root README using the specified structure while preserving accurate
  capabilities, installation guidance, tested platforms, and limitations.
- Leave four clear slots for future GIFs without nonexistent media URLs.
- Establish English for the root README in AGENTS.md, CONTRIBUTING.md, and the
  OpenSpec context.
- Direct Install to actual installation instructions; do not invent Marketplace
  publication, a donation link, or roadmap deadlines.

The user explicitly authorized the scope: documentation and the language rule.
In a subsequent request, the user also authorized commit and push of this change
to `dev`. Publication and icon changes are outside this task.

## Capabilities

### New Capabilities

None: documentation changes without new extension behavior.

### Modified Capabilities

No product requirement changes. `skip_specs: true`.

## Impact

README.md, AGENTS.md, CONTRIBUTING.md, openspec/config.yaml, and this change.
Runtime, dependencies, and extension version remain unchanged.
