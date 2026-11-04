# ADR 0008: Штатное дерево Find в нижней панели и центральный редактор

Статус: **Accepted**

Дата: 2026-11-04

## Контекст

HTML-дерево ADR 0007 показывало собственные SVG для всех файлов и папок. Пользователь
попросил штатные клиентские иконки, в том числе при Remote. Native TreeView позволяет
оставить SearchEngine/сессии/INVALID нашими и передать ResourceLabels workbench.
Публичный API размещает contributed tree в View, но не в центральном Editor.
Пользователь явно выбрал нижнюю панель с открытием результата в центре.

## Решение

Использовать contributed `panel` container `jbsearch-find` с TreeView
`jbsearch.results`. FindTree получает снимки SearchController, строит данные дерева
и передаёт `TreeItem.resourceUri` и `ThemeIcon.File`/`Folder`. Сворачиваемым file
узлам File задаётся явно, иначе дочерние matches сделали бы их папками по умолчанию.
Иконки, theme changes, строки, highlights и раскрытие рисует сам workbench клиента.
Читать или пересылать JSON/шрифты/картинки клиентской icon theme не требуется.

Один view показывает выбранный поиск; независимые снимки доступны через Switch
Saved Search (QuickPick). New Search и Keep as a new search сохраняют независимость
параметров. Hide Panel сохраняет сессии, Close Search отменяет её workers/checks и
освобождает снимок. Gear открывает isolated draft выбранного поиска; Esc оставляет
исходные параметры, подтверждение обновляет тот же поиск.

FindPreview открывает файл через showTextDocument в активной editor group. Новые
группы и перенос существующих вкладок не выполняются. Click сохраняет фокус дерева;
Open and Focus Editor / Cmd/Ctrl+Enter переводит фокус в исходник и закрепляет таб.
Панель сама, фоновые batches и Rerun не меняют документ редактора до явного выбора.
70%-заливка search decorations сохраняется в исходнике; в дереве используются
обычные TreeItemLabel highlights, без собственного HTML/CSS.
INVALID помечается префиксом перед сниппетом и штатным ThemeIcon `error` с
ThemeColor `errorForeground`. Цвет ошибки выбирает активная тема; файловые иконки
и текст остальных строк сохраняют штатное оформление.

Это заменяет **размещение и renderer** ADR 0007. Его snapshot ordering, tracking,
worker validation, INVALID/Undo и guarded replace сохраняются. Modal и клиентский
мост ADR 0006 не изменяются. Старые восстановленные findWindow editor URI
перенаправляются в панель; in-memory history после Reload не восстанавливается.

## Альтернативы

- Пересылать клиентскую file icon theme в webview: возможно, но требуется адаптация
  resolver/CSS/resources и поддержание совместимости с логикой workbench.
- Native tree в центральном editor: публичного API нет; renderer injection/patch
  нарушил бы выбранный способ обычной установки расширения.
- Скрытая TreeView с извлечением DOM/иконок: публичного API извлечения DOM нет.

## Последствия и проверки

Нижняя панель заменяет отдельные editor tabs результатов; сессии переключаются
штатным QuickPick. Положение Panel остаётся настраиваемым пользователем; расширение
не переносит Terminal/Problems и не переписывает layout. Новых runtime dependencies,
сокетов или proposed API нет. Дополнительная клиентская установка для дерева не нужна.

Unit-проверки покрывают resource URIs/icons, UTF-16 highlights, порядок/INVALID,
сессии/команды и центральный редактор без split. Реальный GUI-протокол и матрица
платформ фиксируются отдельно в [native-find-panel](../testing/native-find-panel.md).
Ссылка на протокол не означает, что непроверенные платформы уже протестированы.

## Источники

- [Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)
- [TreeItem и resourceUri](https://code.visualstudio.com/api/references/vscode-api#TreeItem)
- [showTextDocument](https://code.visualstudio.com/api/references/vscode-api#window.showTextDocument)
- [Места регистрации View](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/browser/viewsExtensionPoint.ts)
- [OpenSpec change](../../openspec/changes/use-native-find-panel/)
