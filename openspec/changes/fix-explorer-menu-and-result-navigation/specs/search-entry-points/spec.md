# Spec Delta

## MODIFIED Requirements

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
