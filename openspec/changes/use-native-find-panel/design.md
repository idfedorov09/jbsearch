# Design

## Context

Мотивация и авторизация — proposal.md. SearchController уже хранит независимые
сессии и snapshot tracking; FindPreview создаёт правую editor group, а центральная
custom editor вкладка содержит HTML-дерево. Меняется представление и переход к
источнику; worker, замены и modal preview сохраняют текущие контракты.

## Goals / Non-Goals

**Goals:** штатная клиентская отрисовка всех файловых иконок, дерево в Panel,
обычный редактор в центре, сохранение снимков и нескольких поисков.

**Non-Goals:** центральный native TreeView, DOM injection, перенос client icon
theme, собственные стили строк native дерева или новое приложение. Modal preview
по-прежнему пользуется существующим клиентским мостом темы/grammars.

## Decisions

1. Зарегистрировать viewsContainer в `panel` и TreeView с одним активным поиском.
   FindTree кэширует snapshots по id, показывает корень/каталог/файл/вхождение,
   отдаёт `resourceUri` и явно `ThemeIcon.File` даже сворачиваемому file-узлу.
   Штатный QuickPick переключает сохранённые сессии без дополнительного уровня
   дерева. Непрозрачные ids и порядок сохраняются при проверке документа.
2. В controller отделить существование сохранённой Find-сессии от `panels.size`.
   Скрытие native view не закрывает сессии. Close Search отменяет workers и
   validation; New Search копирует параметры независимо. toolbar/context commands
   передают идентификатор сессии/результата и актуальный generation в существующий
   message handler. Обёртка команд показывает ошибки, не скрывая отказ замен.
3. FindPreview открывает источник в активной editor group через showTextDocument.
   Никаких newGroupRight/Beside и собственных split groups. Последний явный выбор
   выигрывает при гонках; изменения и смена темы только обновляют decorations.
   Автовыбор результата при поиске не открывает документ. Click сохраняет фокус
   дерева, отдельное Open and Focus Editor переносит его в редактор.
4. В дереве использовать `TreeItemLabel.highlights`, счётчики INVALID/pending,
   tooltip с путём, позицией, текстом и причиной INVALID и штатные действия.
   Запрос и scope показываются в заголовке/summary, replacement — в Edit Search.
   Это стандартная подсветка
   списка VS Code; 70%-заливка editor find decorations сохраняется в исходнике.
   По уточнению пользователя INVALID помещается перед сниппетом и получает
   `ThemeIcon('error', ThemeColor('errorForeground'))`. Произвольный цвет текста
   native label не вводится; валидность/Undo убирают оба маркера ошибки.
   Выбранная строка сохраняет штатные правила контраста workbench, включая
   переопределение цвета значка; префикс и форма error остаются видимыми.
5. Новые Find не используют CustomEditorProvider. Старые восстановленные
   `?view=findWindow` resources перенаправляются в native панель без HTML-дерева;
   query/results, как раньше, не сохраняются на диск. Старые HTML/CSS ресурсы
   дерева удаляются из runtime и проверки VSIX.

API evidence:
- https://code.visualstudio.com/api/extension-guides/tree-view
- https://code.visualstudio.com/api/references/vscode-api#TreeItem
- https://code.visualstudio.com/api/references/vscode-api#window.showTextDocument
- https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/browser/viewsExtensionPoint.ts

Архитектурные причины фиксируются в ADR 0008, заменяющем размещение ADR 0007.

## Risks / Trade-offs

- Одна native view вместо множества editor tabs → переключатель сохранённых поисков.
- Пользователь может перемещать Panel средствами VS Code → `panel` задаёт место
  по умолчанию, расширение не перестраивает весь пользовательский layout.
- Нет CSS отдельных native строк → использовать штатное оформление highlights.
- Remote и platform → проверить доступные среды отдельно, не выводить физический
  SSH/macOS/Windows из локальной Linux-пробы.
- Фоновые snapshot validations → хранить сессии независимо от видимости, но явно
  освобождать Close Search и dispose; не открывать источники от background notify.

## Migration Plan

После изменения исходников достаточно Developer: Reload Window; клиентский пакет
не меняется. Старые editor tabs с findWindow URI перенаправляются в пустую native
панель. Версия, профиль пользователя, коммиты и Marketplace не меняются.
