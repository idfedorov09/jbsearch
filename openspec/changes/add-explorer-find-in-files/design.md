# Design

## Context

Directory уже поддерживается controller и worker. Новая точка входа использует
существующий modal adapter ([ADR 0002](../../../docs/adr/0002-floating-search-host.md))
и изоляцию Find-снимков ([ADR 0007](../../../docs/adr/0007-find-window-and-native-editor.md)).
Мотивация и согласованный scope — в proposal.md.

## Goals / Non-Goals

Цель — передать точный путь выбранной папки в существующий Directory scope без
потери флагов запроса и без изменения сохранённого поиска. Нового renderer,
поискового движка и нового клиентского транспорта не требуется.

## Decisions

- Отдельная команда `jbsearch.findInDirectory` принимает URI из Explorer.
  В меню она видна только для одной папки с `file` или `vscode-remote` scheme,
  скрыта в Command Palette. Существующий Find по клавишам остаётся прежним.
  Использование выбранного ресурса вместо active editor корректно для multi-root.
- Controller проверяет файловый URI, принадлежность workspace и Directory через
  `workspace.fs.stat` до изменения сессии. Путь хранится в `scope.directory`,
  а не glob-маске: пробелы и специальные символы не меняют смысл поиска.
- Remote Explorer использует `vscode-remote`, а штатный URI transformer передаёт
  файловый URI в workspace host. Ручного преобразования remote URI в локальный
  путь нет. Виртуальные файловые системы этим изменением не поддерживаются.
- Контекстный запуск копирует параметры текущего поиска. Обычный modal можно
  переиспользовать; для Find-снимка или связанного с ним draft создаётся
  независимая сессия без `targetWindowId`. Смена области отменяет прежний запрос
  и очищает результаты до открытия, включая повторный запуск во время opening.
  При выполняющейся замене изменение поиска запрещено.

Стабильные API и исходники VS Code 1.143.1:

- [Menu contributions](https://code.visualstudio.com/api/references/contribution-points#contributes.menus)
- [When clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts)
- [Explorer context arguments](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/workbench/contrib/files/browser/views/explorerView.ts)
- [Remote URI transformer](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/base/common/uriTransformer.ts)

## Risks / Trade-offs

- Недоступная или удалённая во время открытия папка → понятная ошибка без fallback
  к Project. Ошибки во время поиска остаются стандартными ошибками worker.
- Вызовы меню во время opening → scope применяется до ожидания общего opening;
  выполняется поиск последней выбранной папки.
- Одна Directory не выражает несколько папок → action скрыт при multiselect.
- Программные проверки Remote URI не доказывают физический Remote или приёмку
  macOS/Windows; границы фиксируются в отчёте GUI.

## Migration Plan

Повысить main до 0.2.0, UI client оставить 0.1.0: его код и протокол не меняются.
Новых настроек и миграции сохранённых данных нет. Исходная установка обновляется
через Reload Window; установленный VSIX требует переустановки новой сборки.
