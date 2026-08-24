# DeepSeek Harness Desktop 3.0.4

## 中文

### 本次亮点

- 启动流程改为直接读取当前 `DSH_HOME`、原有 Profile、对话、Session、设置、任务、皮肤和全部已安装插件。新用户直接进入内置插件环境；老用户不再看到迁移、隔离恢复、安全模式或插件来源选择页面。
- 完整 Profile 启动失败时先原样自动重试一次。确认属于插件或配置问题后，才会调用用户已经配置好的模型，在私有事务工作区内生成候选修复；候选必须通过注册检查，才能原子应用并再次启动完整 Profile。
- 自动修复有严格次数、时间和文件范围限制。模型不会收到 API Key、Cookie、凭据、完整对话、完整 Session、Tool Result 或无关项目内容；失败候选不会污染真实 Profile，修复后仍失败会自动回滚。
- 没有可用模型、候选验证失败或修复后仍无法启动时，Desktop 会在同一个 Home 中自动使用内置插件启动。用户的聊天记录和设置不会被搬到临时目录，也不需要再点恢复按钮。
- 用户主动从 Web Profile 导入插件的功能继续保留；它仍是扩展坞里的显式事务操作，与应用启动无关。插件市场继续为新用户提供正常的发现和安装入口。

### 验证

- CI 和发布工作流使用真实历史 Home 夹具验证 Desktop 2.3–2.7、3.0.1 与干净安装，并覆盖用户插件、配置、Session 保留、语法错误、启动抛错、无效补丁、原生 ABI 错误、模型修复和同 Home 内置回退。
- 发布前先生成未签名的 unpacked 应用并运行完整 direct-start matrix，全部通过后才允许生成所选频道的安装器。Runtime 完整性、更新关停、诊断脱敏、包校验、Smoke、签名和 release manifest 仍是独立门禁。

### 下载与校验

从同一 GitHub Release 下载 `DeepSeek-Harness-Desktop-Setup-3.0.4-x64.exe`、`SHA256SUMS.txt` 和 `release-manifest.json`。先比对 SHA-256，再查看 manifest 中的大小、频道、Runtime、Schema 与实际签名状态。未配置证书的社区 Release 可能是未签名版本，Windows 因此可能显示未知发布者提示。

### 说明

Desktop 默认不配置遥测上传端点，也不会自动上传诊断。自动修复只使用用户已经配置的模型；没有模型时直接进入同 Home 内置插件回退。3.0.4 不删除独立备份，也不承诺恢复 Desktop 之外的项目编辑或磁盘损坏。

## English

### Highlights

- Startup now reads the current `DSH_HOME`, persistent profile, conversations, sessions, settings, tasks, skins, and all installed plugins directly. Fresh users enter the built-in environment immediately, while existing users no longer receive migration, isolated recovery, safe-mode, or plugin-source choice screens.
- A failed full-profile start is retried once without rewriting state. Only an attributable plugin or configuration failure can invoke a model the user has already configured. The model works in a private transaction workspace, and its candidate must pass registered checks before atomic application and another complete-profile start.
- Automatic repair has strict attempt, time, and file-scope limits. It excludes API keys, cookies, credentials, full conversations, full sessions, tool results, and unrelated project content. Rejected candidates never touch the real profile, and an applied candidate is rolled back if the repaired full start still fails.
- If no model is configured, verification fails, or the repaired profile still cannot start, Desktop automatically starts the built-in plugins from the same Home. Conversation and settings data are not moved into a temporary profile, and users do not need to choose a recovery button.
- The explicit Web Profile import remains available in Extension Dock as a user-initiated transaction. It is separate from application startup. The built-in plugin market remains the discovery and installation path for fresh users.

### Verification

- CI and release verification use preserved historical Home fixtures from Desktop 2.3 through 2.7 and 3.0.1 plus clean-install coverage. The matrix checks user plugins, configuration, session preservation, syntax errors, startup throws, invalid patches, native ABI failures, model repair, and same-Home built-ins fallback.
- The release workflow packages an unsigned unpacked application and runs the complete direct-start matrix against that exact executable before producing the selected-channel installer. Runtime integrity, update shutdown, diagnostic redaction, package checks, smoke tests, signatures, checksums, and the release manifest remain independent gates.

### Download and verification

Download `DeepSeek-Harness-Desktop-Setup-3.0.4-x64.exe`, `SHA256SUMS.txt`, and `release-manifest.json` from the same GitHub Release. Verify the SHA-256 first, then inspect the manifest for size, channel, Runtime, Schema, and actual signature state. A community Release may be unsigned when no certificate is configured, so Windows can show an unknown-publisher warning.

### Notice

The committed source configuration has no telemetry endpoint, while official Desktop packages enable first-party product analysis with rotating daily and monthly anonymous actors. Diagnostics are never uploaded automatically. Automatic repair uses only a model already configured by the user; when none is available, it proceeds to the same-Home built-ins fallback. Version 3.0.4 does not remove independent backups and cannot restore project edits or disk damage outside Desktop-owned transactions.
