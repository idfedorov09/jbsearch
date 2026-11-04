# OpenSpec в JB Search

`specs/` описывает проверенное текущее поведение. `changes/` содержит предложения,
дельты требований, дизайн и задачи будущих изменений. Наличие файлов и успешная
валидация не означают принятие дизайна или готовность функции.

Установка: `npm ci` (Node.js 22.12+). Используется локальный OpenSpec 1.16.0;
глобальная версия не нужна. В `.agents/skills/` CLI создал инструкции workflow.

```sh
npm run openspec -- list
npm run openspec -- list --specs
npm run openspec -- status --change design-floating-search
npm run spec:check
```

Для нового изменения сначала `npm run openspec -- new change <имя>`, затем
`instructions <артефакт> --change <имя>`. Обсуждаем proposal/design/specs, уточняем
ADR и только после запроса на реализацию выполняем задачи. После реализации и
проверок архивируем изменение штатной командой OpenSpec и синхронизируем specs.
Не архивируем невыполненный план ради отметки «готово».

OpenSpec и ADR — инструменты разработки, в VSIX не включаются. Причины выбора
архитектуры находятся в [docs/adr](../docs/adr/README.md).

Текущий baseline: `installation-check` описывает реальное уведомление версии/пути
и регистрацию исходников; `find-results-panel` — проверенную native панель,
центральный редактор и жизненный цикл сохранённых поисков.

Реализованный Find/Replace описан в `design-floating-search`, но change остаётся
открытым из-за ручной приёмки macOS/Windows и физического Remote. `implement-find-window`
сохраняет историю прежнего HTML-дерева; размещение заменено завершённым
`use-native-find-panel`. Старая схема размещения не переносится в baseline.
`setup-marketplace-publication` содержит подготовленный workflow, внешняя публикация
не проверена. `prepare-initial-release` ведёт подготовку `0.1.0`, коммиты и CI в `dev`.
Архивирование этих изменений выполняется отдельно после review.
