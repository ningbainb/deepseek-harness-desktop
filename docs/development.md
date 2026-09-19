# 开发流程（development）

dsh-web-ui 是 DeepSeek Harness Web GUI 的插件与皮肤 monorepo。仓库、包级和
文档规则分别见根 [AGENTS.md](../AGENTS.md)、[packages/AGENTS.md](../packages/AGENTS.md)
和 [AGENTS.md](AGENTS.md)。

## 环境准备

- Node.js >= 22.19 与 pnpm 11；
- 依赖解析官方 NPM SDK（registry.npmjs.org）。仍使用私有 scope 认证时需
  `NPM_TOKEN` 环境变量（真实令牌只放环境变量，勿提交）；token 配置放
  用户级 `~/.npmrc`，项目 `.npmrc` 只留 scope 映射（见
[plugins.md](plugins.md)）。

## 日常循环

```sh
pnpm install
pnpm -r build          # 全仓构建
pnpm typecheck        # 全仓类型检查
pnpm test             # 全仓单测
pnpm docs:check       # 文档一致性（链接 / README / i18n 配对）
```

改动提交前至少跑 `pnpm typecheck && pnpm test && pnpm docs:check`；CI 会
全量跑所有门禁（typecheck / build / test / aggregate / gallery /
skin-center / docs / emoji）。

## 常见任务

### 审核远程 PR

维护者可用 `node scripts/pr-review.mjs` 批量审核外部 PR（`--open` 审核全部）：
先检查规模、缓存、密钥、emoji、模板和 CI 文件，再在隔离 worktree 运行完整
CI 门禁。验证目录统一放在 `~/remote-e2e`，同 head 复用；定期运行
`pnpm pr:review --cleanup` 清理。

皮肤 PR 还会生成亮/暗预览与画廊截图，检查过曝、对比度、版权声明和画廊注册。
用法与 verdict 语义见脚本注释或 `pnpm pr:review --help`。

### 修改 shared 运行时模块

shared/ 是跨包模块的唯一事实源；包内同名文件由 `scripts/sync-shared.mjs` 生成。
修改后运行该脚本并提交副本；`pnpm test:scripts` 会检查漂移。

### 新增插件包

```sh
node scripts/dsh-plugin-new <name>   # 生成 packages/<name>/ 骨架
```

然后按 [plugins.md](plugins.md) 把包注册进聚合包（aggregate.yml 的
`patchFrom` 与 `deps`），跑 `node scripts/aggregate.mjs` 重新生成聚合包。
新包必须自带 README 三件套（`README.md` + `README.zh.md` +
`README.i18n.yaml`）与测试。

### 新增皮肤

```sh
node scripts/dsh-skin-new          # 生成 packages/skins/<id>/ 骨架
pnpm --filter @linxin666/dsh-skins build   # 皮肤资产并入 dsh-skins
pnpm gallery:build                # 画廊产物
```

皮肤启用互斥由 `dsh-skin use` 管理（`~/.dsh/cordis.patch.yml` managed
区段）；皮肤资产全部内置在 dsh-skins 一个包里，不单独发 npm 包。

### 本地验证（挂载进 dsh web）

```sh
node scripts/link-profile.mjs      # 把全家桶链接进 web profile
dsh plugin --profile web add link:<仓库绝对路径>/packages/dsh-web-ui-all
dsh web                            # 重启后侧边栏出现插件入口
```

## 发布

发布流程见 [publish-prep.md](publish-prep.md) 与 .github/workflows/
release.yml：推送 vX.Y.Z tag 触发发布，tag 是版本唯一来源，
`scripts/verify-version.mjs` 在发布前校验每个包版本与 tag 一致。

Desktop 三端验证遵循原生平台边界：Windows 开发机只做通用检查和 Windows
本地测试、打包、安装验收；macOS arm64 统一由 `macos-preview.yml` 或
`desktop-three-platform-release.yml` 的 macOS Runner 验证；Linux x64 统一由
`linux-preview.yml` 或 `desktop-three-platform-release.yml` 的 Linux Runner
验证。WSL、容器、交叉打包和静态检查不能替代对应平台的原生工作流结论。
三端 Release 只能在三个原生 job 与资产校验全部成功后发布。

## 文档纪律

- 任何改动触及 README / AGENTS.md / docs/ 描述的行为时，同 PR 更新文档；
- 改包 README 任一侧后，同步另一侧并 `pnpm docs:write-pair <包名>`；
- 一次性记录（任务交接、验证快照）放 `docs/archive/`，不进长期文档目录。
