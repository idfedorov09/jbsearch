# Modal query reset

## ADDED Requirements

### Requirement: Immediate parameter reset

The modal SHALL immediately clear previous results, selection, preview and scroll
when query, mask, scope or other search-affecting parameters change, without
waiting for debounce, acknowledgement or the first result. The controller SHALL
invalidate the previous generation and cancel its pending work. Replacement-only
patches SHALL preserve the search generation, rows, selection and preview.

#### Scenario: Optimistic edits and late acknowledgement
- **WHEN** parameters change several times before their host acknowledgements
- **THEN** the latest input remains visible, previous rows stay cleared and older
  generations or acknowledgements do not restore them

#### Scenario: Invalid regex and zero results
- **WHEN** the current query is invalid or a nonempty query finishes with no matches
- **THEN** no previous selection or preview remains, replacement is unavailable,
  and the current error or no-matches state is shown

#### Scenario: Explicit rerun
- **WHEN** an explicit Rerun starts while older work is still completing
- **THEN** it creates a new generation and obsolete batches, completions, previews
  and failures cannot alter that generation

### Requirement: Bound preview delivery

The controller and webview MUST bind previews to the current query generation,
selected result revision, render revision and explicit selection request. A result
ID alone MUST NOT authorize delivery. Unknown or obsolete bindings SHALL be
rejected before publication and on receipt; ordinary keyboard selection and
current preview delivery SHALL remain functional.

#### Scenario: Reused result ID across generations
- **WHEN** an old preview arrives after the new generation selects the same result ID
- **THEN** the old preview is ignored and a correctly bound current preview is accepted

#### Scenario: Rapid repeated selection
- **WHEN** keyboard selection moves from A to B to A before host acknowledgements
- **THEN** an earlier A preview does not satisfy the latest selection request

#### Scenario: Result changes or late asynchronous failure
- **WHEN** a row revision, selection, document version or generation changes while
  document opening or preview rendering is pending
- **THEN** the obsolete completion or failure cannot restore preview or publish a notice

#### Scenario: Validation begins without a text delta
- **WHEN** an existing verified occurrence enters pending validation after a Save or initial document binding
- **THEN** its row revision changes so an older same-ID preview delivery or failure cannot be adopted
- **AND** repeated pending echoes preserve the current revision and normal current-request preview remains available


### Requirement: Valid accessibility selection reference

The virtual results list SHALL expose `aria-activedescendant` only while its
selected row actually exists in the rendered window. Clearing results or
virtualizing the selected row away MUST remove the reference without changing
the preserved logical selection or scrolling it into view automatically.

#### Scenario: Clear or virtualize selected row
- **WHEN** a selected row is removed by reset or lies outside the rendered window
- **THEN** the accessibility reference is absent rather than dangling

#### Scenario: Keyboard returns to a row
- **WHEN** ordinary keyboard navigation selects and reveals a current result
- **THEN** the reference identifies that rendered option and current preview can load
