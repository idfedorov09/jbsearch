# Tasks

## 1. Research and policy

- [x] 1.1 Inspect the existing contributor and publishing rules and compare primary SemVer, Git, GitLab, Microsoft, and Google guidance; record scoped links in the policy.
- [x] 1.2 Document public-surface assessment, `0.x`/`1.x`, mixed-batch, immutable channel ordering, and independent-client rules; review decision examples in `docs/versioning.md`.
- [x] 1.3 Add concise links from AGENTS.md and CONTRIBUTING.md without changing existing release authorizations; review their diffs.

## 2. Documentation validation

- [x] 2.1 Run strict OpenSpec validation, `git diff --check`, and local Markdown-link checks for this change; report their actual results.
- [x] 2.2 Review the final documentation diff and file hashes to ensure that no package version, runtime, CI, release notes, or baseline spec was changed.

## Real VS Code manual checklist

No real-editor check is claimed or needed to establish a documentation-only
policy. Runtime and platform acceptance remain separate from this change.

## Workflow follow-up

- Review and archive this process-only change separately when appropriate.
- Version changes, branch actions, and publication require separate authorization.
