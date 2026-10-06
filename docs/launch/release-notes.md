# DeepSeek Harness Desktop 5.0.1

## 中文

### 本次亮点

5.0.1 在 5.0.0 完整工作台基础上优化日常可用性，重点改善流式输出、拥挤侧栏和暗色拓展坞。官方 NPM Runtime 保持 0.2.0-rc.2，不修改官方源码，不删除已有插件、模型配置、历史会话或设置入口。Windows x64、macOS arm64 与 Linux x64 使用同一版本号，按三个原生 Runner 的统一门禁发布。

- 新用户默认使用官方原生皮肤；升级保留已有皮肤、背景和明确保存的粒子主题选择，十五款内置皮肤继续可用。
- 流式文本与 Markdown 内部更新避免重复侧栏兼容扫描，保留完整中文、代码、工具结果及原生轮次导航，不以截断内容换取性能。
- 左侧工具支持折叠、展开、键盘操作与重启恢复，为工作区和会话列表留出空间；扩展坞只保留底部入口，用量统一保留今日消费，旧外壳兼容入口仍保留。
- 拓展坞采用纯色面板，去除玻璃模糊、装饰渐变和悬停上浮；保留十五个导航入口、功能搜索和可见键盘焦点，改善暗色文字对比度。
- 上下文提示不因磨砂容器反复跳动；会话 A 到 B 再返回 A、完整历史及已有 API 接入流程仍纳入回归。
- 应用菜单提供最小化到托盘，Windows 使用 Ctrl+Shift+M；启用托盘关闭偏好后，标题栏最小化也可后台驻留。保留恢复、明确退出和托盘不可用时的任务栏回退，不自动改写关闭偏好。
- Windows 应用内升级沿用当前安装目录，手动安装识别已有卸载注册项与两种注册表视图，保留数据备份与事务回滚，不扫描或删除其他盘的旧目录。

### 验证

当前为正式发布候选，三端验证与安装验收结果以本次工作流为准。5.0.1-beta.1 的本地解包校验、逐段输出、侧栏布局、暗色拓展坞和后台驻留专项检查已通过，但旧的完整回归存在失败，不作为 5.0.1 已通过的证据。发布前保留全部断言，复跑源码及打包回归，并在一次性 Windows Runner 上执行实际新装、历史版本覆盖、重装及数据保全检查。

### 下载与校验

正式 5.0.1 尚未发布；官网继续提供已验证的 5.0.0。三端同一候选提交通过统一门禁后，才创建正式标签并由完整流程发布安装包。正式包大小与 SHA-256 以实际资产及同 Release 的校验清单为准，不复用 5.0.0 或内测版哈希。所有包按未签名流程构建，macOS 未公证；macOS/Linux 的能力边界仍按各平台指南说明。

### 说明

本项目是社区维护的开源桌面端，并非 DeepSeek 官方客户端。覆盖升级前建议备份重要会话与配置。保留 bai 浏览器授权、deepseek-flash 实际目录优先及独立第三方 API，不自动充值、不重试付费推理。正式构建携带既有匿名活动与功能结果统计，不采集对话、代码、路径、截图、模型密钥或账号凭据；开发和测试构建不发送生产事件。机械硬盘启动耗时与交互流畅度分别记录，不承诺所有设备完全无卡顿。

## English

### Highlights

5.0.1 improves everyday usability on top of the complete 5.0.0 workbench, focusing on progressive output, crowded sidebars and readable dark Dock surfaces. The official NPM Runtime remains pinned to 0.2.0-rc.2. Official sources, existing plugins, model configurations, conversation history and settings entries remain intact. Windows x64, macOS arm64 and Linux x64 use one version and the unified native-runner release gates.

- New profiles start with the official appearance; existing skins, backgrounds and explicitly saved particle preferences survive upgrades. All fifteen bundled skins remain available.
- Streaming text and internal Markdown updates avoid repeated sidebar compatibility scans while preserving complete Chinese text, code, tool results and native turn navigation.
- Sidebar tools support collapse, expansion, keyboard access and restart persistence, reserving space for workspaces and conversations. The footer Dock and Today spending are the sole primary shortcuts, retaining older-shell fallbacks.
- Opaque Dock panels remove glass blur, decorative gradients and hover lift while preserving fifteen destinations, feature search and visible keyboard focus, with improved dark text contrast.
- Context tooltips avoid repeated movement through frosted containers. A-to-B-to-A conversation recovery, complete history and existing third-party API access remain in regression coverage.
- The App menu offers Minimize to tray with Ctrl+Shift+M on Windows or Cmd+Shift+M on macOS. The saved tray close preference also covers titlebar minimization, retaining restoration, explicit quit and taskbar fallback without rewriting preferences.
- Windows in-app upgrades carry the current installation directory. Manual installation recognizes existing uninstall entries and both registry views, retaining backups and transactional rollback without scanning or deleting old directories on other drives.

### Verification

This is a formal release candidate; this workflow's native-platform and installer results define its acceptance. The earlier local beta passed extracted-payload integrity, progressive output, sidebar layout, dark Dock and background-residency checks, but earlier complete regressions had failures and do not establish a passed 5.0.1 release. Existing assertions remain intact. Source and packaged regression must pass, and a disposable Windows Runner exercises real fresh installation, historical-version overlay, reinstall and data preservation.

### Download and verification

Formal 5.0.1 is not published yet; the website continues to offer verified 5.0.0. The formal tag is created only after all three platforms pass the unified candidate gates at the same commit, followed by complete release validation. Actual asset sizes and SHA-256 receipts must come from that Release, never reused stable or beta hashes. Builds are unsigned and macOS is unnotarized; platform guides retain the macOS/Linux capability boundaries.

### Notice

This is a community-maintained open-source Desktop application, not an official DeepSeek client. Back up important conversations and configuration before overlay upgrades. Existing bai browser authorization, preference for deepseek-flash actually present in the model directory, and independent third-party APIs remain available, without automatic top-ups or paid inference retries. Official builds retain anonymous activity and fixed feature-outcome metrics, never conversations, code, paths, screenshots, model keys or account credentials. Development and tests do not send production events. Mechanical-disk startup and interactive performance are measured separately, without promising stall-free behavior on every device.
