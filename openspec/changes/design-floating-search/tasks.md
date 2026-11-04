# Tasks

## 1. Контракт и поставка

- [x] 1.1 Обновить ADR/specs под подтверждённые Find/Replace и worker regex; проверка spec:check.
- [x] 1.2 Добавить bundled ripgrep/TextMate/Oniguruma и manifest команд/shortcuts/settings; проверить npm ci и VSIX contents.

## 2. Поиск и сессия

- [x] 2.1 Реализовать отменяемый worker search с scopes, masks, ignore и dirty snapshots; тесты Unicode/CRLF/regex/limits/cancel.
- [x] 2.2 Реализовать SessionController и guarded modal adapter; тесты generation, off/unsupported, state lifecycle.
- [x] 2.3 Реализовать Replace/Replace All через WorkspaceEdit с captures и stale checks; тесты literal/captures/overlap/stale/partial.

## 3. UI и preview

- [x] 3.1 Реализовать компактный Find/Replace UI по референсам, scopes, фильтры, keyboard/splitter; проверить browser/VS Code automation.
- [x] 3.2 Реализовать TextMate preview из активной темы/grammars с match ranges; тесты escaping/theme/token ranges и реальный preview.
- [x] 3.3 Реализовать перенос во вкладку, повторный вызов, смену темы и документировать использование/ограничения в README.

## 4. Интеграция и проверка

- [x] 4.1 Выполнить check/test/spec:check/package и проверить установленный VSIX в чистом Linux VS Code: Find/Replace, Undo, themes, scopes, Esc/move/resize/tab.
- [ ] 4.2 Выполнить ручную проверку macOS и Windows: shortcuts, focus/IME, themes, resize/tab/replace; сохранить отдельную матрицу результатов.
- [x] 4.3 Поднять установочный пакет до 0.1.0, показывать загруженную версию в Check Installation и проверить обновление прежнего VSIX.
- [x] 4.4 Проверить штатную регистрацию из исходников и Reload Window на 1.143.1; отразить фактическую папку в Check Installation.
- [x] 4.5 Зарегистрировать исходники в рабочем Remote SSH профиле и проверить активную запись, сохраняя другие расширения.
- [ ] 4.6 Реализовать корректное syntax preview клиентских grammars/themes при Remote SSH и проверить на разных машинах; до этого явно показывать fallback.

  Клиентский канал реализован: Linux Remote SSH loopback проверен из исходников
  и установленного основного VSIX, включая BL, клиентскую JS grammar и тему.
  Открытой остаётся проверка на разных физических машинах; этот пункт не закрывается
  только по loopback. Недоступность ресурсов по-прежнему обозначается явно.

## 5. Замечания по референсу

- [x] 5.1 Уплотнить диалог и его элементы относительно присланного референса; заменить иконки фильтра и настроек и проверить работу при изменении размера.
- [x] 5.2 Сделать настройку сочетаний Find/Replace доступной из настроек расширения через штатный редактор клавиш VS Code и проверить её.
- [x] 5.3 Исправить подсветку preview с учётом установленной темы и Remote SSH; сохранить выделение совпадений и явно описать непокрытые случаи.
- [x] 5.4 Проверить и описать оставшиеся фиксированные размеры, настройки и ограничения, выполнить подходящие автоматические и интеграционные проверки.
- [x] 5.5 По согласованию проверить изолированный прототип native TextEditor preview с клиентской темой при Remote SSH; зафиксировать read-only, несохранённый текст, потерю ввода и ограничение переноса. Это исследование не закрывает реализацию 4.6/5.3.
- [x] 5.6 Реализовать согласованную клиентскую передачу темы/grammars через команды VS Code, поставку локального UI-компонента и настройку без ручной установки темы на сервер.
- [x] 5.7 Проверить готовый Remote preview в едином окне и вкладке: клиентская GitHub Dark Default, BL и клиентская JS grammar, смена темы/customizations, быстрый ввод, Replace/Undo, read-only и исходники/Reload Window.
- [x] 5.8 Исправить дробление рамки совпадения по TextMate-токенам: единый контейнер на диапазон строки, сохранение syntax styles, соседних/multiline/zero-width matches и табуляции; проверить DOM и реальный browser layout.
- [x] 5.9 По замечанию пользователя сделать заливку совпадений прозрачнее, сохранив цвет и исходный alpha темы, текст и рамку; проверить выдачу, preview и переключение тем в браузере.

Проверки и оставшиеся платформы: [матрица](../../../docs/testing/find-replace.md).

## Workflow follow-up

- После платформенной проверки и review синхронизировать baseline и архивировать change.
