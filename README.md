# DeepSeek Harness Desktop

中文 | [English](README.en.md)

![DeepSeek Harness Desktop](docs/dsh-web-ui-banner.png)

## 👥 DeepSeek Harness Desktop 用户交流群

QQ 群：**1105158177**

**[👉 点击一键加入 QQ 群](https://qm.qq.com/q/vehlNjaeye)**

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

**DeepSeek Harness Desktop** 是社区维护的开源 Windows AI 编程桌面客户端。

它将 **DeepSeek Harness Web、DSH 本地运行环境、Skills、插件、任务自动化、Git、远程开发与桌面扩展能力** 集成到一个 Windows 应用中，让你无需复杂配置，就能获得完整的 Harness AI 编程体验。

支持 **Windows 10 / 11 x64**，采用 **BSD-3-Clause** 许可证。

安装包已包含主要运行组件，无需另外配置 Node.js、Git 或单独安装 DSH。

[🌐 产品介绍](https://ningbainb.github.io/deepseek-harness-desktop/) · [⬇️ 下载最新版](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest) · [📖 使用文档](docs/desktop.md) · [📝 更新日志](CHANGELOG.md)

### 最新版：3.0.9

`desktop-v3.0.9` 使用“直接载入 + 零点击自动修复”启动策略：[查看完整发布说明](docs/launch/release-notes.md) · [查看兼容性和运行时政策](docs/compatibility-policy.md) · [查看升级与回滚](docs/upgrade-and-rollback.md)。发布资产包含 `SHA256SUMS.txt`、`release-manifest.json` 与频道元数据；签名状态以同一 Release 的 manifest 为准。

| 版本 | 主要更新 |
| --- | --- |
| **3.0.9** | 直接读取同一 Home 的原有数据和全部插件；完整启动原样重试后可用已配置模型做有界事务修复，验证失败自动回滚，最终在同一 Home 使用内置插件；无模型或可用 Key 时不调用云端模型并明确回退；启动页显示修复过程，Tools 能力按当前 Runtime 安全处理。 |
| **3.0.7** | 直接启动与零点击自动修复的首个稳定版本；保留同一 Home 的数据、完整插件图和事务回滚边界。 |
| **3.0.1** | 冻结 SDK/Contract/Provider/Schema，Stable/Beta 分离，受控 Runtime matrix 与 patch 政策，隐私脱敏 JSON/ZIP 诊断包，签名与 release manifest 发布基础设施；遥测默认关闭。 |
| **2.7.0** | 修复 Windows 8% Runtime 启动故障并升级到 DSH rc.7；新增托盘后台自动化、Host 持久任务调度、插件兼容声明/锁、browser-safe Desktop SDK、安全工作区外部打开和 Candidate Matrix。 |
| **2.6.0** | Task Board v3 引入 Project、Task Run、Evidence 与 Git Worktree 审核流；Runtime Provider 缺少可选能力时显式回退 shared-workspace，并加入 Candidate 执行兼容夹具。该版本的匿名统计行为仅作历史记录，已由 3.0 的默认关闭政策取代。 |
| **2.5.0** | 新增 Runtime Adapter 与上游兼容防线、安全 `.dshpreset` 和 Web Profile 迁移、原子插件批量事务、严格 Deep Link/文件关联与结构化通知。 |
| **2.4.0** | 新增可靠更新关停回执 v2、主界面/扩展坞权限拆分、Desktop Contract v1，以及 Task Board Host 文件存储 v2。 |
| **2.3.0** | 新增只出现一次的 GitHub Star 动画引导与“加入社群”反馈入口；安装预检可识别外部 PowerShell/CMD/Node 宿主、EncodedCommand 与 Windows 短路径，兼容 0.1.9 直接升级，并通过独立 profile 与端口回退和官方 Web 端共存。 |
| **2.2.0** | 隐藏 Windows 终端及其后代窗口；升级时自动清理旧应用和插件后台、迁移可识别旧依赖与旧安全模式误判；重启复用端口，安全模式支持可见提示与一键恢复。 |
| **2.1.0** | 新增国内更新镜像自动测速与回退、插件快照/自动隔离/安全模式三层容灾；统一皮肤持久化，修复升级文件占用、隐藏命令框、中文工作区重启循环，并从工具菜单直接打开扩展坞。 |
| **2.0.0** | 修复取消后排队消息滞留与运行时损坏循环；新增 Skills 菜单、模型 API 有界重试、思考区吸顶和 SSH 实时监控；统一 Harness 原生视觉并完善粒子鲸鱼启动页。 |
| **0.1.9** | 修复对话气泡与整段内容复制；更新改为后台下载并加入毛玻璃更新面板与粒子鲸鱼启动页；新增社区插件适配检测、离线切换、失败回滚与性能保护。 |
| **0.1.8** | 内置 ChatGPT OAuth 与 OpenAI Codex 模型、模型推理强度滑块、帮助菜单社群与建议入口；默认只保留 `dshmarket`，并修复空补丁、旧市场和皮肤链接迁移。 |
| **0.1.7** | 全新深海启动界面与状态驱动进度；32px macOS 风格磨砂玻璃窗口栏；收紧大文件预览内存、Git 轮询和 SSH 传输边界，并提升首次安装后的冷启动容错与发布门禁。 |
| **0.1.6** | 内置腾讯官方 QQ Bot 与扫码 Connector；在扩展坞完成二维码绑定、刷新、取消、重新绑定和解绑，QQ 私聊与群聊可直接接入桌面版 Harness。AppSecret 使用 Windows 凭据保护加密，只注入 DSH 子进程。 |
| **0.1.5** | 原生标题栏跟随亮色/暗色主题；全屏弹窗避开标题栏安全区；修复安装版皮肤发现与切换，并内置 `dshmarket` 和 `dsh-plugin-hub`。 |
| **0.1.4** | 桌宠迁移到全局 Shell Overlay，首页和设置页均可见；恢复五张 Web UI 插件配置卡；皮肤中心完整展示安装版随附的九套皮肤。 |
| **0.1.3** | 加入稳定版 GitHub Release 更新检查、双语更新说明、用户确认下载、任务栏进度和二次确认安装。 |

### 3.0.9 直接启动与自动修复

- **不再让用户选启动方式**：新用户直接进入内置环境；老用户直接读取当前 `DSH_HOME`、Profile、对话、Session、设置、任务、皮肤和全部插件，不创建迁移计划或隔离 Home。
- **完整启动优先**：完整 Profile 失败时原样重试一次，不先停用插件，也不把“外来插件”当作启动阻断条件。
- **模型自动修复**：确认为插件或配置问题后，可调用用户已经配置的模型在私有事务工作区生成候选；只有通过注册检查的修改才会原子应用。
- **无 Key 也可完成启动收敛**：没有模型或可用 Key 时不会调用云端模型，页面明确显示无模型状态并继续同 Home 内置插件回退；Tools capability 按当前 Runtime 能力安全处理。
- **失败自动收敛**：候选无效、没有可用模型或修复后仍失败时自动回滚，并从同一个 Home 启动内置插件；聊天和设置不搬家。
- **状态页不做选择题**：启动界面只显示“正在载入”“正在自动修复”“正在验证”等状态。日志和脱敏诊断位于设置的高级区域。
- **发布前跑真实矩阵**：2.3–2.7、3.0.1 与干净安装 Home 加上故障注入，必须在未签名的 unpacked 候选上通过 direct-start matrix，之后才能生成安装器。

> 如果这个项目对你有帮助，欢迎点一个 **Star ⭐**。  
> 你的支持可以让更多 Windows 用户发现 DeepSeek Harness Desktop。

---


## ✨ 为什么选择 DeepSeek Harness Desktop

### 📦 开箱即用

下载安装 EXE 后即可启动完整 Harness 环境。

无需手动准备 Node.js、Git、pnpm 或 DSH Runtime，桌面端会统一管理所需组件与运行环境。

### 🤖 完整 AI 编程工作台

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

### 🧩 Skills 与插件生态

支持多种扩展方式：

- DSH Skills
- Agents Skills
- 项目 Skills
- 社区 DSH Bundle
- 插件市场
- 桌面扩展

可以直接在 Harness 中搜索、安装和使用扩展能力，将自己的开发工具逐步组合成一套完整工作流。

### ✅ 任务看板与自动化

内置任务看板，可以管理：

**待规划 → 待办 → 进行中 → 已完成 / 已失败**

任务可以交给真实 DSH Agent Session 执行，并记录 Task Run 与 Evidence，方便查看结果和继续处理。

同时支持定时任务与后台调度，适合周期性的开发、维护和自动化工作。

### 🌐 远程开发

桌面版不仅可以操作本机项目，也支持远程开发场景：

- 手机远程控制
- SSH
- Web Terminal
- SFTP
- 端口转发
- 多主机集群执行
- QQ Bot 接入

可以从电脑、手机或聊天工具连接自己的 Harness 工作环境。

### 🎨 个性化桌面体验

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

## 🖥️ Harness AI 编程工作台

桌面版直接运行 DeepSeek Harness Web Surface，并由桌面宿主管理本地 DSH Runtime。

在同一个窗口中即可完成 AI 对话、代码修改、文件管理、Git 操作、任务执行、模型切换和插件扩展。

![DeepSeek Harness Desktop 主界面与 Skills 技能库](docs/screenshots/13-hero-main.png)

## 🧩 Skills 与插件

输入框可以直接搜索并插入已安装 Skills。

扩展坞支持：

- 社区 DSH Bundle
- 插件市场
- 项目 Skills
- DSH Skills
- Agents Skills

桌面版使用独立的 `desktop` profile，不会覆盖已有 DSH 配置。

插件安装、更新以及运行时生命周期均由桌面宿主统一管理。

## 🧠 Codex 模型与推理强度

3.0.9 使用 DSH RC.1 内置的 `llm-pi-ai/openai-codex` 官方授权流程完成 ChatGPT OAuth，并在 Harness 中使用支持的 OpenAI Codex 模型；不再加载会与原生 Provider 冲突的旧 `dsh-codex-connect` 插件。设置页的「ChatGPT 登录」一次点击启动 OAuth，并由系统浏览器继续；授权 grant 只由官方凭据服务读写并保存在本机 DSH Home，前端只读取"是否已登录"，不会收到 access token 或 refresh token。它不会默认替换当前模型、接管全局搜索或启用远程图片工具。

模型切换时，桌面端会根据模型实际能力展示可用的推理强度档位，并自动处理对应配置。

## ✅ 任务看板与自动化

通过任务看板统一管理 Agent 工作。

| 多列任务看板 | 任务详情与定时执行 |
| --- | --- |
| ![任务看板](docs/screenshots/09-task-board.png) | ![任务定时执行](docs/screenshots/10-task-board-detail-cron.png) |

任务可以直接交给 DSH Agent Session 执行，并保存 Task Run 与 Evidence。

除了手动任务之外，还支持定时任务和后台调度，可以用于周期性开发、信息处理和维护工作。

## 🌿 Git 图谱

通过分支选择器和 Git 图谱查看分支关系、Commit 历史、当前仓库状态和分支泳道，帮助快速理解项目变化和代码提交历史。

![Git 图谱](docs/screenshots/04-git-graph.png)

## 📁 文件、预览与 SCM

项目会话右侧提供完整工作面板：

- **文件树**：浏览和搜索工作区文件
- **文件预览**：Markdown、HTML、代码、Diff、CSV、PDF、Office、图片和文本
- **编辑与保存**：源码 / 预览切换以及分屏操作
- **Git 变更**：查看真实 SCM 状态并执行 Stage / Unstage / Discard
- **可调布局**：记录不同项目的面板宽度和折叠状态

![右侧面板](docs/screenshots/19-right-panel.png)

## 📱 手机远程控制

通过桌面端二维码即可连接当前 Harness 工作区。

手机端可以查看工作区、新建和查看会话、收发消息、切换模型、调整思考强度，并与桌面端保持同步。

默认可以在局域网环境使用，也可以根据需要启用公网隧道。

| 工作区列表 | 会话列表 |
| --- | --- |
| ![移动端工作区](docs/screenshots/20-mobile-workspaces.png) | ![移动端会话列表](docs/screenshots/21-mobile-sessions.png) |
| **移动端聊天** | **模型与思考强度** |
| ![移动端聊天](docs/screenshots/22-mobile-chat.png) | ![模型选择](docs/screenshots/23-mobile-model-sheet.png) |

## 🖥️ SSH 远程开发

侧边栏内置 SSH 面板，可以直接管理远程服务器，并与 Agent 共用连接配置。

支持：

- Web Terminal
- SFTP 上传 / 下载
- 本地端口转发
- 多主机集群执行
- 从 `~/.ssh/config` 导入主机
- 在 Agent 对话中直接调用已配置的远程主机

让 Harness 不仅能操作本机项目，也可以直接参与服务器和远程开发环境中的工作。

## 💬 QQ Bot 接入

桌面版集成腾讯 QQ Bot Connector。

可以通过扩展坞扫码完成连接，让 QQ 私聊和群聊与本机 Harness 联动。

连接信息由桌面宿主管理，无需手动修改复杂配置文件。

## 📊 实时 Token 与性能统计

输入区域下方可以实时查看：

- TPS 生成速度
- LLM 请求耗时
- 上下文占用
- Cache 命中率
- Input Token
- Output Token

![实时令牌统计](docs/screenshots/18-live-stats.png)

## 🎨 主题与皮肤

桌面版内置多套主题，并支持先预览、再应用。

当前包括 Harbor、Windows XP / Luna、Minecraft 方块世界、Blue Fantasy、鲸吟、初音未来、Trading Terminal、QQ 怀旧主题等风格。

![皮肤中心](docs/screenshots/03-settings-skin-center.png)

### 🐳 鲸鱼娘桌宠

内置鲸鱼娘桌宠。

桌宠会根据 Agent 的思考、工作、等待和完成状态自动切换不同动画，同时支持互动、命名、拖拽和隐藏。

| 陪伴工作 | 互动面板 |
| --- | --- |
| ![鲸鱼娘桌宠](docs/screenshots/11-pet-new-chat.png) | ![桌宠互动面板](docs/screenshots/12-pet-panel.png) |

### ✨ 全页粒子主题

粒子鲸鱼主题不仅可以显示在启动页面，也可以直接应用到 Harness 主界面，并根据输入、弹窗、后台状态和系统「减少动态效果」设置自动调整视觉效果。

---

## ⬇️ 下载与安装

1. 打开 [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest)。
2. 下载 `DeepSeek-Harness-Desktop-Setup-<版本号>-x64.exe`。
3. 运行安装程序完成安装。
4. 启动 **DeepSeek Harness Desktop**。

安装包已经包含 DSH、桌面插件、皮肤、pnpm、MinGit 与所需原生依赖，不需要额外安装 Node.js 或 Git。

如果 GitHub 下载速度较慢，也可以加入页面顶部的用户交流群获取同步提供的安装包。

## 🔄 更新

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

## 🔐 安全与隐私

DeepSeek Harness Desktop 默认尽可能将用户数据和运行环境保留在本机。

主要设计包括：

- DSH Runtime 默认监听本机回环地址
- 桌面主界面与扩展能力采用独立权限边界
- 外部链接通过系统浏览器打开
- OAuth、QQ Bot 等凭据保存在本机
- 遥测默认关闭
- 诊断信息只有在用户主动操作时才会导出
- 导出的诊断信息会对 Token、Secret、Cookie、路径、Prompt、Session 和 Tool Result 等内容进行脱敏

## 📚 文档

- [桌面版技术说明](docs/desktop.md)
- [兼容性政策](docs/compatibility-policy.md)
- [运行时支持政策](docs/runtime-support-policy.md)
- [升级与回滚](docs/upgrade-and-rollback.md)
- [发布与交接工作流](docs/launch/desktop-release-workflow.md)
- [更新日志](CHANGELOG.md)

## 📄 开源与版权

DeepSeek Harness Desktop 采用 **BSD-3-Clause** 许可证。

| 包 | 来源 | 版权 |
| --- | --- | --- |
| dsh-task-board / dsh-git-graph / dsh-aionui-panel / dsh-pet / dsh-particle-theme / dsh-remote-web-ui / dsh-live-stats / dsh-web-ui-settings / dsh-skins / dsh-web-ui-all / skins | 作者 zhu1090093659 个人开发 | BSD-3-Clause（zhu1090093659） |

迁入第三方代码时保留对应 LICENSE 与署名；对于仍然活跃维护的第三方项目，优先采用 Fork 或依赖引用方式。

## ❤️ 友情链接

本项目积极参与并认可 [LINUX DO 社区](https://linux.do)。

---

<p align="center">
  <b>让 DeepSeek Harness 在 Windows 上真正成为一个可以每天使用的 AI 编程桌面工作台。</b>
</p>

<p align="center">
  如果你喜欢这个项目，欢迎点一个 ⭐ Star。
</p>
