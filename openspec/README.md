# OpenSpec in JB Search

`specs/` describes verified current behavior. `changes/` holds proposals,
requirement deltas, designs, and tasks for future changes. Files existing and
passing validation does not mean a design is approved or a feature is ready.

All OpenSpec content is written and maintained in English, as is the rest of the
repository. Conversation with the user stays Russian unless requested otherwise.
Preserve requirement meaning, status history, and validation evidence when editing.

Install with `npm ci` (Node.js 22.12+). The project uses local OpenSpec 1.16.0;
a global installation is unnecessary. The CLI created workflow instructions in
`.agents/skills/`.

```sh
npm run openspec -- list
npm run openspec -- list --specs
npm run openspec -- status --change design-floating-search
npm run spec:check
```

For a new change, run `npm run openspec -- new change <name>`, then
`instructions <artifact> --change <name>`. Discuss proposal/design/specs, clarify
ADRs, and implement tasks only after an implementation request. After implementation
and checks, archive through the standard OpenSpec command and sync specs. Do not
archive an unfinished plan just to mark it complete.

OpenSpec and ADRs are development tools and are excluded from VSIX. Architectural
rationale lives in [docs/adr](../docs/adr/README.md).

Current baseline: `installation-check` describes the actual version/path
notification and source registration; `find-results-panel` describes the verified
native panel, central editor, and saved-search lifecycle.

Implemented Find/Replace is described in `design-floating-search`. The user
confirmed macOS/Linux use on November 4, 2026; Windows and physical Remote
acceptance remain open. Exact coverage is recorded in
[platform acceptance](../docs/testing/platform-acceptance.md).
`implement-find-window` preserves the old HTML tree's history; its placement was
superseded by completed `use-native-find-panel`. The old placement is not moved
into the baseline. `setup-marketplace-publication` contains the OIDC workflow;
the normal `master` publishing job succeeded for 0.2.1. Its original end-to-end
acceptance task still requires verified installation in real VS Code.
`release-stable-022` tracks the stable metadata/documentation update and release
verification. `prepare-initial-release` tracks `0.1.0`
preparation, commits, and CI on `dev`. Archive these changes separately after review.
