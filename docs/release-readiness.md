# Кандидат JB Search 0.1.0

Дата подготовки: **4 ноября 2026**. Ветка: **dev**.

Это подготовка исходников и установочного пакета. Публичный выпуск и перенос
в `master` ещё не выполнены. Версия `0.1.0` согласована в main/client manifests
и lockfiles; в первоначальном Git scaffold была `0.0.1`.

## Состав

- Find/Replace modal и native Find Panel описаны в [changelog](../CHANGELOG.md).
- Технические границы — в [implementation-limits](implementation-limits.md).
- Вложенный `idfedorov09.jbsearch-client` включается в основной VSIX и нужен для
  клиентской темы/grammars preview в Remote; отдельное приложение не требуется.
- VSIX, `bundled/`, `.client-build/`, node_modules и временные тестовые профили
  не входят в Git. Артефакт выпуска собирается из исходников.

## Проверки подготовки

- [x] Чистая установка зависимостей `npm ci` на Node.js 22.
- [x] Main/client version и lockfiles согласованы на `0.1.0`.
- [x] `npm audit --omit=dev`: у поставляемых runtime dependencies нет известных
  уязвимостей по ответу npm в момент подготовки.
- [x] `npm run check`; `npm test` — **146/146**; `npm run spec:check` — **7/7**;
  `npm run package` — успешно на Node.js **22.23.2** / npm **12.0.2**, Linux x64.
- [x] Проверен новый состав VSIX и вложенный клиент: **72** и **31** файлов,
  main/client версии `0.1.0`, build клиента соответствует метаданным. README и
  changelog включены; dev dependencies, тесты и исследовательские документы исключены.
- [x] Git staging проверен: generated bundles/VSIX исключены; сканирование
  текста и OCR **22** тестовых PNG не обнаружили credentials или личных данных.
- [x] Исходники отправлены в `origin/dev`; GitHub Check прошёл для коммита
  `e4d78278d146d96358b9816320b5764a748a3d26`.

Результаты новой упаковки и SHA-256:
[release-candidate-package-results.json](testing/release-candidate-package-results.json).
Размер VSIX: **24 329 409 байт**. Наличие ripgrep для всех платформ проверено
в архиве; это не заменяет запуск расширения на каждой из них.

## Проверено ранее в настоящем VS Code

- Исходники, VS Code 1.143.1 на Linux/X11: **13/13** сценариев native Find Panel.
- Установленный VSIX, VS Code 1.144.1 на Linux/X11: **13/13** тех же сценариев.
- Иконки Find и Explorer: **10/10** сравнений в каждом прогоне, включая BL,
  JS/JSON, каталоги и смену icon theme.
- INVALID/Undo, guarded replace, gear drafts, независимые поиски и открытие
  исходника в центральной группе подтверждены GUI.

Это автоматизированные GUI-прогоны реальных окон, а не ручная приёмка всех
платформ. Точные версии пакетов и условия: [native Find Panel](testing/native-find-panel.md),
[modal/Remote preview](testing/find-replace.md). Изменения подготовки релиза
не меняют runtime поиска и UI; новые упаковочные проверки записываются отдельно.

## Перед публичным выпуском

- [ ] Выполнить ручную приёмку macOS и Windows: shortcuts, focus/IME, Esc,
  move/resize, Find/Replace, центральный редактор, INVALID и Undo.
- [ ] Проверить физический Remote между разными машинами: клиентские theme/grammars,
  файловые иконки в Panel, смена тем, Replace/Undo и установка клиентского bundle.
- [ ] Провести review кандидата и подтвердить выпуск именно выбранной версии.
- [ ] Настроить/проверить GitHub Environment и Marketplace Trusted Publishing
  по [инструкции](marketplace-publishing.md); эти настройки пока не подтверждены.
- [ ] Отдельно разрешить перенос в `master` и публикацию; обновить дату changelog.
- [ ] После выпуска проверить GitHub Actions, карточку Marketplace и установку
  в чистом VS Code.

Иконка расширения пока отсутствует. Её создание — отдельная задача, сборку VSIX
это не блокирует. Невыполненные платформенные и внешние проверки остаются в
соответствующих OpenSpec changes; подготовка `dev` не закрывает их автоматически.

## Git и CI

Первый функциональный коммит: `e4d78278d146d96358b9816320b5764a748a3d26`
(`feat: implement floating Find/Replace and native Find panel`). Он отправлен
обычным push в `origin/dev`; удалённый HEAD совпал с локальным. Первый запрос
push получил GitHub Internal Server Error, повторная отправка прошла без force.

[GitHub Check #41810967859](https://github.com/idfedorov09/jbsearch/actions/runs/41810967859)
завершился успешно **4 ноября 2026, 09:57:50 UTC** для указанного коммита:
чистый `npm ci --ignore-scripts`, check, **146/146** тестов, **7/7** проверок
OpenSpec, сборка и verifier основного/вложенного VSIX. Этот протокол и финальная
отметка OpenSpec фиксируются отдельным последующим коммитом документации;
runtime и состав поставки в нём не меняются.

`master` остался на `b88978d771a59fbacd2492128ff3d865dc6e8ff4`.
`dev` запускает обычные проверки. Workflow публикации ограничен `master`;
после настройки доверия push в эту ветку может публично выпустить версию.
