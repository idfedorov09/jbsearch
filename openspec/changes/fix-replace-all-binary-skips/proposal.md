# Proposal

## Why

A binary ZIP container such as a DOCX in the project currently makes a search
partial and disables Replace All even though its contents are not supported text
search targets. The warning also does not identify the skipped file or its reason,
which makes the blockage difficult to resolve.

## What Changes

### Confirmed scope

- Exclude binary inputs from text search and replacement without treating their
  exclusion alone as incomplete results. Detect by content, including common
  binary signatures and NUL bytes, rather than trusting file extensions.
- Preserve the safety guard for unsupported encodings, unrecognized oversized
  files, read/enumeration errors, deadlines, result limits, and unverified or
  stale results. Check byte-order marks and likely BOM-less UTF-16/32 before
  treating generic NUL-containing input as binary.
- Show a bounded, useful list of excluded or skipped paths and reasons, clearly
  distinguishing deliberate binary exclusions from incomplete searches.
- Explain what a complete search means and update existing guidance and tests.

### Recommendations and non-goals

- Retain bounded ZIP validation and add bounded binary content detection; do not
  extract archives or search their contents. Binary/encoding classification is
  necessarily heuristic for arbitrary bytes and must be documented honestly.
- Do not weaken existing replacement checks or change exclusions, save behavior,
  search syntax, or delivery mechanisms.

### Approval and platform limits

The user authorized this fix for implementation. Artifact completion alone is not
proof of implementation or verification. Automated tests and any real-editor checks
must be reported separately; macOS, Windows, and physical Remote SSH execution are
not implied by local tests.

### Open questions

No byte-based classifier can perfectly distinguish every binary file from every
unsupported text encoding. Ambiguous non-UTF-8 inputs and oversized inputs that
cannot be classified from bounded content remain blocking.

## Capabilities

### New Capabilities

- `text-search`: Define eligible text inputs, completeness, and bounded skip
  diagnostics for text search and replacement.

### Modified Capabilities

None. The existing `find-results-panel` requirement to block replacement of
incomplete or unverified results is preserved.

## Impact

The search worker and engine statistics, session notices and modal/Find Panel
presentation, automated tests, and user documentation are affected. The change
should reuse existing Node.js and VS Code APIs and does not require extracting
archives, new runtime dependencies, a client bridge change, or publication.
