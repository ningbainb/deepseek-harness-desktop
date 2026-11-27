# dsh-git-graph

[English](README.md) | 中文

会话输入栏里的 Git 分支图标可以打开可搜索的分支列表和 Git 图谱。悬停提示和无障碍名称均显示当前分支。Git 操作由宿主进程在本会话的工作区中执行。

行为对齐 ZCode 的 `GitBranchSwitcher`：可搜索弹层、当前项打勾、「创建并检出新分支… / Git 图谱」底部操作、切换守卫（未解决冲突 / 进行中操作 / 目标分支被其他 worktree 检出）与可读报错。

## 仓库布局与构建

插件位于 `packages/dsh-git-graph`。宿主和客户端项目都从官方 `@deepseek-ai/*` npm 依赖解析 SDK 类型。在工作区根目录执行以下命令。

```sh
pnpm install
pnpm --filter @linxin666/dsh-client-ui-git-graph typecheck
pnpm --filter @linxin666/dsh-client-ui-git-graph test
pnpm --filter @linxin666/dsh-client-ui-git-graph build
```

浏览器构建使用仓库共享预设 `shared/tsdown.client.ts`。宿主通过 `/plugins/<id>/client.js` 提供构建产物 `lib/client.js`。

## 激活

Profile 通过 `cordis.patch.yml` 加载 Git 服务及 `/git/*` 路由。会话关联 Git 工作区后，客户端在会话输入工具栏显示分支图标。

### 通用安装（任何机器）

本插件已并入 dsh-web-ui 全家桶仓库（`github.com/zhu1090093659/dsh-web-ui`）。插件已发布到 npm，推荐一行安装：

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-git-graph
```

或直接安装全家桶聚合包 `@linxin666/dsh-web-ui-all` 一次到位（同样一行 `dsh plugin --profile web add @linxin666/dsh-web-ui-all`）。

需要改代码调试时再从仓库安装：

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-git-graph
```

> `github:` 安装方式适用于包位于仓库根部的独立仓库（`prepare` 脚本自包含构建；pnpm ≥10 首次会被拒绝，需按报错提示把包 key 加进 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重试）。monorepo 内的子包请用上面的 `link:` 方式。

### 本地开发循环（本仓库 checkout）

```sh
dsh plugin --profile <name> add link:/absolute/path/to/dsh-git-graph
```

`link:` 安装直接引用本地目录，重建后立即生效、无需重装（改完 `pnpm run build` 后刷新页面即可）。注意 `link:` 后跟的是绝对路径（`~` 由 shell 展开，不是 pnpm 语义）。

## 卸载

```sh
dsh plugin --profile web remove @linxin666/dsh-client-ui-git-graph
```

## 设计要点

- 边界与加载链调研、关键决策见 [docs/ADR-001-plugin-boundary.md](docs/ADR-001-plugin-boundary.md)。
- host half 的 `/git/*` 只接受已注册 workspace 的路径（realpath 校验）与 loopback 客户端（loopback socket + loopback Host，与 dsh-ssh 相同的 fence）；浏览器无法对任意目录执行 git，LAN 暴露的 dsh web 对非 loopback 客户端返回 403。
- Desktop 的 `/git-worktree/*` 路由只接受 loopback 和不透明 ID：Renderer 仅传 `workspaceId`、`taskId`、`runId` 或 `worktreeId`，不传绝对路径、base ref 或 Git argv。Host 解析 canonical workspace root，把执行树放在 `DSH_HOME/worktrees` 下，限制 Diff 预览，并要求二次确认才能丢弃 dirty Worktree。
- 切换语义是工作区级：`git switch --no-guess <branch>` 作用于 repoRoot 磁盘树，影响该工作区所有会话；项目切换 = 激活目标工作区并打开其（复用或新建的）空白会话，不给既有会话换 cwd。
- 图标挂在官方会话工具栏 `conversation.input.left`。处于 Git 工作区的空白会话和已有对话均使用此入口。原生菜单锚定到图标，切换会话会关闭上一个工作区的菜单和对话框。
- 工作区选择不在此插件内：官方工作区胶囊（`conversation.input.selector.workspace`）是唯一入口，本插件只提供 git 分支上下文。
- 分支状态刷新：挂载/弹层打开/切换成功后拉取 + host SSE（`/git/events`，订阅期间每 30s 轮询 workspace 状态，单次探测有 15s 超时兜底，挂起的 git 不会卡死推送流）推送外部变更 + window focus 刷新（5s 节流）。

## 检查链

```sh
pnpm run typecheck
pnpm test
pnpm run build
```
