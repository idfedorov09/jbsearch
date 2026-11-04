# Design

## Context

См. proposal.md. Main/client уже имеют `0.1.0`, локальный пакет и GUI проверены.
На `origin/dev` пока только scaffold `0.0.1`. Publish/check jobs используют разные
runner: bundle, собранный в check, не попадает в publish автоматически.

## Goals / Non-Goals

**Goals:** воспроизводимый VSIX с клиентской частью, честная документация текущего
кандидата и проверенная история в `dev`.

**Non-Goals:** реальная публикация, внешние credentials/Environment, merge в
`master`, новые платформенные обещания, смена runtime/API или версии.

## Decisions

1. Сохранить `0.1.0`: это уже подготовленный первый функциональный выпуск после
   scaffold `0.0.1`. Дополнительное повышение не исправляет регистрацию исходников.
2. В publish runner явно выполнить `npm run package`, включающий prepare:client
   и verify-package; передавать проверенный VSIX через `--packagePath`. Передача
   artifact между jobs возможна, но добавляет механизмы без необходимости для
   этой небольшой поставки. Контракт ADR 0005 и существующего publication spec
   сохраняется; команды сверяются с локальным `vsce publish --help`.
3. Отделить changelog для пользователя от release checklist разработчика.
   Обновить limits и обзор OpenSpec. Синхронизировать только проверенные
   installation-check и find-results-panel; старое размещение HTML-дерева и
   незавершённые платформенные планы не переносить в baseline и не архивировать.
4. Проверить npm ci/check/test/spec/package и упаковку из Git-дерева. Сохранить
   VSIX и generated bundles вне Git, затем отправить связанные коммиты в `dev`.
   Дождаться GitHub Check именно для отправленного HEAD; замечания CI исправлять
   обычными последующими коммитами, без force push.

Основания: [ADR 0005](../../../docs/adr/0005-marketplace-trusted-publishing.md),
[ADR 0008](../../../docs/adr/0008-native-find-panel.md),
[проверка пакета](../../../scripts/verify-package.js).

## Risks / Trade-offs

- Непроверенные macOS/Windows/Remote → оставить открытые пункты исходного change
  и явно указать границы кандидата в release checklist.
- Накопленная незакоммиченная работа → проверить состав staging, исключить VSIX,
  secrets/личные данные и не менять соседний BL-проект.
- Workflow публикации уже подготовлен → сохранить master/repository guards;
  push `dev` запускает только обычные проверки.

## Migration Plan

После согласованной подготовки пользователь получает коммиты в `origin/dev` и
локальный VSIX. Следующий выпуск/перенос в `master` согласуется отдельно после
платформенной приёмки. Возврат выполняется обычным revert при необходимости;
история удалённой ветки не переписывается.
