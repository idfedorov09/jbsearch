# Platform acceptance

Updated: **November 4, 2026**, during preparation of main extension **0.2.2**.

## Current evidence

| Environment | Evidence | Status |
| --- | --- | --- |
| macOS | The user reported that the extension works correctly on November 4, 2026 | User-confirmed use |
| Linux | The same user report, plus earlier automated GUI runs in actual Linux/X11 VS Code windows | User-confirmed use and recorded GUI scenarios |
| Windows | Intended platform; user confirmed no Windows run yet; platform-specific ripgrep executables are included and checked in the universal VSIX | Execution and manual acceptance pending |
| Remote SSH | Earlier automated Linux loopback GUI checks of client installation, theme/grammars, and modal behavior | Recorded loopback coverage; separate physical-machine acceptance not reported |
| WSL, Dev Containers, Wayland | No dedicated acceptance evidence supplied | Unverified |

The user's report did not specify the exact extension or VS Code builds, CPU
architectures, test scenarios, or Remote topology. It confirms successful use
on macOS and Linux without establishing every scenario from the historical test
matrix. Expected Windows compatibility is not a completed Windows test.

## Release scope

Version 0.2.2 changes public documentation and extension metadata; search,
replacement, native modal integration, and the bundled UI client are unchanged.
No additional manual GUI runs are claimed for this release. Automated package
checks confirm distribution contents, including Windows executables, rather
than execution on every platform.

Historical scenario details remain in [Find/Replace validation](find-replace.md),
[native Find Panel validation](native-find-panel.md), and
[Explorer/result navigation](explorer-navigation-fixes.md). Their original test
dates, versions, and platform boundaries remain unchanged.
