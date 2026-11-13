# Design: Search performance without weaker replacement safety

## Context

Each worker result batch currently builds a fresh controller presentation
snapshot and may reconstruct the native tree. Completed Find also builds a
replacement approval model. Replacement preflight repeatedly serializes plan
comparison keys, and copying a full approval duplicates shared subobjects.
The user authorized the four corresponding optimizations. See the proposal and
`search-result-delivery` spec for behavior.

## Goals / Non-Goals

**Goals:** Lower repeated synchronous work and retained duplication while
retaining complete results, current-generation routing, exact preflight
semantics, immutable independently owned approval state and existing limits.

**Non-Goals:** Changing native TreeView APIs, waiting for search completion
before first results, replacing snapshot-only results as if they were a complete
scope, removing full-scope preflight, weakening authority/provenance checks,
changing default search limits, adding dependencies or promising platform
performance from synthetic runs.

## Decisions

1. **Presentation-only coalescing.** Accept every worker batch immediately;
   show the first promptly, schedule at most one pending intermediate refresh
   per session/generation (initially 50 ms), and flush final/error/reset/safety
   transitions immediately. Protect scheduled callbacks with session identity,
   generation and cancellation on reset, transfer, close and dispose. A timeout
   is a scheduling bound subject to event-loop load, not a real-time guarantee.
   Do not debounce all controller notifications or delay worker consumption.
2. **Do not create replacement approval for Find-only sessions.** Clear any
   prior approval when entering Find. Navigation continues to use generation,
   row revision and immutable native handle checks. Entering Replace must
   construct and present a current full approval before accepting replacement;
   missing or stale bindings retain existing fail-closed/review behavior. Do not
   mint a token only after an old command arrives.
3. **Cache plan sort keys, not equality proofs.** Normalize each plan as before,
   compute its JSON sort key once, and preserve comparator and stable-tie order;
   compare the normalized plans using the existing deep equality. Test special
   scalar values and duplicate-key ties, not merely typical serialized strings.
4. **Memoize equivalent objects within an independent approval copy.** A single
   copy may share its own frozen replicas where source subobjects are shared; it
   MUST NOT share mutable input objects. Preserve supported array/object/undefined
   and special-key copy behavior and retain mutation detection at admission.
   Do not replace structural proof with an unaudited version-only cache.

The immutable-action and full-scope contracts from
[ADR 0013](../../../docs/adr/0013-stable-result-presentation.md) and
[ADR 0014](../../../docs/adr/0014-replace-all-preflight.md) remain authoritative.
The native workbench still owns TreeView handles and rendering.

## Risks / Trade-offs

- [Intermediate rows appear less often] → First, final and non-stream safety
  updates remain prompt; no results are dropped or delayed indefinitely.
- [A late timer can overwrite a new session] → Identity/generation guards and
  deterministic reset, transfer, close, error and disposal tests.
- [Find/Replace transitions or shared copies admit stale actions] → Compare
  against existing action-binding and replacement-race suites; test mutated
  nested captures, changed replacement parameters, and old native handles.
- [Serialization-key collisions change plan equality] → Preserve original
  deep-equality evaluation and stable ordering, including collision cases.
- [Mock benchmarks misrepresent actual workbench responsiveness] → Record
  workload, runtime, CPU/RSS scope and native/Remote acceptance separately.

## Migration and rollback

No migration or configuration is required. Revert the feature branch if its
safety or performance regressions cannot be resolved. No publishing or merge is
implied by this design.
