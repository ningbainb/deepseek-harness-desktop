# DeepSeek Harness Desktop 3.0.1

## 中文

### 本次亮点

- 3.0.1 是平台稳定版。Desktop Client SDK、Desktop Contract 和 Runtime Provider 继续维持 1.x；Preset、Project/Task/Run/Evidence、Deep Link、插件兼容元数据、supported-runtime matrix 与 compat patch registry 都有可机器校验的定义、兼容夹具和同 major 的增量演进规则。
- Stable Runtime 不跟随 `latest`。只有状态为 `known-good` 或 `supported`，并且 provider、Desktop 范围、完整性、lockfile 与 patch 证据都匹配的矩阵项可以进入 Stable；`candidate` 只生成证据，`blocked` 不会被当成回退路径。
- Migration Assistant 覆盖 2.3.0–2.7.0 升级矩阵并生成 `safe`、`needs-confirmation` 或 `blocked` 计划。识别出的 Task Store v2/v3 状态会被检测、校验并纳入白名单 snapshot/journal 边界；2.3 legacy browser-localStorage task state 必须先确认，扫描不会暴露其内容或 task/run 计数。确认后，受支持的保留同源 v1 数据只会通过 CSP、无调度、无权限的隐藏 probe 读取其键，且只会复制到空的 v3 Host ledger，再以 task count/fingerprint 验证，原浏览器值会保留。未知、缺失或已变化的 origin 会阻断复制并保留恢复/回滚指引。原子 journal 和有限期全局状态 snapshot 支持继续和回滚，且不复制项目文件或用户内容。
- Desktop 默认不配置遥测端点，也不会自动上传诊断。用户确认后才会在自选位置导出经集中脱敏的 JSON/ZIP 诊断包，包内带清单和哈希；密钥、Token、Cookie、路径、完整 Prompt、完整 Session、Tool Result、项目内容和 SSH 私钥被排除。
- 扩展坞新增原生社区插件市场，直接使用 `awesome-dsh-plugin.com/plugins.json` 作为索引并在本地完成搜索、分类、排序与分页，不嵌入第三方市场页面，也不再显示其沙箱边界栏。安装时 Renderer 只提交不透明目录 ID，主进程重新解析安装源，经一次原生确认后复用完整权限的事务安装、Runtime 重启与失败回滚；旧 `dshmarket` 运行时依赖已退役。
- 新增独立嵌入式终端、受校验的 Managed Git 修复路径，以及不依赖主 Runtime 的恢复界面和隔离恢复会话。迁移完成标记缺失时可从已提交 journal 自愈，存在中断 journal 时仍保留严格的恢复流程。
- Windows 发布门禁会让 PowerShell 在 Shell 内部比较完整规范化的 Desktop Profile 工作目录，并只向 xterm 输出有界结果标记；这避免 Runner 长路径换行或滚动造成误超时，同时保留对真实终端 cwd 的严格验证和 mismatch 诊断。
- 修复 Task Ledger v3 写入被过长错误文本永久阻断、损坏 v3 被过期 v2 覆盖、SSH 断线重试失效、连接替换泄漏并拆错隧道、取消请求误报成功和分块上传绕过大小限制等问题，并加入对应回归测试。
- 既有 Task Board、Scheduler、Worktree、Evidence、Preset、插件和完整 Harness Web Surface 继续工作；第三方应通过 capability detection 和公开 Schema 集成，而不是依赖私有实现细节。

### 频道、升级与回滚

- 更新频道为 `stable` 与 `beta`。现有用户与新安装默认使用 Stable；Stable 只接收正式版本，Beta 只有在明确选择后才接收 prerelease。任何频道切换都不会自动降级。
- 升级矩阵覆盖 Desktop 2.3.0–2.7.0。迁移前应阅读计划与兼容性结果：识别出的 v2/v3 状态会被检测、校验和快照；legacy browser-localStorage state 需要确认且扫描不展示内容或 task/run 计数。确认后，受支持的保留同源 v1 数据可复制到空 v3 Host ledger 并以 task count/fingerprint 验证，原浏览器值保持不变；未知、缺失或已变化的 origin 会阻断复制并进入恢复/回滚指引。升级或 Runtime 变更出现问题时，使用 Migration Assistant 的 journal/snapshot 恢复流程，并参考 [升级与回滚](../upgrade-and-rollback.md) 与 [运行时支持政策](../runtime-support-policy.md)。

### 验证

- 发布门禁覆盖公共 Schema、SDK/Contract/Provider 兼容性、Preset 恶意输入、Deep Link、Scheduler fake clock、Worktree 生命周期、Evidence、迁移矩阵、Runtime matrix 和 Candidate guard。
- 打包与发布验证覆盖 Stable/Beta 频道隔离、安装器哈希与 `release-manifest.json`。未配置证书时正式社区 Release 可保持未签名；配置 `CSC_LINK`、`WIN_CSC_LINK` 或 `CSC_NAME` 后会自动强制 Authenticode 签名和有效时间戳，配置不完整或验证失败时发布必须失败。
- 发布前还会运行文档、发布说明和网站一致性检查；诊断导出测试验证脱敏、清单、哈希和用户确认边界。

### 下载与校验

从同一 GitHub Release 下载 `DeepSeek-Harness-Desktop-Setup-3.0.1-x64.exe`、`SHA256SUMS.txt` 与 `release-manifest.json`。先用 `SHA256SUMS.txt` 比对安装包 SHA-256，再查看 manifest 中该资产的大小、哈希、频道、Runtime/Schema 信息和实际签名状态。安装器的 updater 哈希仍是基础完整性校验，签名是额外信任层；工作流会在正式 GitHub Release 正文末尾追加从已验证 manifest 得出的实际签名状态。

### 说明

本项目是社区维护的发行版，并非 DeepSeek、OpenAI 或腾讯官方产品。未配置证书的正式 Release 可以未签名，此时 Windows 可能显示未知发布者或 SmartScreen 提示；请只从本项目 GitHub Release 下载并核对同一 Release 的 SHA-256。配置证书后发布门禁会自动强制验证签名和有效时间戳。最终状态以 `release-manifest.json` 的资产记录和正式 Release 正文末尾的已验证签名状态为准。Desktop 3.0 不默认收集或上传遥测，官网也不自动上报安装包点击。更多公开承诺见 [兼容性政策](../compatibility-policy.md)、[Schema 版本政策](../schema-versioning.md) 和 [安全边界](../security-boundaries.md)。

## English

### Highlights

- 3.0.1 is the platform-stability release. The Desktop Client SDK, Desktop Contract, and Runtime Provider stay on 1.x. Preset, Project/Task/Run/Evidence, Deep Link, plugin compatibility metadata, the supported-runtime matrix, and the compat-patch registry have machine-verifiable definitions, compatibility fixtures, and additive same-major evolution rules.
- Stable Runtime does not follow `latest`. Only a `known-good` or `supported` matrix entry whose provider, Desktop range, integrity, lockfile, and patch evidence agree can enter Stable. A `candidate` produces evidence only, and a `blocked` entry is never a fallback.
- Migration Assistant covers the 2.3.0 through 2.7.0 upgrade matrix and produces a `safe`, `needs-confirmation`, or `blocked` plan. Recognized Task Store v2/v3 state is detected, validated, and included in the allowlisted snapshot/journal boundary. The 2.3 legacy browser-localStorage task path deliberately requires confirmation, and the scan does not expose its contents or task/run counts. After confirmation, supported preserved-origin v1 data is read only through a hidden CSP/no-scheduler/no-permission probe, copied only into an empty v3 Host ledger, and verified by task count/fingerprint while preserving the original browser value. An unknown, missing, or changed origin blocks the copy and retains recovery/rollback guidance. Its atomic journal and bounded global-state snapshot support resume and rollback without copying project files or user content.
- Desktop configures no telemetry endpoint by default and never uploads diagnostics automatically. After user confirmation, a centralized-redaction JSON/ZIP diagnostic bundle can be written to a chosen location with a manifest and hashes. Keys, tokens, cookies, paths, complete prompts, complete sessions, tool results, project content, and SSH private keys are excluded.
- Extension Dock now includes a native community plugin market backed directly by the `awesome-dsh-plugin.com/plugins.json` index, with local search, category filtering, sorting, and pagination. It does not embed the third-party market page or show its sandbox boundary banner. The renderer submits only an opaque catalog ID; the main process resolves the install source again and reuses the full-permission transactional installer, Runtime restart, and rollback after one native confirmation. The old `dshmarket` runtime dependency is retired.
- Added a standalone embedded terminal, a validated Managed Git repair path, and recovery surfaces and isolated recovery sessions that do not depend on the primary Runtime. A missing migration completion marker can self-heal from a committed journal, while an interrupted journal keeps the strict recovery path.
- The Windows release gate now compares the full normalized Desktop Profile working directory inside PowerShell and emits only a bounded result marker to xterm. This avoids false Runner timeouts from long-path wrapping or scrolling while retaining strict validation of the real terminal cwd and explicit mismatch diagnostics.
- Fixed Task Ledger v3 writes being permanently poisoned by oversized error text, stale v2 data replacing a damaged v3 ledger, ineffective SSH disconnect retries, connection replacement leaks and wrong-tunnel teardown, cancellation falsely reporting success, and chunked uploads bypassing the size limit, with regression coverage for each class.
- Existing Task Board, Scheduler, Worktree, Evidence, Preset, plugin, and complete Harness Web Surface behavior remains available. Third parties should integrate through capability detection and public schemas instead of private implementation details.

### Channels, upgrade, and rollback

- The update channels are `stable` and `beta`. Existing users and new installations default to Stable. Stable accepts final releases only, while Beta accepts prereleases only after explicit selection. A channel change never authorizes an automatic downgrade.
- The upgrade matrix covers Desktop 2.3.0 through 2.7.0. Review the migration plan and compatibility result first: recognized v2/v3 state is detected, validated, and snapshotted; legacy browser-localStorage state requires confirmation, but the scan does not expose content or task/run counts. After confirmation, supported preserved-origin v1 data can be copied into an empty v3 Host ledger and verified by task count/fingerprint without removing the original browser value; an unknown, missing, or changed origin blocks the copy and retains recovery/rollback guidance. For an upgrade or Runtime issue, use the Migration Assistant journal/snapshot recovery flow and the [upgrade and rollback guide](../upgrade-and-rollback.md) together with the [Runtime support policy](../runtime-support-policy.md).

### Verification

- Release gates cover public schemas, SDK/Contract/Provider compatibility, malicious Preset input, Deep Link routing, Scheduler fake-clock behavior, Worktree lifecycle, Evidence, the migration matrix, the Runtime matrix, and the Candidate guard.
- Packaging and release verification cover Stable/Beta separation, installer hashes, and `release-manifest.json`. An official community Release may remain unsigned when no certificate is configured. Configuring `CSC_LINK`, `WIN_CSC_LINK`, or `CSC_NAME` automatically requires an Authenticode signature and valid timestamp; incomplete configuration or failed verification must stop publication.
- Documentation, release-note, and website consistency checks run before release. Diagnostic-export tests cover redaction, manifest, hashes, and the user-confirmation boundary.

### Download and verification

Download `DeepSeek-Harness-Desktop-Setup-3.0.1-x64.exe`, `SHA256SUMS.txt`, and `release-manifest.json` from the same GitHub Release. Compare the installer SHA-256 with `SHA256SUMS.txt`, then inspect the manifest record for its size, hash, channel, Runtime/Schema information, and actual signature state. The updater hash remains the baseline integrity check; signing is an additional trust layer. The workflow appends the actual signing state derived from the verified manifest to the published GitHub Release body.

### Notice

This is a community-maintained distribution, not an official DeepSeek, OpenAI, or Tencent product. An official Release may be unsigned when no certificate is configured; Windows may then show an unknown-publisher or SmartScreen prompt, so download only from this project's GitHub Release and verify the same-Release SHA-256. Configuring certificate material automatically makes signing and a valid timestamp mandatory. The asset record in `release-manifest.json` and the verified signing-status section appended to the published Release body are authoritative. Desktop 3.0 does not collect or upload telemetry by default, and the website does not automatically report installer clicks. See the [compatibility policy](../compatibility-policy.md), [schema versioning guide](../schema-versioning.md), and [security boundaries](../security-boundaries.md) for the public commitments.
