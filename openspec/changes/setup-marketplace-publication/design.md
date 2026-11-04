# Design

## Context

В репозитории есть отдельный workflow проверок на `dev`, `master` и pull request;
он не публикует расширение. `@vscode/vsce` уже закреплён через lockfile. Ветку
`master` и внешние сервисы нельзя изменять без отдельного запроса.

## Goals / Non-Goals

**Goals:** отделить ограниченную авторизацию выпуска от обычных проверок;
сохранить исходный коммит и явную версию; документировать активацию.

**Non-Goals:** автоматическое изменение версии, Git-теги, релизы GitHub,
передача изменений в `master`, настройка сервисов и реальная публикация.

## Decisions

1. Отдельный workflow запускается по push в `master`; условие job дополнительно
   ограничивает репозиторий и ref. Проверки выполняются до job публикации.
   Публикующий job получает `id-token: write` и проверяет тот же commit.
2. `vsce publish --oidc --skip-duplicate` использует имеющуюся dev-зависимость,
   сам упаковывает исходники и не хранит PAT. Альтернатива с PAT отклонена
   пользователем после сообщения об ограниченном сроке действия глобальных PAT.
3. Marketplace Trusted Publishing ограничивается репозиторием, именем workflow
   и GitHub Environment `marketplace`. В GitHub для этого Environment вручную
   разрешается только `master`: одной проверки в YAML недостаточно для защиты от
   изменённого workflow в другой ветке. Пользователь сам задаёт настройки до
   включения доверия и первой публикации.
4. Выпуски сериализуются без отмены выполняющегося job. Версия берётся из
   manifest; `--skip-duplicate` не сравнивает содержимое существующей публикации
   с новым коммитом и не заменяет её.

Официальные источники: [VS Code: secure automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing),
[GitHub: deployment branches](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags),
[GitHub: concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
Связанные архитектурные записи приведены в [ADR 0005](../../../docs/adr/0005-marketplace-trusted-publishing.md).

## Risks / Trade-offs

- [Environment ещё не ограничен] → инструкция требует настроить GitHub и
  Marketplace до включения публикации; до этого интеграция не считается готовой.
- [Версию не повысили] → `--skip-duplicate` оставляет прежний выпуск без изменений.
- [Тесты проходят, но расширение не готово] → ручная проверка и решение о
  переносе в `master` остаются отдельными действиями пользователя.
- [Очередь переполнена или поставщик недоступен] → ошибка видна в Actions;
  инфраструктура не гарантирует бесконечное число ожидающих запусков.

## Migration Plan

1. Проверить workflow локально, затем по отдельному разрешению доставить его в GitHub.
2. Пользователь ограничивает Environment и создаёт политику доверия издателя.
3. Первый реальный push в `master` с новой версией становится публикацией.
   Для отключения пользователь удаляет политику доверия или workflow отдельно.
