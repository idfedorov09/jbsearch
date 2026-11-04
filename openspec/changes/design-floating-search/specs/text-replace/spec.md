# Spec Delta

## Purpose

Дать Replace in Files с безопасной проверкой актуальности и штатным Undo.

## ADDED Requirements

### Requirement: Selected replacement
Продукт SHALL заменять выбранное совпадение через WorkspaceEdit без автосохранения.

#### Scenario: Replace selected match
- **WHEN** пользователь нажимает Replace на актуальном совпадении
- **THEN** изменяется только выбранный диапазон и выдача обновляется
- **AND** изменение можно отменить через Undo в VS Code

### Requirement: Replace all
Продукт SHALL применять весь полный актуальный набор совпадений одной операцией.

#### Scenario: Complete result set
- **WHEN** пользователь запускает Replace All после полного поиска
- **THEN** все актуальные совпадения изменяются через один WorkspaceEdit
- **AND** файлы не сохраняются автоматически

#### Scenario: Stale or incomplete results
- **WHEN** выдача ограничена лимитом либо документ изменился после поиска
- **THEN** массовая замена не применяется и UI предлагает обновить поиск

### Requirement: Replacement syntax
Продукт SHALL поддерживать capture substitution в Regex и preserve case.

#### Scenario: Capture groups
- **WHEN** regex имеет группу и replacement содержит $1 либо $<name>
- **THEN** замена использует captured value соответствующего совпадения

#### Scenario: Literal replacement
- **WHEN** Regex выключен и replacement содержит $1
- **THEN** в документ вставляется буквальный текст $1
