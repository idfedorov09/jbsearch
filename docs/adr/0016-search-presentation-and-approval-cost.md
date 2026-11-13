# ADR 0016: Bound presentation work without weakening replacement approval

- Status: Accepted
- Date: 2026-11-12

## Context

The result-streaming and replacement contracts in [ADR 0013](0013-stable-result-presentation.md)
and [ADR 0014](0014-replace-all-preflight.md) favor stable presentation and
fail-closed actions. Synthetic measurements found that delivering each worker
batch as a complete presentation snapshot and repeatedly copying/comparing full
approval models can burden the extension host for large result sets. Those
measurements do not establish native VS Code or Remote latency.

## Decision

Keep accepting search batches immediately, but coalesce only intermediate
presentation notifications. Show the first batch and final or error state
promptly. Reset, disposal, stale/invalid/pending safety states, and generation
changes remain immediate; a timer is not a real-time latency guarantee under a
busy event loop. Workbench TreeView and existing final deterministic sorting stay
unchanged.

Ordinary Find does not need a replacement approval model. Before Replace actions
are enabled, a full independent immutable approval must name the displayed model;
stale or missing bindings retain the prior refusal/frozen-review rules. Within a
single approval copy, equivalent shared source subobjects may share their own
immutable replicas, but no mutable input may become part of the approval.
Normalized replacement plans may cache sort keys but continue to use the same
ordering, deep equality and full-scope verification.

## Alternatives

- Buffer every result until completion: reduces intermediate work but changes the
  prompt first-result experience and can leave slow searches blank.
- Reuse current provider state or a single revision as approval: cannot prove the
  prior full client model or safely admit delayed native actions.
- Skip independent Replace All discovery: can miss newly eligible occurrences and
  changes the approved behavior, rather than optimizing it.
- Reimplement the tree as an incremental or virtual custom view: potentially
  valuable later, but larger in scope and subject to different native handles,
  grouping, selection and accessibility risks.

## Consequences

Intermediate counters and rows can update less frequently, but no accepted
result is dropped. Guarded callbacks and normal worker completion remain
necessary to prevent stale generations from repainting. Shared immutable copies
and cached sort keys trade temporary indexing memory and implementation
complexity for potentially less retained duplication and comparison work. The
guarded copy falls back to the original traversal for non-plain inputs, so some
workloads may spend additional CPU on inspection without sharing replicas.
Existing full-scope preflight,
source identity, incomplete-input behavior and fail-closed replacement admission
remain required. Mock measurements are not native rendering or platform
acceptance; each supported environment still needs separate verification.

## References

- [Search result delivery proposal](../../openspec/changes/optimize-search-performance/proposal.md)
- [Search result delivery design](../../openspec/changes/optimize-search-performance/design.md)
- [VS Code TreeDataProvider API](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L12236-L12242)
