# DeepSeek Harness Desktop

<p align="center"><img src="docs/brand/app-icon.png" width="160" alt="DeepSeek Harness Desktop 应用图标"></p>

中文 | [English](README.en.md)

> **项目由 ningbai牛逼 维护**：如果 DeepSeek Harness Desktop 对你有帮助，欢迎在[爱发电支持 ningbai牛逼](https://www.ifdian.net/a/ningbai)。你的支持将用于服务器、测试环境和后续维护。
>
> 扫码支持：
>
> <a href="https://www.ifdian.net/a/ningbai"><img src="website/assets/afdian-qr.svg" width="180" alt="爱发电赞助二维码"></a>

## DeepSeek Harness Desktop 用户交流群

QQ 群：**1105158177**

**[点击一键加入 QQ 群](https://qm.qq.com/q/vehlNjaeye)**

<a href="https://qm.qq.com/q/vehlNjaeye"><img src="website/assets/qq-group-1105158177.jpg" width="280" alt="DeepSeek Harness Desktop QQ 群 1105158177 加群二维码"></a>

欢迎加入社群交流：

- 使用与配置交流
- 插件与 Skills 分享
- 模型配置与使用经验
- 自动化玩法
- 主题与桌宠
- 新版本体验与功能建议

> **GitHub 下载速度较慢？**  
> 群内会同步提供最新版安装包，也可以直接交流安装与使用问题。

---

**DeepSeek Harness Desktop** 是社区维护的开源 AI 编程桌面客户端。

DeepSeek 官方尚未正式发布独立 Desktop 产品；本项目已经把公开的官方 **DSH Runtime、Web UI 与官方仓库中的 Desktop 能力边界** 融合为可安装的 Windows 应用，并在独立社区宿主中补齐插件、Skills、任务自动化、Git、远程开发和桌面体验。它不是 DeepSeek 官方客户端，也不使用或覆盖未来官方 Desktop 的应用身份、数据目录与更新源。

支持 **Windows 10 / 11 x64**；同时提供 **macOS Apple Silicon arm64 Preview** 与 **Linux x64 Preview**。项目采用 **BSD-3-Clause** 许可证。

安装包已包含主要运行组件，无需另外配置 Node.js、Git 或单独安装 DSH。

[产品介绍](https://ningbainb.github.io/deepseek-harness-desktop/) · [下载最新版](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest) · [使用文档](docs/desktop.md) · [更新日志](CHANGELOG.md)

### 4.3.0：终端选择、操控开关与更新体验

当前桌面版本为 4.3.0，继续精确锁定已验证的官方 DSH `0.1.6-alpha.2` 与 dsh-web `alpha` 0.3.23 固定源码快照；新发布的 DSH `0.1.7-alpha.1` 尚未完成破坏性变更适配，不随本版升级。手动终端新增 PowerShell、PowerShell 7、WSL 与 CMD 选择；Agent 的 WSL 命令使用独立权限，默认逐条确认，绝不替换官方 PowerShell 沙箱。操控开关增加预检、进度与失败恢复；自动更新增加离线退避，手动检查保持可用。

- **终端与权限**：手动终端可选系统 Shell；Agent 的 WSL 工具单独受关闭、逐次确认、始终允许三档权限控制，默认逐次确认，信任模式需要明确风险确认。
- **智能操控**：Agent Team、Browser Use 和 Computer Use 的启停先预检插件环境，显示保存、重启和恢复进度；失败时保留并恢复原配置。
- **更新与安装**：自动检查按网络状态和失败类型退避，手动检查不受冷却限制；4.x 覆盖安装优先复用已验证的用户自定义安装目录。
- **扩展与模型**：插件设置可从拓展坞直接进入；技能选择按最近使用分组，bai 模型组在选择器中更明显，同时保留其他供应商顺序。

[4.2 上游同步记录](docs/upstream-web-sync.md) · [升级与回滚](docs/upgrade-and-rollback.md) · [4.3.0 发布说明](docs/launch/release-notes.md)

### 4.1.0：让 DeepSeek 操作浏览器和电脑

4.1.0 引入智能操控。Windows x64 为正式版，macOS arm64 与 Linux x64 为 Preview；三端全部通过后才会进入同一个 GitHub Release。

- **Browser Use**：默认使用官方 Playwright MCP，在可见、隔离的系统浏览器会话中执行；自动发现 Chrome、Edge 或 Chromium，点击、输入、上传和下载仍需审批。
- **Computer Use**：默认使用随包安装的 Cua Driver Native，外置 MCP 可作为隔离回退；截图和窗口枚举可观察，鼠标键盘操作逐次确认，连续启动失败自动进入安全模式。
- **DSH 0.1.6 破坏性更新适配**：精确锁定 `@deepseek-ai/dsh@0.1.6-alpha.1`，完成 Agent、Session、PTC、Workflow、Sandbox 与 Agent Team 新契约迁移。
- **3.5/4.0 数据事务继承**：会话与长上下文、Workspace、模型、凭据引用、Skills、插件、皮肤、桌宠与协作设置在修改前备份，失败回滚，原始 Session 日志不被无备份改写。
- **埋点保持克制**：新增的操控事件仅使用固定结果词表，不采集 URL、域名、窗口名称、截图、Prompt、工具参数、路径或凭据，详见 [隐私政策](PRIVACY.md)。

[智能操控使用指南](docs/smart-control.md) · [完整 4.1.0 发布说明](docs/launch/release-notes.md)

![DeepSeek Harness Desktop 4.1.0 智能操控中心](docs/screenshots/desktop-4.1.0/control-center.png)

### 持续提供的核心能力

- **性价比模式 V2**：专家主控模型负责理解、拆解、派发、复核和汇总，副模型 / 子代理只处理被派发的局部任务；首次选择会自动引导配置。
- **大模型用量看板**：实时展示余额、输入/输出 Token、上下文、缓存、请求耗时与费用；峰值采用严格滚动 1 秒算法，不再把一次 usage 汇总事件误当作瞬时速率。
- **Claude Code / Codex 项目导入**：只读发现项目和历史会话，预览后导入 Harness 工作区；敏感信息脱敏，历史工具调用不会重新执行。
- **启动与插件稳定性继续加固**：启动阶段可见、事务修复可回滚、第三方插件错误隔离，原有 DSH Home 与插件直接延续。

[查看完整发布说明](docs/launch/release-notes.md) · [查看历史更新日志](CHANGELOG.md) · [升级与回滚指南](docs/upgrade-and-rollback.md)

---

## 模型协作、Skills 与模型接入

以下实机截图展示 4.1 智能操控，以及持续提供的模型协作、Skills 与模型接入。

### 模型协作：Agent Team 与性价比模式放在同一处

会话侧栏的“模型协作”会直接打开唯一的拓展坞窗口并进入协作页。Agent Team 负责多角色协作，性价比模式负责主控与执行模型分工；两者互不排斥，可独立开启或同时使用。

![DeepSeek Harness Desktop 4.0.0 模型协作页面](docs/screenshots/desktop-4.0.0-rc.3/model-collaboration.png)

### Skills：会话菜单与技能中心使用同一目录

4.0 统一扫描项目 `.dsh/skills`、用户 DSH Skills 与用户 Agents Skills。会话输入框可搜索并插入技能，技能中心显示相同来源及作用域，不再出现“侧栏能看到、技能中心看不到”的路径分裂。

![DeepSeek Harness Desktop 4.0.0 会话 Skills 菜单](docs/screenshots/desktop-4.0.0-rc.3/conversation-skills.png)

### bai 供应商：在模型入口中统一优先显示

聊天模型、模型设置以及协作页的主控与执行模型选择器共用排序规则：用户手动置顶优先，其次是 bai 供应商，再保留其余供应商的既有顺序。

![DeepSeek Harness Desktop 4.0.0 bai 模型接入](docs/screenshots/desktop-4.0.0-rc.3/bai-models.png)

详细边界见 [桌面架构与能力](docs/desktop.md)、[升级与回滚指南](docs/upgrade-and-rollback.md) 和 [4.1 发布说明](docs/launch/release-notes.md)。


## 为什么选择 DeepSeek Harness Desktop

### 开箱即用

下载安装 EXE 后即可启动完整 Harness 环境。

无需手动准备 Node.js、Git、pnpm 或 DSH Runtime，桌面端会统一管理所需组件与运行环境。

### 完整 AI 编程工作台

在一个桌面应用中完成：

- AI 对话与代码修改
- 项目文件浏览与编辑
- Git / SCM 操作
- Markdown、HTML、代码、Diff、PDF、Office 等文件预览
- 模型切换与推理强度调整
- Skills 与插件调用
- Agent 任务执行
- Token 与性能统计
- 多项目开发工作流

### Skills 与插件生态

支持多种扩展方式：

- DSH Skills
- Agents Skills
- 项目 Skills
- 社区 DSH Bundle
- 插件市场
- 桌面扩展

可以直接在 Harness 中搜索、安装和使用扩展能力，将自己的开发工具逐步组合成一套完整工作流。

### 任务看板与自动化

内置任务看板，可以管理：

**待规划 → 待办 → 进行中 → 已完成 / 已失败**

任务可以交给真实 DSH Agent Session 执行，并记录 Task Run 与 Evidence，方便查看结果和继续处理。

同时支持定时任务与后台调度，适合周期性的开发、维护和自动化工作。

### 远程开发

桌面版不仅可以操作本机项目，也支持远程开发场景：

- 手机远程控制
- SSH
- Web Terminal
- SFTP
- 端口转发
- 多主机集群执行
- QQ Bot 接入

可以从电脑、手机或聊天工具连接自己的 Harness 工作环境。

### 个性化桌面体验

除了开发能力，Desktop 还提供完整的桌面化体验：

- 多套主题皮肤
- 全页粒子主题
- 鲸鱼娘桌宠
- 独立窗口
- 窗口状态保存
- 桌面通知
- 托盘能力
- Stable / Beta 更新频道

---

## Harness AI 编程工作台

桌面版直接运行 DeepSeek Harness Web Surface，并由桌面宿主管理本地 DSH Runtime。

在同一个窗口中即可完成 AI 对话、代码修改、文件管理、Git 操作、任务执行、模型切换和插件扩展。

![DeepSeek Harness Desktop 3.3.0 主界面与 AI 编程工作区](docs/screenshots/3.3.0-workspace.webp)

## Skills 与插件

输入框可以直接搜索并插入已安装 Skills。

扩展坞支持：

- 社区 DSH Bundle
- 插件市场
- 项目 Skills
- DSH Skills
- Agents Skills

桌面版使用独立的 `desktop` profile，不会覆盖已有 DSH 配置。

插件安装、更新以及运行时生命周期均由桌面宿主统一管理。

## Codex 模型与推理强度

3.0.9 使用 DSH RC.1 内置的 `llm-pi-ai/openai-codex` 官方授权流程完成 ChatGPT OAuth，并在 Harness 中使用支持的 OpenAI Codex 模型；不再加载会与原生 Provider 冲突的旧 `dsh-codex-connect` 插件。设置页的「ChatGPT 登录」一次点击启动 OAuth，并由系统浏览器继续；授权 grant 只由官方凭据服务读写并保存在本机 DSH Home，前端只读取"是否已登录"，不会收到 access token 或 refresh token。它不会默认替换当前模型、接管全局搜索或启用远程图片工具。

模型切换时，桌面端会根据模型实际能力展示可用的推理强度档位，并自动处理对应配置。

## 任务看板与自动化

通过任务看板统一管理 Agent 工作。

| 多列任务看板 | 任务详情与定时执行 |
| --- | --- |
| ![任务看板](docs/screenshots/09-task-board.png) | ![任务定时执行](docs/screenshots/10-task-board-detail-cron.png) |

任务可以直接交给 DSH Agent Session 执行，并保存 Task Run 与 Evidence。

除了手动任务之外，还支持定时任务和后台调度，可以用于周期性开发、信息处理和维护工作。

## Git 图谱

通过分支选择器和 Git 图谱查看分支关系、Commit 历史、当前仓库状态和分支泳道，帮助快速理解项目变化和代码提交历史。

![Git 图谱](docs/screenshots/04-git-graph.png)

## 文件、预览与 SCM

项目会话右侧提供完整工作面板：

- **文件树**：浏览和搜索工作区文件
- **文件预览**：Markdown、HTML、代码、Diff、CSV、PDF、Office、图片和文本
- **编辑与保存**：源码 / 预览切换以及分屏操作
- **Git 变更**：查看真实 SCM 状态并执行 Stage / Unstage / Discard
- **可调布局**：记录不同项目的面板宽度和折叠状态

![右侧面板](docs/screenshots/19-right-panel.png)

## 手机远程控制

通过桌面端二维码即可连接当前 Harness 工作区。

手机端可以查看工作区、新建和查看会话、收发消息、切换模型、调整思考强度，并与桌面端保持同步。

默认可以在局域网环境使用，也可以根据需要启用公网隧道。

| 工作区列表 | 会话列表 |
| --- | --- |
| ![移动端工作区](docs/screenshots/20-mobile-workspaces.png) | ![移动端会话列表](docs/screenshots/21-mobile-sessions.png) |
| **移动端聊天** | **模型与思考强度** |
| ![移动端聊天](docs/screenshots/22-mobile-chat.png) | ![模型选择](docs/screenshots/23-mobile-model-sheet.png) |

## SSH 远程开发

侧边栏内置 SSH 面板，可以直接管理远程服务器，并与 Agent 共用连接配置。

支持：

- Web Terminal
- SFTP 上传 / 下载
- 本地端口转发
- 多主机集群执行
- 从 `~/.ssh/config` 导入主机
- 在 Agent 对话中直接调用已配置的远程主机

让 Harness 不仅能操作本机项目，也可以直接参与服务器和远程开发环境中的工作。

## QQ Bot 接入

桌面版集成腾讯 QQ Bot Connector。

可以通过扩展坞扫码完成连接，让 QQ 私聊和群聊与本机 Harness 联动。

连接信息由桌面宿主管理，无需手动修改复杂配置文件。

## 大模型用量看板与性能统计

输入区域下方可以实时查看：

- 滚动 1 秒生成速度与步骤内峰值
- LLM 请求耗时
- 上下文占用
- Cache 命中率
- Input Token
- Output Token

![3.2.0 历史参考：大模型用量看板与滚动 1 秒峰值](docs/screenshots/3.2.0-usage-dashboard.webp)

## 主题与皮肤

桌面版内置多套主题，并支持先预览、再应用。

当前包括 Harbor、Windows XP / Luna、Minecraft 方块世界、Blue Fantasy、鲸吟、初音未来、Trading Terminal、QQ 怀旧主题等风格。

![皮肤中心](docs/screenshots/03-settings-skin-center.png)

### 鲸鱼娘桌宠

内置鲸鱼娘桌宠。

桌宠会根据 Agent 的思考、工作、等待和完成状态自动切换不同动画，同时支持互动、命名、拖拽和隐藏。

| 陪伴工作 | 互动面板 |
| --- | --- |
| ![鲸鱼娘桌宠](docs/screenshots/11-pet-new-chat.png) | ![桌宠互动面板](docs/screenshots/12-pet-panel.png) |

### 全页粒子主题

粒子鲸鱼主题不仅可以显示在启动页面，也可以直接应用到 Harness 主界面，并根据输入、弹窗、后台状态和系统「减少动态效果」设置自动调整视觉效果。

---

## 下载与安装

### Windows

1. 打开 [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest)。
2. 下载 `DeepSeek-Harness-Desktop-Setup-<版本号>-x64.exe`。
3. 运行安装程序完成安装。
4. 启动 **DeepSeek Harness Desktop**。

Windows 安装包已经包含 DSH、桌面插件、皮肤、pnpm、MinGit 与所需原生依赖，不需要额外安装 Node.js 或 Git。

### macOS 未签名预览（Apple Silicon）

只提供 arm64。下载 `.dmg` 或 `.zip` 后把应用放到 `/Applications`，用 `xattr` 去掉隔离属性；macOS 15 起没有「右键打开」。预览版没有自动更新，mac 端使用系统 Git。完整步骤见 [macOS 未签名预览版安装说明](docs/macos-preview.zh.md)。

如果 GitHub 下载速度较慢，也可以加入页面顶部的用户交流群获取同步提供的安装包。

## 更新

DeepSeek Harness Desktop 支持应用内版本检查，发现新版本后可以查看更新内容并选择升级。

提供两个更新频道：

- **Stable**：默认频道，适合绝大多数用户。
- **Beta**：用于体验较新的功能，需要用户主动切换。

升级过程中会尽可能保留已有 DSH_HOME、Desktop Profile、社区 Bundle、Skills、皮肤配置与桌宠状态。

更多信息：

- [升级与回滚](docs/upgrade-and-rollback.md)
- [兼容性政策](docs/compatibility-policy.md)
- [运行时支持政策](docs/runtime-support-policy.md)
- [完整发布说明](docs/launch/release-notes.md)

## 安全与隐私

DeepSeek Harness Desktop 默认尽可能将用户数据和运行环境保留在本机。

主要设计包括：

- DSH Runtime 默认监听本机回环地址
- 桌面主界面与扩展能力采用独立权限边界
- 外部链接通过系统浏览器打开
- OAuth、QQ Bot 等凭据保存在本机
- 遥测默认关闭
- 诊断信息只有在用户主动操作时才会导出
- 导出的诊断信息会对 Token、Secret、Cookie、路径、Prompt、Session 和 Tool Result 等内容进行脱敏

## 文档

- [桌面版技术说明](docs/desktop.md)
- [兼容性政策](docs/compatibility-policy.md)
- [运行时支持政策](docs/runtime-support-policy.md)
- [升级与回滚](docs/upgrade-and-rollback.md)
- [发布与交接工作流](docs/launch/desktop-release-workflow.md)
- [更新日志](CHANGELOG.md)

## 开源与版权

本项目采用 **[BSD-3-Clause](LICENSE)** 许可证开源。

- 本项目代码及内置功能插件、主题皮肤与桌面端均遵循 BSD-3-Clause 开源协议。
- 迁入与引用的第三方代码及环境依赖均保留其原始开源许可证与作者署名。

## Star History

<a href="https://www.star-history.com/?repos=ningbainb%2Fdeepseek-harness-desktop&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ningbainb/deepseek-harness-desktop&type=date&theme=dark&legend=top-left&sealed_token=uz8tv2Zw0Y2_JAybqcIqmwNfh1T4of91EHnFEz-Bxh28xljI3KiZet4ykSVHn9mBULuP0l8FFLHDhudWLQDyfH8pBNAj7Yp6AwseXsGazp8hfpFOt6x0Lg" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ningbainb/deepseek-harness-desktop&type=date&legend=top-left&sealed_token=uz8tv2Zw0Y2_JAybqcIqmwNfh1T4of91EHnFEz-Bxh28xljI3KiZet4ykSVHn9mBULuP0l8FFLHDhudWLQDyfH8pBNAj7Yp6AwseXsGazp8hfpFOt6x0Lg" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ningbainb/deepseek-harness-desktop&type=date&legend=top-left&sealed_token=uz8tv2Zw0Y2_JAybqcIqmwNfh1T4of91EHnFEz-Bxh28xljI3KiZet4ykSVHn9mBULuP0l8FFLHDhudWLQDyfH8pBNAj7Yp6AwseXsGazp8hfpFOt6x0Lg" />
 </picture>
</a>

## 友情链接

本项目积极参与并认可 [LINUX DO 社区](https://linux.do)。

---

<p align="center">
  <b>让 DeepSeek Harness 在 Windows 上真正成为一个可以每天使用的 AI 编程桌面工作台。</b>
</p>

<p align="center">
  如果你喜欢这个项目，欢迎点一个 Star。
</p>
