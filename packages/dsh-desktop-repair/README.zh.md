# dsh-desktop-repair

[English](README.md) | 中文

`@linxin666/dsh-desktop-repair` 是 DeepSeek Harness Desktop 内置的纯 Host 修复 bundle。它不是普通聊天插件；只有 Desktop 使用私有 `DSH_DESKTOP_REPAIR_JOB` 文件启动受管 `desktop-repair` Profile 时才会运行。

正常 Desktop Profile 连续两次启动失败后，Desktop 可以把受影响的 Profile 配置和已启用插件根复制到本次故障的 staging 目录。本 bundle 最多使用用户已配置的默认模型和一个备用模型检查、修改候选副本。Desktop 随后验证候选，并通过单独的哈希校验、可回滚事务应用结果。模型不会直接修改原 Home。

## 硬限制

- 每个故障最多尝试两个 provider/model 组合。
- 每个 job 最多执行十二次工具动作。
- 工具只能在已声明的 staging 根中列出、读取、写入、移动或删除有界文件。
- 检查只能选择 Desktop 预先登记的固定名称；模型不能提交命令、shell 字符串、工作目录或安装依赖请求。
- 检查进程不经过 shell，并强制包管理器离线模式。
- job 只写入结构化诊断、相对变更路径、检查名、provider/model 标识和固定结果。

## 安全模型

插件文件、manifest、注释、诊断和命令输出全部是不可信数据，不能改写 Host 策略或增加工具。job 不包含原 Profile 路径、项目路径、凭据路径、API key、会话正文或 Desktop 安装路径。每次工具调用都会拒绝凭据类文件和文件系统链接逃逸。原始模型输出与工具参数不会进入结果文件或产品遥测。

本 bundle 只使用官方 DSH Agent、默认模型、Session、system-prompt 和 Tool SDK，不修改 DSH 源码。

## 开发验证

```sh
pnpm --filter @linxin666/dsh-desktop-repair typecheck
pnpm --filter @linxin666/dsh-desktop-repair test
```
