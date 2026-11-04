# Spec Delta

## Purpose

Определить предсказуемый текстовый поиск с фильтрами, отменой и корректным
preview по актуальному содержимому. Regex имеет документированную ECMAScript
семантику, одинаковую для дисковых файлов и несохранённых документов.

## ADDED Requirements

### Requirement: Query modes
Поиск SHALL поддерживать literal, Match Case, Whole Word, regex и многострочный
запрос; синтаксис regex документируется отдельно от Java regex JetBrains.

#### Scenario: Literal versus regular expression
- **WHEN** пользователь ищет `a.b` с выключенным Regex
- **THEN** точка ищется буквально
- **AND** при включении Regex точка получает значение оператора выбранного диалекта

#### Scenario: Case and words
- **WHEN** Match Case и Whole Word включены для запроса `cat`
- **THEN** `cat` находится, а `Cat` и `catalog` не находятся

#### Scenario: Newline
- **WHEN** пользователь вводит настоящий перевод строки между `first` и `second`
- **THEN** поиск находит соседние строки с этим текстом в LF и CRLF файлах
- **AND** literal `\n` без настоящего перевода строки остаётся текстом

#### Scenario: Invalid regular expression
- **WHEN** введено некорректное выражение
- **THEN** у поля показана ошибка и поиск этого выражения не запускается
- **AND** старые результаты не выдаются за результаты нового запроса

#### Scenario: Escaped newline and dotall
- **WHEN** включён Regex и запрос содержит `first\nsecond` либо `(?s)first.second`
- **THEN** выражение может сопоставить текст на соседних строках
- **AND** точка без dotall не сопоставляет перевод строки

### Requirement: Search scopes
Поиск SHALL различать весь workspace, отдельный root, directory, открытые
текстовые вкладки и именованный custom scope; отсутствие универсальной модели
модулей VS Code не скрывается названием Module.

#### Scenario: Multiple roots
- **WHEN** в multi-root workspace выбран один root
- **THEN** результаты ограничены этим root и содержат однозначный путь

#### Scenario: Open editors
- **WHEN** выбрана область Open Editors
- **THEN** ищутся открытые текстовые вкладки, включая доступные untitled buffers
- **AND** закрытый, но загруженный внутренне документ не включается автоматически

#### Scenario: Empty workspace
- **WHEN** Workspace выбран без открытых корневых папок
- **THEN** UI сообщает об отсутствии области и предлагает открыть папку или выбрать Open Editors

#### Scenario: Custom scope with additional include
- **WHEN** выбран custom scope с include `src/**` и пользователь вводит include `**/*.js`
- **THEN** ищутся только JS-файлы внутри `src`, прошедшие остальные фильтры
- **AND** include текущего запроса не расширяет границы выбранного scope

### Requirement: File masks
Поиск SHALL пересекать scope с включённой маской. Шаблоны `*`, `?`, `**` и
`{a,b}` разделяются `;`; без `/` применяется basename, с `/` — путь от корня.
Mask/include/exclude globs чувствительны к регистру независимо от Match Case.
Отключённая маска сохраняет текст, но не фильтрует результаты.

#### Scenario: Combined masks
- **WHEN** выбран Directory `src` и маска `*.js;*.ts`
- **THEN** находятся только JS/TS файлы внутри `src` и его подпапок

#### Scenario: Disabled mask
- **WHEN** пользователь выключает File mask
- **THEN** текст маски сохраняется, а поиск включает остальные допустимые файлы scope

### Requirement: Exclusions and traversal
Поиск SHALL явно применять выбранную политику ignore и exclusions каждого root,
не следовать symlinks за scope и не выдавать пропущенные файлы за проверенные.

#### Scenario: Default exclusions
- **WHEN** учитывание исключений включено
- **THEN** `.gitignore`, применимые search/files exclusions и ignore-настройки ограничивают результаты
- **AND** маска файла не возвращает исключённый файл обратно

#### Scenario: Exclusions disabled
- **WHEN** пользователь выключает учитывание исключений
- **THEN** ignore и общие exclude-фильтры отключаются
- **AND** выбранный scope с его include/exclude, include текущего запроса, маска и ограничения ресурсов сохраняются

#### Scenario: Unsupported input
- **WHEN** встречается бинарный, недоступный или неподдерживаемый по кодировке файл
- **THEN** он не интерпретируется как обычный UTF-8 текст
- **AND** неполнота поиска и причина пропуска доступны пользователю

### Requirement: Unsaved documents
Поиск SHALL использовать актуальные снимки изменённых открытых документов
в выбранном scope вместо их дисковых копий, с той же семантикой сопоставления.

#### Scenario: Unsaved edit
- **WHEN** совпадение существует только в несохранённом изменении файла
- **THEN** оно доступно в результатах и preview
- **AND** результаты старой дисковой версии этого файла не дублируются

#### Scenario: Document changes during search
- **WHEN** версия документа меняется во время поиска
- **THEN** результаты старой версии инвалидируются и обновляются

#### Scenario: Excluded dirty file
- **WHEN** изменённый открытый файл не проходит текущие scope/mask/ignore-правила
- **THEN** его snapshot не добавляет совпадения в результаты

#### Scenario: Untitled with mask
- **WHEN** в Open Editors включена маска и открыта untitled вкладка
- **THEN** маска проверяет её отображаемое имя, а файловые ignore-правила не применяются

### Requirement: Cancellation and partial results
Поиск SHALL отменять устаревшие запросы, постепенно показывать результаты
и явно различать завершение, отмену, ошибку, пустой запрос и достижение лимита.

#### Scenario: Rapid typing
- **WHEN** новый запрос отправлен до завершения предыдущего
- **THEN** поздние результаты предыдущего не появляются в новой выдаче

#### Scenario: Limit or deadline
- **WHEN** достигнут настроенный лимит результатов, размера файла или времени
- **THEN** интерфейс сообщает о неполном поиске и его причине
- **AND** не показывает ограниченный счётчик как полное количество совпадений

#### Scenario: Empty query
- **WHEN** поле запроса пусто
- **THEN** поиск не выполняется и UI предлагает ввести запрос

### Requirement: Accurate ranges
Поиск SHALL сохранять точные диапазоны для preview и открытия результата,
включая Unicode, CRLF, multiline и несколько совпадений на одной строке.

#### Scenario: Unicode positions
- **WHEN** перед совпадением есть emoji и кириллица
- **THEN** выделяется сам match, без сдвига на число UTF-8 байтов

#### Scenario: Zero-width match
- **WHEN** regex возвращает совпадение нулевой длины
- **THEN** поиск завершается или достигает лимита без бесконечного цикла
- **AND** позиция совпадения отображается однозначно
