# DeepSeek Harness Desktop

中文 | [English](README.en.md)

![dsh-web-ui](docs/dsh-web-ui-banner.png)

**DeepSeek Harness Desktop** 是社区维护的开源 Windows AI 编程桌面客户端。它将 DeepSeek Harness Web、DSH 本地主机、插件、Skills、主题、任务自动化与桌面更新能力整合到一个 Windows x64 安装器中，让你安装后即可直接使用完整的 Harness 工作环境。

支持 **Windows 10 / 11 x64**，采用 **BSD-3-Clause** 许可证。安装包已经包含运行所需组件，无需另外配置 Node.js、Git 或单独安装 DSH。

[产品介绍](https://ningbainb.github.io/deepseek-harness-desktop/) · [下载最新版](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest) · [更新日志](CHANGELOG.md) · [桌面版技术说明](docs/desktop.md) · [兼容性政策](docs/compatibility-policy.md)

> 当前稳定版：**3.0.1**

如果这个项目对你有帮助，欢迎在 GitHub 点一个 **Star**，让更多需要 Windows 桌面版 Harness 的用户发现它。

## 为什么使用桌面版

- **开箱即用**：下载安装 EXE 即可启动完整 Harness 环境，不需要手动准备运行时。
- **原生桌面体验**：独立窗口、系统级更新、窗口状态恢复、托盘与桌面交互能力统一集成。
- **完整 AI 编程工作台**：会话、文件、Git、任务、预览、Skills、插件与模型能力集中在一个界面里。
- **可扩展**：支持插件市场、社区 DSH bundle、项目技能、DSH Skills 与 Agents Skills。
- **自动化**：任务看板支持计划任务、后台调度、执行记录与 Evidence。
- **远程能力**：支持移动端远程控制、SSH、SFTP、端口转发、集群执行和 QQ Bot 接入。
- **个性化界面**：内置多套皮肤、全页粒子主题与鲸鱼娘桌宠。
- **可控升级**：Stable / Beta 频道分离，并提供兼容性检查、迁移计划、升级与回滚机制。

## 3.0.1 平台稳定版

3.0.1 的重点是让桌面版具备长期可维护、可升级、可扩展的稳定边界，而不是继续堆叠零散功能。

- **稳定 API 边界**：Desktop Contract、Desktop SDK、Runtime Provider、Preset、Task / Run / Evidence 与 Deep Link 均有明确版本约束。
- **受控 Runtime**：Stable 频道只使用经过验证的 Runtime 组合，通过 supported-runtime matrix 与兼容策略控制上游变化。
- **Stable / Beta 分离**：Stable 不接收 prerelease，Beta 由用户主动选择，频道切换不会自动降级。
- **Migration Assistant**：升级前生成迁移计划，对需要确认或阻断的项目明确提示，并支持继续或回滚。
- **诊断包**：用户可主动导出脱敏 JSON / ZIP 诊断信息，便于反馈问题和定位环境差异。
- **遥测默认关闭**：不会默认上传使用数据；诊断信息仅在用户主动操作时导出到自选位置。
- **发布完整性校验**：Release 提供 `SHA256SUMS.txt` 与 `release-manifest.json`，可用于核验安装资产与发布元数据。

完整版本变化请查看 [CHANGELOG.md](CHANGELOG.md)，主页只保留面向用户的主要能力介绍。

## 核心功能

### Harness AI 编程工作台

桌面版直接运行 DeepSeek Harness Web Surface，并由桌面宿主管理本地 DSH Runtime。你可以在同一个窗口中完成 AI 对话、代码修改、文件预览、Git 操作、任务执行、模型切换和插件扩展。

![DeepSeek Harness Desktop 主界面与 Skills 技能库](docs/screenshots/13-hero-main.png)

### Skills 与插件生态

输入框可直接搜索并插入已安装 Skills；扩展坞支持社区 DSH bundle、插件市场以及项目、DSH、Agents 技能的发现和导入。

桌面版使用独立 `desktop` profile，不覆盖已有 DSH 配置。插件安装、更新和运行时生命周期统一由桌面宿主管理。

### Codex 模型与推理强度

内置 Codex Connect，可通过系统浏览器完成 ChatGPT OAuth，并在 Harness 中使用支持的 OpenAI Codex 模型。

推理强度滑块会根据模型实际能力展示可用档位，切换模型时自动选择有效配置。

### 任务看板与自动化

任务看板按「待规划、待办、进行中、已完成、已失败」管理工作。任务可以直接交给真实 DSH Agent Session 执行，并记录 Task Run 与 Evidence，方便查看结果和继续处理。

同时支持定时任务与后台调度，可用于周期性开发、维护和信息处理工作。

| 多列看板 | 任务详情与定时执行 |
| --- | --- |
| ![任务看板](docs/screenshots/09-task-board.png) | ![任务定时执行](docs/screenshots/10-task-board-detail-cron.png) |

### Git 图谱

通过分支选择器和 Git 图谱查看分支泳道、提交历史与当前仓库状态，快速理解项目变化和定位提交。

![Git 图谱](docs/screenshots/04-git-graph.png)

### 文件、预览与 SCM 右侧面板

项目会话右侧提供完整工作面板：

- **文件树**：浏览和搜索工作区文件；
- **多标签预览**：支持 Markdown、HTML、代码、Diff、CSV、PDF、Office、图片和文本等格式；
- **编辑与保存**：支持源码 / 预览切换及分屏操作；
- **Git 变更**：查看真实 SCM 状态并执行 stage / unstage / discard；
- **可调布局**：宽度、折叠状态按项目保存，并适配桌面版皮肤。

![右侧面板](docs/screenshots/19-right-panel.png)

### 移动端远程

通过桌面端二维码即可在手机上连接当前 Harness 工作区。移动端可以查看和新建会话、收发消息、切换模型与思考强度，并与桌面端保持同步。

默认可在局域网使用，也可以按需启用公网隧道。

| 工作区列表 | 会话列表 |
| --- | --- |
| ![移动端工作区](docs/screenshots/20-mobile-workspaces.png) | ![移动端会话列表](docs/screenshots/21-mobile-sessions.png) |
| 移动端聊天 | 模型与思考强度 |
| ![移动端聊天](docs/screenshots/22-mobile-chat.png) | ![模型选择](docs/screenshots/23-mobile-model-sheet.png) |

### SSH 远程连接

侧边栏的 SSH 面板可直接管理远程主机，并与 Agent 共用连接配置。

支持：

- Web 终端；
- SFTP 上传 / 下载；
- 本地端口转发；
- 多主机集群执行；
- 从 `~/.ssh/config` 导入主机；
- 在 Agent 对话中直接调用已配置的远程主机。

### QQ Bot 扫码接入

桌面版集成腾讯 QQ Bot Connector，可在扩展坞中扫码完成绑定，让 QQ 私聊和群聊连接到本机 Harness。

凭据使用 Windows 系统能力在本机保护，运行时由桌面宿主管理，不需要手动编辑配置文件。

### 实时令牌统计

输入区域下方可以实时查看生成速度（TPS）、LLM 耗时、上下文占用、缓存命中率以及输入 / 输出 Token 数。

![实时令牌统计](docs/screenshots/18-live-stats.png)

## 皮肤与桌宠

桌面版内置多套主题皮肤，并支持先预览再应用。当前包括 Harbor、Windows XP（Luna）、Minecraft 方块世界、Blue Fantasy、鲸吟、初音未来、Trading Terminal、QQ 怀旧主题等风格。

![皮肤中心](docs/screenshots/03-settings-skin-center.png)

### 鲸鱼娘桌宠

鲸鱼娘会根据 Agent 的思考、等待、工作和完成状态切换动画，也支持互动、命名、拖拽和隐藏。

| 陪伴工作 | 互动面板 |
| --- | --- |
| ![鲸鱼娘宠物](docs/screenshots/11-pet-new-chat.png) | ![宠物互动面板](docs/screenshots/12-pet-panel.png) |

### 全页粒子主题

粒子鲸鱼主题不仅用于启动页，也可以应用到主界面，并根据输入、弹窗、后台状态和系统「减少动态效果」设置自动调整动画强度。

## 下载与安装

1. 打开 [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest)。
2. 下载 `DeepSeek-Harness-Desktop-Setup-<版本号>-x64.exe`。
3. 运行安装器完成安装。
4. 如需核验文件完整性，可同时下载 `SHA256SUMS.txt` 并比对安装包 SHA-256。

安装包已经包含 DSH、桌面插件、皮肤、pnpm、MinGit 与所需原生依赖，不需要额外配置 Node.js 或 Git。

GitHub Releases 是桌面版默认下载源。如果 GitHub 下载速度较慢，可以加入用户群获取同步提供的最新安装包。

## 更新与升级

应用会检查 GitHub Release，并在发现新版本时展示更新说明。用户可以选择前往 GitHub 下载、加入用户群或稍后更新。

Stable 是默认更新频道；Beta 仅在用户明确选择后接收 prerelease。升级流程会保留现有 `DSH_HOME`、桌面 profile、社区 bundle、桌宠状态和皮肤配置。

更多信息：

- [升级与回滚](docs/upgrade-and-rollback.md)
- [兼容性政策](docs/compatibility-policy.md)
- [运行时支持政策](docs/runtime-support-policy.md)
- [完整发布说明](docs/launch/release-notes.md)

## 安全与隐私

- DSH Runtime 默认只监听本机回环地址；
- 桌面主界面与扩展能力使用独立权限边界；
- 外部链接交由系统浏览器打开；
- OAuth、QQ Bot 等敏感凭据只保存在本机；
- 遥测默认关闭；
- 诊断包由用户主动导出，并对 Secret、Token、Cookie、路径、Prompt、Session、Tool Result 等敏感内容进行脱敏处理。

## 社区用户交流群

QQ 群：**1105158177** · **[点击一键加入 QQ 群](https://qm.qq.com/q/vehlNjaeye)**

<a href="https://qm.qq.com/q/vehlNjaeye"><img src="website/assets/qq-group-1105158177.jpg" width="280" alt="DeepSeek Harness Desktop QQ 群 1105158177 加群二维码"></a>

欢迎在群内交流使用体验、插件、Skills、模型配置与功能建议。

## 文档

- [桌面版技术说明](docs/desktop.md)
- [兼容性政策](docs/compatibility-policy.md)
- [运行时支持政策](docs/runtime-support-policy.md)
- [升级与回滚](docs/upgrade-and-rollback.md)
- [发布与交接工作流](docs/launch/desktop-release-workflow.md)
- [更新日志](CHANGELOG.md)

## 来源与版权

| 包 | 来源 | 版权 |
| --- | --- | --- |
| dsh-task-board / dsh-git-graph / dsh-aionui-panel / dsh-pet / dsh-particle-theme / dsh-remote-web-ui / dsh-live-stats / dsh-web-ui-settings / dsh-skins / dsh-web-ui-all / skins | 作者 zhu1090093659 个人开发 | BSD-3-Clause（zhu1090093659） |

迁入第三方代码必须保留 LICENSE 与署名；活跃且有上游的第三方优先 fork 或依赖引用，不搬代码。

## 友情链接

- 本项目积极参与并认可 [LINUX DO 社区](https://linux.do)。
