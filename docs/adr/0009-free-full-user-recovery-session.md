# ADR-0009: 隔离恢复会话（已废止）

状态：Desktop 3.0.2 已废止。

Desktop 启动只使用当前用户的同一个 `DSH_HOME`。完整 Profile 原样重试后，可在私有事务工作区执行有界自动修复；验证或修复失败时使用同 Home 内置插件。产品不再创建隔离恢复会话、恢复壳或启动方式选择页。

当前契约见 [升级与回滚](../upgrade-and-rollback.md) 与 [安全边界](../security-boundaries.md)。本 ADR 仅保留编号，避免历史链接失效。
