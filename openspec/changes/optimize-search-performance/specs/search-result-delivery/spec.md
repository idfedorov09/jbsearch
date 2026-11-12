# Search result delivery

## Purpose

Deliver intermediate and complete search results responsively while preserving
session isolation, current-generation state, and replacement safety.

## ADDED Requirements

### Requirement: Coalesce intermediate result delivery
The product SHALL retain each accepted worker result and MAY coalesce intermediate
presentation updates for the same live search. It SHALL deliver the first batch
promptly and SHALL eventually present the complete accepted result snapshot.

#### Scenario: A rapid sequence of batches
- **WHEN** multiple batches arrive in the same live search
- **THEN** the first batch is presented without waiting for subsequent batches
- **AND** later batches may be presented together
- **AND** a coalesced update is scheduled without requiring another batch to arrive

#### Scenario: A search finishes before a scheduled update
- **WHEN** a search completes with an intermediate update still pending
- **THEN** the final snapshot, counts, diagnostics and completion state are presented without waiting for that update
- **AND** the pending update cannot replace the final snapshot

### Requirement: Preserve immediate lifecycle and safety transitions
Coalescing MUST NOT delay immediate query resets, errors, cancellation, closure,
replacement-safety state changes, or allow old-generation updates to affect a
new or disposed search.

#### Scenario: The query changes while delivery is pending
- **WHEN** a query edit resets the search before a scheduled result update
- **THEN** the previous generation's rows and preview are reset immediately
- **AND** the old scheduled update cannot repopulate them

#### Scenario: A session closes while delivery is pending
- **WHEN** a modal or saved search closes before a scheduled result update
- **THEN** its scheduled update is cancelled or rejected
- **AND** it does not notify another session or revive the closed search

#### Scenario: Replacement validity changes
- **WHEN** a result becomes pending, invalid, stale, or otherwise ineligible
- **THEN** that safety change is presented without waiting for a streaming-only update
- **AND** stale or unbound replacement actions remain subject to existing rejection and review requirements
