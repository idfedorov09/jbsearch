# JB Search: agent instructions

Respond to the user in Russian. Follow user and higher-priority instructions,
and verify the actual project state instead of making assumptions.

## Workflow

- Before editing, check the current branch and `git status`; preserve other
  people's and unfinished changes. Do not silently switch branches or rewrite
  someone else's work.
- If the user asks how to do something, requests an assessment, or leaves
  implementation intent unclear, briefly outline a plan and ask through
  `functions.request_user_input` whether to implement it. If the tool is
  unavailable, ask one concise question in chat. An explicit implementation
  request does not require another approval for expected steps within its scope.
- Work autonomously toward the agreed result while the path is expected. If an
  unexpected problem arises, explain it and the available solutions before
  changing the approach; do not conceal a workaround.
- A plan, task list, or feature proposal is neither implementation authorization
  nor a confirmed description of working behavior. Clearly distinguish existing
  behavior from intentions and unverified ideas.
- Make small, related changes, add relevant checks, and report honestly what was
  verified and which limitations remain.

## Branches and external actions

- `dev` is the single trunk for ordinary work and `master` is the stable branch.
  The explicitly authorized `beta` branch is reserved for pre-release publication;
  all its changes must arrive through a reviewed `dev` → `beta` pull request,
  linked to the relevant issue without closing it automatically. Do not make or
  push direct beta commits. Work in short iterations on `dev`, without Git Flow.
  Transfer only ready, verified history to `master`, and only at the user's request.
- A non-deletion, non-force push to `beta` can publish a pre-release to both
  registries automatically after checks; `dev` and manual `beta` dispatch do not.
  Marketplace `master` push/manual and Open VSX `master` manual stable routes
  remain separate. Confirm release intent and protected environment restrictions
  before any merge; use the same extension ID and a distinct numeric version.
  The release workflow itself does not prove a push came from a pull request;
  enforce and review that requirement separately.
- Do not commit, push, or change remote branches without a separate request.
  Actions directly and explicitly requested for the initial repository/branch
  setup are an exception; do not extend that authorization to subsequent tasks.
- Do not publish to Marketplace or configure automatic publication without a
  separate explicit request. Do not silently create tags or releases.
- Keep secrets, personal information, and generated VSIX files out of Git.

## Project and validation

- Write and maintain all repository content in English: README files,
  CONTRIBUTING, agent instructions, OpenSpec, ADRs, research, testing and release
  notes, code comments, and human-readable project metadata. Continue speaking
  Russian with the user unless they request another language. Preserve
  intentional Unicode/localization fixture values and historical binary
  evidence; use Unicode escapes for non-English test data where appropriate.
- Use OpenSpec (`openspec/`) for requirements and changes, and ADRs (`docs/adr/`)
  for architectural rationale. CONTRIBUTING.md describes the process. Drafts in
  `openspec/changes/` and Proposed ADRs are neither implemented capabilities nor
  permission to start implementation.
- The OpenSpec CLI is pinned in devDependencies: `npm run openspec -- <command>`.
  Validate documentation with `npm run spec:check`. Move requirements into
  `openspec/specs/` only after the corresponding change is implemented and verified.
- This is a JavaScript/CommonJS VS Code extension. Its entry point is `main` in
  package.json; source compilation is unnecessary. Use Node.js 22.12+ and `npm ci`.
  The `prepare` hook builds a nested client UI VSIX from `client/`; run
  `npm run prepare:client` to prepare it again. Do not add generated packages to Git.
- Find/Replace use a native modal custom editor, and Find Panel has a native
  results TreeView; Check Installation remains available. The modal uses an
  internal adapter, search uses a worker/ripgrep, and its read-only preview uses
  TextMate. In Remote, theme and additional grammars come through ordinary
  commands from the local UI extension `idfedorov09.jbsearch-client`, installed
  automatically from the bundled VSIX. Queries and source contents are not sent
  to that client component; semantic tokens are not implemented in the modal.
  Find Panel uses a native TreeView contributed to Panel: resourceUri plus
  ThemeIcon.File/Folder let the client workbench choose icons without copying
  the icon theme to the server. Clicking a result opens an actual TextEditor in
  the active central editor group; it creates neither a split nor a new right
  group. Opening or refreshing the panel does not switch the document by itself.
  Tree snippets use native label highlights; syntax/semantic tokens are in the
  source editor. Completed results form a deterministically ordered snapshot;
  UTF-16 ranges are tracked, changed files are revalidated by the worker, and
  INVALID/pending results block replacement. New matches appear after Rerun Search.
  Edit Search opens an isolated draft of the selected session; Esc preserves its
  previous parameters, confirmation updates it, and Keep as a new search creates
  an independent session. Switch Saved Search selects sessions; Hide Panel keeps
  them, and Close Search releases the snapshot and scheduled checks. Sessions
  live in memory and reset when the extension host restarts.
  Consult docs/testing/find-replace.md and docs/testing/native-find-panel.md for
  tested platforms and boundaries (find-window.md records the previous renderer).
  Do not infer macOS/Windows or physical Remote SSH support from Linux runs.
  Do not present an untested platform or unfinished item as complete; icon work,
  publication, and external actions require a separate request.
- Before finishing, run the relevant `npm run check` and `npm test`; use
  `npm run package` to verify packaging. Record real VS Code manual checks
  separately; never claim they ran when they did not.
- Test with F5 → Extension Development Host or register the source folder once
  through **Developer: Install Extension from Location…** in a normal window.
  After editing, **Developer: Reload Window** is sufficient; reloading does not
  require a version bump. An installed VSIX is a separate copy and must be
  rebuilt and reinstalled. Server-only changes do not require rebuilding the
  client. After changing `client/`, prepare its package and run
  **JB Search: Set Up Client Preview**, or separately register the `client/`
  source folder on the local client host.
- Add dependencies or new mechanisms only when necessary. When changing
  distribution, account for VSIX contents and runtime dependencies.
