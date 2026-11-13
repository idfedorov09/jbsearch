# Contributing to JB Search

## Community and reports

Please follow the [Code of Conduct](.github/CODE_OF_CONDUCT.md) when
participating. Report undisclosed vulnerabilities privately using the
[Security Policy](.github/SECURITY.md), not a public issue.

For bugs and feature ideas, use [GitHub Issues](https://github.com/idfedorov09/jbsearch/issues).
Include clear steps and environment details when reporting a bug. Redact private
code, search queries, credentials, and other sensitive information before posting.
When submitting a pull request, describe the change and report the checks that
actually ran. Ordinary development pull requests should target `dev`.

## Branches: dev as the trunk

The project uses `dev` as the ordinary development trunk and `master` as the
stable branch. The explicitly authorized `beta` branch is a publication channel,
not a second development trunk:

- `dev`: make small, verifiable ordinary changes in short iterations.
- `master`: transfer ready, verified history from `dev` only when separately agreed.
- `beta`: receive authorized changes only through a reviewed `dev` → `beta`
  pull request; do not commit or push changes directly to `beta`. Link the pull
  request and its issue without auto-closing the issue. Merging the reviewed PR
  produces a beta push that can publish to both registries after checks.

The publication workflow reacts to beta pushes but does not itself prove their
pull-request provenance; repository process and branch restrictions must enforce
that rule. This is not Git Flow and does not introduce feature branches. Check
`git status` and the current branch before working. Preserve other people's
uncommitted changes. If `master` and `dev` have diverged and a safe transfer is
unclear, stop and discuss synchronization without silently rewriting history.

For an agreed transfer of linear history, if `master` is an ancestor of `dev`,
run `git merge --ff-only dev` from `master`. This does not push anything; review
the resulting history before pushing. If fast-forward is impossible, investigate
the cause instead of forcing the operation.

## Setup and checks

Use VS Code, Node.js 22.12+, and npm. From the repository root:

```sh
npm ci
npm run check
npm test
npm run spec:check
```

`npm ci` does not compile JavaScript, but its `prepare` hook creates
`bundled/jbsearch-client.vsix` and build metadata from `client/` and the pinned
runtime dependencies. This client UI component supplies Remote preview resources
and is included in the main VSIX. Run `npm run prepare:client` after changing it;
an unchanged package is reused. Generated `bundled/` and `.client-build/`
directories stay out of Git. Verify both main and nested VSIX packages when
changing distribution.

Use relevant automated tests and manual checks when editor UI is affected.
Record automated checks separately from checks in real VS Code. Scripts do not
replace manual UI validation.

To create a local installation package:

```sh
npm run package
```

The generated `.vsix` is an artifact, not source; keep it out of Git. Check
package contents and functionality before distributing it.

To build the seven-package matrix without publishing, use:

```sh
npm run package:matrix                       # stable metadata
npm run package:matrix -- --pre-release       # pre-release metadata
npm run package:matrix -- --target linux-x64 # one target only
```

Each invocation reports a newly created temporary output directory, the package
paths, sizes, SHA-256 digests, and verification results. Use `--out-dir <dir>`
to choose another directory other than the repository root. Existing artifacts are
not overwritten. The matrix consists of `win32-x64`, `win32-arm64`,
`darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`, and a universal
fallback. It retains the extension ID, source version, and bundled UI client.
Neither these commands nor the separate GitHub Actions build matrix publish to
either registry. The build-only workflow is not a publication gate; the
publication jobs build their own verified matrices.
Building artifacts never publishes them. Committing, transferring branches,
and publishing any release each require separate authorization.

Select the VSIX for the **workspace extension host**, not necessarily the local
UI host: in Remote SSH, WSL, or a container that can be the remote environment.
The bundled UI client remains platform-neutral. The dependency resolves its
architecture using `npm_config_arch` when set, otherwise `process.arch`, so an
override inconsistent with the workspace host's package can select a missing
binary. Use the universal fallback where its existing binaries cover the host;
it does not imply support for every environment. Do not rely on a local VSIX
install rejecting the wrong target: in an isolated Linux test, VS Code 1.144.1
accepted a Windows VSIX but its searches then failed because the Linux binary
was missing. This observation does not establish gallery behavior. See
[platform packaging validation](docs/testing/platform-packaging.md) for package
contents, README image limitations, actual verification, and pending editor
and Remote checks.

## Fast development cycle

Sources are JavaScript/CommonJS and need no separate compilation. Open the
project in VS Code, press F5, then invoke **JB Search: Find in Files** or
**JB Search: Replace in Files** in the separate **Extension Development Host**.
After editing and saving, run **Developer: Reload Window** in that host or
restart F5. Neither VSIX installation nor a version bump is needed.

To use sources in a normal window, first clone the repository and prepare its
dependencies:

```sh
git clone --branch dev https://github.com/idfedorov09/jbsearch.git
cd jbsearch
npm ci
```

1. Run **Developer: Install Extension from Location…** in the target VS Code window.
2. Select the repository root. In Remote SSH, select the folder on the remote host.
3. Run **Developer: Reload Window**.

Register the folder once per profile and host. After editing and saving,
**Developer: Reload Window** loads the changed code from the same folder; no
version bump or VSIX rebuild is needed. **JB Search: Check Installation** shows
the loaded version and actual location. F5 instead starts a separate Extension
Development Host.

With Remote SSH, the main extension runs on the server and
`idfedorov09.jbsearch-client` runs in the local UI host. The first Remote preview
installs the client from the nested VSIX using a standard VS Code command.
It reads the client's theme and grammar resources; search queries and matched
files are not sent to it. No server-side theme installation is needed.
**JB Search: Set Up Client Preview** retries setup after a failure or package
update; use Reload Window if old client code is still loaded.

Server-only changes need only Reload Window. After changing `client/`, run
`npm run prepare:client` from the root, then the client preview setup command.
For development without packaging, register the `client/` source folder **on the
client** after running `npm ci` inside it. Registering the repository root on the
server does not register `client/` locally; each registration belongs to its
selected profile and host. Test the appropriate host without changing neighboring
projects or the user's working client profile unless requested.

To test an installed VSIX copy, run `npm run package`, then open
**Extensions → … → Install from VSIX…** and select the generated
`jbsearch-<version>.vsix` from the repository root. Run
**Developer: Reload Window**, then invoke a JB Search command. Rebuild and reinstall
after each change: an installed VSIX is not linked to the source folder and does
not update automatically when the source version changes.

## Project language

Write and maintain all repository content in English, including documentation,
OpenSpec changes and main specs, ADRs, contributor and agent guidance, changelog,
research and testing reports, code comments, and human-readable metadata.
Conversation with the user remains in Russian unless they request another
language.

Preserve technical identifiers, commands, paths, URLs, dates, test evidence, and
historical status. Non-English Unicode/localization fixtures are test data;
keep their meaning and coverage, using Unicode escapes where appropriate.
Historical screenshots and Git history remain unchanged.

## Changes and versions

### ADRs and OpenSpec

- Record architectural rationale in [docs/adr](docs/adr/README.md). Proposed
  means under discussion; Accepted means the decision is made, not that code
  is implemented.
- [openspec/specs](openspec/specs/) describes verified current behavior.
  Discuss future changes in `openspec/changes/<name>/`: proposal, design, and
  spec deltas. Write tasks after resolving material design decisions.
- Create a change with `npm run openspec -- new change <name>`, then read
  `instructions <artifact> --change <name>`. Run `npm run spec:check`.
- Once scope is agreed, implement in small iterations and update tasks.
  Archive and sync requirements into the baseline after implementation and
  validation. Structural validation alone does not establish user approval.

### Versions

The extension implements Find/Replace; the actual validation matrix lives in
[docs/testing/find-replace.md](docs/testing/find-replace.md). Describe expected
behavior and boundaries before development, and completed checks and known
limitations afterward. Plans and task lists neither prove a feature exists
nor authorize implementation by themselves.

Use the [versioning policy](docs/versioning.md) for patch/minor/major decisions,
including `0.x`, mixed batches, the first `1.x` compatibility commitment, and
channel ordering. F5 testing does not require a version bump. Version changes,
commits, push, transfers to `master`, and publication require separate agreement.
Marketplace retains its `master` push and manual stable routes; Open VSX stable
publication remains manually dispatched from `master`. A `beta` push can publish a pre-release to both registries using
the same extension ID; `dev` pushes and manual `beta` dispatch do not publish.
Use a distinct numeric version and account for that effect when agreeing to push.
Access, environment restrictions, and verification are described in the
[Marketplace](docs/marketplace-publishing.md) and
[Open VSX](docs/open-vsx-publishing.md) guides.
