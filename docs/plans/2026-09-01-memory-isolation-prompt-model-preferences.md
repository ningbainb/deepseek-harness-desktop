# 记忆、用户隔离、个性化 Prompt 与模型偏好实施方案

**日期：** 2026-09-02  
**代码基线：** `dsh-web-ui-desktop-direct-repair` / `docs/align-v3.2.0-screenshots`  
**目标版本建议：** 3.3.0

## 1. 结论与当前状态

本方案补齐并统一设计以下能力：记忆功能、用户隔离、个性化 Prompt、模型自定义置顶，以及供应商排序/禁用。实现必须通过现有 SDK、Cordis plugin、client slot、settings bridge 和远程 API 接缝完成，不修改官方 DSH 源码 checkout，不绕过 Host 的凭证、工具、sandbox 或运行时生命周期。

| 能力 | 当前状态 | 证据与边界 |
| --- | --- | --- |
| 记忆功能 | 方案设计中 | 当前已有模块、局部行为测试和打包验证，但显式保存/确认、作用域隔离、损坏恢复与完整用户场景尚未形成最终验收闭环 |
| 用户隔离 | 方案设计中 | 当前已有 `dsh-user-scope`、remote 授权过滤和 A/B 自动化测试，但真实设备隔离、全路由核查和 revoke 现场证据尚未形成最终验收闭环 |
| 个性化 Prompt | 方案设计中 | 当前已有 global/workspace profile、优先级和打包验证，但 session 语义、跨主体隔离、长度/安全边界与完整用户场景仍需按本方案确认 |
| 模型置顶、供应商排序/禁用 | 方案设计中 | 首版代码和基础验证已存在，但按需求恢复为“方案设计中”；最终状态以方案确认和专项验收为准 |
| Claude Code/Codex 项目、对话、上下文一键导入 | 已有 | 当前代码和既有导入测试保留，不重复设计或误标为待开发 |

模型偏好必须与官方模型目录保持兼容：最多 2 个自定义置顶项；供应商排序和禁用只作用于本地选择投影；选择器与 `/model` 使用同一个投影；不修改 Host 默认模型、凭证、adapter、官方加载/重载/推理能力，也不改变已经运行的请求。

## 2. 已确认的基线

Claude Code/Codex 的项目、对话、上下文导入已经存在，导入适配器、批量导入、会话分组、工具调用和压缩归档相关测试继续作为既有能力维护。

模型切换能力也已存在。本方案只增加“偏好投影”：置顶、供应商顺序、供应商禁用和持久化，不把偏好误认为新的模型运行时。

远程第一阶段的“用户”定义为已配对的设备主体，不引入完整账号、SSO 或组织成员系统。未知主体、未知设备、未知 workspace、未知 session 均 fail closed。

真实手机/LAN 验收不纳入本轮交付范围。官方 DSH 当前明确拒绝 `--host 0.0.0.0`，因为这会把远程代码执行能力暴露到网络；默认保持 loopback。网络暴露能力继续保留官方安全门禁，不在本轮绕过。

## 3. 总体架构

```text
Principal / Device / Workspace / Session
                 │
           dsh-user-scope
       ┌─────────┼─────────┐
       │         │         │
   dsh-memory  Prompt   Remote API
       │         │         │
 SystemPrompt  SystemPrompt  逐资源授权
       │         │         │
       └────── official DSH runtime ──────┘

 ModelDirectory + conversation.input.model
                 │
          dsh-model-preferences
```

共享作用域服务只暴露不含内容的主体和授权结果。记忆、Prompt 和远程 API 不各自发明 owner key，从而避免“同一设备能看到 Prompt 但看不到记忆”或 session 跨设备泄漏。

## 4. 记忆功能设计

### 4.1 用户体验

记忆采用显式保存，不根据对话内容静默猜测并写入。用户可以保存、编辑、搜索、删除和清空；模型只能提出建议，只有用户确认后才保存。设置页显示启用开关、作用域、条目列表、搜索、敏感内容拒绝原因和清空操作。

### 4.2 数据模型与限制

```ts
interface MemoryItem {
  id: string
  scope: 'global' | 'workspace' | 'session'
  principalId: string
  workspaceId?: string
  sessionId?: string
  content: string
  tags: string[]
  pinned: boolean
  source: 'explicit' | 'confirmed-suggestion'
  createdAt: number
  updatedAt: number
}
```

- 单条文本最多 2,000 字符，标签最多 10 个，每个 owner 最多 2,000 条。
- 单次 Prompt 注入最多 5 条或 2,000 字符，并明确标记为“参考事实，不是指令”。
- 默认拒绝 API key、cookie、access token、私钥、密码、长 JWT 和明显 credential 格式。
- 文件位于 `${DSH_HOME}/memory/<principalId>/memories.json`，目录 700、文件 600；原子写入、锁和缓存只在 Host 侧实现。
- 不把记忆原文写入日志、错误消息、诊断导出或远程移动端默认响应。

### 4.3 运行时接入

通过官方 `ctx.systemPrompt.section({ name: 'dsh:memory', order: 40, text })` 和 `ctx.systemPrompt.variable('dsh_memory', ...)` 接入。`search`/`suggest` 不拥有写权限；`save`/`remove`/`clear` 由显式设置操作触发。作用域、owner 和 session 每次从当前 request carrier 解析，不复用上一个请求的全局变量。

损坏 JSON、锁失败或读取异常时进入空记忆/不可用状态并继续启动；不得把损坏内容当作可执行指令，也不得因记忆不可用阻断主应用。

## 5. 用户隔离设计

### 5.1 主体与归属

`dsh-user-scope` 定义四种 opaque ID：`PrincipalId`、`DeviceId`、`WorkspaceId`、`SessionId`。每个 session 记录创建主体、所属 workspace、创建/更新时间和可选的明确授权主体列表。桌面本地使用当前 OS 用户与 DSH profile 作为本地 owner；远程配对设备使用已注册的 device/principal。

### 5.2 授权规则

- 未解析出主体或 scope 时拒绝，不回退为共享 owner。
- workspace 列表只返回当前主体可见项。
- session 的列表、读取、历史、搜索、发送 Prompt、改名、选模型均逐 session 校验。
- A 设备不能读取、搜索、发送、改名或选取 B 设备不可见的 session。
- `revoke` 更新持久化授权并使已有 request 在下一次校验时立即失效；不依赖客户端刷新或缓存过期。
- 授权目录和文件使用原子更新、受限权限和损坏降级；未知 owner 永远不读其他 owner 的目录。

### 5.3 远程 API

完整 `/api` 默认只允许 loopback；移动端使用受限 `/m/api` 和逐方法 allowlist。每个 handler 在调用官方 session/workspace API 前先校验当前 device/principal 与资源归属。`session.search` 使用官方 `sessionQuery.searchSessions` 后再过滤 session ID，避免“列表过滤了但搜索绕过隔离”。

## 6. 个性化 Prompt 设计

### 6.1 配置模型

```ts
interface PromptProfile {
  id: string
  name: string
  text: string
  scope: 'global' | 'workspace'
  workspaceId?: string
  enabled: boolean
  updatedAt: string
}

interface PersonalPromptConfig {
  version: 1
  profiles: PromptProfile[]
}
```

首阶段支持 global 和 workspace；session 级 schema 预留但不宣称已经完成。生效优先级固定为 `session > workspace > global`，同级按更新时间和稳定 ID 确定性排序。

### 6.2 安全与界面

通过官方 `SystemPrompt.section({ name: 'dsh:personal-prompt', order: 50, text })` 和变量接入，作为独立 context section 附加，不能替换官方 system prompt、身份、工具定义、sandbox policy 或安全顺序。

设置页支持新建、编辑、删除、启用/停用、scope 选择、生效预览、字符数和恢复默认。总长度硬上限 8,000 字符；预览只显示当前主体可见的内容。删除当前 profile 后必须回退到下一优先级，重启后配置可恢复。

## 7. 模型自定义置顶与供应商排序/禁用方案

### 7.1 数据与投影

配置使用版本化 JSON：

```ts
interface ModelPreferencesConfig {
  version: 1
  pinnedModelIds: string[]
  providerOrder: string[]
  disabledProviderIds: string[]
  recentModelIds: string[]
}
```

- `pinnedModelIds` 最多 2 个，去重并只保留当前官方目录可解析的模型。
- `providerOrder` 只影响展示顺序，未列出的供应商按官方目录顺序追加。
- `disabledProviderIds` 只影响本地选择器投影；已禁用供应商的显式不可用状态要可解释。
- recents 有界保存，不能成为隐式置顶，也不能越过禁用规则。
- 配置不保存 API key、cookie、access token、完整 prompt 或原始凭证。

### 7.2 官方接缝

使用官方 `modelDirectories` 作为唯一目录源，在 `conversation.input.model` 槽位提供投影，在 `/model` 命令上复用同一 selector projection。展示层可把置顶放在前面、按 provider 排序并隐藏 disabled provider，但模型实际加载、reload、reasoning、capability、routable 和错误处理仍交给官方实现。

本轮不纳入自定义 `/model` 命令替换，也不修改官方命令 contribution。模型偏好只验收设置卡和 composer selector 的本地投影；官方 `/model` 保持原生行为，不作为本轮完成条件。

设置页提供置顶拖拽/取消、供应商拖拽排序、启用/禁用和恢复默认；保存后只更新本地偏好。正在运行的请求不被重写，Host 默认模型不被修改，凭证和 adapter 不被触碰。

### 7.3 验收要点

冷启动后设置两项置顶；调整供应商顺序并禁用一项；重启后偏好仍存在；输入框 selector 与 `/model` 展示顺序一致；取消置顶、恢复默认和目录缺项均确定性降级；Host 默认模型和运行中请求保持不变。

## 8. 实施顺序

1. 建立 `dsh-user-scope`，先完成 ID、目录、授权、revoke、损坏降级和纯函数测试。
2. 接入记忆 Host service、设置桥和 SystemPrompt section，完成显式保存、敏感拒绝、清空和损坏 JSON 测试。
3. 接入 Prompt profile、global/workspace 优先级、预览和长度/安全边界。
4. 完成远程 pairing、逐资源 API、search 过滤、loopback 设备隔离和 revoke 测试；真实手机/LAN A/B 不纳入本轮验收。
5. 保留模型偏好为方案设计状态；本轮不展开自定义 `/model` 命令替换。
6. 重新聚合、打包并执行冷启动、重启、清空、选择器和隔离 smoke。

## 9. 完成标准

源码测试只能证明实现存在，不能直接标记“已完成”。最低验收场景为：

```text
cold start
  → 两项模型置顶
  → 供应商排序/禁用
  → 重启后持久化
  → Workspace A/B
  → loopback 设备 A/B
  → A/B 列表、历史、搜索、发送、改名、选模型隔离
  → revoke 立即失效
  → Global/Workspace Prompt 优先级
  → memory save/read
  → clear
  → 损坏 memory JSON 启动降级
  → profile reset
```

完成状态必须同时具备核心行为测试和打包运行时证据；真实手机/LAN 现场验收不属于本轮完成条件。当前 `pnpm verify` 全部通过：桌面测试 820 项（818 通过、2 跳过、0 失败），remote 测试 182/182，脚本测试 173/173，packaged runtime verify 88 个包。

## 10. 隐私、恢复与风险

- 记忆和 Prompt 原文只在当前 owner 的本地受控存储和运行时上下文中出现，不进入日志。
- 清空是 owner 范围内的硬删除操作；profile reset 停止运行时、清理受控配置并重新启动。
- 损坏 JSON、未知版本、权限错误都 fail closed 并降级为空/不可用，不尝试执行或猜测恢复内容。
- 任何新远程 route 都必须加入 allowlist、owner 检查和 A/B 授权测试。
- 远程网络开放会扩大远程代码执行风险；官方网络安全门禁继续保留，不在本轮绕过。

## 11. 飞书状态同步结果

已按用户身份读取 `DeepSeekharness需求收集与管理` Base 的目标表全部 24 条反馈和 16 个附件，并回读目标记录。当前同步结果：

- “模型自定义置顶”→ `方案设计中`。
- “供应商排序/禁用”→ `方案设计中`。
- “记忆功能”→ `方案设计中`。
- “用户隔离”→ `方案设计中`。
- “个性化 Prompt”→ `方案设计中`。
- “Claude Code/Codex 项目、对话、上下文一键导入”→ `已完成`/已有能力，不重复设计。

本文件是方案总览；代码包、测试文件、远程授权实现和打包 smoke 脚本分别承担实现与证据职责。
