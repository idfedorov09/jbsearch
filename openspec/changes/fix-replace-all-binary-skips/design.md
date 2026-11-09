# Design

## Context

See the proposal and `specs/text-search/spec.md` for the behavior change. The
worker enumerates files with ripgrep and the session controller copies search
state to the modal and Find Panel; replacement checks incomplete and stale results
again in the extension host. The first iteration separated confirmed ZIP from
blocking skips; the user then clarified that all identified binary data should be
outside text search. See
[ADR 0003](../../../docs/adr/0003-search-engine-and-session.md) and
[ADR 0007](../../../docs/adr/0007-find-window-and-native-editor.md).

## Goals / Non-Goals

**Goals:**

- Distinguish binary inputs excluded from text search from unsupported encodings
  and other inputs that make a text search incomplete.
- Bound inspection, diagnostics, and cross-process data while preserving search
  cancellation, resource limits, and existing safety checks.

**Non-Goals:**

- Infer binary data from a suffix alone, recognize every possible binary format, decode unsupported
  encodings, inspect the contents of containers, or change replacement semantics.
- Guarantee perfect classification of arbitrary bytes.

## Decisions

### Classify binary content before the text size guard

The user clarified that binary data in general, not just ZIP containers, is
outside text search. In addition to structurally confirmed ZIP, use bounded
content checks for common binary signatures and for NUL-containing data. Check
UTF-16/32 byte-order marks and probable BOM-less UTF-16/32 before a generic NUL
classification so those unsupported text encodings remain blocking. Small
files are checked again after their bounded read; large inputs without a binary
classification remain blocking. Recognition is heuristic: arbitrary bytes
cannot be partitioned perfectly into binary data and unsupported text encodings.
VS Code document snapshots are already decoded and remain the source of truth
for open/dirty text documents.

### Preserve confirmed ZIP recognition

After the existing scope/mask/ignore checks, inspect candidate disk files with
bounded reads. Confirm a ZIP using consistent container structure, including its
end-of-central-directory record and relevant directory/header bounds; do not
accept a file name or a leading `PK` signature by itself. The checker does not
extract entries. ZIP variants outside the supported bounded validation, malformed
structures, ambiguous evidence, and read errors fall back conservatively to the
ordinary text/size/error checks. A supported confirmed ZIP is deliberately outside
the searchable text domain even when larger than the text size limit. Ordinary
UTF-8 files, including files named `.docx`, remain searchable.

The signature-only alternative risks silently excluding a valid text file; reading
whole large archives breaks the existing size limit. Node's
[`fs.promises.open` / `FileHandle.read`](https://nodejs.org/api/fs.html) API can
read fixed-size ranges using the same open file without loading the archive;
ZIP record structure is documented in the
[PKWARE ZIP APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).
Recognition is intentionally a conservative subset, not full ZIP validation or
an extraction/security guarantee. Keep existing dirty-document snapshot and
ignore/scope behavior unchanged, and avoid following newly introduced symlinks.

### Separate completeness from diagnostic totals

Represent safe container exclusions separately from blocking skipped files while
retaining aggregate diagnostic totals where useful. Only blocking skips, errors,
timeouts, and result limits contribute to an incomplete result. Preserve backward
compatibility and fail closed at controller boundaries if the new statistics are
absent or inconsistent. Revalidation must continue to reject incomplete worker
results; the new category must not weaken content/version or INVALID/pending checks.
A generic NUL heuristic is used only after the encoding checks described above;
its ambiguity is an explicit trade-off. Treating every skipped file as safely
excluded remains prohibited.

### Keep diagnostics bounded and clear

Collect a capped sample of path, reason, classification, and enough workspace
root context to disambiguate paths; also retain total counts and indicate omitted
details. Give blocking failures representation even when there are many safe
exclusions. Render the distinction in modal status and the Find Panel snapshot,
without injecting file names as markup, posting file contents, or requiring the
client resource bridge. The notice must not imply that ZIP/DOCX contents were
searched. The alternative of a count-only message preserves the current problem;
unbounded per-file state would scale with workspace size.

## Risks / Trade-offs

- [False positive classification] → Detect known Unicode BOMs and likely BOM-less
  UTF-16/32 first, treat undecodable bytes without binary evidence as blocking, and
  document that the NUL/signature heuristic cannot identify all encodings.
- [Large or many files consume time/I/O] → Cap bytes, probes, and diagnostic
  entries; preserve the worker deadline and cancellation. Unknown oversized files
  remain blocking rather than being read without limit.
- [Filesystem changes during inspection] → Read from an open handle and treat
  read/stat failures or inconsistent observations conservatively; preserve all
  existing later replacement freshness checks.
- [Filename disclosure or injection] → Keep paths on the workspace host and in the
  local extension UI, render as text, bound displayed details, and do not log file
  contents or add network transmission.
- [Misleading completeness] → State explicitly that completeness is relative to
  eligible text inputs; confirm containers remain unchanged in tests.

## Migration Plan

No persistent session migration is required because search sessions are in memory.
Update the worker, controller/UI, tests, and user guidance together; reload the
extension host for source installations. Reverting the change restores the old
conservative behavior. Do not change package versions, publish, or imply untested
platform coverage as part of this fix.
