# CI 分层与三端发版测试流程

本仓库采用**静态 Fail-Fast 前置 + Build-Once 一次打包 + 4 分片并行 E2E** 的分层门禁体系，在不削减任何测试覆盖的前提下，将 PR 反馈与 Windows 发版流水线压缩至 20 分钟级。

## 三层 CI 拓扑

1. **PR 与 main 快速集成（`.github/workflows/desktop-ci.yml`）**
   - `verify`（约 3 分钟）：优先执行 `verify-desktop-version-floor.mjs`、`feature-baseline:check`、`typecheck`、`pnpm test`、`test:scripts`、`dsh-audit:check` 及各类文档/架构清单校验；任何静态、类型或契约错误立刻拦截。
   - `verify` 通过后并行触发：
     - `installer-lifecycle`：Windows NSIS 安装器生命周期回归。
     - `e2e`（`shard: [1, 2, 3, 4]`）：基于 `--shard=<index>/4 --retry-flaky=1` 并行执行核心桌面 E2E 套件，并复用 Playwright Chromium 缓存。

2. **Nightly 夜间全源码回归（`.github/workflows/desktop-nightly.yml`）**
   - 每日定时（UTC 20:00）及支持手动触发，先跑 `verify`，再以 `--source --shard=<index>/4 --retry-flaky=1` 扇出 4 台 Windows Runner 覆盖含源码态专属校验的完整回归，提前暴露上游依赖变更，并保留 QA 回执产物。

3. **三端正式发版（`.github/workflows/desktop-three-platform-release.yml`）**
   - `macos`（arm64）与 `linux`（x64）各在原生 Runner 上完成 `pnpm verify`、打包、产物/Runtime 校验、启动冒烟并缓存 Playwright 浏览器。
   - `windows-build` 只打包并校验一次产物（`pnpm verify` -> `pack:win` -> `pack:verify` -> `verify-office-runtime` -> `pack:smoke` -> 签名/清单校验），上传带有 Runtime 隐藏清单的完整候选包。
   - 并行扇出 5 台 Windows Runner：
     - `windows-setup-upgrade`：在一次性云端 Runner 下载上一稳定版（`5.3.5`）并完成全新安装、覆盖升级与卸载保留验收。
     - `windows-e2e`（`shard: [1, 2, 3, 4]`）：复用同一构建产物并行跑完全量 47 组打包版回归，每片保留独立 QA 与截图证据。
   - `windows` 汇总门禁全绿后接入 `verify-artifacts` 与 `publish` 创建 GitHub Release。
   - 稳定版发布后，按[镜像发布与交接清单](launch/desktop-release-workflow.md#stable-download-mirror)同步及验收官网下载和客户端更新线路。

## 本地定向验证

Windows 本地开发机仅需运行通用源码校验及与改动相关的定向测试，无需在提交前本地串行跑完 47 组弹窗 E2E：

- 快速全仓门禁：`pnpm verify`
- 定向单个 E2E 套件：`node apps/dsh-desktop/scripts/verify-<name>.mjs`
- 按与 CI 相同的加权分片执行：`pnpm desktop:regression:e2e --shard=1/4`
- 查看全部参数说明：`node apps/dsh-desktop/scripts/run-regression-e2e.mjs --help`

## 加权分片与 Flaky 重试策略

- **加权分片（`apps/dsh-desktop/scripts/regression-e2e-shards.mjs`）**：依据历史实测耗时采用 LPT（最长耗时优先）装箱算法将套件均分到 4 个分片，并保持各分片内部原有顺序稳定。
- **Flaky 重试边界**：仅在 CI 工作流显式传入 `--retry-flaky=1`，对偶发基础设施抖动允许单套件自动重试一次，并将重试后通过的用例记录在验收回执 JSON 的 `flakySuites` 字段中；**禁止在本地忽略失败或删改断言来掩盖必现回归**。

## 保护流水线结构的契约单测

以下测试在 `pnpm verify` / `pnpm desktop:test` 阶段锁定工作流约束，修改工作流或分片逻辑时必须同步保持通过：

- [three-platform-release-workflow.test.mjs](../apps/dsh-desktop/test/three-platform-release-workflow.test.mjs)
- [native-fixture-storage.test.mjs](../apps/dsh-desktop/test/native-fixture-storage.test.mjs)
- [regression-e2e-shards.test.mjs](../apps/dsh-desktop/test/regression-e2e-shards.test.mjs)
