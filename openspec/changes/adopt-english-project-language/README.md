# adopt-english-project-language

## Result — 2026-11-04

All Russian prose present in tracked project files at the start of this change
has been translated into English. This includes contributor and agent guidance,
the changelog, client documentation, ADRs, research, implementation limits,
release and testing reports, existing OpenSpec changes, and main specifications.
README, CONTRIBUTING, AGENTS, and OpenSpec context now establish English for all
repository content. Conversation with the user remains in Russian.

Historical task states, decision statuses, dates, hashes, commands, paths, URLs,
and validation boundaries are preserved. Shared baseline and delta requirements
are aligned. Earlier README-only language decisions are explicitly described as
historical and superseded by this repository-wide policy.

Four test files contain intentional Cyrillic Unicode/localization fixtures.
Their source literals now use JavaScript Unicode escapes; a comparison against
HEAD confirms that these files differ only by that character representation.
The evaluated strings and their original test coverage remain unchanged.

## Validation

| Check | Result |
| --- | --- |
| Tracked UTF-8 text scan, including Cyrillic characters outside the basic Russian alphabet | No remaining Cyrillic text |
| Local Markdown links and translated heading fragments | All targets resolve; an existing stale README fragment was also repaired |
| Historical Markdown checkbox states, ISO dates, and recorded hashes compared with HEAD | Preserved |
| Specification structure and SHALL/MUST/WHEN/THEN/AND sequences | Preserved; Russian marketplace requirement/scenario titles translated |
| Unicode fixture comparison with HEAD | Exact escape-only changes in all four test files |
| Targeted Unicode/localization test sets | 45/45 passed |
| `npm run check` | Passed |
| `npm test` | 195/195 passed; no skips or cancellations |
| `npm run spec:check` | 15/15 passed, including the separate concurrent screenshots change |
| Strict validation of `adopt-english-project-language` | Passed |
| `git diff --check` | Passed |

## Boundaries

This language migration changes no runtime source, dependencies, versions, JSON
evidence, screenshots, or existing Git history. The separate concurrent
`add-readme-screenshots` change was preserved without modification. This editorial
change did not rerun GUI or packaging checks and does not extend the platform
coverage recorded in the translated historical reports. No archive, release, or
publication was performed for this language migration.
