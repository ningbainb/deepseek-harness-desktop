# ADR-0009: 主 Runtime 持久化完整权限与隔离恢复会话

## 状态

已接受，Desktop 3.0。

## 决策

Desktop 正常启动只创建一个主 `DshRuntimeController`。它使用 `process.env.DSH_HOME || ~/.dsh`、固定的 `profiles/desktop`、`danger-full-access` 和 `approval policy: never`，并直接承载主窗口、Agent、终端、文件、网络、工具、插件与后台调度能力。主 Runtime 仍受当前 Windows 用户权限约束，不申请 UAC、管理员权限，不修改系统 PATH、注册表或系统权限。

首次启用主 Runtime 完整权限时，Electron 主进程显示一次原生确认，并把固定 Desktop 来源的授权持久化；已确认的后续健康启动不重复弹窗，撤销后下次启动重新确认。确认不能代替 Runtime 准入：每次启动仍校验官方 Runtime 的支持矩阵、已知良好证据和文件哈希，损坏、缺失或篡改时只进入 Recovery Shell。

完整权限 overlay 由 Electron 主进程以固定内容原子写入 `<userData>/runtime-overlays/primary-full-user.yml` 并写后校验。renderer 和插件不能提供 overlay 路径或内容。DSH Web 调用固定包含一次 `--no-open`，Electron 主窗口只加载检测到的 loopback URL，不调用系统浏览器。

原自由模式保留为故障恢复工具，产品名称改为“隔离恢复会话”。它只在主 Runtime、本地 Profile 或迁移不能启动时由 Recovery Shell 明确提供，不得在健康启动或迁移失败后自动进入。启动前主 Runtime 必须已停止，任何时刻最多一个 DSH Runtime；已有 `free-mode-sessions` 不删除，新的目录只在用户明确启动隔离恢复会话时创建。

主 `desktop` Profile 是唯一持久化插件环境。已经存在的用户插件不因缺少 registry、发布者或兼容性声明而被自动删除、覆盖或迁移；用户明确确认外来代码来源和执行风险后，新增插件安装到该 Profile，不再启动临时 Runtime。写入清单、lockfile、patch 或 `node_modules` 前创建完整可恢复快照，安装或 Runtime 激活失败时回滚。

隔离恢复会话仍可复制原 Profile 或加载单个外来来源，但只能写入隔离 Profile。Runtime 页面没有 Repair Shell 或 Electron 主进程私有修复 IPC；所有恢复动作继续由 Electron 主进程固定实现。这里的“隔离”是 Desktop 配置与 IPC 隔离，不是操作系统沙箱，获准代码仍能访问当前 Windows 用户本来可访问的文件。

Desktop 内置 pnpm 的稳定 shim 固定为 `<userData>/runtime-bin/pnpm.cmd`，该目录在主 Runtime、插件安装进程和内置终端子进程的 PATH 首位，但不写入进程全局、用户或系统 PATH。内置终端和插件安装 cwd 固定到 `~/.dsh/profiles/desktop`，不依赖 `free-mode-runtime-bin`。

迁移完成以原子完成标记记录目标版本、schema、journal 和 Profile 身份。只有真实旧版本、旧 schema 或可恢复的中断 journal 才进入迁移；提交后的后续启动直接跳过，失败或中断不得被写成成功。

## 背景与取舍

临时自由模式作为正常入口会同时制造两个 Profile、两套 pnpm 路径和潜在的双 Runtime 生命周期，配置与插件也无法自然持久化。主 Runtime 持久化完整权限能让用户先进入应用并保留日常状态，而首次原生确认、逐次完整性校验、插件事务快照和主进程 IPC 边界继续约束高风险能力。

隔离恢复会话仍保留干净配置和复制检查的价值，但仅作为主链路确实无法启动时的旁路。代价是主 Profile 内经确认的插件拥有当前用户级代码执行能力，因此来源确认、内容复核、快照和失败回滚必须是不可绕过的安装事务组成部分。

## 后果

- 健康启动只有一个主 Runtime，不创建新的 `free-mode-sessions`。
- Shell 是启动故障时的控制面，不渲染原始日志、路径、命令、提示词或工具结果。
- 完整权限仅表示当前 OS 用户边界内的 Runtime 行为，不包含 Desktop 主进程修复特权，也不能执行被篡改或缺失的官方 Runtime。
- 外来插件确认后写入持久化 Desktop Profile；用户手改插件树在任何写入前由独立归档事务保全。
- Git 缺失是可选能力降级：系统或内置 Git 优先；经用户确认后可使用哈希固定的 Desktop 管理 Portable Git，只把验证后的命令目录传给指定子进程。
- 授权账本不可读时主 Runtime 不会静默启动完整权限；用户必须留在 Recovery Shell 处理本地状态。
