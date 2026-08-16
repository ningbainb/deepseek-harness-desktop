# DeepSeek Harness Desktop

中文 | [English](README.en.md)

![dsh-web-ui](docs/dsh-web-ui-banner.png)

## 社区用户交流群

QQ 群：**1105158177** · **[点击一键加入 QQ 群](https://qm.qq.com/q/vehlNjaeye)**

<a href="https://qm.qq.com/q/vehlNjaeye"><img src="website/assets/qq-group-1105158177.jpg" width="280" alt="DeepSeek Harness Desktop QQ 群 1105158177 加群二维码"></a>

## Windows 桌面版

DeepSeek Harness Desktop 将原版 DSH Web 界面完整装进 Windows EXE：不是重写页面，而是用安全的 Electron 窗口启动官方 `@deepseek-ai/dsh` 本地主机，再原样加载本仓库的全部插件与皮肤。

[浏览产品介绍](https://ningbainb.github.io/deepseek-harness-desktop/) · [下载 Windows x64 安装器](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest) · [桌面版技术说明](docs/desktop.md) · [发布与交接工作流](docs/launch/desktop-release-workflow.md) · [更新日志](CHANGELOG.md)

如果这个项目对你有帮助，欢迎在 [GitHub 仓库](https://github.com/ningbainb/deepseek-harness-desktop) 点 Star，帮助更多桌面版用户发现它。

### 最新版：0.1.9

`desktop-v0.1.9` 是当前稳定版：[查看完整发布说明](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v0.1.9) · [直接下载安装包](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v0.1.9/DeepSeek-Harness-Desktop-Setup-0.1.9-x64.exe) · [下载 SHA-256 校验文件](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v0.1.9/SHA256SUMS.txt)

| 版本 | 主要更新 |
| --- | --- |
| **0.1.9** | 修复对话气泡与整段内容复制；更新改为后台下载并加入毛玻璃更新面板与粒子鲸鱼启动页；新增社区插件适配检测、离线切换、失败回滚与性能保护。 |
| **0.1.8** | 内置 ChatGPT OAuth 与 OpenAI Codex 模型、模型推理强度滑块、帮助菜单社群与建议入口；默认只保留 `dshmarket`，并修复空补丁、旧市场和皮肤链接迁移。 |
| **0.1.7** | 全新深海启动界面与状态驱动进度；32px macOS 风格磨砂玻璃窗口栏；收紧大文件预览内存、Git 轮询和 SSH 传输边界，并提升首次安装后的冷启动容错与发布门禁。 |
| **0.1.6** | 内置腾讯官方 QQ Bot 与扫码 Connector；在扩展坞完成二维码绑定、刷新、取消、重新绑定和解绑，QQ 私聊与群聊可直接接入桌面版 Harness。AppSecret 使用 Windows 凭据保护加密，只注入 DSH 子进程。 |
| **0.1.5** | 原生标题栏跟随亮色/暗色主题；全屏弹窗避开标题栏安全区；修复安装版皮肤发现与切换，并内置 `dshmarket` 和 `dsh-plugin-hub`。 |
| **0.1.4** | 桌宠迁移到全局 Shell Overlay，首页和设置页均可见；恢复五张 Web UI 插件配置卡；皮肤中心完整展示安装版随附的九套皮肤。 |
| **0.1.3** | 加入稳定版 GitHub Release 更新检查、双语更新说明、用户确认下载、任务栏进度和二次确认安装。 |

| 原版界面无损加载 | 桌面扩展坞 |
| --- | --- |
| ![桌面启动界面](docs/screenshots/desktop-startup.png) | ![插件与技能扩展坞](docs/screenshots/desktop-extension-dock.png) |

- 内置 dsh-web-ui 0.1.15 套件，保留任务看板、Git 图谱、右侧面板、SSH、移动端远程、实时统计、宠物，并新增图像描述与量身 Agent；
- 内置腾讯官方 QQ Bot，可在扩展坞扫码绑定 QQ 私聊与群聊，无需编辑 YAML 或打开后台终端；
- 内置 ChatGPT OAuth、OpenAI Codex 模型与推理强度滑块，登录使用系统浏览器，凭据保存在本机；
- 独立 `desktop` profile，不覆盖既有 DSH 配置，运行时仅监听回环地址；
- 内置崩溃恢复、日志脱敏与轮转、窗口状态恢复、严格导航与权限策略；
- 内置 GitHub Release 更新检查，发现新版后在后台下载，完成后再由用户阅读说明并确认重启安装；
- 扩展坞支持社区 DSH bundle 安装/回滚、内置插件市场，以及项目、DSH、Agents 技能发现与安全导入；
- 安装包自带官方 DSH、pnpm 与原生依赖，无需另外安装 Node.js。

桌面版已预装任务看板、Git 图谱、右侧面板、移动端远程、远程连接、鲸鱼娘宠物、实时令牌统计、Codex Connect、推理强度滑块、插件市场和皮肤中心。下载安装 EXE 即可使用，不需要另外安装 DSH、Node.js 或执行插件命令。

![DSH Web UI 主界面](docs/screenshots/13-hero-main.png)

## 功能插件

### QQ 机器人扫码接入（桌面版 0.1.6）

桌面版内置腾讯官方 `@tencent-connect/dsh-qqbot` 0.3.0 和 `@tencent-connect/qqbot-connector` 1.2.0。在扩展坞打开 QQ Bot 卡片即可获取自动刷新的二维码，使用手机 QQ 扫码后，QQ 私聊与群聊便可连接到本机 Harness；同时支持取消、重新绑定和彻底解绑。

未绑定时插件保持禁用，不会让隐藏的后台进程等待终端扫码，也不会拖慢 Web UI 启动。绑定成功后桌面端会自动启用插件并重启 DSH。AppSecret 由 Electron `safeStorage` 结合 Windows 系统凭据保护加密保存，不会发送到渲染页面、写入日志或明文进入 `cordis.patch.yml`；运行时只通过子进程环境注入。

### Codex 模型与推理强度（桌面版 0.1.8）

桌面版内置 `dsh-codex-connect` 0.1.0-alpha.4.5，可在设置页通过系统浏览器完成 ChatGPT OAuth，并启用 OpenAI Codex 模型。它不会默认替换当前模型、接管全局搜索或启用远程图片工具；检测到已有 Codex Provider 时会保留现有配置，OAuth 凭据只保存在本机 DSH home。

内置 `reasoning-slider` 0.0.2，在模型选择器中只展示模型实际支持的推理强度，切换模型时会自动回退到有效档位。顶部帮助菜单同时提供 QQ 群二维码、一键加群与 GitHub 建议入口，所有外链均交由系统浏览器打开。

### 任务看板

在侧边栏点击「任务看板」进入。任务按五列状态组织：待规划、待办、进行中、已完成、已失败。点击卡片上的「执行」，任务将由真实的 DSH 智能体会话执行，完成后状态自动回写；需要复盘时，可直接跳转到执行会话查看完整过程。

任务支持定时执行：在详情中配置 cron 表达式（如每天 23:00 自动升级 DSH、每周一 09:00 生成周报），到点自动开工，无需人工值守。

| 多列看板 | 定时执行 |
| --- | --- |
| ![任务看板](docs/screenshots/09-task-board.png) | ![任务定时执行](docs/screenshots/10-task-board-detail-cron.png) |

### Git 图谱

输入框上方的分支选择器，支持切换分支与查看提交历史；Git 图谱将分支泳道与提交历史可视化，仓库再大也能顺着时间线快速定位变更。

![Git 图谱](docs/screenshots/04-git-graph.png)

### 右侧面板

项目会话打开时，聊天区右侧出现「预览」与「文件/变更」两块面板：

- **文件树**：浏览工作目录，点击文件即在预览面板打开，整行点击展开文件夹，支持按文件名搜索定位；
- **预览**：多标签预览 markdown、HTML、代码、diff、CSV、PDF、Office、图片与文本等格式，支持源码 / 预览切换、分屏编辑与保存；
- **变更（SCM）**：真实 git 变更面板，支持 stage / unstage / discard；
- 面板宽度可拖拽调整，双击把手复位默认宽度，折叠状态与宽度按项目持久化；
- 11 款皮肤全部适配右侧面板，换肤后面板随之融入主题。

![右侧面板](docs/screenshots/19-right-panel.png)

### 鲸鱼娘宠物

一只常驻界面的鲸鱼娘宠物，会跟随智能体的状态切换动画：思考、等待、工作、庆祝。点击可互动（摸头），投喂小鱼干可提升亲密度，陪伴度从幼鲸一路成长至「深海羁绊」。支持自定义名称、自由拖动位置，也可随时隐藏。

| 陪伴工作 | 互动面板 |
| --- | --- |
| ![鲸鱼娘宠物](docs/screenshots/11-pet-new-chat.png) | ![宠物互动面板](docs/screenshots/12-pet-panel.png) |

### 实时令牌统计

在输入框下方实时显示生成速度（TPS）、LLM 耗时、上下文占用、缓存命中率以及输入 / 输出 token 数，每次生成的用量一目了然。

![实时令牌统计](docs/screenshots/18-live-stats.png)

### 移动端远程

侧边栏底部的手机图标打开配对面板：扫码配对（或复制链接）后，手机进入独立的移动端界面，远程控制当前 dsh web 工作区——查看与新建会话、收发消息、切换模型与思考强度、调整权限预设，全部与桌面端同步。配对令牌一次性且限时，「停止」可随时吊销所有设备；二维码默认走局域网，也可开启 cloudflared 公网隧道，让手机在任意网络配对。

| 工作区列表 | 会话列表与新建会话 |
| --- | --- |
| ![移动端工作区](docs/screenshots/20-mobile-workspaces.png) | ![移动端会话列表](docs/screenshots/21-mobile-sessions.png) |
| 聊天（折叠的深度思考与工具调用） | 模型与思考强度选择 |
| ![移动端聊天](docs/screenshots/22-mobile-chat.png) | ![模型选择](docs/screenshots/23-mobile-model-sheet.png) |

### 远程连接

侧边栏「SSH」入口打开远程运维面板。主机支持密钥 / 密码认证，可从 `~/.ssh/config` 一键导入；配置统一存于 `~/.dsh/dsh-ssh.json`。对已配置主机可执行真实操作：

- **Web 终端**：xterm.js 远程终端，实时输出、随窗口自适应；
- **文件传输**：SFTP 上传 / 下载，带进度条与远程目录浏览；
- **端口转发**：本地隧道直达远程内网服务（数据库、API、管理后台），仅监听 127.0.0.1；
- **集群执行**：一条命令并发跑多台主机，按别名 / 环境 / 标签过滤；
- **Agent 直连**：Agent 与面板共享同一份主机配置，对话中直接说「连一下 xxx 看看状态」即可由智能体执行远程命令。

### 设置中心

全部插件的开关与参数统一收纳于「设置 > 插件配置」，修改即时生效。桌面版会明确开放移动端远程控制、皮肤中心、实时令牌估算、任务看板和宠物五张配置卡，不会因 DSH Host 的设置命名空间过滤而缺项。

![插件配置中心](docs/screenshots/02-settings-web-ui-plugins.png)

### 插件市场与扩展坞

桌面 profile 只内置 `dshmarket` 1.3.0 作为默认插件市场。市场安装目标固定为隔离的 `desktop` profile，支持社区 DSH bundle 的发现、安装、事务回滚和保留升级；运行时重启由桌面宿主统一管理，避免市场自行启动第二个 DSH 进程。项目技能、DSH 技能与 Agents 技能也可在扩展坞中发现并经过安全检查后导入。

## 皮肤

皮肤中心提供 11 款可选皮肤（含 Harbor 与 QQ2006），均支持先试穿再应用：试穿即时生效、退出完全还原，确认满意后一键应用。

![皮肤中心](docs/screenshots/03-settings-skin-center.png)

### Windows XP（Luna）

还原 Luna 经典界面：蓝色渐变窗口条、绿色「开始」按钮、Bliss 蓝天桌面，全局直角风格。

![Windows XP 皮肤](docs/screenshots/16-skin-xp-light.png)

### Minecraft 方块世界

以《我的世界》主界面为灵感：像素全景天空盒在界面后方缓慢旋转，按钮为灰石板样式，输入框为木告示牌样式。

![Minecraft 皮肤](docs/screenshots/15-skin-minecraft-light.png)

### Blue Fantasy 蓝色幻想

鲸鱼插画铺于半透明面板之下，靛蓝色调色板贯穿全局，暗色主题下效果尤为突出。

![Blue Fantasy 暗色](docs/screenshots/17-skin-blue-fantasy-dark.png)

### 鲸吟（Whale Song）

深海鲸语女神主题：无文字纯氛围背景画（蓝发女神与鲸群居左、冰蓝星座网格与金色细线点缀、右侧大量留白）垫在半透明面板之下，冰蓝 / 浅青 / 深海军蓝 / 钴蓝冷色体系贯穿全局，暗色变体为深海夜航调。

![鲸吟 亮色](docs/screenshots/24-skin-whale-song-light.png) · ![鲸吟 暗色](docs/screenshots/25-skin-whale-song-dark.png)

### 初音未来（Miku）

电子歌姬主题以青蓝音符、声波状态栏与半透明舞台面板重塑完整界面，同时保持亮色、暗色模式和功能插件可读性。

### 交易终端（Trading Terminal）

带实时行情的炒股皮肤：顶栏滚动跑马灯（A股 / 港股 / 美股 / 指数 / 加密 / 外汇，红涨绿跌），标题栏行情快签，状态栏展示 A股 / 港股 / 美股交易时段与港美股指数。已安装 `dsh-fun-ticker` 时跑马灯跟随你的自选列表（同源代理取数），已安装 `dsh-longbridge` 时指数格渲染长桥券商快照；两个插件都没装也能直接走公共行情源（腾讯 / 币安 / Frankfurter）独立工作，所有路径失败都安全降级为 `--`。

![交易终端 亮色](docs/screenshots/26-skin-trading-light.png) · ![交易终端 暗色](docs/screenshots/27-skin-trading-dark.png)

其余三款：QQ2008 怀旧版（水晶蓝配色与企鹅元素）、同花顺风格（行情元素融入界面）、龙的传人（朱砂龙印主题）。

## 下载、校验与升级

1. 从 [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest) 下载最新的 Windows x64 安装包。
2. 运行 `DeepSeek-Harness-Desktop-Setup-<版本号>-x64.exe` 完成安装；DSH、插件、皮肤、pnpm 和原生依赖均已随安装包提供。
3. 如需核验文件完整性，请下载同一 Release 中的 `SHA256SUMS.txt` 并比对安装包 SHA-256。

应用会检查稳定版 GitHub Release，展示中英双语更新说明，并在下载和重启安装前分别请求确认。覆盖升级不会删除既有 `DSH_HOME`、桌面 profile、社区 bundle、桌宠状态、皮肤配置或已加密的 QQ Bot 凭据。

当前安装包没有商业代码签名，Windows SmartScreen 可能显示“未知发布者”。请只使用本项目 Release 页面提供的安装包；推荐采用默认安装路径，避免过长路径触发传统 Win32 限制。

## 来源与版权

| 包 | 来源 | 版权 |
| --- | --- | --- |
| dsh-task-board / dsh-git-graph / dsh-aionui-panel / dsh-pet / dsh-remote-web-ui / dsh-live-stats / dsh-web-ui-settings / dsh-skins / dsh-web-ui-all / skins | 作者 zhu1090093659 个人开发 | BSD-3-Clause（zhu1090093659） |

迁入第三方代码必须保留 LICENSE 与署名；活跃且有上游的第三方优先 fork 或依赖引用，不搬代码。

## 友情链接

- 本项目积极参与并认可 [LINUX DO 社区](https://linux.do)。
