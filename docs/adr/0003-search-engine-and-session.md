# ADR 0003: Поисковый движок, замена и подсветка preview

- Статус: Accepted
- Дата: 2026-11-03

## Контекст

Find/Replace должны одинаково сопоставлять файлы на диске и unsaved documents,
не блокировать extension host и предоставлять captures/UTF-16 ranges для замены.
Пользователь требует syntax highlighting текущей темы и match decorations в preview.

## Решение

@vscode/ripgrep-universal поставляется с расширением для перечисления файлов/ignore. Сам
matcher ECMAScript работает в одноразовом worker thread, одинаково для snapshots
и файлов; termination даёт отмену и deadline даже для pathological regex. Прежнее
предложение PCRE2 пересмотрено: оно усложняло согласованную capture replacement.

SessionController принадлежит extension host; UI передаёт намерения, получает
snapshots/batches. Generation и preview revision отбрасывают устаревшие ответы.
Replace использует captures, проверяет полное содержимое/версию до WorkspaceEdit;
неполные результаты не допускают Replace All. Изменения не сохраняются автоматически.

Preview tokenizes через vscode-textmate/vscode-oniguruma, беря grammar/theme из
публичных contributions установленных extensions, включая theme includes и user
customizations. Это не DOM injection. TextMate-токены поддерживаются; LSP semantic
highlighting не воспроизводится. Без grammar — plaintext с объяснением.

## Последствия

В VSIX нужны native ripgrep для desktop платформ, onig.wasm и JS runtime пакетов;
упаковка проверяется отдельно. Windows/macOS runtime verification ещё требуется.
Regex dialect документируется как ECMAScript, не Java/PCRE2. Кодировка — UTF-8;
binary/unsupported inputs отражаются в partial status. Remote/web не обещаются
на основании Linux desktop опыта. Содержимое/запросы не отправляются внешним сервисам.

## Источники

- [TextMate tokenizer](https://github.com/microsoft/vscode-textmate)
- [Oniguruma](https://github.com/microsoft/vscode-oniguruma)
- [Bundled ripgrep](https://github.com/microsoft/vscode-ripgrep)
- [WorkspaceEdit](https://code.visualstudio.com/api/references/vscode-api#WorkspaceEdit)
