# dsh-desktop-compat

[English](README.md) | 中文

面向 DeepSeek Harness Desktop 2.0 的桌面端兼容修复包。

## 能力

这个包保留现有的“默认排队”交互。当 DSH rc.6 在取消当前任务后进入空闲状态，但普通后续消息仍留在队列中时，插件会重新唤醒官方 Agent 驱动，且不会复制消息或改变先进先出的顺序。它还会把已知的 `code run failed (abort): [object Object]` 展示替换为清晰的停止提示。

实现仅运行在宿主端，使用公开的 `agent/status`、Agent inbox、`followup` 和 `tools/post-execute` SDK 接口。它不会修改 DeepSeek Harness 的文件；上游运行时补齐文档约定的取消行为后，可以直接移除这个包。

## 工具调用参数恢复

部分模型适配器会额外输出一层传输包装，例如
`{"arguments":{"command":"...","description":"..."}}`。Desktop 在公开的
`llm/stream` 钩子中、Agent loop 解析工具调用之前处理它。只有当前工具 schema
接受内层对象、同时拒绝外层包装时，才会展开恰好一层 `arguments`；有歧义、格式错误、
未知工具或其他无效调用一律保持原样，仍由 DSH 的正常 schema 校验处理。

每次恢复或拒绝都会写入有界的运行日志诊断，包含 provider、model、工具名、调用 id、
来源和原因；日志不会写入原始工具参数。

## 历史会话恢复

Desktop 在不修改 DSH 源码的前提下，处理三种已确认的历史格式：误带 Zstandard 后缀的明文 JSONL、数据字段恰好为 `preset` 和 `origin: "default"` 的 v0 `permission/preset`，以及符合已发布 one-shot 或 continuable schema 的 v0 `subagent/descriptor` 第二代数据。后两种修复只移除遗留 `origin` 或将描述符版本 2 改为 3，不凭空补充模型、权限、工具过滤或推理设置。混合记录作为一个完整候选统一校验。替换前保留原始字节备份，候选必须通过官方完整会话迁移目录校验；Runtime 重试失败会恢复原始字节。

恢复覆盖旧的日志读取入口和当前 DSH 原生的历史迁移准备入口。共享修复任务避免并发读取争抢备份；迁移发布与取消仍由内核管理。校验期间检测到源文件变化会拒绝过期候选；修复后检测到变化则禁止回滚覆盖更新的数据，并保留原始备份供恢复。额外字段、未知版本、其他 origin 值、不完整帧、身份不匹配、冲突备份及无关迁移错误均保持原样。诊断只报告数量和有界类型，不包含会话 id、路径、提示词或回复正文。

## 安装

DeepSeek Harness Desktop 2.0 会在隔离的 desktop profile 中自动挂载这个 bundle。这个包不作为通用 Web UI 插件提供。

## 配置

这个 bundle 没有用户配置项。发送仍默认进入队列，steering 消息行为不会改变。

## 已知限制

恢复逻辑只处理 DSH rc.6 在取消后没有唤醒普通 next-turn 消息的问题。官方运行时实现相同的文档契约后，应移除这个兼容包。

## 开发

```bash
pnpm --filter @linxin666/dsh-desktop-compat test
pnpm --filter @linxin666/dsh-desktop-compat build
```
