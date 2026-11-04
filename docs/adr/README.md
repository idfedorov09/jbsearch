# Архитектурные решения

ADR фиксирует контекст, варианты, решение и последствия; отдельный CLI не нужен.
Требования и сценарии ведём в OpenSpec, не дублируем их здесь целиком.

| ADR | Статус | Тема |
| --- | --- | --- |
| [0001](0001-record-decisions-and-specifications.md) | Accepted | ADR и OpenSpec |
| [0002](0002-floating-search-host.md) | Accepted | Штатный modal editor: проверенный кандидат и граница API |
| [0003](0003-search-engine-and-session.md) | Accepted | Поисковый движок и единая сессия |
| [0004](0004-source-registration-and-vscode-compatibility.md) | Accepted | Исходники как расширение и проверенная совместимость с VS Code 1.143.1 |
| [0005](0005-marketplace-trusted-publishing.md) | Accepted | Доверенная публикация расширения через GitHub Actions |
| [0006](0006-remote-preview-theme.md) | Accepted | Клиентские тема/grammars через команды VS Code для Remote preview |
| [0007](0007-find-window-and-native-editor.md) | Accepted | Отдельная Find Window, снимок результатов и настоящий редактор справа |
| [0008](0008-native-find-panel.md) | Accepted | Штатный Find Panel и центральный редактор; заменяет размещение ADR 0007 |

Статусы: Proposed — обсуждается; Accepted — принято; Superseded — заменено
другим ADR; Rejected — рассмотрено и отклонено. Accepted не означает, что код
уже реализован. При пересмотре принятого решения создаём новый ADR со ссылкой
на предыдущий. Даты — YYYY-MM-DD.

Новый документ: следующий номер, название, статус/дата, контекст, решение,
альтернативы, последствия и ссылки. Согласование реализации отделяем от принятия
архитектуры; коммит и публикация также требуют отдельного запроса.
