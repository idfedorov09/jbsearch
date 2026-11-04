# Design

**Implementation in progress.** Разрешено пользователем 2026-11-03. Проверка осуществимости
выявила подход к обязательному диалогу: штатный modal editor с custom webview
обычного VSIX. Внутренняя команда открытия принята как изолированная зависимость,
не как гарантия стабильного API. Для Remote preview 2026-11-04 принята клиентская
UI-часть расширения; отдельное desktop-приложение не требуется.

## Context

См. [proposal.md](proposal.md). Расширение реализует Find/Replace и сохраняет
Check Installation; minimum VS Code 1.143.1, JavaScript/CommonJS, компиляции нет.
`npm ci` подготавливает вложенный VSIX клиентской UI-части. ADR
[0002](../../../docs/adr/0002-floating-search-host.md) объясняет границу UI/API,
[0003](../../../docs/adr/0003-search-engine-and-session.md) — поискового API.
[Реальный эксперимент](../../../docs/research/modal-editor-feasibility.md)
проверил официальный VS Code 1.144.1 Linux/X11, включая обычную установку probe
VSIX без Development Host. Тот эксперимент проверял контейнер; результаты проверок
реального Find/Replace фиксируются отдельно в [матрице](../../../docs/testing/find-replace.md).
Дополнительно 1.143.1 проверен с регистрацией исходников; Remote SSH проверен
отдельно. Разделение клиентских и серверных grammar/theme решается каналом
ресурсов из [ADR 0006](../../../docs/adr/0006-remote-preview-theme.md); реальные
сценарии проверки этого канала фиксируются отдельно. macOS/Windows не
считаются проверенными на основании опыта Linux/X11.

## Goals / Non-Goals

**Goals:** один основной установочный VSIX для stock VS Code со вложенной
клиентской UI-частью для Remote; нативный контейнер поверх workbench;
единая сессия окна/вкладки; наследование темы; поиск вне UI-потока. Использовать
публичные API, изолируя принятое исключение для modal opening в адаптере.

**Non-Goals:** DOM/inspector injection, патч/форк редактора, отдельное приложение,
собственный полноценный редактор кода, дублирование штатной страницы настроек.

## Decisions

### 1. Нативный modal editor и граница поддержки

Выбран read-only CustomEditorProvider для виртуального URI сессии. Его webview содержит
query/results/preview, а modal part VS Code даёт заголовок, drag/resize, Esc и
переход во вкладку. Это контейнер внутри workbench, без отдельного окна Alt+Tab.
Поведение модальности фона и сочетаний клавиш требуется проверить в UX-тестах.

Открытие в проверенной версии:

```js
await vscode.commands.executeCommand(
  '_workbench.openWith', sessionUri, viewType,
  [-4, { pinned: true, modal: { size: { width: 820, height: 640 } } }]
);
```

Это начальный размер из modal adapter. `_workbench.openWith`, `-4`
и modal options — внутренний контракт. Публичного ViewColumn.Modal нет;
createWebviewPanel и публичный vscode.openWith не принимаются за эквивалент.
Адаптер обязан изолировать этот код, проверять поддерживаемую версию и настройку,
обрабатывать ошибки. Одного наличия команды недостаточно для проверки совместимости.

На 1.144.1 default workbench.editor.useModal — some; обычные файлы продолжают
открываться во вкладках. Не включать all. Если пользователь выбрал off, внутренний
маршрут молча открывает tab: до вызова нужно показать ограничение и дать пользователю
самостоятельно изменить настройку. Не менять её автоматически и не считать tab
успешным выполнением требования. При появлении публичного modal API заменить адаптер.

Внутренние controls workbench при этом не экспортируются. Используются semantic
HTML controls с переменными темы VS Code: контейнер настоящий,
содержимое webview воспроизводит привычные поля/checkbox/toolbar/list.
Дополнительная библиотека компонентов не требуется для компактной компоновки.

### 2. Архитектура в одном VS Code

```text
VS Code command / keybinding
             |
             v
ModalHostAdapter -> CustomEditorProvider -> webview: query/results/preview
                                                |
                                          webview messages
                                                |
                                                v
Extension host: SessionController -> SearchEngine / PreviewProvider
                                                |
                                                v
                                  files + dirty document snapshots

Remote only: PreviewProvider -> VS Code command -> client UI extension
                     ^                          -> client theme + grammars
                     |______ resource snapshot _______|

Native Move to Editor -> same custom editor + same SearchSession
```

При Remote основной workspace extension (`idfedorov09.jbsearch`) остаётся на
сервере. Стандартный UI extension `idfedorov09.jbsearch-client` с
`extensionKind: ["ui"]` работает локально на клиенте и читает тему/grammars через installation
URI и `workspace.fs`. Снимок ресурсов передаётся через
`jbsearch.client.previewResources`; смена темы, token customizations или набора
расширений сообщает серверу о необходимости обновления через
`jbsearch.previewResourcesChanged`. Запросы и содержимое файлов клиентскому
компоненту не передаются. Локальный workspace не требует этого канала.

Нет запуска GUI-процесса, локального HTTP-сервера и собственного сокетного IPC.
Extension host проверяет сообщения webview, resultId и допустимые URI; renderer
не имеет Node/filesystem-доступа. Для HTML нужны CSP, локальные ресурсы и безопасный
вывод snippets. UI не может передавать произвольные shell-команды для выполнения.
Каждая сессия принадлежит своему экземпляру/workspace; несколько окон не должны
делить «последний активный» результат. Remote требует отдельной проверки search
backend и канала ресурсов, но не запуска графического приложения на remote host.

### 3. Сессия

SearchSession: sessionId, workspace identity, query/options, scope, masks,
generation, result metadata, selectedResultId, status, revision. Истина — в host;
UI подписывается на snapshot и batched events. Каждый новый запрос отменяет
предыдущий, его запоздавшие события отбрасываются. Preview имеет свою revision.
Локальные patches имеют clientId/revision и host acknowledgements: поздний
snapshot не перезаписывает более новый ввод. Пока patch не подтверждён, замена
недоступна; новые query/options сразу убирают устаревшие results.

При show контроллер открывает новую view с URI, включающим стабильный id сессии,
и только после успешного открытия закрывает прежнюю view. Это устраняет как
дефект layout при возврате retained webview из tab в modal, так и гонку открытия
по Remote SSH. Сессия остаётся в host; при `useModal: off` прежняя вкладка
сохраняется. См. ADR 0004 и матрицу интеграционных проверок.

«Открыть во вкладке» вызывает штатный moveModalEditorToMain для текущего custom
editor; тот же UI сохраняет ту же сессию. Повторное открытие использует URI сессии.
Это не экспорт строки в штатный Search Editor.
Повторное действие показывает существующую вкладку этой сессии. «Новая вкладка»
создаёт отдельную сессию-копию запроса/фильтров, чтобы запросы могли расходиться.
Повторный shortcut Find/Replace открывает текущую сессию в modal.

При reload webview query/filter/selection приходят из живой host session;
getState/setState сохраняют только высоту results. Esc закрывает view: host
сохраняет сессию на время жизни extension host. Query, options, results и исходники
не сохраняются на диск. После restart host создаёт пустую сессию, в том числе если
VS Code повторно разрешает старый CustomDocument URI. Объём контекста preview
ограничен; полный файл в webview state не сохраняется.

### 4. Компоновка и клавиатура

Референс — присланные Find/Replace in Files: компактный header/mask, затем query
с toolbar справа, в Replace вторая строка replacement/preserve-case; scopes ниже;
плотные rows snippets + filename/line справа; preview снизу; footer с Open in
Find Window (перенос в editor tab), Replace All и Replace. Open Editors заменяет
неприменимый Module. Палитра и шрифты берутся из VS Code, не фиксируются под JetBrains.
Cmd+Shift+F — Find, Cmd+Shift+R — Replace; Windows/Linux используют Ctrl.


Верх: заголовок, количество совпадений/файлов, маска с checkbox, расширенные
фильтры. Ниже — textarea запроса и действия New Line, Match Case, Whole Word,
Regex. Далее — Workspace / Folder / Directory / Open Editors / Custom Scope.
`Module` не переносим буквально: в VS Code нет единой модели модулей Java/Gradle.

Центр: плоский компактный список «фрагмент — файл — строка». Снизу — preview с
path, номерами строк и подсветкой совпадений; разделитель изменяет высоту.
В preview рамка и фон принадлежат одному контейнеру найденного диапазона
на строке. Вложенные TextMate-токены сохраняют собственные цвета и начертания,
но не рисуют отдельные границы. Текст строки остаётся в едином inline-контексте,
чтобы tab stops не зависели от границ токенов или совпадений. Соседние диапазоны
не объединяются; многострочное совпадение имеет фрагмент на каждой строке,
нулевая длина обозначается отдельным маркером.
Фон совпадения в выдаче и preview смешивается с transparent: остаётся 70%
непрозрачности исходного цвета темы, включая его alpha-канал. Это смягчает заливку,
сохраняя цвета текста и чёткость рамки; прозрачный текущий match остаётся прозрачным.
Статусы: пустой запрос, поиск идёт, нет результатов, regex error, partial results,
лимит, отмена, недоступный файл, потеря связи. Счётчик во время поиска — «Найдено N»,
после завершения — итог; при лимите — «Показаны первые N».

Раскладка:

| Контекст | Действие |
| --- | --- |
| Tab / Shift+Tab | Последовательно перейти по управляющим элементам |
| Space на checkbox/toggle | Переключить; текст содержит доступное название |
| Shift+Enter / кнопка New Line | Вставить настоящий перевод строки в запрос |
| Enter в query | Перейти к первому результату; не вставлять newline |
| Стрелки в textarea | Обычное движение каретки; ArrowDown в однострочном query переводит фокус в results |
| Стрелки в results | Выбрать совпадение, обновить preview |
| Enter / двойной клик по результату | Открыть файл на точном диапазоне в исходном VS Code |
| Cmd+Enter / Ctrl+Enter | Открыть сессию во вкладке |
| Esc | Сначала закрыть дополнительные фильтры; затем штатная команда VS Code закрывает modal |

Не перехватывать Enter во время IME composition. Tooltips описывают действие,
не заменяют accessible labels. ARIA states, видимый focus, screen-reader live status,
high contrast и масштабирование — часть UI. Превью read-only: Tab выходит из него.

Cmd+Shift+F / Ctrl+Shift+F конфликтует со штатным Find in Files. Выбрана
настройка `jbsearch.keybindings.overrideFindInFiles`, по умолчанию true;
когда true, declarative keybinding с `when: config.jbsearch.keybindings.overrideFindInFiles`
направляет сочетание в JB Search. Показать этот выбор при настройке; пользователь
может переназначить команду через Keyboard Shortcuts. Из описания настройки ведут
отдельные ссылки в редактор, отфильтрованный по команде Find или Replace. При
редактировании стандартного сочетания VS Code сохраняет его `when`: переключатель
продолжает управлять сочетанием, пока пользователь не удалит это условие. Не править
keybindings.json автоматически и не регистрировать глобальный хоткей ОС.

### 5. Scopes и маски

Workspace — все корни; Folder — один явно выбранный workspace root; Directory —
каталог внутри корня; Open Editors — открытые текстовые вкладки, не просто все
загруженные TextDocuments; Custom Scope — именованный набор include/exclude globs.
Для Open Editors можно учитывать открытые файлы вне workspace и untitled buffers,
поскольку пользователь явно выбрал этот scope. Для остальных scopes границы корней
сохраняются. Remote URI не превращается в локальный fsPath. Open Editors применяет
маску и явные исключения к файловым документам; gitignore применяется для файлов
внутри известных корней. Для untitled маска проверяет отображаемое имя, а
файловые ignore-правила не применяются; при несовпадении маски документ исключается.

Маска — дополнительное пересечение со scope; её отключение сохраняет введённый
текст. Синтаксис: шаблоны через `;`, например `*.js;*.ts`, OR внутри
списка. Шаблон без `/` применяется к basename во всех подпапках; с `/` — к пути
от корня, разделитель `/` на всех ОС. Поддерживаются `*`, `?`, `**` и brace
alternatives, например `**/*.{js,ts}`; отрицание `!` не поддерживается. Для
исключений отдельное поле, а не regex. Собственные mask/include/exclude globs
чувствительны к регистру на всех ОС, независимо от Match Case текстового запроса.

По умолчанию учитываются `.gitignore`, `search.exclude`, `files.exclude`
и настройки search.useIgnoreFiles/useGlobalIgnoreFiles/useParentIgnoreFiles;
«Учитывать исключения» переключает их и общее Exclude-поле UI. Настройки
объединяются для каждого workspace root отдельно с учётом boolean false и conditional
excludes. Include текущего запроса и include именованного scope пересекаются;
OR применяется только внутри каждого набора шаблонов. Выбранный scope, его
include/exclude и маска остаются ограничениями при отключении ignore/exclusions.
Symlinks не обходятся. Поддерживается UTF-8; binary, UTF-16, невалидная кодировка,
слишком большие и недоступные файлы учитываются как пропуски. Неполная выдача
показывается явно и запрещает Replace All.

### 6. Поисковый сервис

Выбран поставляемый @vscode/ripgrep-universal для перечисления файлов с ignore-политикой.
Один matcher ECMAScript выполняется в disposable Node worker: UTF-16 offsets,
Unicode whole-word, case, multiline и capture groups одинаковы для диска и dirty
snapshots. Это пересмотр прежнего PCRE2-предложения ради согласованности Replace.
Leading (?s)/(?m)/(?i) поддерживаются явно; остальные regex имеют JS-семантику.
Нормализация настоящих переводов строк учитывает CRLF; literal backslash-n — текст.

Worker читает UTF-8, отбрасывает binary/невалидную кодировку, ограничивает размер,
количество matches и время. Abort/timeout terminate worker и процесс перечисления.
В extension host regex не запускается. Пакеты ripgrep не берутся из установки
VS Code или workspace PATH. Запросы, snippets и исходники не пишутся в логи.

Подсветка preview: vscode-textmate + vscode-oniguruma с опубликованными grammar/theme
contributions установленных расширений. При локальной работе ресурсы берутся из
текущего host. При Remote снимок клиентской темы и grammars поступает от UI-части;
тему на сервер устанавливать не требуется. Серверные grammars сохраняют приоритет
для совпадающего языка/scope; клиентские дополняют отсутствующие, включая встроенные.
Тема определяется по активному workbench.colorTheme с includes, JSONC/tmTheme,
локализованными именами и tokenColorCustomizations; цвета оболочки из --vscode-*.
Клиентские content strings разбираются на сервере без чтения клиентских путей
серверным `fs`. Кэш theme/registry сбрасывается при уведомлении об изменении
ресурсов, запоздавшие preview не заменяют выбранный результат.
Это TextMate syntax highlighting, без LSP semantic tokens сторонних расширений.
Язык без grammar отображается обычным текстом с доступным сообщением о fallback.
Найденные диапазоны рисуются поверх syntax tokens, сохраняя цвета текста; выбранная
строка и match имеют разные декорации. Preview read-only, scroll, line numbers,
нижний splitter. HTML строится безопасно, без интерпретации текста файлов как markup.

Исследование 2026-11-04 проверило альтернативу: настоящий `TextEditor` в нижней
группе того же modal. Клиентская GitHub Dark Default и BL-подсветка работают без
темы на сервере, включая read-only snapshot актуального несохранённого текста.
Однако проверенный маршрут временно переводит фокус в preview и теряет символы
запроса; исходный URI также допускает случайную правку кода. Snapshot защищает
код, но не ввод. Штатный перенос делает search и preview отдельными вкладками.
Этот адаптер не переносится в production. Другой native маршрут без смены
фокуса не реализован; стабильный virtual URI с обновлением через content provider
остаётся исследовательской идеей без реализации и проверки в продукте.
Невозможность любого native preview не установлена.
См. [результаты](../../../docs/research/native-preview-feasibility.md) и
[Accepted ADR 0006](../../../docs/adr/0006-remote-preview-theme.md).
Выбран клиентский канал ресурсов с двумя extension ID, сохраняющий прежнюю единую
компоновку окна и вкладки без focus-переходов в отдельный TextEditor. Готовность
Remote preview определяется проверками в tasks.md, а не одним принятием ADR.

`npm ci`/`npm run prepare:client` собирает клиентский VSIX из `client/` и двух
закреплённых runtime-зависимостей, уже установленных в корневом `node_modules`.
Основной VSIX включает этот пакет. При первом Remote preview сервер вызывает
штатную `workbench.extensions.installExtension` с URI вложенного VSIX;
`extensionKind: ["ui"]` размещает клиентскую часть локально. Доступность команды
проверяется её исполнением, которое также активирует установленный компонент.
Автоматическая попытка установки ограничена одной за активацию. Команда
**JB Search: Set Up Client Preview** даёт явный повтор, а несовпадение хэша сборки
позволяет обновить пакет и сообщить о необходимости Reload Window, если старый
клиентский код ещё загружен. Ошибка настройки показывается в preview, при этом
поиск и выделение совпадений продолжают работать. Протокол v1, размеры ресурсов
и deadlines описаны в [границах](../../../docs/implementation-limits.md).

Replace использует captured matches, без повторного запуска regex в extension host.
Поддерживаются $1/$<name>/$$/$& и preserve case; обычная замена literal не разворачивает
capture-синтаксис. Перед применением проверяются версии документов/полный snapshot
файла и ranges. Для Replace All неполная выдача запрещает операцию; сначала требуется
полный поиск. Весь набор применяется одним WorkspaceEdit, не сохраняется автоматически,
отменяется средствами VS Code. Повторное нажатие и устаревший search generation отклоняются.

### 7. Настройки и тема

Постоянные предпочтения — `contributes.configuration`, поэтому сразу есть UI
в Settings и Settings JSON. Шестерёнка открывает Settings с `@ext:idfedorov09.jbsearch`.
В окне остаются настройки текущего поиска; они живут в памяти extension host.
Запросы и их история не записываются на диск. Настройки manifest и defaults:

| Setting | Default | Назначение |
| --- | --- | --- |
| `jbsearch.keybindings.overrideFindInFiles` | true | Перехват штатного сочетания по выбору пользователя |
| `jbsearch.search.debounceMs` | 150 | Задержка после ввода |
| `jbsearch.search.maxResults` | 5000 | Лимит совпадений |
| `jbsearch.search.maxFileSizeMiB` | 2 | Ограничение чтения |
| `jbsearch.search.timeoutMs` | 10000 | Время одного запуска |
| `jbsearch.search.respectExcludes` | true | Начальное значение фильтра исключений |
| `jbsearch.scopes` | [] | Именованные наборы include/exclude, resource scope |

Числовые настройки имеют minimum/maximum. Путь executable нельзя задавать
из workspace configuration. Общие предпочтения — user/window, scopes — resource,
runtime-переключатели — session. Сессии принадлежат extension host данного окна;
после его restart запросы и результаты сбрасываются.

В modal и во вкладке один webview получает `--vscode-*`, editor font variables
и классы light/dark/high contrast от VS Code. Controls построены на semantic HTML
с CSS tokens, CSS/inline SVG-иконками и текстовыми glyphs; библиотеки VSCode Elements и
Webview UI Toolkit не используются. Смена Dark Modern → Light Modern в опыте
обновила UI без перезагрузки; custom themes, HC/zoom требуют отдельных проверок.
TextMate renderer загружает token colors отдельно, как описано в разделе 6;
встроенного Monaco в preview нет.

## Risks / Trade-offs

- [Внутренний modal API] → один адаптер, тесты выбранных stable-версий, явное
  unsupported состояние. Не скрывать fallback во вкладку и не гарантировать
  будущую совместимость. Пользователь подтвердил это ограниченное исключение.
- [Три ОС] → Linux/X11 доказан; отдельно проверить Windows/macOS, Wayland,
  fullscreen, несколько окон, zoom, IME и accessibility. Нативная рамка снижает
  объём собственного кода, но не заменяет платформенную проверку.
- [Webview controls] → проверять semantic HTML controls на разных темах, high
  contrast и zoom; не выдавать их за экспорт внутренних widgets workbench.
- [Remote workspace] → SSH extension host видит серверные file URI и выполняет
  поиск на сервере. Клиентская тема и недостающие grammars поступают по командам;
  отключённая UI-часть, ошибка установки или недоступный ресурс дают явное
  пояснение. Переносимость канала между разными машинами проверяется отдельно
  от Linux Remote SSH loopback. WSL/Containers не считаются проверенными.
- [Regex и большие репозитории] → изоляция worker, отмена, limits и partial status.
- [Жизненный цикл] → host session, revision checks, тесты Esc/reopen/move/reload;
  не полагаться только на сохранность DOM.

## Migration Plan

Find/Replace, scopes, preview и переход во вкладку реализованы; Check Installation
сообщает о командах поиска и замены. Поставка — основной VSIX с runtime-зависимостями
и вложенным VSIX UI-части для Remote. Проверка упаковки выполняется отдельно
от запуска. Для локального обновления
установленного расширения VSIX пересобирается и переустанавливается. Для работы
без переустановки VS Code может зарегистрировать исходную папку через Install
Extension from Location; после правок требуется Reload Window. См. ADR 0004.
Изменения только серверного кода не требуют пересборки клиентского пакета.
После изменения `client/` требуется `prepare:client` и повтор настройки preview;
для разработки самой UI-части можно отдельно зарегистрировать папку `client/`
из исходников на локальном host клиента, установив её зависимости.

Оставшиеся проверки перечислены в tasks.md; результаты и ограничения — в
[матрице](../../../docs/testing/find-replace.md). При useModal: off адаптер
объясняет ограничение и предлагает Settings. Неподдерживаемая версия или ошибка
открытия показывается пользователю; автоматической подмены modal вкладкой нет.
Коммиты, релизы и публикация сейчас не выполняются.

## Implementation scope and remaining verification

Пользователь подтвердил внутренний modal adapter и реализацию Find/Replace.
Минимум VS Code 1.143.1 проверен с регистрацией из исходников на Linux/X11.
Целевые desktop-платформы — macOS/Windows/Linux, и bundled backend содержит их
бинарные файлы; ручная проверка Windows/macOS остаётся отдельным пунктом и не
считается выполненной по наличию binaries или запуску в Linux.
На Remote SSH поиск работает на файловом host сервера, клиентские grammar/theme
доставляются стандартным UI-компонентом по командам VS Code. Проверка на разных
машинах остаётся открытой; Linux loopback не заменяет её. Semantic tokens
не реализованы. Браузерный host с Node worker/ripgrep
не поддерживается. Архивировать change до
платформенной проверки нельзя; реализацию можно доставить с честной матрицей проверок.
