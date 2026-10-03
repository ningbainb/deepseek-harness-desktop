# DeepSeek Harness Desktop 5.0.0

## 中文

### 本次亮点

此版本将官方 NPM Runtime 更新到 0.2.0-rc.2，并按新版接口承接桌面现有功能；旧接口不保证兼容，历史会话、模型配置和用户插件数据仍按迁移与回滚流程保全。更新了会话恢复、社区插件、插件管理、宠物、皮肤中心等内置插件的适配。皮肤中心使用新版状态接口，保留 15 款离线皮肤并迁移可用的旧皮肤选择。桌面启动器补齐新版设置服务依赖，避免浏览器插件加载失败。安装事务先备份并清理 Windows 64 位和 32 位卸载注册表视图，再移动旧安装目录；失败时根据事务记录恢复旧文件与注册表。启动时只将指向已不存在旧安装包的插件链接退出活动 Profile，并保存原始清单备份。Windows 首次启动宽限延长至 180 秒。

### 历史与配置保全修复

修复大会话重新打开、A→B→A 切换或重启时，历史首帧超过桌面私有管道物理帧上限导致的加载失败。采用经过身份握手的分片与完整重组，保留 512 KiB 物理帧限制，单逻辑消息预算为 32 MiB；不会为了显示历史而截断消息或工具结果。超出预算仍明确失败，不伪装为成功。修复日志只记录安全错误码和数字，不写入会话内容或密钥。

启动重建托管 Patch 时保留官方 SDK 原地保存的模型、个人偏好及用户插入项，不再按注释边界整块删除用户配置。歧义或损坏的 Patch 拒绝自动重建，原数据交由现有备份与修复流程保全。恢复 4.4.0 品牌图标，并恢复新版官方模型页中的 bai 优先排序，保留原供应商能力扩展。

旧会话可选手动转为上下文摘要；这是备用续聊方式，不是无损历史恢复的前提。操作前保留原文件、检查敏感内容，由用户决定是否发送给模型；应用不自动上传历史或调用收费模型。

皮肤中心按每次激活实际创建的样式节点管理释放，避免反复试穿、退出试穿或恢复默认后残留旧皮肤样式；加载失败与超时的未提交样式也会清理，保留原有跨窗口同步、用户选择持久化及关闭后的写入保护。

### 验证

退出时先等待插件事务并安全停止 Runtime，再销毁窗口；停止失败时保留窗口与传输入口，不让仍在恢复的应用变成无界面的后台进程。

余额与配额查询通过桌面 Host 侧兼容配置读取，使用当前 Profile 的实时设置并保留原有凭据引用；服务商密钥不发送给界面，也不扫描其他用户数据目录。

发布前校验功能基线、插件适配、安装器生命周期、Profile 保全、桌面回归、打包完整性及独立启动。上述检查的实际结果以本次构建的验证记录为准；隔离测试不等同于所有用户机器上的覆盖安装验收。

### 下载与校验

Windows x64 安装包名为 DeepSeek-Harness-Desktop-Setup-5.0.0-x64.exe。下载后请按同一发布目录内的 SHA256SUMS.txt 核对 SHA-256；文件大小与哈希以最终构建产物为准。

### 说明

本项目是社区开源桌面端，并非 DeepSeek 官方客户端。直接运行安装包即可覆盖升级；建议保留重要会话与配置备份。Windows 未签名安装包可能触发 SmartScreen 未知发布者提示。

## English

### Highlights

This release updates the official NPM Runtime to 0.2.0-rc.2 and carries Desktop features onto its new APIs. Old API compatibility is not guaranteed; conversations, model configuration, and user plugin data remain covered by migration and rollback. Builtin adaptations include session recovery, community plugins, plugin management, pets, and Skin Center. Skin Center uses the new state API, keeps 15 offline skins, and migrates supported legacy selections. The Desktop launcher now injects the new settings service so browser plugins can boot. The upgrade transaction backs up and clears both Windows uninstall registry views before moving the old installation, then restores files and registry entries on failure. Startup retires only plugin links whose old packaged targets no longer exist and saves the prior manifest. The Windows first-launch grace period is now 180 seconds.

### History and configuration preservation

Large conversations can reopen after switching A to B to A or restarting without truncating messages or tool results. Authenticated fragmentation preserves the 512 KiB physical frame limit and uses a 32 MiB logical message budget. Oversized messages fail explicitly. Diagnostic logs contain safe error codes and numbers, not conversation content or secrets.

Startup now preserves SDK-saved model and personal-preference settings inside managed Patch comment boundaries, along with user insertions. Ambiguous or malformed Patch content is not silently rebuilt. The 4.4.0 branding icons and bai-first ordering in the official Models page are restored without taking over provider capability slots.

Optional manual context summaries remain a fallback, not a prerequisite for lossless history recovery. Keep original files, review sensitive content, and choose whether to send it to a model; the application does not automatically upload history or request paid inference.

Skin Center now owns and releases the exact stylesheet nodes created by each activation, preventing stale styles after repeated previews, preview exit or stock restoration. Failed and timed-out loads release uncommitted nodes while retaining cross-window synchronization, persisted user selection and shutdown write protection.

### Verification

Quit drains plugin transactions and safely stops the Runtime before destroying windows. A failed stop retains windows and transport access instead of leaving a recovering application headless.

Balance and quota queries use Desktop's Host-only compatibility reads over the current Profile's live settings, preserving existing credential references. Provider keys stay off the UI, and queries do not scan other user data directories.

Release validation covers the machine readable feature baseline, builtin plugin adaptation, compiled installer lifecycle, Profile preservation, Desktop regression, package integrity, and an isolated startup check. The results recorded for this build define the verified scope. Isolated tests alone do not establish successful overlay installation on every user machine.

### Download and verification

The Windows x64 installer is named DeepSeek-Harness-Desktop-Setup-5.0.0-x64.exe. Compare its SHA-256 value with SHA256SUMS.txt from the same release directory. The final build artifact determines the exact size and checksum.

### Notice

This is a community maintained open source Desktop application and is not an official DeepSeek client. The installer supports direct overlay upgrades. Keep a backup of important conversations and settings. Because the installer is unsigned, Windows SmartScreen may show an unknown publisher warning.
