# Release versioning policy

This policy describes how JB Search chooses a version for a planned release;
it does not authorize a version change, publication, branch transfer, or
platform-support claim. [CONTRIBUTING](../CONTRIBUTING.md#changes-and-versions)
already gives the basic patch/minor/major rule. This document makes its `0.x`,
batch, client-component, and prerelease decisions explicit.

## What compatibility covers

Assess changes from the user's point of view, not by commit title, lines changed,
implementation effort, or number of files. Consider the extension identity,
documented commands and keybindings, contributed settings and their defaults,
persisted configuration formats, documented search/replace workflows and safety
semantics, supported editor/platform scope, and privacy promises. A change in
which an action is admitted, refused, or requires another user step can matter
even if it fixes an incorrect or unsafe behavior. Distinguish a change to an
advertised contract from an undocumented defect and record any judgment calls.

SemVer requires a declared public API even in `0.x`; the README, extension
manifest, and verified specifications provide a starting point, but this list
does not by itself prove a complete, reviewed declaration. Internal functions,
worker messages, UI markup, tests, and the private host/client bridge are not
automatically a public programming API. `activate` currently exposes no
documented extension API object; that does not make commands, settings, or
user-visible behavior private. A draft OpenSpec proposal is not a shipped
contract. Before a first stable `1.x` release, explicitly review and document
the intended public surface and exceptions rather than promising that every
internal detail is permanent.

## Choose the bump

The table describes the minimum semantic bump for the release's actual changes.
The `0.x` column is **this project's conservative convention**, not a rule
imposed by SemVer on all initial-development software. SemVer's detailed patch,
minor, and major increment requirements in sections 6–8 apply to major versions
above zero; section 4 permits `0.y.z` to change without a stable public API.

| Change since the relevant published baseline | While `0.x` | At `1.x` or later |
| --- | --- | --- |
| Backward-compatible corrective bug fix, documentation, or internal refactor without a new or materially changed user-visible contract | Patch (`0.3.2` → `0.3.3`) | Patch (`1.2.3` → `1.2.4`) |
| New compatible user-facing functionality or setting; deprecation of a public capability; or a substantial, material change in workflow, safety checks, or action admission that users need to notice | At least minor (`0.3.2` → `0.4.0`) | At least minor (`1.2.3` → `1.3.0`) if compatible; use major if incompatible |
| Incompatible public contract, including a restriction that breaks a previously supported workflow | At least minor, with explicit review of the incompatibility, migration and owner approval; do not silently graduate to `1.0.0` | Major (`1.2.3` → `2.0.0`), with the incompatibility and migration documented |

A fix may be visible without being a new workflow; visibility alone, a security
or safety label, or a large refactor does not force a minor bump. Conversely, a
safety fix that materially changes who or what can be replaced, introduces a
review step, or adds a configurable public setting must not silently receive a
patch merely because the issue was filed as a bug. Assess the specific contract
and compatibility. When uncertain whether an existing workflow was supported,
review and document the assumption rather than label it compatible by default.

For a batch, assess the changes each target audience has not yet received
against its relevant published baseline; take the **largest required bump**, not
the last commit's type. A later release of the same already-published content
still needs a new number for the other channel, but need not repeat the semantic
minor bump. Incrementing minor resets patch to zero; incrementing major resets
both minor and patch to zero. The selected release number must also respect
published-version ordering below.

## First `1.x`: a deliberate compatibility commitment

`0.x` is not synonymous with Marketplace pre-release: a `0.x` build can be
published on the stable channel. Likewise, `1.0.0` can technically be marked as
a Marketplace pre-release; the number alone neither proves stable-channel
publication nor establishes platform acceptance. A numeric `1.0.0` can still be
interpreted as a normal SemVer version by tooling that ignores the separate
channel marker. Choosing any `1.x` number, including a marked pre-release, is
therefore an explicit owner decision, not an automatic consequence of a large
batch, a completed milestone, or an incompatible `0.x` change.

SemVer says `1.0.0` defines the public API. Its FAQ suggests `1.0.0` when
software is in production, users depend on a stable API, or compatibility is a
major concern; it also describes `0.x` as suitable for rapid API change. These
are reasons to evaluate readiness, not automatic thresholds or a requirement to
stay below `1.0` merely because the project previously used `0.x`. Before the
**first stable `1.x`**, the project must review the intended public contract and
compatibility promise; identify the supported editor/platform scope and the
evidence for its key workflows; document remaining limitations and migration/deprecation expectations;
and obtain explicit owner agreement to that commitment and release. Existing
platform requirements must not be silently narrowed; any change of scope needs
separate agreement. Unverified environments must not be presented as accepted.
These are project readiness gates, not a claim that SemVer requires tests on
every operating system or a defect-free implementation. A `1.x` pre-release
may be used to gather evidence before stable acceptance if separately approved,
but it does not waive those first-stable gates.

## Published versions, channels, and ordering

- Use the same extension ID and a numeric `major.minor.patch` for Marketplace
  and Open VSX. Microsoft documents that extension versions do not support
  SemVer prerelease suffixes such as `-beta.1`. The beta route packages a
  **pre-release marker** independently of the numeric version; parity of the
  minor number does not determine the channel.
- A published artifact is immutable for its extension ID and version. Never
  replace or silently reuse that version for different contents; investigate a
  duplicate or uncertain publication and issue a new version when appropriate.
  An unpublished local draft is not a published artifact; verify both registries
  before relying on that distinction.
- Beta and stable must use distinct numbers. For each new logical release, the
  project chooses a number higher than every version already published for that
  extension ID on either target registry, including the highest beta. Publishing
  the same intended artifact at the same version to both registries is one
  logical release, not reuse for different contents. For example, a marked
  `0.7.0` beta could be followed by stable `0.7.1`, provided the ordering and
  availability checks pass. Additional beta publications consume further numbers.
- Microsoft **recommends**, but does not require, even minor numbers for stable
  and odd minor numbers for pre-release. JB Search does not mandate that parity
  convention: it chooses the semantic bump and uses the actual package marker.
  VS Code can update a pre-release opt-in user to a numerically higher stable
  version; plan ordering accordingly. Open VSX `latest` behavior and individual
  client update behavior have their own documented boundaries.
- The main extension and the bundled `idfedorov09.jbsearch-client` have separate
  package identities and versions. Do not automatically bump the client merely
  because the main extension changes. Review a client version independently
  when its package or protocol changes and a new client artifact is needed;
  never reuse a published client version for changed contents. If the client and
  its artifact are unchanged, keep its version unchanged.

F5/source-folder testing and Reload Window do not require a version bump.
Choosing or changing a number is not permission to release it. Continue to use
the reviewed `dev` → `beta` PR, separate release authorization, protected
environments, and existing stable routes in the
[Marketplace](marketplace-publishing.md) and [Open VSX](open-vsx-publishing.md)
guides. Do not create tags or releases without a separate request.

## Sources and scope

Primary sources consulted on **2026-11-12**:

- [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html), especially
  sections 1–8 and the `1.0.0` FAQ: public API, immutable releases, `0.x`
  flexibility, and normal post-`1.0` increments.
- [Git `tag` documentation](https://git-scm.com/docs/git-tag): annotated and
  lightweight refs and their release-bookkeeping roles; Git itself does not
  prescribe application version increments or authorize creating a tag.
- [GitLab release and maintenance policy](https://docs.gitlab.com/policy/maintenance):
  GitLab's own product uses patch for compatible fixes, minor for new compatible
  functionality, and major for incompatible changes. Its product cadence and
  rules are not a Git or JB Search mandate.
- [Microsoft VS Code publishing guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions):
  numeric-only version format, distinct channel versions, pre-release marker,
  update ordering, and the optional even/odd recommendation.
- [Google Open Source library breaking-change policy](https://opensource.google/documentation/policies/library-breaking-change):
  its policy for generally available library APIs requires a major bump for
  breaking changes and documents migration; it is useful compatibility context,
  not a binding support promise for JB Search.
- [Google AIP-180](https://google.aip.dev/180) and
  [AIP-185](https://google.aip.dev/185): service API compatibility includes
  semantic behavior; AIP-185 has Google service-specific version/channel
  conventions and does not prescribe VSIX version numbers. Do not transplant
  its API URL/version format or support policy to this extension.
