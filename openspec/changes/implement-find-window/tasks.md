# Tasks

## 1. Контракт и возможности VS Code

- [x] 1.1 Проверить штатный API групп/Secondary Side Bar и редакторских decorations на установленном desktop VS Code; сохранить первоисточники и решение ADR 0007 с явным ограничением sidebar.

## 2. Снимок и живые диапазоны

- [x] 2.1 Реализовать детерминированный порядок и отслеживание диапазонов без перестановки дерева; unit-проверки insert/delete/replace/multiline/UTF-16/CRLF/Undo.
- [x] 2.2 Подключить проверку изменённого документа через worker, INVALID/pending и guards от устаревших ответов; unit-проверки ошибок, удаления и невозможности stale Replace.

## 3. Find Window и редактирование

- [x] 3.1 Сделать отдельный виртуализированный UI дерева с toolbar, сворачиванием и клавиатурой без формы modal/кнопки Open in Find Window; проверить DOM и browser layout, описать управление.
- [x] 3.2 Подключить настоящий правый редактор и decorations с preserveFocus и защитой от быстрой смены результатов; unit-проверки группы и отдельный GUI smoke с редактированием/Undo.
- [x] 3.3 Сделать gear → draft modal → обновление исходной вкладки, Esc и New Tab; проверить изоляцию нескольких сессий и сохранение query/options/scope.

## 4. Интеграция и поставка

- [x] 4.1 Выполнить check/test/spec:check/package, проверить оба VSIX; сохранить протокол и согласовать прежний сценарий переноса в OpenSpec/README.
- [x] 4.2 Проверить в изолированном обычном VS Code Find/Replace → дерево, детерминированный порядок, editable preview/Undo/INVALID, rerun, gear/Cancel/Confirm/New Tab и тему; записать точную среду, снимки и ограничения.

## Workflow follow-up

- Точное размещение native editor внутри Secondary Side Bar остаётся пожеланием,
  ограниченным возможностями stock VS Code; обычная правая editor group не
  считается такой sidebar-вкладкой. macOS/Windows и физический Remote клиент
  проверяются отдельно, без переноса статуса Linux.
- После проверки и review согласовать синхронизацию baseline и архивирование.
