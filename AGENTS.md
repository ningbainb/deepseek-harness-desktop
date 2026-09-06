# dsh-web-ui — 仓库规则

## 插件只能基于官方 NPM SDK 开发（禁止改 DSH 源码）

- 本仓库所有插件**禁止修改 DeepSeek Harness (DSH) 源码**（对官方源码 checkout 零写入），
  挂载只走 `cordis.patch.yml` + profile 机制。
- 开发**只能基于官方 NPM SDK**：`@deepseek-ai/*` 官方 NPM SDK 包（scope registry 为
  registry.npmjs.org，内测已结束），类型来源是各包 `devDependencies` 中的 SDK 包（node_modules 解析）。
- **禁止** tsconfig `extends` / `paths` / `references` 指向任何 DSH 源码 checkout
  （`test-zhu1090093659`、`~/.dsh/source/current` 等引用一律不得新增）。
- 构建预设统一用仓库内单一共享副本 `shared/tsdown.client.ts`，禁止在包内复制。
- 环境：若仍使用私有 scope 认证，需要 `NPM_TOKEN` 环境变量（真实令牌只放环境变量，勿提交）；
  当前 SDK 已结束内测，公开包通常可直接安装。
  认证配置：token 放**用户级 `~/.npmrc`**（`//registry.npmjs.org/:_authToken=${NPM_TOKEN}`，
  由 pnpm 展开环境变量）；**项目 `.npmrc` 只留 scope 映射**
  （`@deepseek-ai:registry=https://registry.npmjs.org/`）。注意：项目级 `.npmrc` 里的
  `${NPM_TOKEN}` 占位符在 pnpm 11 下不会被展开、被忽略，不承担认证职责，详见 `docs/plugins.md`。

## 新包命名统一 dsh- 前缀

**此后新建的插件包（`packages/` 下新目录）一律以 `dsh-` 开头**（如 `dsh-aionui-panel`、
`dsh-task-board`）。既有包已全部更名对齐，新包直接沿用，不允许再出现不带 `dsh-` 前缀的
包目录。仓库自有 npm 包名沿用已发布的 `@linxin666/dsh-*`（UI 类插件按惯例用
`@linxin666/dsh-client-ui-*`）；`@deepseek-ai/*` 仅用于官方 SDK 和官方运行时包。

## 禁止使用 emoji

本仓库**禁止出现任何 emoji 字符**（含 Emoji_Presentation、变化选择符 U+FE0F、ZWJ 序列、
区域指示符、Dingbats/杂项符号等 Unicode Emoji 属性字符），覆盖所有文件类型：
代码、注释、README / 文档、UI 文案、脚本输出、提交信息均不得使用 emoji。

- 需要装饰性符号时，改用非 emoji 的普通字符（如 `×`、`-`、`*`），或直接去掉。
- 新提交前先检查：`git diff` 或全局搜索 Unicode Emoji 范围字符。

## git push 与 NPM 发布已放开（内测结束）

**git push 已放开**：可正常执行 `git push` 到远程仓库 `dsh-external/dsh-web-ui`，
推送前仍须核验目标仓库为 PRIVATE。

**内测已结束，NPM 包可按正常流程发布**：本仓库任何包（`@linxin666/dsh-*`）发布前
仍需由维护者确认发布动作、版本号与 registry 规范，避免误发或破坏线上包。

## 功能保全与防静默退化规则

除非用户或任务有明确书面要求，否则**严禁删除或使已有功能失效**：
- **UI 入口与控件保全**：严禁删除或隐藏既有 UI 入口（侧边栏项、设置卡片、快捷操作、桌面窗口控制、交互按钮、数据看板等）。
- **插件生态保全**：严禁从 `feature-baseline.json`、`aggregate.yml`、`cordis.patch.yml` 或 `apps/dsh-desktop` 依赖中删除已有插件或其 patch 挂载项。
- **配置与兼容行为保全**：严禁废弃既有配置字段、环境兼容 shim、本地隔离契约及公开 API。
- **严禁弱化测试**：禁止为了通过测试而删除测试用例、降低断言条件、注释校验逻辑或静默跳过失败用例；遇到测试失败必须修复代码实现本身。
- **修改基线约束**：任何核心功能的变动必须同步更新机器可读的基线清单 `scripts/feature-baseline.json` 并通过回归门禁（`pnpm feature-baseline:check` 和 `pnpm desktop:regression:e2e`）。

## 仓库卫生与临时产物规则

仓库根目录只用于项目入口文档、包管理文件、工作区配置和仓库级配置。开发过程中的临时文件不得直接提交到根目录。

- 临时 `.patch` 文件不得留在根目录。确实需要长期维护的补丁统一放到 `patches/`；一次性修复补丁在任务完成后删除。
- `capture-*`、`diagnose-*`、`verify-*` 等调试或验证脚本不得留在根目录。仍需保留历史追溯价值的脚本放到 `scripts/archive/<版本>/<类别>/`，长期维护脚本放到 `scripts/`。
- `bug-report-*` 等阶段性报告放到 `docs/archive/bug-reports/` 或其他合适的 `docs/` 子目录。
- 截图、海报、二维码和其他图片资产不得直接放在根目录。常规展示资源放到 `gallery/`，历史验证截图放到 `gallery/archive/`，版本发布素材放到 `gallery/releases/<版本>/`。
- 以下划线开头的一次性脚本不得留在根目录；需要保留时移动到 `scripts/archive/<用途>/`。
- 纯整理任务只允许移动、归档或删除已确认无引用的临时产物，不得借机重构生产源码或改变功能行为。
- 移动仍被代码或文档引用的文件时，必须在同一变更中更新引用路径。
- 每次提交前运行 `pnpm repo-hygiene:check`。该检查失败时不得通过新增例外、改弱规则或跳过 CI 来规避。
