# Tasks

## 1. Меню Explorer

- [x] 1.1 Обновить title/guard меню и проверить manifest и передачу context URI, включая несколько выделенных ресурсов; отразить различимое название и область в документации.

## 2. Активация результата

- [x] 2.1 Сохранить строки при selection/host echo, восстановить double click и Enter; проверить UI regression tests и виртуализацию.
- [x] 2.2 Проверить актуальность до закрытия modal и открыть исходник в центральной группе на совпадении; проверить controller success/stale/error cases.

## 3. Проверка и доставка

- [x] 3.1 Поднять main до 0.2.1, обновить changelog; на изолированном снимке выполнить check, test, spec:check, package и сохранить отчёт main/client VSIX.
- [x] 3.2 Выполнить реальный VS Code GUI: меню при multiselect/compact folders, различимое название, double click выбранного и другого результата, Enter, точные URI/range и закрытие modal; записать проверенные платформы.
- [x] 3.3 Проверить diff, сделать коммит/push в dev и сверить remote SHA и CI.

## Workflow follow-up

- Main spec `search-entry-points` синхронизирована с проверенным поведением 0.2.1.
  Changes сохраняются до отдельного архивирования; уже перенесённые дельты
  повторно применять при архивировании не нужно.
- macOS, Windows и физический Remote не выдаются за проверенные по Linux-прогону.
