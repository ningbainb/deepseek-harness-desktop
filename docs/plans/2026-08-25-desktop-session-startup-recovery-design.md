# Desktop 历史会话启动降级设计

## 背景

固定在 Desktop 3.0.8 使用的 DSH Runtime `0.1.1-rc.1` 中，JSONL 会话持久化的 `list()` 会读取每个历史会话的 zstd 首帧。单个 `session.jsonl.zstd` 在文件偏移 0 处不是合法 zstd 帧时，Runtime 在 `@deepseek-ai/dsh-workspace` 初始化阶段直接失败，导致完整 Runtime 和同一 `DSH_HOME` 下的 builtins fallback 都无法启动。

该故障已经通过真实 Electron 启动复现。它发生在第三方插件初始化之前，也不是插件配置损坏，因此不应进入 Plugin Recovery，更不应移动、删除或重写用户的原始会话文件。

## 目标

- 只对已确认的 zstd 文件头损坏错误做非破坏性降级。
- 让其他历史会话和 Desktop Runtime 正常启动。
- 启动后向用户显示精确文案：`有 1 个历史会话暂时无法读取`；数量大于 1 时使用对应数量。
- 记录不包含绝对路径、会话内容或凭据的结构化诊断信息。
- 为有效会话、确认的损坏项和其他错误补充回归测试。

## 非目标

- 不修复会话文件内容，不执行迁移、移动、删除或覆盖。
- 不捕获所有解析错误，不把权限错误、未知格式、zstd 解压错误或编码错误变成可忽略故障。
- 不修改 `node_modules` 中的 DSH 源码，不把该问题伪装成插件故障。
- 不改变 Plugin Recovery 的触发条件和修复策略。

## 方案选择

### 方案 A：在 Desktop 兼容包中增加早期会话持久化钩子（采用）

新增 `@linxin666/dsh-desktop-compat/session-recovery` bundle entry，只注入 `sessionPersistence`，在 `dsh-workspace` 初始化前对 JSONL backend 的首帧读取函数做最小包装。仅当错误消息严格匹配 `corrupt Zstandard session log: invalid frame magic at byte 0` 时返回 `undefined`，利用上游 `listArtifacts()` 已有的“无首行则跳过”行为；其他错误原样抛出。

该 entry 放在 `dsh-web-app` 之前，主兼容包继续负责已有的 Web/UI 兼容逻辑。跳过项只在当前 Runtime 实例内去重计数，并输出 `[dsh-session-recovery]` 结构化标记，不输出文件路径。

优点是改动位于仓库已有的 Desktop 兼容层，符合官方 SDK 和 `cordis.patch.yml` 挂载边界；有效会话的读取仍由上游实现完成，未知错误不会被吞掉。代价是依赖当前固定 Runtime 的内部 backend 方法，因此必须绑定版本、写入兼容补丁注册表，并用真实启动测试锁定注入顺序。

### 方案 B：在 Desktop 主进程自行扫描并过滤会话文件

在 Runtime 启动前解析 `DSH_HOME/sessions`，临时隐藏或重写损坏项。

不采用。它会复制上游存储布局和 zstd 判断逻辑，存在路径编码、并发和权限语义漂移；即使只做临时改名，也容易留下用户无法理解的外部状态变化。

### 方案 C：失败后启动隔离的临时 DSH_HOME

当完整 Runtime 失败时，为 builtins 创建新 Home。

不采用。它会丢失用户可用的历史会话上下文，且无法满足“其他会话继续可用”的要求；同一会话数据也不能在隔离 Home 中恢复，诊断信息还会被错误地归因到 Profile 或插件恢复。

## 运行时流程

1. `session-recovery` entry 在 `dsh-workspace` 之前取得 `sessionPersistence`。
2. 它幂等地包装 backend 的 `readFirstZstdLine`。
3. 首帧在偏移 0 遇到确认的无效 magic 时，返回 `undefined`，计数加一并输出脱敏标记。
4. `listArtifacts()` 跳过该项，继续枚举其余项目和会话；任何非确认错误继续阻断启动。
5. Desktop 主进程监听 Runtime 的脱敏 line marker，在 Runtime ready 后发出历史会话提示，并将计数纳入启动诊断摘要。
6. 该流程不创建 Plugin Recovery incident，不改变 repair state，也不写入原始会话目录。

## 诊断与通知

Runtime 日志只记录 `skipped` 数量和固定 `kind`，不记录 session id、项目路径、文件内容或异常堆栈。Desktop 侧保存本次启动的最大安全计数，并在诊断导出中提供 `sessionRecovery` 摘要。

通知正文应说明其他历史会话仍可使用，原始文件未被修改。通知使用独立的 `session` 类别，避免与 `plugin-recovery` 混淆；重复 Runtime line 不重复通知。

## 测试策略

- 纯逻辑测试：确认错误匹配严格、安装幂等、恢复函数只处理目标错误，其他错误继续抛出。
- 持久化集成测试：一个有效会话和一个无效 zstd 文件同时存在时，`list()` 成功并保留有效项，损坏项原始字节不变。
- Runtime 启动回归：使用临时 `DSH_HOME` 和真实 Electron source smoke，确认 `ready-full`、无 `plugin-recovery`、日志包含脱敏 marker，且没有 `ready-builtins` fallback。
- Desktop 通知/诊断测试：数量为 1 时包含精确文案，数量聚合、重复 marker 去重，诊断不含路径和会话内容。

## 验收标准

- 目标损坏项存在时，完整 Runtime 能 ready，其他会话可读取。
- 非目标错误仍然可观测并阻断启动，不被静默吞掉。
- 原始 `session.jsonl.zstd` 字节内容前后完全一致。
- 不触发 Plugin Recovery，不移动或删除会话文件。
- 诊断和日志不泄露路径、session id、会话正文或凭据。
- 固定 Runtime 版本和补丁注册表均有明确记录，针对性测试与现有 Desktop 测试通过。
