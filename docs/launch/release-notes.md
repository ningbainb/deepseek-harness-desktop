# DeepSeek Harness Desktop 5.2.0

## 中文

5.2.0 正在完成发版前测试，尚未发布。公共官网与正式下载继续指向已发布的 5.1.0；各候选包的证据分别记录，不混用验收结果。

### 本次亮点

- 官方 NPM Runtime/SDK 使用 `0.2.1-rc.4`；本次适配观察时它是 `next` 候选，`latest` 为 `0.2.1-rc.2`，不称为官方稳定版。保留官方皮肤默认值、用户已保存的皮肤、会话、模型提供方和扩展配置。
- 集中修复桌面共用侧栏布局，针对所有皮肤出现的左下角空栏，保留底部功能入口与侧栏展开、折叠能力。
- 接入 GitHub 插件合集中的预测下一句、鲸鱼娘全身桌宠与操控浏览器。三个原始 tgz 的大小与 SHA-256 均匹配公开资产；适配代码独立放在自有插件和桌面宿主中，不修改官方源码或原始插件压缩包。
- 既有桌宠、AionUI、官方浏览器提供方、技能入口、第三方 API 和托盘驻留继续保留。浏览器增加受校验的专用子进程入口，避免打包后重复启动主工作台。
- 桌宠自动避让输入区，保留用户原始位置，修复位置镜像异步乱序；修复 profile 合并时配对服务挂载和中断迁移恢复晚于配置读取的问题。机械盘冷启使用有界等待，避免过早重试。
- 自定义供应商先确认首次 Key 保存再提交配置；写入失败时保留草稿并明确提示，避免留下没有 Key 的供应商。已经丢失且没有备份的 Key 仍需重新填写。

### 验证

Key 修复候选完成设置测试 354 项、源码核心回归 32 套和实际新包隔离验收 9 项，包括真实凭据写入拒绝、重启后模拟模型鉴权及 5.1.0 数据保全，见 [Key 修复验收记录](../archive/2026-10-29-custom-provider-credential-save-validation.md)。更早的皮肤、新插件及候选回归归 [初版适配记录](../archive/2026-10-26-desktop-5.2.0-local-validation.md)，不替代本轮发版前加固后的完整门禁。正式 Setup、macOS 和 Linux 原生预检尚须以同一冻结提交的运行记录为准；历史正式证据归 [5.1.0 发布档案](../archive/desktop-5.1.0-formal-release.md)。

### 下载与校验

各本地候选的实际安装包大小、SHA-256 和签名状态保存在对应验收记录中；最终下载应核对同一构建产物的 `SHA256SUMS.txt` 与 `release-manifest.json`，不沿用较早候选或中间归档的哈希。5.2.0 尚未上传或正式发布；正式下载仍使用 [5.1.0 Release](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0)。

### 说明

这是社区维护的开源桌面宿主。所有适配只使用官方公开 NPM SDK 与 profile/Cordis patch 机制。Windows 本地结果仅代表本地 Windows；macOS 与 Linux 需要各自原生 GitHub Actions 验证。构建和测试使用隔离数据，保留匿名统计与退出选项，不向生产端点提交合成测试事件；本次适配不包含 NPM 发布、签名或自动正式发布。

## English

5.2.0 is undergoing pre-release testing and is not published. The public website and stable downloads continue to identify 5.1.0; each candidate keeps its own acceptance evidence.

### Highlights

- Use public official NPM Runtime/SDK `0.2.1-rc.4`. At the adaptation observation it was the `next` candidate while `latest` was `0.2.1-rc.2`; this is not an official stable-runtime claim. Keep the official default skin and saved skin choices, conversations, providers and plugin preferences.
- Address the shared Desktop sidebar layout behind the reported lower-left empty strip across skins while preserving footer actions and expanded or collapsed navigation.
- Integrate Prompt Pilot, the full-body companion and the visible browser from the public GitHub plugin bundle. Original tarball sizes and SHA-256 digests match the release assets. Compatibility code remains separate from the immutable archives and official source.
- Retain the existing companion, AionUI, official browser providers, skill controls, third-party API configuration and background residency. A validated browser subprocess entry prevents a packaged executable from launching another main workbench.
- Keep companions clear of the composer without overwriting intended positions, and serialize asynchronous position mirrors. Restore pairing-service composition and recover interrupted migration before reading configuration. A bounded disk-startup budget avoids premature retries.
- Confirm a new custom provider's first Key save before committing its configuration. A refused write retains the draft and shows a clear error rather than leaving a provider without its Key. An already lost Key with no backup still needs to be entered again.

### Verification

The Key-fix candidate passed 354 settings tests, 32 source-core suites and nine acceptance steps against the actual new package, including genuine credential-write refusal, authenticated simulated chat after restart and 5.1.0 data preservation. See the [Key-fix acceptance](../archive/2026-10-29-custom-provider-credential-save-validation.md). Earlier skin, plugin and candidate rounds remain in the [initial adaptation record](../archive/2026-10-26-desktop-5.2.0-local-validation.md) and do not certify the current release hardening. Production Setup, macOS and Linux native preflight still require one frozen commit's run evidence. Historical formal evidence remains in the [5.1.0 release archive](../archive/desktop-5.1.0-formal-release.md).

### Download and verification

Each local candidate's acceptance record holds its actual installer size, SHA-256 and signature state. Verify final downloads against `SHA256SUMS.txt` and `release-manifest.json` from the same build; do not reuse an earlier candidate or intermediate archive's digest. 5.2.0 has not been uploaded or formally published. Stable downloads remain on the [5.1.0 Release](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0).

### Notice

This is a community-maintained open-source Desktop host. Adaptation uses the official public NPM SDK and profile/Cordis patches only. Local Windows results establish Windows behavior only; macOS and Linux require native GitHub Actions evidence. Isolated tests retain anonymous metrics and opt-out behavior without submitting synthetic production events. NPM publication, signing and automatic formal publication are outside this adaptation run.
