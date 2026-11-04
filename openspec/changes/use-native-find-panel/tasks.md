# Tasks

## 1. Native Find panel

- [x] 1.1 Implement FindTree with native file/folder resource icons, stable ids, highlights/INVALID, and a session switcher; check the provider's node tests and ADR 0008.
- [x] 1.2 Connect contributed Panel/views, toolbar/context commands, and the controller lifecycle instead of Find editor tabs; check controller/manifest tests and update modal labels.

## 2. Central editor and saved search

- [x] 2.1 Move FindPreview to the current editor group without a split; check races, focus, decorations, and the absence of newGroupRight in unit tests.
- [x] 2.2 Preserve snapshot validation/Undo/replace guards/Edit Search/New Search/Close Search; check controller tests and update README and AGENTS.
- [x] 2.3 Make INVALID more visible at the user's request: a red error ThemeIcon through errorForeground and a label before the snippet; check restoration of the ordinary appearance after validation/Undo.

## 3. Integration

- [x] 3.1 Run a GUI smoke in isolated stock VS Code: Panel, native icons, click into the central editor, no split, sessions/gear/INVALID; record results and a separate manual checklist with platform boundaries.
- [x] 3.2 Remove the obsolete HTML tree from runtime/VSIX, run npm run check, npm test, npm run spec:check, and npm run package; record package validation.

## Workflow follow-up

- Archive and synchronize the baseline as a separately agreed step after validation.
