# Proposal

## Why

Пользователь предоставил SVG и разрешил добавить его как иконку расширения,
сделать коммит и push в `dev`. Сейчас у основного расширения нет manifest icon.

## What Changes

- Сохранить исходный SVG и получить из него PNG 256×256 без изменения рисунка.
- Подключить PNG через `icon` основного `package.json` и проверить его в VSIX.
- Обновить changelog и устаревшие упоминания об отсутствии иконки.

## Capabilities

### New Capabilities

Нет новых функций: меняются artwork, manifest metadata и проверка поставки.

### Modified Capabilities

Контракты поиска и панели не меняются; `skip_specs: true`.

## Impact

Основной manifest, PNG, исходный SVG в документации, verifier пакета и документация.
Runtime, зависимости, клиентский bundle и версия `0.1.0` остаются прежними.
Публикация и перенос в `master` не входят в scope.
