# Find and Replace validation

Latest check: **2026-11-04**, extension **0.1.0**, working branch `dev`.
After implementing the separate Find Window, **141 of 141 unit tests** and
**16 of 16 GUI scenarios** passed in normal desktop VS Code 1.144.1 on Linux/X11,
separately from source and installed VSIX. Checks covered the tree, actual BL
editor on the right, INVALID/Undo, draft/Cancel/Confirm/New Tab, Replace, and
theme changes. `check`, `spec:check`, and `package` passed. Exact environment,
limits, screenshots, and reports are in the [Find Window report](find-window.md).

The sections below preserve the history of earlier modal and Remote client
bridge checks. The former transfer of one shared modal UI into a tab was replaced
by a separate results tree with an actual right-hand editor; historical counts
of 75/79 and notes about GUI checks not being repeated belong to those iterations.

The preceding client bridge check passed **75 of 75 unit tests and 14 of 14 GUI
scenarios**. `npm run check`, `npm run spec:check`, `npm run package`, and separate
content verification for both VSIX packages passed. An additional GUI run tested
eight theme switches and a client package update with the same version number.
A separate Remote workspace GUI smoke check of the main VSIX also passed:
automatic helper installation, BL/JS preview, Replace shortcut, and a shared tab.

## Continuous match border, 2026-11-04

Previously, each TextMate token had its own border. Each continuous range on a
line now has one shared highlight container; nested tokens retain their color,
italic, bold, underline, and strikethrough. Separate adjacent matches are not
merged, multiline matches are highlighted on each line, and zero-width matches
remain markers at their positions. A shared inline line context preserves tabs.

Fill and border still use the active theme's corresponding current/other match
colors. In the tested dark theme, an ordinary match has a fill, while the current
match has a transparent background with one continuous border. This presentation
was retained at the user's preference; no fixed custom palette was added.

DOM regressions cover multiple syntax tokens and spaces in one match, partial
tokens, adjacent ranges, multiline matches, and zero-width matches at the start,
inside a token, at token boundaries, at the end, and on an empty line.
Full `npm test`: **79/79**; `test/ui.test.js` separately: **10/10**.

Headless Chromium loaded production `media/search.js` and `media/search.css`
with synthetic VS Code theme variables: dark with a transparent current match,
light with a fill, and high contrast. Checks confirmed one element and browser
rectangle per match, retained token colors, adjacent/multiline ranges, five
visible zero-width markers without text shifts, and tab positions matching plain
text. Previous packaged resources reproduced seven separate highlight elements
for `static public final guid`; corrected resources produced one. No page errors.

[Browser validation report](match-decoration-results.json),
[corrected highlight screenshot](assets/match-decoration-fixed.png),
[package validation with the border fix](match-decoration-package-results.json).
Main VSIX: 68 files, 24,309,676 bytes; client: 31 files, unchanged build.
These are browser layout and distribution checks. The 14 Remote SSH GUI scenarios
below were run before this fix.

## Softer match fill, 2026-11-04

Following the user's next comment, result and preview fill opacity was reduced
to 70% of the theme value. For example, an opaque color gets alpha 0.7, while
an original alpha of 0.5 becomes about 0.35 after 8-bit color rounding. The theme's
RGB is retained. Text, its own alpha, font styles, and border are not dimmed;
a transparent current-match background remains transparent.

A separate Chromium page checked results and preview, six theme changes without
reloading, already translucent colors, fallback when the current-match color is
missing, and absence of both background colors. Comparison with the original
fill confirmed unchanged text, styles, and border. No page errors.
[Opacity report](match-fill-results.json).

After this change, browser checks of continuous borders, adjacent/multiline/
zero-width ranges, and tabs passed again in three appearances.
[Layout report](match-fill-layout-results.json),
[updated screenshot](assets/match-fill-fixed.png).
`check`, 79/79 unit tests, `spec:check`, and `package` passed.
[Updated package](match-fill-package-results.json): 68 files, 24,309,709 bytes;
the client package has 31 files with the same build. These browser checks do not
constitute a repeat of the complete VS Code GUI run.

## Client theme and grammar over Remote SSH

Checks ran in normal desktop VS Code **1.143.1**, Linux x64, X11/Xvfb, in a
separate profile with Remote SSH loopback. The main extension was registered
from source through the standard VS Code command, without an Extension Development
Host. **GitHub Theme 6.3.5 was installed only on the client**; the BL grammar was
available on the server. The server extension host could not see GitHub Theme,
the client UI extension, or the JavaScript grammar.

The client component was absent before the first search. The first preview
request automatically installed bundled `idfedorov09.jbsearch-client` in the local
UI host and activated it without manual Reload Window. The server received
GitHub Dark Default: 49 rules and 82 grammars, including JavaScript. Actual preview
colors were checked: keyword `rgb(255, 123, 114)`, string `rgb(165, 214, 255)`,
number `rgb(121, 192, 255)`. Matches were highlighted over TextMate syntax colors.

| GUI scenario | Result |
| --- | --- |
| Reload sources and inspect remote inventory before installation | Client helper absent; theme unavailable to the server |
| First search | Helper installed and activated locally automatically |
| JavaScript grammar available only on the client | Preview uses the client grammar and theme |
| Light Modern → GitHub Dark Dimmed → GitHub Dark Default | UI and syntax colors update without reload |
| Global/theme-specific token customizations | Colors, italic, underline, and strikethrough applied; settings restored |
| Typing at 210 ms and 4 ms per character | Query `return` retained completely; no focus losses |
| Rapid result switching | Preview matches the last selected result |
| Attempt to type in preview | Source document and on-disk file unchanged |
| Unsaved edits | Current text participates in search and preview without saving |
| Open Editors | Preview-only documents excluded; actual text tabs included |
| Replace and normal Undo | Single replacement undone; file not automatically saved |
| Replace All in three files | One workspace Undo restores all files; changes unsaved |
| Open in Find Window, Esc, and reopening | One shared tab; query, preview, and state preserved |
| Reload server sources | Existing client build reused without reinstallation |

Machine-readable report: [client-bridge-results.json](client-bridge-results.json).
Its UTC timestamp corresponds to **November 4, 2026 in Europe/Moscow**.
Screenshots were reviewed afterward and cropped to the search area to exclude
Remote SSH service logs: [Find](assets/bridge-find.png),
[Replace](assets/bridge-replace.png), [shared tab](assets/bridge-tab.png).
All files and queries were synthetic. The user's working profile and the
neighboring BL project were not changed.

Unit tests additionally cover dormant command activation, client build version,
absence of installation loops, late replies and disposal, switching themes without
restarting search, and repeating TextMate tokenization after `stoppedEarly`.
A repeated timeout produces an explicit plain-text fallback while retaining
match ranges.

## Repeated theme switching and client update

A separate GUI run alternated Light Modern and GitHub Dark Default eight times.
The selected JavaScript preview was retained; the keyword received the expected
color every time: `rgb(175, 0, 219)` for light and `rgb(255, 123, 114)` for GitHub
Dark Default.

A test VSIX with the same 0.1.0 version and a deliberately old build was then
installed through the CLI into the isolated client profile. The main extension
automatically updated it from the bundled VSIX. While old code remained loaded,
preview consistently showed an explicit Reload Window requirement. No repeated
installation loop occurred. After Reload Window, the expected current build
loaded and highlighting returned.
[Additional run report](client-bridge-upgrade-results.json).

## Client bridge distribution before the border fix

The main `jbsearch-0.1.0.vsix` has 68 files and is **24,309,502 bytes**.
It contains `bundled/jbsearch-client.vsix`: 31 files, 82,935 bytes, version 0.1.0.
Nested package metadata and build match. The main package includes runtime
dependencies, `onig.wasm`, and all 12 upstream `@vscode/ripgrep-universal`
binaries; the nested client contains the required `jsonc-parser` and
`vscode-textmate` dependencies.

Contents were also checked with deliberately corrupted packages: a missing nested
helper and a mismatched build were rejected with explicit errors.
[Packaging report, SHA-256, and negative checks](client-bridge-package-results.json).
This verifies actual ZIP contents; the client bridge GUI scenarios above used
the main extension from source and separately verified nested client installation.

## Running the main VSIX in a Remote workspace

The main `jbsearch-0.1.0.vsix` was installed through the standard VS Code Server
CLI into a separate test folder. Its entry temporarily replaced the source entry
in the isolated server profile; the original entry was restored afterward.
The active extension path confirmed loading the installed copy without an
Extension Development Host. The user's working profile was unchanged.

The client helper was first removed from the test profile. The first Find
installed it from the nested VSIX into the local UI host. BL with the server
grammar and JavaScript with the client grammar received GitHub Dark Default
without a server theme copy; match highlighting remained. Ctrl+Shift+R opened
Replace with the same query. Open in Find Window left one shared search tab.
This is a smoke check of distributed files; the full 14 scenarios above ran
separately from source.
[Installed package run report](client-bridge-installed-results.json).

## Current matrix and boundaries

| Environment | Status |
| --- | --- |
| Headless Chromium, production webview resources | Continuous border and softer fill: themes, ranges, tabs, original alpha, and fallback |
| Linux x64, X11, VS Code 1.143.1, Remote SSH loopback | 14/14 client bridge GUI scenarios and main VSIX smoke before the border fix |
| Linux x64, X11, VS Code 1.143.1, local sources | Earlier 17 Find/Replace GUI scenarios passed |
| Linux x64, X11, VS Code 1.144.1, installed VSIX before the client bridge | Historical validation; current contents of both VSIX packages checked separately |
| macOS x64 / ARM64 | Launch and Cmd shortcuts not tested |
| Windows x64 / ARM64 | Launch not tested |
| Linux Wayland / ARM64 | No separate validation |
| Remote SSH between separate machines | Not tested; loopback does not prove behavior with real network latency |
| WSL / Containers | Not separately tested |
| Web / virtual workspace | Unsupported in this iteration |

Preview uses TextMate grammar/theme contributions. Language server semantic
tokens are not reproduced. GUI automation and screenshot review do not replace
focus, IME, screen reader, and Cmd shortcut checks on macOS/Windows. The native
modal still opens through the internal adapter `src/modal.js`; compatibility with
all future VS Code versions is not claimed. OpenSpec 4.2 and the separate-machine
part of 4.6 remain open.

## Validation history before the client bridge

Earlier iteration results are retained below. Their 40/47 test counts, old VSIX
contents, and unavailable client theme describe those checks. The client bridge
validation above supersedes the earlier conclusion that Remote preview could not
inherit the theme.

Date: 2026-11-03. Extension version: 0.0.1. Working branch: `dev`.

Completed checks: **40 automated tests and 17 installed VSIX GUI scenarios passed**.
`check`, `spec:check`, `package`, and `git diff --check` passed; `npm ci` ran during
distribution preparation. The VSIX has 65 files and is 24,227,672 bytes
(about 23.1 MiB).

### Environment and validation boundaries

Integration was checked in official desktop VS Code **1.144.1**, Linux x64,
X11/Xvfb. The VSIX was installed into a separate clean profile without
`extensionDevelopmentPath`. GUI automation accessed the test VS Code through
Playwright/CDP. The distributed extension contains no CDP, debugger, or workbench
code injection.

| Environment | Status |
| --- | --- |
| Linux x64, X11, VS Code 1.144.1 | Installed VSIX tested in the actual GUI |
| Linux x64, X11, VS Code 1.143.1 | 17 GUI scenarios with ordinary source registration |
| macOS x64 / ARM64 | Binaries included; launch and Cmd shortcuts not yet tested |
| Windows x64 / ARM64 | Binaries included; launch not yet tested |
| Linux Wayland / ARM64 | No separate validation yet |
| Remote SSH, Linux loopback, VS Code 1.143.1 | Search tested; client grammar/theme unavailable to server preview |
| WSL / Containers | Not separately tested |
| Web / virtual workspace | Unsupported in this iteration |

Real GUI automation and manual screenshot review do not replace focus, IME, and
screen reader checks on the user's macOS/Windows. OpenSpec item 4.2 remains open.
This matrix does not claim compatibility with all future VS Code versions.

### Automated checks

Reproducible commands from the repository root:

```sh
npm ci
npm run check
npm test
npm run spec:check
npm run package
git diff --check
```

Tests cover Unicode/UTF-16, CRLF/BOM, multiline/regex/captures, ignores/masks,
custom scope intersections, nested workspace roots, dirty/untitled snapshots,
limits/timeouts/cancellation, stale replacements, and overlap. Controller/UI tests
cover generation/preview revisions, late input echoes, rapid toggles, blocking
replacement until acknowledgment, and Open Editors updates when tabs change.

A separate Chromium scenario with 40 ms state reply latency and typing at
15 ms/character verified fast query/replacement retention after the race fix.

### Installed VSIX scenario

A small synthetic workspace has five `shortClassName:` matches in three JS files,
`.gitignore`, and another ignored file. Find and Replace use the same data.
Each step's result is saved in [installed-vsix-results.json](installed-vsix-results.json).

| Action | Expectation |
| --- | --- |
| Ctrl+Shift+F | Modal with five matches in three files; query focused |
| File mask `MetricBar.js` | Two matches in one file |
| Open Editors before opening other files | Only the two matches in open ChatView; preview-only documents excluded |
| Regex `[` | Clear error; previous results cleared |
| Literal query with an actual newline | One multiline match |
| Regex `(?=shortClassName:)` | Zero-width marker at the exact position before the word |
| Dark Modern → Light Modern | UI and TextMate token colors update without reload |
| Ctrl+Shift+R | Additional replacement field, Preserve Case, Replace/Replace All |
| Replace one match | Four matches remain; document unsaved |
| Undo in the editor | Original five matches restored |
| Replace All | No matches; on-disk files not automatically saved |
| Undo the entire WorkspaceEdit | All five original matches restored |
| Open in Find Window | Same query in a tab; modal closed |
| Find shortcut again | Same session in the modal with the correct layout |
| Esc with filters open | Filters close first |
| Drag the title | Dialog moves through its native container |
| Resize to about 680 × 410 | Main controls/footer remain accessible |
| Esc | Dialog closed |

Installed extension screenshots: [Find](assets/find-dark.png),
[Replace](assets/replace-dark.png), [light theme](assets/find-light.png).

VS Code owns multi-file Undo. The editor may request confirmation for undoing the
entire WorkspaceEdit. The automated test profile uses `window.dialogStyle: custom`
so that confirmation can be observed and handled. The product does not change
this setting.

### Distribution checks

The VSIX contains JS runtime dependencies, `onig.wasm`, and all 12 upstream
`@vscode/ripgrep-universal` binaries. It does not download an executable at runtime.
ZIP checks separately confirm exclusion of tests, scripts, docs, OpenSpec, AGENTS,
and dev dependencies. A platform binary's presence is not a successful run on
that OS. The VSIX stays out of Git.

### Remaining manual validation

On macOS and Windows, install the same VSIX in normal desktop VS Code 1.144.1+
and repeat the table above. Also check Cmd/Ctrl shortcuts, multiple windows,
fullscreen, focus return after Esc, IME composition, high contrast, 125–200% zoom,
a custom theme, and an independent New Tab session. Record exact OS/VS Code
versions and results before closing OpenSpec 4.2.

Preview uses TextMate grammar/theme contributions. It does not reproduce normal
editor LSP semantic tokens; without a grammar it shows plain text. Modal opening
depends on the internal API isolated in `src/modal.js`. After a VS Code update,
repeat the tab → modal lifecycle: the retained webview defect is handled by
recreating the view while preserving the host session.

### Package update to 0.1.0

After complete 0.0.1 validation, the manifest and lockfile version was raised to
**0.1.0**. The new `jbsearch-0.1.0.vsix` was installed over 0.0.1 in the same test
profile without removing the previous installation or using `--force`. The CLI
confirmed `idfedorov09.jbsearch@0.0.1` → `idfedorov09.jbsearch@0.1.0`.

On launch, **JB Search: Check Installation** showed
`JB Search 0.1.0 is ready. Use Find in Files or Replace in Files.` — using the
actually loaded extension's version. Find again returned five matches, and
Replace opened with the same query. The 40 tests, check, spec:check, and package
passed again. Result: [upgrade-0.1.0.json](upgrade-0.1.0.json).

This validates a separate test profile, not an update of the user's VS Code.
For an installed copy, select the new VSIX in the relevant profile and run
**Developer: Reload Window**. Check Installation then confirms that 0.1.0 loaded.

### Sources, VS Code 1.143.1, and Remote SSH

In a separate VS Code 1.143.1 Linux/X11 profile, the source folder was registered
through **Developer: Install Extension from Location…**. After Reload Window,
all 17 Find/Replace GUI scenarios passed in a normal window, not a development
host. JavaScript and manifest were changed in a separate source copy; another
Reload loaded both changes without reinstallation or VSIX build.

In isolated Remote SSH loopback, search found five matches in three files. The
server extension host lacked client JS grammar and theme; preview showed a
plain-text fallback. Exact highlighting in that environment remained open task
4.6, rather than being considered proven by a local test.

The standard VS Code command registered the JB Search source folder in the
working server profile instead of the old VSIX copy. Entries for 26 other
extensions, including `bl-language-support`, were unchanged. In a separate VS Code
window using the same server profile, Check Installation confirmed the source
path; Find, Replace All without saving to disk, and Undo passed on a test file.
The user's working window was not reloaded.

After fixing the SSH mode-switching race, **47 automated tests**, `check`,
`spec:check`, and `git diff --check` passed. Machine-readable report:
[source-location-results.json](source-location-results.json).

### Compact dialog and shortcut configuration, 2026-11-04

In a separate normal VS Code 1.143.1 Linux/Xvfb window, source registration was
followed by 17 scenarios: search, mask, Open Editors, multiline/regex, match
highlighting, dark/light theme changes, Replace/Undo, tab transfer, Esc, move,
and resize. Initial modal size was 820 × 640 px; after shrinking to 681 × 411 px,
the footer remained accessible. Icons are 18 × 18 px, with accessible names and
button hit areas of about 30 × 29 px.
Machine-readable report: [compact-ui-results.json](compact-ui-results.json).
Local JavaScript preview screenshot: [compact-find-local.png](assets/compact-find-local.png).

In another isolated VS Code 1.143.1 profile, override settings links opened the
individual commands in Keyboard Shortcuts. Both bindings were reassigned through
the editor and opened the corresponding modes. The override switch was checked
by turning it off/on; editing a default binding retains its `when` clause in the
user binding.

A separate programmatic probe used the neighboring project's real BL grammar and
stock VS Code themes to confirm distinct Dark/Light token colors and highlight
ranges; the neighboring project was unchanged.

In isolated Remote SSH loopback, current sources and the real BL grammar were
registered in a VS Code 1.143.1 test server profile. Search found three matches in
two files; Find → Replace preserved query and results, while mask and include
filter narrowed results. Match highlighting worked in Dark Modern and Light
Modern; an unsaved change in an open BL file was found separately. BL code still
had one color because the client theme was unavailable to server preview. JS
additionally confirmed the missing client grammar. With
`editor.tokenColorCustomizations`, some BL tokens used the specified colors, but
this did not restore automatic active-theme inheritance. Remote SSH highlighting
was not considered fixed, and tasks 4.6/5.3 remained open.

### Separate native preview prototype, 2026-11-04

An [isolated experiment](../research/native-preview-feasibility.md) tested an actual
BL TextEditor inside the same modal in a normal workspace extension, VS Code
1.143.1 Linux/X11, Remote SSH loopback. GitHub Dark Default was installed only on
the client; native preview inherited its colors automatically, including theme
changes and match decorations. A separate clean snapshot run confirmed read-only
behavior and display of unsaved changes without writing to disk.

The adapter temporarily focuses preview and loses query characters; in source
mode, one character reached the test source. A read-only snapshot protects the
document but does not solve input loss. Standard modal transfer merges its groups,
leaving search and preview as separate tabs. The prototype was therefore not
integrated into working JB Search and is not a Remote SSH highlighting fix.
This experiment did not cover macOS/Windows or real network latency.
