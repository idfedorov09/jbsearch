# Stable search snapshots

## Purpose

Keep completed search results usable while source files and open documents
change, without silently incorporating new matches into the displayed search.

## ADDED Requirements

### Requirement: Completed modal snapshot is retained
After a search completes, the modal SHALL retain its displayed occurrences and
selection when source files or documents change. A source event MUST NOT itself
start a new search or add occurrences to the displayed snapshot.

#### Scenario: Relevant source change
- **WHEN** a file or open document within the search scope changes after a search completes
- **THEN** the displayed occurrences remain in their previous order
- **AND** newly matching occurrences are not added until the user reruns the search

#### Scenario: Unrelated file event
- **WHEN** an unrelated file is created, changed, or deleted
- **THEN** the displayed results, selection, and search generation remain unchanged

### Requirement: Changed occurrences are checked conservatively
An occurrence affected by a change SHALL be unverified until it is checked. An
occurrence whose identity or validity cannot be established MUST NOT be replaced.

#### Scenario: File changes while searching
- **WHEN** a source event occurs while the initial search is running
- **THEN** potentially affected results are not presented as verified without a safe check
- **AND** repeated file events do not repeatedly cancel the search
- **AND** initial completeness is conservatively marked partial, without claiming that a match was necessarily lost

#### Scenario: A completed snapshot becomes stale
- **WHEN** a relevant source event arrives only after enumeration completes
- **THEN** the scope is marked potentially stale and its event revision advances
- **AND** the event does not retroactively mark initial enumeration partial

#### Scenario: A document closes before a validation opening returns
- **WHEN** Close arrives while an existing occurrence is waiting for its document, before any version binding exists
- **THEN** the logical check is canceled and its existing occurrences remain invalid
- **AND** late opening success cannot start a worker or restore those rows

#### Scenario: Membership rules change during initial enumeration
- **WHEN** a delivered ignore-rule change or file creation/deletion may alter which files belong to the search
- **THEN** already published and later results from that enumeration are treated as unverified
- **AND** the search is not silently restarted

#### Scenario: A document without saved matches is saved or closed
- **WHEN** a relevant document is saved or closed, including while a replacement is being prepared
- **THEN** the session's scope revision advances even when that document has no saved match
- **AND** the event alone does not establish the origin of a disk write

#### Scenario: A metadata-only document notification arrives
- **WHEN** a relevant document change has no text edit delta
- **THEN** the session's scope revision advances
- **AND** the notification is not treated as a known text edit

#### Scenario: Uncertain external edit
- **WHEN** an existing occurrence is affected by an external change without a reliable edit delta
- **THEN** it remains unverified or invalid until a fresh search establishes a new snapshot

#### Scenario: Validation opening times out
- **WHEN** the per-file document opening does not complete before its deadline
- **THEN** affected occurrences are invalid and cannot be replaced
- **AND** a late response cannot make those occurrences valid
- **AND** a physical opening remains counted until it actually settles

#### Scenario: Changed source detected when opening a result
- **WHEN** activation detects that the source no longer matches the saved occurrence
- **THEN** affected occurrences remain invalid without automatically rerunning the search
- **AND** the user is directed to rerun the search

### Requirement: Physical openings and validation waiting are bounded
The controller MUST share one physical opening gate across its initial search,
validation, preview, activation and replacement preparation document opens.
The default limit SHALL be four actual openings and 512 FIFO waiters. A timeout,
cancellation or disposal MUST NOT release a running physical opening before its
underlying operation settles. Logical waiting SHALL have a bounded deadline
including queue time, and expired requests MUST NOT start new physical work.

#### Scenario: All physical slots remain occupied
- **WHEN** four actual host openings never settle
- **THEN** further callers fail within their waiting budgets without starting unlimited substitute openings
- **AND** no physical progress or native host recovery is promised until an actual slot settles

#### Scenario: Several saved sessions schedule checks
- **WHEN** validation work is admitted across multiple sessions
- **THEN** the total controller backlog, including debounce timers, queued checks and running callers, is bounded at 512
- **AND** overflow fails closed with an explicit Rerun reason without merging session state
- **AND** admitted FIFO work is not overtaken by a repeatedly requeued hot file

#### Scenario: A request is canceled or disposed
- **WHEN** a search closes, resets or the controller is disposed during opening
- **THEN** its logical waiter and scheduled checks are cleaned up
- **AND** late success or rejection cannot publish results, start a validation worker, or dispatch an edit

#### Scenario: A hot file is requeued after configuration changes
- **WHEN** an admitted check is requeued while debounce, FIFO, opening or worker work is active
- **THEN** it retains the original absolute first-admission deadline
- **AND** a changed timeout setting applies only to a new admission, not to the existing ticket

#### Scenario: Pending checks transfer to a different saved-search owner
- **WHEN** confirmation or Keep as a new search transfers pending rows to another session
- **THEN** only pending URI checks are readmitted with their original deadline and fresh destination generation and row binding
- **AND** expired or unavailable tickets settle as explained non-pending INVALID without a silent rerun
- **AND** late source callbacks cannot change the destination

#### Scenario: A native opening resolves after observed Close
- **WHEN** Close invalidates an acquisition before the document version has been bound
- **THEN** a late closed document cannot cause a new native show request
- **AND** a later explicit fresh navigation remains available, including intentional inspection of INVALID rows
- **AND** an already dispatched host show request is not described as revocable

### Requirement: Explicitly rerun a stale modal search
The modal SHALL provide a contextual Rerun Search action when the displayed
snapshot may be stale. Rerun SHALL build a fresh snapshot using current settings.

#### Scenario: New occurrence in a relevant file
- **WHEN** a relevant file gains a new occurrence after the search
- **THEN** the modal indicates that its snapshot may be stale
- **AND** Rerun Search discovers the new occurrence in a fresh search

#### Scenario: A separate preflight requests a rerun
- **WHEN** either the source event state or the separate preflight reports that a rerun is needed
- **THEN** the modal offers the same single Rerun Search action
- **AND** the action is disabled while a patch, search, or replacement is pending

#### Scenario: User changes query parameters
- **WHEN** the user changes the query, mask, or scope
- **THEN** the previous results are immediately cleared and the new search begins

### Requirement: Transfer continuations preserve current owners and delivered events
A modal-to-panel transfer SHALL bind its asynchronous continuation to exact source
and destination session lifetimes, generations and accepted parameters. Rollback
MUST NOT rewind a delivered event revision or revive a pre-event verified model.

#### Scenario: Source events race with a failed transfer
- **WHEN** reveal or modal close fails after delivered source events while provisional parameters are installed
- **THEN** the previous owner's rows are explicitly INVALID with Rerun guidance unless their current history can be preserved safely
- **AND** delivered epochs are monotonic and no full event-driven rerun starts

#### Scenario: An edit or Rerun is acknowledged during transfer
- **WHEN** a current owner accepts new parameters or an explicit Rerun before transfer finishes
- **THEN** the obsolete transfer is canceled without overwriting that accepted state

#### Scenario: A transfer owner is closed
- **WHEN** the source, destination or controller is closed or removed during an asynchronous transfer
- **THEN** its late continuation cannot republish, focus, dispose a newer owner or resurrect a closed owner
- **AND** already dispatched host calls are not described as revocable

#### Scenario: Source events arrive after admitted modal close
- **WHEN** the source has no panels while final native focus or the actual rollback reopen is awaiting the host
- **THEN** the exact still-live source continues its own event, identity and validation chain, including relevant zero-match Save, Close and metadata epochs
- **AND** rollback preserves known progressed rows, original pending deadlines and private authority without a silent full rerun
- **AND** observed Close leaves unknown non-pending INVALID rows rather than verified-looking old results

#### Scenario: Rollback reopening fails or resolves after source Close
- **WHEN** a rollback resource fails, expires or cannot resolve a panel within the original source lifetime
- **THEN** it cannot create a fallback owner or attach a late panel after Close or disposal
- **AND** retained rows without a live reopened panel lose pending work and authority, become unknown INVALID with Rerun guidance, and do not leave the dead source selected
- **AND** temporary event and resource admission are released after actual host settlement, without claiming physical cancellation

#### Scenario: New parameters are accepted while rollback opens
- **WHEN** the original source accepts a query edit or explicit Rerun during rollback reopening
- **THEN** the accepted generation, acknowledgement and cleared result model remain current
- **AND** rollback does not restore the obsolete model or silently schedule its search

#### Scenario: Rerun arrives before replacement busy state
- **WHEN** the host refuses a client Rerun request because replacement or searching is busy
- **THEN** it acknowledges refusal for that request so its client latch can be released
- **AND** unrelated state echoes or late old refusals cannot release a later accepted request guard
