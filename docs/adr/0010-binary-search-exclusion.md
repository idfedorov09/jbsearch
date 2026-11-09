# ADR 0010: Binary exclusion from text search

- Status: Accepted
- Date: 2026-11-09
- Revises the binary-input completeness consequence of [ADR 0003](0003-search-engine-and-session.md).

## Context

ADR 0003 requires incomplete searches to block Replace All. Treating every
binary skip as incomplete also blocks a complete search of supported text when a
project contains a ZIP-based document that the product cannot search at all.
A count-only notice does not identify the file or give a useful resolution.

## Decision

Define completeness relative to eligible text inputs. Exclude identified binary
data from search and replacement without making the result incomplete solely for
that reason. Detect common binary signatures and NUL bytes in file content, not
extensions, and retain the bounded ZIP32 structural check. Check known UTF-16/32
BOMs and likely BOM-less wide text before the general NUL heuristic. Unsupported
encodings, unreadable or unclassified oversized files, timeouts, result limits,
and stale or unverified occurrences retain the existing safeguards. Show bounded
path-and-reason diagnostics, including omitted-detail counts.

## Alternatives

- Treat every file containing a NUL as an ignorable binary without checking for
  wide encodings. Rejected because common UTF-16/32 text would be silently omitted.
- Block on all binary input. Safe but forces manual exclusion even for files outside
  text search; this is the behavior being revised.
- Extract archives or add a format library. Rejected as outside the text search
  scope and unnecessary for the bounded recognition supported here.

## Consequences

Identified binary files can coexist with bulk replacement of supported text, and
the UI states that their contents are excluded. Classification is heuristic:
arbitrary bytes cannot always be distinguished from unsupported text or valid
UTF-8. Text can be excluded as binary and binary can be searched as text or reported
as an encoding error; diagnostics make the exclusions visible for review.
Unclassified large inputs remain blocking. Bounded ZIP recognition is not an
integrity check. This decision adds no network communication or runtime dependency
and does not establish platform acceptance.

## References

- [OpenSpec change](../../openspec/changes/fix-replace-all-binary-skips/proposal.md)
- [PKWARE ZIP APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)
- [Node.js FileHandle.read](https://nodejs.org/api/fs.html#filehandlereadbuffer-offset-length-position)
