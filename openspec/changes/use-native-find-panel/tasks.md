# Tasks

## 1. Native Find panel

- [x] 1.1 Реализовать FindTree с native file/folder resource icons, стабильными ids, highlights/INVALID и переключателем сессий; проверить node tests провайдера и ADR 0008.
- [x] 1.2 Подключить contributed Panel/views, toolbar/context commands и controller lifecycle вместо Find editor tabs; проверить controller/manifest tests и обновить подписи modal.

## 2. Центральный редактор и сохранённый поиск

- [x] 2.1 Перевести FindPreview в текущую editor group без split; проверить гонки, фокус, decorations и отсутствие newGroupRight в unit tests.
- [x] 2.2 Сохранить snapshot validation/Undo/replace guards/Edit Search/New Search/Close Search; проверить controller tests, обновить README и AGENTS.
- [x] 2.3 Сделать INVALID заметнее по запросу пользователя: красный ThemeIcon ошибки через errorForeground и подпись перед сниппетом; проверить возврат обычного вида после validation/Undo.

## 3. Интеграция

- [x] 3.1 Выполнить GUI smoke в изолированном stock VS Code: Panel, штатные иконки, click в центральный editor, отсутствие split, сессии/gear/INVALID; записать результаты и отдельный manual checklist с границами платформ.
- [x] 3.2 Удалить устаревшее HTML-дерево из runtime/VSIX, выполнить npm run check, npm test, npm run spec:check и npm run package; записать проверку пакета.

## Workflow follow-up

- Архивирование и синхронизацию baseline выполнять отдельным согласованным шагом после проверки.
