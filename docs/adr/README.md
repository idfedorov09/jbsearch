# Architecture decisions

ADRs record the context, alternatives, decision, and consequences; no separate CLI
is needed. Requirements and scenarios belong in OpenSpec and are not duplicated
in full here.

| ADR | Status | Topic |
| --- | --- | --- |
| [0001](0001-record-decisions-and-specifications.md) | Accepted | ADRs and OpenSpec |
| [0002](0002-floating-search-host.md) | Accepted | Native modal editor: verified candidate and API boundary |
| [0003](0003-search-engine-and-session.md) | Accepted | Search engine and shared session |
| [0004](0004-source-registration-and-vscode-compatibility.md) | Accepted | Source registration and verified compatibility with VS Code 1.143.1 |
| [0005](0005-marketplace-trusted-publishing.md) | Accepted | Trusted extension publishing through GitHub Actions |
| [0006](0006-remote-preview-theme.md) | Accepted | Client themes/grammars through VS Code commands for Remote preview |
| [0007](0007-find-window-and-native-editor.md) | Accepted | Separate Find Window, result snapshot, and native editor on the right |
| [0008](0008-native-find-panel.md) | Accepted | Native Find Panel and central editor; supersedes the layout in ADR 0007 |

Statuses: Proposed — under discussion; Accepted — adopted; Superseded — replaced
by another ADR; Rejected — considered and rejected. Accepted does not mean the code
has already been implemented. When revisiting an accepted decision, create a new
ADR linking to the previous one. Dates use YYYY-MM-DD.

A new document includes the next number, title, status/date, context, decision,
alternatives, consequences, and references. Authorization to implement is separate
from acceptance of the architecture; commits and publication also require a
separate request.
