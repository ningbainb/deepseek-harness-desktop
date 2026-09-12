# dsh-task-board — DSH web GUI 任务看板插件

[English](README.md) | 中文

一个可热插拔的 DeepSeek Harness (DSH) 客户端 GUI 插件：在侧边栏「新会话」下方增加 **任务看板**入口，点击后中间列整体切换为多列看板视图；任务以 DSH 自身的会话机制 **真实执行**（`session.prompt`），执行状态实时回写卡片。

- 不修改 DSH 源码：以 cordis 插件 + 浏览器 DOM 扩展挂载（外挂形态与 `dsh-web-ui/packages/skins/skin-center` 一致）。
- 卸载即恢复原状，其它 managed 段（dsh-skin / skin-center / 个人配置）互不干扰。
- 任务数据优先写入 profile 隔离的 Host 文件；Host 端点不可用时回退到保留的浏览器 v1 台账。

## 功能

- **保存与恢复**：看板和任务详情会区分保存中、未保存草稿与并发修改冲突。失败的更改保留在当前窗口供重试，关闭或刷新窗口会丢失。重试先读取最新账本，只合并没有冲突的修改，保留 Host 执行状态；重新载入前需确认放弃草稿，且只有读取成功才替换。定时任务继续使用上次保存的设置，新执行必须在保存成功后启动。

- **侧边栏入口**：侧边栏列（旧版 `[data-pane="sidebar"]`，DSH 0.1.0-rc.6 AppFrame 布局为 `[class*="sidebarCol"]`）内、新会话按钮下方注入「任务看板」入口行（宽栏显示图标+文字，折叠 rail 显示纯图标，随 DSH 皮肤 token 自适应）。
- **多列看板**：待规划 / 待办 / 进行中 / 已完成 / 已失败 五列；卡片显示标题、描述、状态、更新时间、执行次数；顶部支持搜索过滤、新建任务、返回对话。
- **任务详情**：点卡片打开详情（标题/描述/执行 Prompt/执行记录），**不会**一点就执行；详情内提供「执行 / 重新执行」「删除（带确认）」「查看会话（跳转到执行 transcript）」以及手动移到待规划/待办。
- **真实执行**：点「执行」后，插件通过客户端 runtime 连接工作区会话（`workspaces.connectWorkspace`，空白会话复用或 host 新建），把任务标题设为会话名，以任务 Prompt 调用 `session.prompt([{ type: 'text', text }], 'queue')` 驱动真实 agent；随后订阅该会话快照，轮次真实结束后把卡片置为 已完成/已失败 并记录执行结果。执行会话会出现在会话列表，可点进对话查看真实 transcript。
- **状态回写**：卡片状态（进行中 → 完成/失败）由真实会话状态驱动；刷新页面/重启后，遗留的 running 任务会按会话现状自动对账（reconcile）。
- **定时任务**：详情面板可为任务配置定时执行——启用开关 + 5 段 cron 表达式（分 时 日 月 周，支持 `*` / `*/n` / `a-b` / 逗号列表）+ 常用预设（每天 09:00、每小时、每 10 分钟、每周一 09:00）；启用即计算并持久化「下次运行时间」，卡片显示定时标识。用户明确启用后台自动化后，Desktop Runtime Provider 的 host-job adapter 可在 Host 端认领到期槽位；其他环境继续由原有浏览器链路按手动执行的真实路径运行。
- **Host 文件持久化**：Host-owned v3 台账把 Project、紧凑 Task Run、派生 Evidence 和可选的持久调度状态保存到 `state/task-board/tasks-v3.json`；写入串行并原子发布，损坏文件会保留，v2 会在迁移前复制备份。持久状态包含 IANA 时区、有界 misfire/running 策略、确定性 run key、provider evidence 与会过期的租约。旧 Host 继续使用 v2/localStorage 回退。
- **Worktree 审核**：Desktop 2.6 任务可选择 shared-workspace 或 Git Worktree；Typed Runtime Provider 提供 workspace/session 观察能力时，Host 创建受控 Worktree，详情展示有界 Evidence 并提供 Commit、Merge、Keep、二次确认 Discard；缺少能力时明确回退到 shared-workspace。
- **系统提示词注入**：host 半边（`src/index.ts`）通过 `SystemPrompt.section` 注册 `plugin:task-board` 段（order 200），向每个 agent 声明本插件存在、能力与限制——插件在组合中（mount 后重启 DSH）即注入，移出组合（unmount 后重启）即消失，agent 无需任何外部文档就能知道如何与本看板协作。

## 目录结构

```
package.json / tsconfig.json / tsdown.config.ts   # 独立仓库构建
build/tsdown.client.ts + build/web/src/platform.ts # 从 DSH checkout 复制的 client bundle 预设（与运行版本保持同步）
src/index.ts / src/host/*.ts                       # host 半边：SystemPrompt + profile 文件存储 + 固定路由 + 持久调度 adapter
src/client/index.ts                                # apply(ctx)：接线 runtime 服务 + 挂载 DOM
src/client/sidebar-entry.ts                        # 侧边栏入口注入（自愈式 MutationObserver）
src/client/board-mount.tsx                         # 中间列看板挂载 + 显隐切换
src/client/board/*.tsx                             # React 看板视图（列/卡片/详情/新建/确认）
src/client/board.module.css                        # 样式（--dsw-* token，随主题/皮肤自适应）
src/core/tasks.ts                                  # 任务模型 + 状态机（纯函数）
src/core/schedule.ts                               # cron 解析 + 下次运行时刻（纯函数）
src/core/scheduler.ts / scheduler-authority.ts     # 浏览器回退 tick + Host/client 调度归属契约
src/core/store.ts / src/client/host-store.ts       # 持久化接缝、Host 客户端、localStorage 回退与迁移
src/core/execution.ts                              # 真实执行服务（会话连接/prompt/结算观察）
src/core/controller.ts                             # 控制器（台账状态、视图状态、导航感知）
tests/*.spec.ts                                    # 存储/状态流转/执行触发/cron/调度 自动化测试
scripts/dsh-task-board.js                          # 一键挂载/卸载/状态 CLI
```

## 为什么这样接（调研结论）

- **侧边栏没有可用的外挂槽位**：侧边栏壳只声明 `sidebar.workspaces` / `sidebar.settings` 两个 single 槽位，且已被 ui-workspace / ui-settings 占用；外部插件无法注册新槽位（声明即占有，重复声明抛错）。因此入口行走 skin 先例的 **DOM 注入**，并用 MutationObserver 自愈（React 重渲染波及该节点时同帧内重新插入，无闪烁）。
- **中间列无法通过槽位替换**：`conversation` 槽位是 single 且已被 ui-conversation 占用。看板视图以 DOM 方式挂在中间列（旧版 `[data-pane="conversation"]`，DSH 0.1.0-rc.6 AppFrame 布局为 `[class*="centerCol"]`；挂载选择器两者都保留）内（React 不管的尾部子节点），通过 `<html data-dsh-taskboard-active>` 属性切换显隐，底下的对话子树保持挂载有状态。
- **持久化使用受限 Host 通道**：Host 只暴露固定台账与事件路径，文件位置由 `DSH_HOME` 和配置的 profile 决定，浏览器不能传入文件系统路径；客户端保留 localStorage v1 作为降级与回滚来源。
- **执行走客户端 runtime**：`ctx.sessions.list` 订阅会话状态（`running` / `byId`），`ctx.workspaces.connectWorkspace()` 创建/复用会话，`session.prompt()` 真实驱动 agent，`ctx.sessions.open()` 跳转 transcript。
- **后台结算靠列表对账**：未打开的会话没有对话快照窗口（cold），所以执行结算以会话列表为准——每次列表变化都对账 running 任务；结果判定依次取「列表缺失→已取消 / 仍在跑→等待 / 对话快照可见→按 lastAgentError / 原始历史尾部→turn-error 节点证明失败 / 否则按成功」，对账幂等。
- **定时归属是显式的**：只有用户明确开启后台自动化后，Desktop 可执行 host-job adapter 才会让 Host 认领到期槽位；它在派发前原子推进 cron 游标并写入确定性 TaskRun，租约阻止另一个 Host 抢占仍有效的槽位；旧 owner 过期后，只能用同一确定性 key 重派尚未持久化会话身份的已认领运行。浏览器仅在固定 Host 状态路由明确报告可执行归属后关闭旧 ticker，并在每次回退调度认领前复查该门禁。旧 Web Host、状态格式异常或没有 adapter 时，浏览器端继续作为安全回退，并保持原有错过即跳过的语义。
- **多标签页同源共享同一份台账**：Host 变更通过 SSE 事件通知，localStorage 降级模式通过 storage 事件通知；两种通道都会重读最新台账，删除的任务不会从其他标签页的陈旧副本中被写回复活。

## 安装

推荐直接安装全家桶聚合包 `@linxin666/dsh-web-ui-all`（一个包装齐全部功能插件与皮肤），或单独安装本插件：

```sh
### 从 npm 安装（推荐）
dsh plugin --profile web add @linxin666/dsh-client-ui-task-board

### 从仓库安装（开发调试）
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-task-board

```

安装后**重启 `dsh web`**，侧边栏「新会话」下方出现「任务看板」入口即生效；页面刷新不够，需重启进程。

## 构建

前置：Node ≥ 20，官方 NPM SDK 可访问（若仍使用私有 scope 认证则配置 `NPM_TOKEN` 环境变量 + 项目 `.npmrc`，见仓库 `docs/plugins.md`）。类型与运行时 API 全部来自官方 NPM SDK（`@deepseek-ai/*` devDependencies），**无需任何 DSH 源码 checkout**。

```sh
cd ~/code/dsh-web-ui/packages/dsh-task-board
pnpm install        # 首次（workspace 根执行 pnpm install）
pnpm run build      # 产出 lib/index.js + lib/client.js（tsdown + shared/tsdown.client.ts 预设）
pnpm run typecheck  # 类型检查（node_modules 的 SDK 包类型）
pnpm test           # vitest：存储读写 / 状态流转 / 执行触发
```

## 挂载 / 卸载

本插件采用官方 profile-bundle 形态（package.json 声明 `dsh.bundle.patch` + `dsh.client`，见 `cordis.patch.yml`）。挂载 = 在 web profile 清单（`~/.dsh/profiles/web/package.json`）注册依赖与 bundle 行并安装：

```sh
# 挂载（dependencies + dsh.profile.bundles 注册，pnpm install；重启 GUI 后生效）
node scripts/dsh-task-board.js mount

# 查看状态
node scripts/dsh-task-board.js status

# 卸载（移除注册行；重启 GUI 后恢复原状；任务数据保留）
node scripts/dsh-task-board.js unmount
```

profile 清单中注册的行：

```json
{
  "dependencies": { "@linxin666/dsh-client-ui-task-board": "link:/Users/zcl/code/dsh-web-ui/packages/dsh-task-board" },
  "dsh": { "profile": { "bundles": [ "...", "@linxin666/dsh-client-ui-task-board" ] } }
}
```

> 注意：profile 层（bundle 行、`dsh.client` 元数据）在 dsh web 进程启动时读取，挂载/卸载后需要**重启 dsh web GUI** 才生效（页面刷新不够）。

## 数据存储位置

- 权威 v3 台账位于 `DSH_HOME/profiles/<profile>/state/task-board/tasks-v3.json`；`profileName` 默认取运行时 `DSH_PROFILE`，未提供时为 `web`。
- v2 文档会先复制到带时间戳的备份，迁移时不推断 Worktree 隔离，回读并校验后才写入 v3 标记；v2 源文件和浏览器 v1 键继续为旧环境保留。
- v3 Host 端点不可用时，看板选择兼容的 v2 Host 或 v1 localStorage；Host 更新通过 SSE 同步，不使用高频轮询。

## 安全模型

- Host 仅注册固定路由，只接受 loopback same-origin 请求，限制请求体大小，浏览器不能传入 profile 名称或文件路径。
- Task Run 和 Evidence 只持久化任务字段、不透明的 session/workspace/run 引用、revision、有界文件摘要和能力证据，不复制模型消息、工具输出、Secret、原始 patch 或完整 transcript。

## 已知限制

- 持久 Host Scheduler 只会在 Desktop Runtime Provider 有意提供 host-job adapter 时启用（通常以用户 opt-in 后台自动化为前提）；其余运行时，以及 Host 状态路由不可用或格式错误时，明确保留浏览器调度回退。
- Host 在派发前推进 `nextRunAt` 并写入确定性 TaskRun。睡眠/重启错过的周期默认 `skip`；显式 `run-once` 最多合并补跑一个槽位，`queue-next` 在任务运行中最多保留一个待执行槽位。旧 owner 租约过期后，只会以原确定性 key 重派尚未记录会话身份的已认领运行。应用完全退出后不承诺继续执行。
- Worktree 执行仍需要可选 Runtime Provider 能力；缺少能力时使用 shared-workspace。

## 手动验证步骤

1. `npm run build` → `node scripts/dsh-task-board.js mount` → 刷新 `http://127.0.0.1:3080`。
2. 侧边栏「新会话」下方出现「任务看板」入口行；点击 → 中间列切换为五列看板。
3. 「+ 新建任务」填标题/描述/Prompt → 卡片出现在「待办」。
4. 点卡片 → 详情可见内容与 Prompt；点「执行」→ 卡片变「进行中」（会话列表出现以任务标题命名的会话）；agent 跑完后卡片落「已完成」或「已失败」，详情执行记录有结果与时间，可「查看会话」跳转到真实 transcript。
5. 定时任务：详情 →「定时运行」勾选启用，选预设「每 10 分钟」（cron `*/10 * * * *`），卡片出现定时标识。若已启用 Desktop host-job adapter，可关闭看板后等待下一个整 10 分钟点；否则保持标签页打开。卡片会自动进入「进行中」并最终完成，详情「上次触发」出现时间、执行记录新增一条（会话可跳转）。
6. 刷新页面/重启 DSH → 任务仍在；卸载插件 → GUI 恢复原状。

## 验收对照

- 挂载后侧边栏出现「任务看板」入口；点击切换看板，点会话项返回对话视图
- 新建任务（标题+描述/Prompt）；刷新/重启后任务仍在（profile Host 文件，localStorage 回退）
- 点卡片开详情（内容 + 执行记录）；详情内有「执行」「删除」按钮
- 执行真实启动会话（会话列表可见 transcript）；卡片状态随真实执行进度变化；详情可跳转到执行会话
- 删除有确认环节，删除后本地存储同步移除
- 定时任务：cron 配置/预设/校验、下次运行时间、到点自动真实执行、状态回写、定时卡片标识，并且只有一个明确归属：已 opt-in 且可执行的 Desktop Host 调度，或需要保持标签页打开的浏览器回退
- 一键挂载/卸载；卸载后 GUI 恢复原状，其它 managed 段不受影响
- README + 覆盖存储读写/状态流转/执行触发/cron 解析/调度器的自动化测试
