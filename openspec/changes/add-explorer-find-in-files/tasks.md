# Tasks

## 1. Команда и область поиска

- [x] 1.1 Добавить Explorer-команду, folder/scheme/multiselect guards и передачу URI; проверить manifest и activation тестами.
- [x] 1.2 Реализовать проверку папки, Directory scope, отмену прежней выдачи и изоляцию saved/draft сессий; проверить controller и существующие directory worker тесты.
- [x] 1.3 Описать запуск из Explorer в README, повысить main до 0.2.0 и обновить changelog; проверить согласованность manifest/lock и отсутствие изменения UI client.

## 2. Проверка и доставка

- [x] 2.1 Выполнить check, test, spec:check и package; проверить содержимое main и bundled VSIX, сохранить результаты.
- [x] 2.2 Проверить реальный VS Code Linux: меню папки/файла, Directory и выдачу для nested/multi-root, сохранность Find-снимка и обычный Find; сохранить GUI отчёт с границами платформ.
- [ ] 2.3 Проверить diff, сделать коммит и push в dev, сверить remote SHA и результат CI.

## Workflow follow-up

- Архивирование и синхронизация baseline выполняются после отдельного review.
- macOS, Windows и физический Remote остаются в общей матрице приёмки; Linux
  и unit-проверки не являются их подтверждением.
