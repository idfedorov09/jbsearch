# Spec Delta

## Purpose

Define predictable text search with filters, cancellation, and an accurate preview
of current content. Regex has documented ECMAScript semantics, identical for files
on disk and unsaved documents.

## ADDED Requirements

### Requirement: Query modes
Search SHALL support literal, Match Case, Whole Word, regex, and multiline queries;
regex syntax is documented separately from JetBrains Java regex.

#### Scenario: Literal versus regular expression
- **WHEN** the user searches for `a.b` with Regex off
- **THEN** the dot is matched literally
- **AND** enabling Regex gives the dot its operator meaning in the chosen dialect

#### Scenario: Case and words
- **WHEN** Match Case and Whole Word are enabled for query `cat`
- **THEN** `cat` is found, while `Cat` and `catalog` are not

#### Scenario: Newline
- **WHEN** the user enters an actual newline between `first` and `second`
- **THEN** search finds adjacent lines with that text in LF and CRLF files
- **AND** literal `\n` without an actual newline remains text

#### Scenario: Invalid regular expression
- **WHEN** an invalid expression is entered
- **THEN** an error appears beside the field and search does not run that expression
- **AND** old results are not presented as results of the new query

#### Scenario: Escaped newline and dotall
- **WHEN** Regex is enabled and the query contains `first\nsecond` or `(?s)first.second`
- **THEN** the expression can match text on adjacent lines
- **AND** a dot without dotall does not match a newline

### Requirement: Search scopes
Search SHALL distinguish the whole workspace, an individual root, a directory,
open text tabs, and a named custom scope; the absence of a universal VS Code
module model is not concealed behind the name Module.

#### Scenario: Multiple roots
- **WHEN** one root is selected in a multi-root workspace
- **THEN** results are limited to that root and contain an unambiguous path

#### Scenario: Open editors
- **WHEN** the Open Editors scope is selected
- **THEN** open text tabs are searched, including available untitled buffers
- **AND** a closed document loaded internally is not included automatically

#### Scenario: Empty workspace
- **WHEN** Workspace is selected without open root folders
- **THEN** the UI reports the missing scope and offers to open a folder or choose Open Editors

#### Scenario: Custom scope with additional include
- **WHEN** a custom scope with include `src/**` is selected and the user enters include `**/*.js`
- **THEN** only JS files inside `src` that pass the other filters are searched
- **AND** the current query's include does not expand the selected scope's boundaries

### Requirement: File masks
Search SHALL intersect the scope with the enabled mask. Patterns `*`, `?`, `**`,
and `{a,b}` are separated by `;`; without `/`, they apply to the basename, and
with `/`, to the root-relative path. Mask/include/exclude globs are case-sensitive
regardless of Match Case. A disabled mask keeps its text but does not filter results.

#### Scenario: Combined masks
- **WHEN** Directory `src` and mask `*.js;*.ts` are selected
- **THEN** only JS/TS files inside `src` and its subdirectories are found

#### Scenario: Disabled mask
- **WHEN** the user turns off File mask
- **THEN** the mask text is preserved, and search includes other eligible files in the scope

### Requirement: Exclusions and traversal
Search SHALL explicitly apply each root's selected ignore and exclusion policy,
not follow symlinks outside the scope, and not present skipped files as checked.

#### Scenario: Default exclusions
- **WHEN** respecting exclusions is enabled
- **THEN** `.gitignore`, applicable search/files exclusions, and ignore settings constrain results
- **AND** the file mask does not bring an excluded file back

#### Scenario: Exclusions disabled
- **WHEN** the user disables respecting exclusions
- **THEN** ignore and general exclude filters are disabled
- **AND** the selected scope with its include/exclude rules, current query include, mask, and resource limits remain

#### Scenario: Unsupported input
- **WHEN** a binary, unavailable, or unsupported-encoding file is encountered
- **THEN** it is not interpreted as ordinary UTF-8 text
- **AND** the user can see that search is incomplete and why the file was skipped

### Requirement: Unsaved documents
Search SHALL use current snapshots of modified open documents in the selected
scope instead of their disk copies, with the same matching semantics.

#### Scenario: Unsaved edit
- **WHEN** a match exists only in an unsaved file edit
- **THEN** it is available in results and preview
- **AND** results from that file's old disk version are not duplicated

#### Scenario: Document changes during search
- **WHEN** the document version changes during search
- **THEN** results from the old version are invalidated and updated

#### Scenario: Excluded dirty file
- **WHEN** a modified open file fails the current scope/mask/ignore rules
- **THEN** its snapshot does not add matches to the results

#### Scenario: Untitled with mask
- **WHEN** a mask is enabled in Open Editors and an untitled tab is open
- **THEN** the mask checks its displayed name, while file ignore rules do not apply

### Requirement: Cancellation and partial results
Search SHALL cancel stale queries, display results incrementally, and explicitly
distinguish completion, cancellation, error, an empty query, and a reached limit.

#### Scenario: Rapid typing
- **WHEN** a new query is submitted before the previous one finishes
- **THEN** late results from the previous query do not appear in the new results

#### Scenario: Limit or deadline
- **WHEN** a configured result, file size, or time limit is reached
- **THEN** the UI reports an incomplete search and its reason
- **AND** it does not present the limited count as the total number of matches

#### Scenario: Empty query
- **WHEN** the query field is empty
- **THEN** search does not run and the UI asks for a query

### Requirement: Accurate ranges
Search SHALL preserve exact ranges for preview and opening results, including
Unicode, CRLF, multiline, and multiple matches on one line.

#### Scenario: Unicode positions
- **WHEN** emoji and Cyrillic text precede a match
- **THEN** the match itself is highlighted, without a shift by the UTF-8 byte count

#### Scenario: Zero-width match
- **WHEN** regex returns a zero-width match
- **THEN** search finishes or reaches a limit without an infinite loop
- **AND** the match position is shown unambiguously
