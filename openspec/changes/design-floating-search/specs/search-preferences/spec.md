# Spec Delta

## Purpose

Разделить постоянные предпочтения и состояние текущего поиска в памяти,
не дублируя штатный Settings UI и не сохраняя историю запросов на диск.

## ADDED Requirements

### Requirement: Settings interface
Расширение SHALL предоставлять постоянные настройки через VS Code Settings UI
и JSON; окно поиска содержит быстрые session-фильтры и переход к настройкам.

#### Scenario: Open settings
- **WHEN** пользователь выбирает настройки JB Search
- **THEN** открывается штатный Settings UI с фильтром расширения
- **AND** настройки лимитов проверяются на допустимые диапазоны

#### Scenario: Session filter
- **WHEN** пользователь меняет Match Case, scope или маску в текущем поиске
- **THEN** обновляется эта сессия без автоматической записи в settings.json

### Requirement: Shortcut ownership
Расширение SHALL предоставлять команды Find/Replace и включённые по умолчанию
Cmd/Ctrl+Shift+F и Cmd/Ctrl+Shift+R, сохраняя возможность отключения перехвата
и назначения пользовательских shortcuts.

#### Scenario: Default keybinding
- **WHEN** расширение установлено с настройками по умолчанию
- **THEN** Cmd/Ctrl+Shift+F открывает JB Search Find, а Cmd/Ctrl+Shift+R — Replace
- **AND** пользователь может отключить перехват в Settings

#### Scenario: User enables keybinding override
- **WHEN** пользователь включает настройку перехвата
- **THEN** сочетание вызывает JB Search в поддерживаемом контексте VS Code
- **AND** отключение настройки возвращает штатное поведение без переписывания keybindings.json

#### Scenario: Customize shortcuts
- **WHEN** пользователь настраивает сочетания Find или Replace через настройки расширения
- **THEN** он может открыть штатный редактор Keyboard Shortcuts для соответствующей команды и назначить сочетание там
- **AND** расширение не выдаёт обычную строку в settings.json за действующую настройку горячей клавиши

### Requirement: Saved scopes
Расширение SHALL позволять задать именованные include/exclude scopes для workspace
и выбрать их в UI, с явным сообщением о некорректной конфигурации. Include текущего
запроса сужает выбранный scope; отключение ignore не снимает его include/exclude.

#### Scenario: Scope selection
- **WHEN** пользователь выбирает сохранённый scope
- **THEN** применяются его include/exclude-паттерны вместе с текущей маской и политикой ignore

### Requirement: Session persistence
Продукт SHALL сохранять query/options между закрытием и повторным вызовом диалога
в памяти extension host, не записывая историю запросов на диск.

#### Scenario: Reopen in the same extension host
- **WHEN** пользователь закрывает диалог Esc и повторно вызывает поиск
- **THEN** query/options восстанавливаются из сессии

#### Scenario: Extension host restart
- **WHEN** extension host перезапускается
- **THEN** query history не восстанавливается с диска и старые результаты не считаются текущими

### Requirement: Safe configuration boundary
Продукт SHALL запускать внешний поисковый backend только из проверенной поставки,
не из содержимого workspace или заданного в нём пути. Отдельное GUI-приложение
в выбранное решение не входит.

#### Scenario: Workspace supplies an executable path
- **WHEN** workspace configuration задаёт путь внешней программы для запуска
- **THEN** этот путь не используется для запуска программы

### Requirement: Local search data
Продукт SHALL обрабатывать query, snippets и содержимое файлов локально;
обычные диагностические логи не содержат текста запросов и исходного кода.

#### Scenario: Search and diagnostics
- **WHEN** пользователь запускает поиск и открывает диагностический лог
- **THEN** поиск не отправляет содержимое внешнему сервису
- **AND** лог содержит статусы/коды ошибок без query и snippets
