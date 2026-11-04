# Design

## Context

Menu guard версии 0.2.0 содержит `!listMultiSelection`, поэтому пункт исчезает,
когда Explorer сохраняет несколько выбранных ресурсов. Category команды
`JB Search` не добавляется к label контекстного меню автоматически.

В modal `select()` и host echo вызывают `renderRows()`, пересоздающий строки.
Первый клик удаляет DOM target до второго клика. После исправления клика нужно
также явно покинуть modal перед открытием source, иначе активной может оказаться
его editor group. Существующий контракт: [search-window](../design-floating-search/specs/search-window/spec.md).

## Goals / Non-Goals

Восстановить навигацию и сделать контекстный запуск доступным для выбранной
мышью папки. Диалог остаётся тем же native modal ([ADR 0002](../../../docs/adr/0002-floating-search-host.md));
Find Panel сохраняет существующий TextEditor ([ADR 0008](../../../docs/adr/0008-native-find-panel.md)).

## Decisions

- В title указать **JB Search: Find in Files…**. Встроенный пункт не скрывать:
  публичное меню расширения используется только для собственной команды.
- Снять guard `!listMultiSelection`; оставить folder и filesystem scheme.
  Первый аргумент Explorer — именно URI контекстной строки; массив выделения
  не меняет Directory. Это определённая одиночная область, не объединение папок.
- Сохранять DOM identity видимых строк по result id в рамках generation.
  Обновлять оформление выбора и удалять строки, ушедшие из виртуального viewport;
  не откладывать одиночный клик таймером. Проверять browser double click.
- Передавать generation при активации результата. Controller проверяет generation
  и актуальность текста до закрытия modal, дожидается закрытия вкладки и открывает
  исходник в восстановленной центральной группе с фокусом и нужным диапазоном.
  Enter использует тот же путь. Ошибка не должна закрывать рабочий поиск молча.

Источники стабильного API:
[contributes.menus](https://code.visualstudio.com/api/references/contribution-points#contributes.menus),
[Explorer context arguments 1.143.1](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/workbench/contrib/files/browser/views/explorerView.ts),
[TabGroups.close и showTextDocument](https://code.visualstudio.com/api/references/vscode-api).

## Risks / Trade-offs

- Host echo между кликами → повторное использование существующей строки,
  проверка в настоящем webview.
- Query изменился между кликом и обработкой → generation guard, проверка текста
  и обновление выдачи вместо перехода к недействительному диапазону.
- Несколько выделенных ресурсов → документировать context target; GUI проверить
  смешанный выбор и folder target, вторую папку не включать в scope.
- Принудительное копирование remote path → отсутствует: используется полученный
  VS Code URI workspace host, как в 0.2.0.
- macOS/Windows/физический Remote → отдельная приёмка; Linux GUI её не заменяет.

## Migration Plan

Основное расширение 0.2.1, UI client остаётся 0.1.0. Новых настроек, зависимостей
и миграции данных нет. Исходники обновляются через Reload Window, VSIX — установкой
нового пакета.
