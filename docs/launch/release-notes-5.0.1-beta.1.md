# DeepSeek Harness Desktop 5.0.1-beta.1

## 中文

### 本次亮点

- 官方原生皮肤作为新用户默认外观；保留已有皮肤、背景和明确保存的粒子主题选择，十五款皮肤及主题设置入口保持可用。
- 流式文本和 Markdown 内部变化不再重复触发侧栏布局兼容扫描；长会话只在消息行发生变化时重新计算渲染资格，保留完整文本、代码、工具结果和原生轮次导航。
- 左侧工具区域提供折叠与展开，工作区、会话列表、新建会话和底部设置保持独立可用；折叠状态支持保存，展开后继续使用原有工具入口。
- 扩展坞保留侧栏底部入口，移除重复的上方入口；旧外壳缺少底部入口时仍提供兼容入口。
- 侧栏用量统一保留“今日消费”，保留统计页面导航与卡片折叠；缺少该卡片时保留兼容余额入口，避免重复占用会话列表空间。
- 拓展坞侧栏和管理面板采用纯色，去除玻璃模糊、装饰渐变和悬停上浮；用细分隔线、清晰选中态与可见键盘焦点提高可读性，保留十五个导航入口及功能搜索。
- 拓展坞暗色模式校正皮肤背景与文字的对比度，独立设置页面跟随主题；上下文提示保留原生交互，不因皮肤磨砂容器反复跳动。
- 应用菜单新增“最小化到托盘”，可用 Ctrl+Shift+M 一键后台驻留；启用原有托盘选项后，标题栏最小化也会驻留。托盘点击恢复、明确退出，托盘不可用时保留任务栏恢复方式，不改写已有关闭偏好。
- Windows 应用内更新明确传递当前安装目录，手动安装补充卸载注册项及 32 位注册表视图识别，保留事务回滚；不扫描或删除其他盘的旧目录和用户数据。

### 验证

内测验收覆盖新用户默认外观、升级时已有选择保全、真实本地模拟供应商的逐段输出、完整中文及代码内容、侧栏折叠后的会话切换、键盘操作和重启恢复。具体执行结果以仓库内验收记录为准；本地 Windows 检查不代表 macOS、Linux 或真实用户机器已经通过。

### 下载与校验

这是基于正式 5.0.0 的内测版，已生成本地未签名 Windows x64 测试安装包，尚未公开发布。实际大小、SHA-256、解包启动及专项检查见[验收记录](../archive/desktop-5.0.1-beta.1-usability.md#local-windows-test-package)，不复用正式版哈希。官网继续提供正式 5.0.0；完整回归门禁尚未通过，正式新装、覆盖升级和回滚验收仍需隔离 Windows 安装环境。

### 说明

官方 Runtime 保持 0.2.0-rc.2。改动限定在 Desktop 适配层和自有兼容插件，不修改官方源码、不删除已有插件、不绕过失败测试。机械硬盘启动耗时与运行时流畅度分别记录，不把启动等待误报成消息丢失。

## English

### Highlights

- New users start with the official appearance. Existing skin selections, backgrounds and explicitly saved particle preferences are preserved. All fifteen bundled skins and their configuration entries remain available.
- Streaming text and internal Markdown changes no longer repeatedly trigger the sidebar compatibility sweep. Long conversations recount their rendering eligibility only when message rows change, retaining complete text, code, tool results and native turn navigation.
- The left tool area offers collapse and expand controls with saved state. Workspaces, conversations, new-session controls and footer settings remain independently usable, and expanded tools retain their original actions.
- The Dock retains its footer shortcut without the duplicate upper entry. Older shells without a footer shortcut retain the compatibility entry.
- Today spending is the sidebar's single usage entry, preserving statistics navigation and card collapse. A compatible balance entry remains available without that card, avoiding duplicate rows crowding the conversation list.
- The Dock sidebar and management panels use opaque surfaces without glass blur, decorative gradients or hover lift. Thin separators, clear selection and visible keyboard focus improve readability while retaining all fifteen destinations and feature search.
- Dark Dock surfaces correct skin background/text contrast, and dedicated settings documents follow the same theme. Native context tooltips retain their interaction without jumping through frosted accessory containers.
- The App menu adds one-time Minimize to tray with Ctrl+Shift+M (Cmd+Shift+M on macOS). The existing tray opt-in also applies to titlebar minimization. Tray clicks restore the window, explicit quit remains available, and tray failures retain taskbar access without rewriting existing close preferences.
- Windows in-app updates explicitly carry the running installation directory. Manual Setup also recognizes uninstall locations and the 32-bit registry view while retaining transactional rollback; it does not scan or delete old directories or user data on other drives.

### Verification

Candidate acceptance covers fresh appearance defaults, preserved upgrade choices, progressive output from a real local mock provider, complete Chinese text and code, conversation navigation while tools are collapsed, keyboard operation and restart restoration. The repository acceptance record identifies the actual executed checks. Local Windows results do not establish macOS, Linux or real-user-machine acceptance.

### Download and verification

This prerelease is based on stable 5.0.0 and has a local unsigned Windows x64 test installer, not a public release. Its actual size, SHA-256 and extracted-payload startup and targeted checks are in the [acceptance record](../archive/desktop-5.0.1-beta.1-usability.md#local-windows-test-package); stable hashes are not reused. The public website continues to serve stable 5.0.0. The complete regression gate is not passed, and formal fresh-install, overlay and rollback acceptance still needs an isolated Windows installation environment.

### Notice

The official Runtime remains pinned to 0.2.0-rc.2. Changes are confined to Desktop adapters and the owned compatibility plugin. Official sources, existing plugins and strict regression assertions remain intact. Mechanical-disk startup delays and interactive streaming performance are recorded separately rather than treating slow startup as lost content.
