# Proposal: Reduce search and replacement overhead

## Why

Synthetic measurements of the 0.4 search workflow show repeated presentation
work for streamed results and unnecessary copying, allocation and sorting in
completed search and replacement paths. These costs grow with result counts and
can block the extension host or increase memory pressure.

## What Changes

- Coalesce only intermediate same-generation search-result notifications while
  continuing to retain all worker results, deliver the first batch promptly,
  and publish final, reset, error, cancellation, and safety states immediately.
- Avoid creating a replacement approval model for ordinary Find sessions; a
  completed Replace model MUST be bound to the displayed model before actions
  can be accepted.
- Reuse precomputed comparison keys for replacement-plan sorting while retaining
  the exact existing normalized deep-comparison semantics.
- Share immutable copies of repeated model subobjects within an approval copy,
  without sharing mutable inputs or weakening approval/admission checks.
- Add deterministic lifecycle, safety, equivalence and reproducible synthetic
  performance checks. Preserve native-platform acceptance as a separate task.

## Capabilities

### New Capabilities

- `search-result-delivery`: Bounded coalescing and lifecycle correctness of
  intermediate results delivered to the search presentation.

### Modified Capabilities

None. Existing search-snapshot, navigation and replacement safety contracts
remain in force; the internal representation and comparison changes preserve
rather than redefine those behaviors.

## Scope and authorization

The user authorized implementation of the four discussed optimizations on a
separate feature branch. The first intermediate display may be followed by
coalesced updates; neither user-facing limits nor replacement guarantees are
reduced. No publication, dependency addition, or release is authorized.

## Impact and limits

The controller, search presentation, approval copying, preflight comparison,
focused tests and performance fixtures may change. Measurements from Node mocks
are not a native VS Code or physical Remote acceptance. Windows, WSL, macOS and
physical Remote remain unverified until independently tested.
