# ADR 0005: Доверенная публикация расширения в Marketplace

- Статус: Accepted
- Дата: 2026-11-03

## Контекст

Пользователь согласовал подготовку CI, публикующего новые версии из `master`.
Для доступа к издателю `idfedorov09` необходимо разграничить обычную проверку
кода и публикацию. Настройка внешних сервисов и реальный выпуск выполняются
отдельно; наличие workflow в рабочем дереве не подтверждает их выполнение.

## Решение

GitHub Actions использует Marketplace Trusted Publishing: отдельный job получает
краткоживущие OIDC credentials и запускает `vsce publish --oidc`. Политика
издателя ограничивается репозиторием, файлом workflow и Environment
`marketplace`. Environment в GitHub отдельно ограничивается веткой `master`.
Сам workflow дополнительно проверяет репозиторий и ref.

После успешных проверок публикуется версия из `package.json`;
`--skip-duplicate` пропускает уже опубликованную версию, не заменяя её.
Job публикации имеет отдельный runner и после `npm ci --ignore-scripts` выполняет
`npm run package`: подготавливает вложенный клиентский VSIX, собирает основной
пакет и проверяет его через `scripts/verify-package.js`. Публикуется готовый VSIX
с `--packagePath ./*.vsix`, без повторной упаковки исходников внутри `vsce publish`.
В чистом runner этот glob выбирает один основной пакет в корне; вложенный
клиентский пакет находится в `bundled/`. Сборка из job проверок автоматически
не переносится; повторная сборка на runner публикации сохраняет явную проверку
runtime-ресурсов и клиентской части без механизма передачи artifacts между jobs.
Версия, файлы, коммиты и теги автоматически не изменяются. Запуски выпуска
сериализуются; ограничение очереди и фактическая работа Marketplace зависят от
внешних сервисов.

## Альтернативы

PAT в GitHub Secrets соответствовал бы примеру другого расширения, но является
долгоживущим секретом, который нужно создавать и ротировать; глобальные Azure
DevOps PAT выводятся из эксплуатации. Ручная загрузка VSIX требует отдельного
шага на каждый выпуск. Оба подхода отклонены пользователем в пользу OIDC.

## Последствия

Издатель должен один раз настроить ограниченное Environment и доверенную
политику. После активации push новой версии в `master` может запустить
публичный выпуск; согласование переноса должно учитывать это последствие.
Работа с GitHub и Marketplace не проверяется одним только локальным workflow.

## Источники

- [VS Code: Trusted Publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing)
- [GitHub: deployment branches and tags](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags)
- [GitHub: workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
