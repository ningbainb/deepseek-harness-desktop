# Desktop 5.1.0 正式发布归档

本文件是发布时的历史快照；结构化证据见[正式 receipt](desktop-5.1.0-formal-release.json)，安装资产名称、大小及实际公开字节 SHA-256 统一见[三端 manifest](../launch/release-manifest-all-platforms.json)。

## 发布身份与门禁

- 版本 `5.1.0`，标签 `desktop-v5.1.0`，源码 SHA `eb1223ddfee78eccadd76d8022501cd1806d9d3d`；[公开 Release](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0) 于 `2026-10-25T15:09:51Z` 发布，非 draft、非 prerelease。
- 同 SHA 的[预检 40193665045](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40193665045)与[正式标签运行 40199647851](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40199647851)均三端原生成功；预检 publish 按流程跳过，正式 publish 成功。
- 正式 Windows source core `28/28`、packaged full `44/44`，均零 accepted issues。Desktop 单测 Windows `1943/1943`；macOS/Linux 各 `1906 pass + 37 skip / 1943`，零失败；scripts 三端各 `213/213`，零失败、零跳过。数字来自正式 `formal-tag-complete.log`，不以本地 beta 代替云端验收。

## 实物与保全证据

证据根为 `E:\DeepSeekHarnessDesktop-Build\artifacts\desktop-5.1.0-release-20261025`；下列路径均相对此根。`public-release-api.json` 与 `public-release-verified.json` 记录五个公开安装文件实际下载字节、大小与 SHA-256 校验，以及 combined checksums、Windows updater SHA-512 和公开 Windows manifest 的独立核验。三端 manifest 与该 canonical receipt 一致，不沿用预检 hash。

`formal-tag-qa/source-core.json` 和 `formal-tag-qa/packaged-full.json` 保存完整回归 receipt。真实 Setup 的 `formal-tag-qa/setup-from-4.3.0.json`、`formal-tag-qa/setup-from-5.0.0.json`、`formal-tag-qa/setup-from-5.0.1.json` 均证明 fresh/upgrade profile 保全、安装阶段字节保全和新版启动后运行时数据保全。

对应 `formal-tag-qa/setup-from-{4.3.0,5.0.0,5.0.1}-old-home/` 保存旧版启动后的 `before-fixture/profiles/desktop/`，以及加入离线夹具后的 `profiles/desktop/` 和 `sessions/` 快照。receipt 保留逐文件 SHA-256、provider IDs `openai-codex` / `setup-upgrade-fixture`、会话 `setup-upgrade-preservation` 的一条消息与语义摘要；Setup 前后检查字节，新版首次及再次启动检查语义，允许合法迁移，不把离线夹具当真实付费服务验证。

`formal-telemetry-payload-verified.json` 逐项记录从实际公开 Windows Setup、macOS ZIP、Linux DEB 提取的 `telemetry-config.json`，核实 `officialBuild=true`，endpoint 为 `https://guanli.1521003.xyz/v1/events`。未提交生产事件，production ingestion 未实测。

## 保留的历史失败

- [40179041237](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40179041237)：旧 SHA `a3bb56148a44ef1bce3ae71059fc6820bbf8e86d`，Windows core `27/28`，Directory Picker & Workspace Import 失败，publish 跳过；保留 `preflight-failed-diagnostics/.tmp/release-qa/source-core.json`。
- [40181531589](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40181531589)：旧 SHA `57998820b1063c818e9fdd3a3daf2700319b8de4`，Windows packaged `41/44`，Model Preferences、Agent Tool Work、Skin Center 失败，publish 跳过；保留 `corrected-preflight-qa/packaged-full.json`。

以上失败属于历史候选，并非当前发布门禁；后续修复后重新执行同 SHA 三端预检及正式流程，未删除或接受失败来宣称通过。

## 能力边界

- Windows x64 为 unsigned Stable；macOS arm64 为 macOS 13+、unsigned/unnotarized Preview。
- Linux x64 为 Preview；仅有当前原生 Ubuntu 22.04 runner 证据，sandbox enforcement 为 partial，仅验证 deny-write 与 native packaged smoke，不代表完整沙箱或其他发行版验收。
- 实体机验收、断电恢复、真实付费授权/计费、生产埋点 ingestion 均未验证。Pages 无当前发布记录，归档为 pending，不预填部署成功。
- 使用官方公开 NPM SDK `0.2.1-rc.2` 与 Electron `44.0.0`，官方源码零改动；本次未发布 NPM、未签名、未覆盖标签。
