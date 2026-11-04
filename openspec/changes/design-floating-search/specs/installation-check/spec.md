# Spec Delta

## MODIFIED Requirements

### Requirement: Installation check command
Расширение SHALL предоставлять команду `jbsearch.checkInstallation` с названием
`JB Search: Check Installation` и сообщать о доступных Find/Replace.
Уведомление SHALL включать версию и расположение фактически загруженного расширения
из `ExtensionContext.extension`.

#### Scenario: User invokes the command
- **WHEN** пользователь выполняет команду проверки установки
- **THEN** расширение показывает `JB Search <version> is ready. Use Find in Files or Replace in Files. Loaded from <path>` с фактической версией и путём
- **AND** сама команда не запускает поиск

#### Scenario: Source registration
- **WHEN** пользователь однажды регистрирует папку исходников через Developer: Install Extension from Location и сохраняет изменения исходников
- **THEN** после Developer: Reload Window VS Code загружает изменённый код из этой папки
- **AND** пересборка и переустановка VSIX не требуются
