# dsh-user-scope

[English](README.md) | 中文

`@ningbainb/dsh-user-scope` 是宿主侧共享归属服务，负责本地 profile 身份、
配对设备 principal、Workspace 授权和 Session 归属。它不依赖 UI，远程访问、
个性化 Prompt、记忆和后续 profile 功能都复用同一套授权规则。

服务直接监听官方 `SessionStore` 的公开生命周期，并从公开的
`WorkspaceRegistry` 投影恢复已有会话归属；memory 插件不再承担权限登记职责。

持久化数据位于 `DSH_HOME/user-scope/` 下的私有 JSON 文件中，写入统一使用
官方 atomic-write 与文件锁 SDK。遇到未知的新 schema 版本时会 fail closed，
不会用旧版本覆盖新文件。

## 安全模型

本地身份是持久化在当前 DSH profile 中的随机不透明 principal。远程设备会获得
独立的配对 principal；客户端不能提交或选择 principal、owner 或 grants。远程
访问 Session 必须同时满足设备绑定有效、owner 匹配；如果 Session 属于某个
Workspace，还必须拥有对应 Workspace grant。本地桌面保留 profile 管理视图。
