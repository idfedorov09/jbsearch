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

The project uses only two long-lived branches:

- `dev` is the single trunk for ordinary development. Make small, verifiable
  changes directly on this branch in short iterations.
- `master` is the stable branch. Transfer ready, verified history from `dev`
  only when separately agreed.

There are no feature or release branches; this is not Git Flow. Check
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

## Fast development cycle

Sources are JavaScript/CommonJS and need no separate compilation. Open the
project in VS Code, press F5, then invoke **JB Search: Find in Files** or
**JB Search: Replace in Files** in the separate **Extension Development Host**.
After editing and saving, run **Developer: Reload Window** in that host or
restart F5. Neither VSIX installation nor a version bump is needed.

To use sources in a normal window, register the folder with
**Developer: Install Extension from Location…**, as described in README.
After editing, **Developer: Reload Window** is sufficient: the extension reads
the same folder. F5 instead starts a separate Extension Development Host.

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

To test an installed VSIX copy, rebuild and reinstall after each change. It is
not linked to the source folder and does not update automatically when the
version changes. [README.md](README.md) includes installation steps through
Extensions.

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

Use SemVer for release versions: patch for fixes, minor for compatible new
features, and major for incompatible changes. F5 testing does not require a
version bump. Version changes, commits, push, transfers to `master`, and
publication require separate agreement. Once the prepared workflow is activated,
a push to `master` with a new version can automatically publish it; account for
that effect when agreeing to push. Access setup, branch restrictions, and
validation are covered in the [publishing guide](docs/marketplace-publishing.md).
