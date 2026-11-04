# Штатный плавающий диалог: проверка осуществимости

Дата: 2026-11-03. Результат исследования, не реализованная функция JB Search.

## Вывод

Обычное расширение, установленное из VSIX в немодифицированный VS Code 1.144.1,
может открыть собственный custom editor/webview в штатном modal editor поверх
workbench. Диалог перемещается и меняет размер; Esc закрывает его; перенос во
вкладку сохраняет UI. Отдельное приложение, proposed API и модификация установки
не требуются. Однако **открытие использует внутреннюю команду и внутренний номер
группы**, а не стабильный публичный контракт Extension API.

![Тестовый VSIX в обычном VS Code](assets/modal-stock-vscode.png)

На снимке реальные VS Code и custom editor. Результаты и preview демонстрационные;
это доказательство контейнера, а не готовый поисковый движок или финальный UI.

## Проверенная среда

- Официальный stable Linux x64, `1.144.1`, commit
  `261c84cb1eddf11235f9e2c921425e9663fbe556`.
- Архив получен через официальный update API; SHA-256 проверен:
  `59d8d6f9dc2431353c453cf6a4da0faae3993e332007ab387f526332eef93fe4`.
- Linux/X11 в Xvfb, окно 1440 × 900 внутри виртуального экрана 1440 × 1000.
- Отдельные user-data/extensions/workspace каталоги. Собранный probe VSIX
  установлен стандартным `code --install-extension` и проверен без
  `--extensionDevelopmentPath`. Также отдельно проверялся Development Host.
- GUI-автоматизация Playwright через CDP использовалась только для наблюдения,
  клавиатуры, мыши и снимков в тестовом экземпляре. Расширение не подключается
  к debugger/inspector, не инжектирует код и не получает DOM workbench.
- `--no-sandbox` и `--disable-gpu` — флаги запуска этой контейнерной тестовой среды,
  не требование расширения; обычный desktop sandbox в этом опыте не проверен.
- macOS, Windows, Wayland, Remote и браузерная версия **не проверены**.

## Механизм

1. В манифесте объявлен custom editor `jbsearchProbe.session` с priority `option`.
2. Через публичный `registerCustomEditorProvider` зарегистрирован read-only
   CustomDocument для URI сессии, `jbsearch-probe:/Find%20in%20Files.jbsearchprobe`.
   Реального файла сессии на диске нет; provider возвращает `{ uri, dispose() {} }`.
3. Команда расширения вызывает:

```js
await vscode.commands.executeCommand(
  '_workbench.openWith',
  sessionUri,
  'jbsearchProbe.session',
  [-4, { pinned: true, modal: { size: { width: 940, height: 650 } } }]
);
```

`-4` — внутренний `MODAL_GROUP`, не значение публичного `vscode.ViewColumn`.
Публичный `vscode.openWith` преобразует опции, а `createWebviewPanel(..., -4)`
не предоставляет этот маршрут. Их нельзя считать эквивалентной заменой вызова.

Внутренняя `_workbench.openWith` передаёт группу через `columnToEditorGroup`,
а `editorGroupFinder` создаёт modal part при `workbench.editor.useModal != off`.
В проверенном stable настройка по умолчанию `some`: менять её для эксперимента
с установленным VSIX не пришлось. `all` не требуется и продукт не должен её
включать. `some` оставляет обычные файлы во вкладках; некоторые системные страницы
VS Code открывает модально сам.

При `off` этот внутренний маршрут **молча открывает вкладку**. Будущий адаптер
обязан заранее проверять настройку и объяснять ограничение. Не менять её скрыто,
не объявлять вкладку успешным открытием требуемого диалога. Даже включение `some`
затрагивает поведение системных редакторов; выбор остаётся у пользователя.

Для переноса используется `workbench.action.moveModalEditorToMain`.
Штатный Esc из webview с фокусом в input закрыл диалог без собственного обработчика.
Сохранение запроса после закрытия обеспечивал объект состояния в extension host;
само закрытие уничтожало view. Для полноценных сессий нужен SessionController.

## Результаты эксперимента

Машиночитаемый протокол: [modal-editor-verification.json](modal-editor-verification.json).

| Проверка | Результат |
| --- | --- |
| Ctrl+Shift+F в чистом VS Code с установленным probe VSIX | Нативный modal поверх текущего editor |
| Начальный размер | 940 × 650 |
| Перетаскивание заголовка | (250, 125) → (320, 170) |
| Resize нижнего правого угла | 940 × 650 → 1016 × 686 |
| Esc при фокусе в query | Modal закрыт штатным обработчиком VS Code |
| Повторный вызов | Запрос `preserve this query` восстановлен из host state |
| Тема Dark Modern → Light Modern | Фон webview изменился rgb(31,31,31) → rgb(255,255,255) |
| Open in Editor Tab | Modal закрыт, тот же запрос во вкладке |
| Повторный shortcut из вкладки | Сессия снова в modal |
| Открытие обычного файла из modal | Modal закрыт, файл в основном editor |
| `useModal: off` | Modal отсутствует, fallback во вкладку — требуется guard |
| Без override настройки `useModal` | Modal работает; установка из VSIX подтверждена |

[Светлая тема во время работы](assets/modal-light.png).

Исходники изолированного опыта, VSIX и вспомогательные сценарии находятся в
`/tmp/jbsearch-window-research/`. Это временные исследовательские файлы, не часть
продукта; VSIX и бинарник VS Code в репозиторий не добавлены. Полноценная проверка
поиска, масок, regexp, preview, доступности и всех трёх ОС ещё впереди.

## Компоненты и темы

Контейнер, рамка, drag/resize, системные действия и Esc здесь принадлежат VS Code.
Содержимое — webview: публичный API не экспортирует внутренние поля, списки и
TextEditor workbench. Для UI предлагается `@vscode-elements/elements`: поддерживаемая
сторонняя библиотека, воспроизводящая элементы VS Code через Web Components.
Она использует передаваемые webview CSS-переменные `--vscode-*`; это не официальный
пакет внутренних widgets. В этом опыте библиотека не установлена: использованы
обычные HTML controls с переменными темы. Встроенный кодовый preview остаётся
отдельным выбором: read-only renderer или отдельно поставляемый Monaco, без
автоматического наследования всех расширений редактора и syntax theme.

Microsoft Webview UI Toolkit deprecated с 2025-01-01; брать его основой нового UI
не рекомендуется. Постоянные предпочтения можно предоставить настоящим штатным
Settings UI через `contributes.configuration`.

## Как делают другие

Найдено [IntelliJ Styled Search](https://marketplace.visualstudio.com/items?itemName=newdlops.intellij-styled-search)
с очень близким UX. Исследован
[исходный код](https://github.com/newdlops/intellij-styled-search) на commit
`7bb3716bef30bfda75ede08d8551118ba62000ae`: `overlayPanel.ts` подключается к
Electron inspector/CDP и использует `Runtime.evaluate`; POSIX-реализация включает
inspector через SIGUSR1; отдельный документ описывает monkey-patching Monaco.
Это существующий пример, но другой класс зависимости от внутренних механизмов.
Его не запускали и не перенимали. Новые modal editors позволяют обходиться без
такой инъекции и без отдельного приложения.

## Границы вывода и следующий этап

- Механизм modal editors объявлен в 1.110 как experimental. Проверен конкретно
  1.144.1; минимальная совместимая версия этим исследованием **не установлена**.
  `engines.vscode` основного JB Search остаётся прежним, пока нет реализации.
- Внутреннюю команду и `-4` изолировать в одном адаптере. Наличие команды само по
  себе не доказывает поддержку modal. Нужны тесты выбранных stable-версий,
  доступное объяснение отсутствующей поддержки и переход на публичный API,
  когда он появится. Нельзя гарантировать совместимость будущих обновлений.
- UI модальный в пределах workbench; отдельного окна в Alt+Tab этот путь не создаёт.
  Поведение фона, menus, IME, fullscreen, несколько окон и восстановление после
  перезапуска ещё проверить на macOS, Windows, Linux. Только Linux/X11 доказан.
- Поставка отдельного Electron/Tauri приложения больше не является необходимым
  кандидатом. Запрос на обычный VSIX и stock VS Code достижим с указанной
  внутренней зависимостью. Согласование этой зависимости отделено от доказательства.

## Источники

- [Официальное введение modal editors, VS Code 1.110](https://code.visualstudio.com/updates/v1_110#_modal-editors-experimental)
- [Текущая документация интерфейса VS Code](https://code.visualstudio.com/docs/editing/getting-started/userinterface)
- [Внутренняя команда открытия, source 1.144.0](https://github.com/microsoft/vscode/blob/1.144.0/src/vs/workbench/browser/parts/editor/editorCommands.ts#L545)
- [Преобразование группы](https://github.com/microsoft/vscode/blob/1.144.0/src/vs/workbench/services/editor/common/editorGroupColumn.ts#L18)
- [Выбор modal group и настройка](https://github.com/microsoft/vscode/blob/1.144.0/src/vs/workbench/services/editor/common/editorGroupFinder.ts#L143)
- [Штатные drag и resize](https://github.com/microsoft/vscode/blob/1.144.0/src/vs/workbench/browser/parts/editor/modalEditorPart.ts#L537)
- [Документация Custom Editor API](https://code.visualstudio.com/api/extension-guides/custom-editors)
- [Темы webview](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content)
- [VSCode Elements: назначение и ограничения](https://vscode-elements.github.io/guides/getting-started/#what-is-vscode-elements)
- [Архивированный Microsoft Webview UI Toolkit](https://github.com/microsoft/vscode-webview-ui-toolkit)
