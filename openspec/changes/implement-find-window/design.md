# Design

## Context

До этого изменения CustomEditorProvider показывал один webview для modal и обычной
вкладки, а SearchController автоматически перезапускал поиск после изменения файла.
Поддержка INVALID требует отдельного жизненного цикла сохранённой выдачи.
Мотивация и scope — в proposal.md. Архитектурное решение — ADR 0007.

## Goals / Non-Goals

**Goals:** отделить редактируемый снимок результатов от live-поиска modal,
сохранить движок worker/ripgrep, пользоваться настоящим TextEditor без эмуляции
LSP и темы. Сохранить стандартную установку из исходников.

**Non-Goals:** внедрение Monaco в sidebar, DOM injection и изменение VS Code;
выдавать обычную editor group за Secondary Side Bar; выводить платформенную
совместимость из единственного Linux-прогона.

## Decisions

1. Отдельные ресурсы Find Window без формы поиска/нижнего preview. Дерево
   виртуализируется, сортируется по корню/пути/позиции и получает стабильные ids.
   Снимок включает исходные query/options/scope и immutable initialOrder.
   Последняя закрытая Find-панель освобождает снимок и проверки. Тип панели
   фиксируется при её создании: исходный modal может закрыться ещё до resolve
   новой Find-панели, и этот переход не должен удалять переносимую сессию.
   Новая generation синхронизирует клавиатурный фокус с первым выбранным
   результатом; обычная перепроверка файла сохраняет фокус и прокрутку.
2. Создаётся отдельная правая editor group через публичные editor commands и
   showTextDocument. Публичные TabGroups помогают находить и повторно использовать
   группу. Нельзя переиспользовать произвольную активную группу пользователя.
   Preview — настоящий файл с preserveFocus при выборе в дереве; Enter даёт фокус.
   Decorations используют CSS-переменные editor.findMatch* и color-mix с 70%
   исходной alpha заливки. Цвета синтаксиса и рамки не приглушаются; отсутствующая
   рамка имеет явный transparent fallback. Изменение decorations не двигает caret.
3. Сохранённая выдача отслеживает UTF-16 offsets через TextDocumentChangeEvent.
   Изменившийся документ перепроверяется тем же движком в worker с исходным
   запросом: точное сопоставление актуального offset:length обновляет metadata,
   отсутствующий диапазон получает invalid. Новые вхождения не добавляются.
   Revision/AbortController отбрасывает запоздавшие ответы. Нельзя исполнять regex
   в extension host; ошибки/timeout оставляют явное непроверенное состояние.
   Пока первоначальный полный поиск ещё выполняется, правка участвующего файла
   перезапускает построение снимка. После завершения состав снимка фиксирован до
   Rerun. Undo восстанавливает геометрию из ограниченной истории координат
   (128 последних состояний и начальное), без хранения текста документа.
4. Шестерёнка создаёт draft modal с targetWindowId, не заменяя параметры снимка.
   Confirm копирует актуальные параметры/результаты в target; Cancel ничего не
   переносит. Обычный shortcut тоже использует этот маршрут для активного Find.
   New Tab создаёт независимую сессию. Поиск при открытии gear не очищает снимок.
5. Замены snapshot-поиска блокируют invalid/pending и используют новые версии,
   hashes/ranges после проверки. Modal сохраняет прежнее live-поведение.
   Refresh заново выполняет полный поиск; после собственных замен snapshot тоже
   проверяется, чтобы заменённые вхождения отображались INVALID до refresh.

API evidence: [showTextDocument/TabGroups/decorations](https://code.visualstudio.com/api/references/vscode-api),
[editor groups](https://code.visualstudio.com/docs/getstarted/userinterface#_editor-groups),
[View Container](https://code.visualstudio.com/api/ux-guidelines/views).
Точные версии и результаты пробы записаны в docs/testing/find-window.md.

## Risks / Trade-offs

- Native editor в буквальном Secondary Side Bar недоступен → явно сообщённая
  правая editor group; sidebar остаётся незакрытым пожеланием, без фиктивного API.
- Перенос/закрытие групп пользователем → проверка живых TabGroups перед каждым
  показом и безопасное пересоздание только собственной preview-группы.
- Несколько Find-вкладок → отдельные query/snapshot/draft, общий правый native
  preview следует за последним активным Find, decorations не текут в другие файлы.
- Undo/удаление диапазона → хранение tombstone геометрии и регрессионные проверки.
- Неполная проверка → pending/ошибка и запрет stale replacement.

## Migration Plan

Новые вкладки получают отдельный UI и ресурс с query `view=findWindow`. Renderer
определяется через URLSearchParams(uri.query): toString() у VS Code URI кодирует
знак равенства в query и не подходит для повторного разбора через стандартный URL.
После Reload Window восстанавливается дерево, но in-memory query/results
сбрасываются; постоянная история поиска не добавляется. При неудачном открытии
вкладки исходная modal-сессия и её URI восстанавливаются. Версия и Marketplace не
меняются. Правки документов выполняются обычным редактором/WorkspaceEdit.
