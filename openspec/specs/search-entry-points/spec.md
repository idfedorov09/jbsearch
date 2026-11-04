# Search entry points

## Purpose

Точки входа JB Search используют контекст Explorer, чтобы открывать существующий
поиск с нужной областью без ручного выбора директории и потери параметров.

## Requirements

### Requirement: Explorer folder search

Расширение SHALL предлагать **JB Search: Find in Files…** в контекстном меню
файловой папки Explorer, включая корень workspace и Remote filesystem workspace.
Видимость и Directory MUST определяться ресурсом, на котором открыто меню,
независимо от количества ранее выделенных ресурсов.

#### Scenario: Selected nested directory
- **WHEN** пользователь вызывает JB Search: Find in Files… для папки workspace
- **THEN** открывается существующий Find-диалог с выбранной Directory и точным
  путём этой папки; результаты ограничены её содержимым и подпапками

#### Scenario: Workspace root and multiple roots
- **WHEN** пользователь вызывает action на корне или папке второго workspace root
- **THEN** областью становится выбранная папка, а не первый root

#### Scenario: File or multiple selection
- **WHEN** меню открыто на файле, ресурсе неподдерживаемой файловой системы
  либо при выделении нескольких ресурсов
- **THEN** пункт JB Search: Find in Files… скрыт для файла и неподдерживаемой
  файловой системы, но доступен на поддерживаемой папке независимо от выделения

#### Scenario: Multiple selected resources
- **WHEN** несколько папок или файлов выделены, а контекстное меню открыто на папке
- **THEN** пункт JB Search: Find in Files… доступен и ищет только в этой папке,
  не объединяя её с другими выделенными ресурсами

#### Scenario: Distinguishable built-in search
- **WHEN** в меню доступен также встроенный Find in Folder
- **THEN** собственный пункт содержит видимый префикс JB Search и различим
  без знания категории команды

### Requirement: Search context and saved results remain coherent

Контекстный поиск SHALL сохранять запрос и настройки поиска, но MUST NOT менять
сохранённую выдачу Find Panel или привязывать новый поиск к её редактированию.

#### Scenario: Existing modal
- **WHEN** выбранная папка меняется через Explorer при уже открытом или открывающемся modal
- **THEN** прежняя выдача очищается, выполнявшийся поиск отменяется, новый поиск выполняется для последней
  выбранной папки с сохранением текста запроса, масок и флагов

#### Scenario: Saved search or its draft
- **WHEN** контекстный поиск запускается из сохранённой Find-сессии или её draft
- **THEN** открывается независимый Find с копией параметров и новой Directory;
  старый снимок и параметры его draft сохраняются

#### Scenario: Default entry points
- **WHEN** пользователь открывает обычный Find или Replace по клавишам
- **THEN** действует прежняя логика; Explorer не меняет scope без вызова action

### Requirement: Reject an unavailable search directory

Расширение MUST проверить URI и существование папки workspace перед изменением
поиска и SHALL сообщить об ошибке без неявного расширения области поиска.

#### Scenario: Invalid command argument
- **WHEN** команда получает пустой аргумент, файл, папку вне workspace или ошибку stat
- **THEN** текущая сессия остаётся прежней и показывается понятная ошибка

#### Scenario: Replacement in progress
- **WHEN** контекстный поиск запрошен во время выполняющейся замены
- **THEN** параметры и область этой замены не меняются
