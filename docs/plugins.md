# 如何把新插件加入全家桶

本指南说明如何把插件加入 `dsh-web-ui-all` / `dsh-skins` 聚合包，同时保留独立安装能力。

## 流程

### 1. 脚手架生成

```sh
node scripts/dsh-plugin-new <name>
```

命令在 `packages/<name>/` 生成 bundle 骨架并替换 `__NAME__`；名称只允许小写字母、数字和单连字符，例如 `dsh-task-board`：

```text
packages/<name>/
├── cordis.patch.yml   # 插件行（- insert: - id: ui-<name> / name: ...）
├── package.json       # dsh.bundle.patch 清单 + dsh.client 声明
├── src/
│   ├── index.ts       # host 半区（node 进程侧）
│   └── client.ts      # browser 半区（Web GUI 侧）
├── tsconfig.json
├── tsdown.config.ts
├── README.md          # 英文版（含 H1 后语言切换行）
├── README.zh.md       # 中文版（结构与英文镜像）
├── README.i18n.yaml   # 配对一致性记录（docs/i18n.md）
└── AGENTS.md          # 包级 AI 指令（可选，复杂包建议写）
```

### 2. 实现插件逻辑

- host 半区 `src/index.ts`：导出 cordis 插件，运行在 dsh host 进程（例如系统提示词公告、真实任务执行等）。
- browser 半区 `src/client.ts`：Web GUI 侧的 UI 逻辑，经 package.json 的 `dsh.client` 声明注入运行时。
- 形态参照 `packages/dsh-task-board/`：`dsh.bundle.patch` 指向包内 `cordis.patch.yml`；`dsh.client` 声明 `inject: ["@deepseek-ai/dsh-client-runtime"]` 与 `platform: "web"`。

### 3. 注册进聚合包

把 `- ../<name>` 追加到 `packages/dsh-web-ui-all/aggregate.yml` 的 `patchFrom` 和 `deps` 两段：

- `patchFrom`：该包的 `cordis.patch.yml` insert 行会被汇总进聚合包 patch；
- `deps`：解析为包名写入聚合包 `package.json` 的 `dependencies`（`workspace:*`）。

皮肤不进 aggregate.yml；`packages/dsh-skins/build.mjs` 会把各皮肤的 `skin.json` 和 `lib/client.js` 收入 `dsh-skins`。修改后运行 `pnpm --filter @linxin666/dsh-skins build`；启用互斥由 `dsh-skin use` 管理。

### 4. 重新生成聚合包

```sh
node scripts/aggregate.mjs          # 重新生成聚合包 cordis.patch.yml + 依赖
node scripts/aggregate.mjs --check  # 校验模式：任何漂移以退出码 1 报错（CI 用）
```

### 5. 构建验证

```sh
pnpm install   # workspace 链接（packages/* 与 packages/skins/*）
pnpm -r build  # 全仓构建
```

> **前置要求**：类型只来自 registry.npmjs.org 上公开的 `@deepseek-ai/*` NPM SDK，不依赖 DSH 源码 checkout。若环境仍需私有 scope 认证，只在环境变量或用户级 `~/.npmrc` 中配置 `NPM_TOKEN`，勿提交；项目 `.npmrc` 仅保留 scope registry 映射。

### 6. 本地验证

两种方式任选：

```sh
# 方式 A：用 link-profile 脚本把全家桶全部包链接进 profile（推荐；脚本自动处理 @linxin666 命名空间）
node scripts/link-profile.mjs            # 链接/刷新全家桶；--dry-run 预览

# 方式 B：只把聚合包本身注册进 profile（聚合包的 workspace:* 依赖会回退解析到 npm 已发布版本，
# 因此请先确认 npm 上的 @linxin666/dsh-* 为最新且可用，或先用方式 A 链接全部子包）
dsh plugin --profile web add link:<dsh-web-ui>/packages/dsh-web-ui-all
```

重启 `dsh web`，确认聚合包插件行挂载生效。调试阶段也可先单独安装单包（`link:<dsh-web-ui>/packages/<name>`）验证。

> profile 目录不是 pnpm workspace，`workspace:*` 会回退到 npm 已发布版本。若版本滞后导致 UI 未显示，运行 `node scripts/link-profile.mjs`，让 profile 使用本地构建产物。

## 第三方插件准入原则

家族仓库欢迎社区插件，但收编必须透明：

1. **活跃且有上游的第三方 → 不搬代码**。优先在 dsh-external fork 并保留上游关联，或直接作为依赖；全家桶只登记安装入口。
2. **收编条件**（无活跃上游、上游已停更、或作者明确授权组织托管）：
   - 用 `git subtree add` 迁入，保留完整 git 历史；
   - **必须**保留上游 LICENSE 文件与作者署名（包内 LICENSE、README 作者声明）；
   - 在包 README 记录来源仓库与迁移日期；
   - 版权归原作者，本仓库仅托管，不主张版权。
3. **合规红线**：无 LICENSE、作者未授权、或版权归属不明的代码，一律不收编。

### Desktop 社区插件入口

扩展坞原生市场读取 awesome-dsh-plugin 公开目录并在本地检索。点击安装后，主进程把目录 ID 解析为安装源，复用确认、事务安装和失败回滚。市场不嵌入第三方页面或执行目录命令；`community.json` 与 `scripts/community-index` 仅保存贡献者元数据并执行一致性校验。

### Desktop 兼容性声明

社区 bundle 可用 `package.json#dsh.compatibility` 声明 Desktop 契约，详见 [Desktop 插件兼容性声明](desktop-plugin-compatibility.md)。未声明项视为“未知”，安装前必须确认。

## 插件规范要点

- **package.json 的 `dsh.bundle.patch` 声明**：指向包内 `cordis.patch.yml`，这是官方 bundle 清单，`dsh plugin` 依赖它识别与挂载插件。
- **cordis.patch.yml insert 行格式**（包名用家族 scope `@linxin666`，与 npm 发布名一致）：

```yaml
- insert:
    - id: ui-<name>
      name: '@linxin666/dsh-client-ui-<name>'
```

- **类型来源（只能基于官方 NPM SDK）**：各包把用到的 `@deepseek-ai/*` 包声明为 `devDependencies`
  （`^0.1.0-rc.8`；cordis 用 `^4.0.1`），TS 从 node_modules 自动解析类型
  （SDK 包的 `exports["."].types` 统一指向 `lib/types/index.d.ts`，client 半区子路径
  `./client` 同理）。**禁止** tsconfig `extends` / `paths` / `references` 指向任何 DSH 源码
  checkout（历史形态：`../../../test-zhu1090093659` 相对路径、`~/.dsh/source/current` 绝对
  paths —— 均已废除）。tsconfig 为自包含单项目：`moduleResolution: "bundler"` +
  `allowImportingTsExtensions`（emit 项目另加 `rewriteRelativeImportExtensions: true`，
  参照 `packages/dsh-task-board/tsconfig.json`）。构建/类型/测试全部以 node_modules 的 SDK 包为
  唯一类型来源，克隆后无需任何源码 checkout 即可构建。
- **浏览器 client 半区**：`@deepseek-ai/*/client` 子路径由 SDK 包 exports 提供（闭包工厂产物，
  运行时经 `window.__ModuleLoader__` 加载）。官方 SDK 尚未发布的槽位（如
  `conversation.input.selector.*`）用**模块形式**的本地 augmentation 补齐类型
  （`import type {}` + `declare module '@deepseek-ai/dsh-client-ui-slots'`，参照
  `packages/dsh-git-graph/src/client/slots-augment.ts`），SDK 发布对应槽位后移除。
- **构建预设**：统一走仓库内单一共享副本 `shared/tsdown.client.ts`（平台模块表
  `shared/web-platform.ts`），各包 `tsdown.config.ts` 引用它并传参（`libExternal` /
  `companions` 等）。**禁止**再复制预设到包内。
- **测试基建**：vitest 配置需 `server.deps.inline: [/@deepseek-ai\//]`（SDK 包走 vite 转译，
  处理 CSS）；client 半区闭包工厂在测试中不可直接 import——用 `vitest.setup.ts` 的最小
  `__ModuleLoader__` stub（`packages/dsh-live-stats/vitest.setup.ts`）或 `vi.mock` 替换
  （`packages/dsh-remote-web-ui/tests/remote-entry.spec.tsx` 的 `createSnapshotStore` mock）。
- **设置页插件配置（rc.8 槽位契约）**：`dsh-web-ui-settings` 在 list 槽 `settings.section` 注册 `web-ui-plugins` 分区，并声明 list 子槽 `web-ui.plugin.item`；功能插件把卡片注册到该子槽。官方 keyed 槽 `settings.plugin.item` 要求 `key`，不承载全家桶根卡。接入分两步：
  1. **host 半区**：用 `installSettingsSection(...)` 注册命名空间；`setSource` 提供动态读取，`onChange` 同步已提交的修改。
  2. **browser 半区**：注入 `settingsScope`、`connection` 和 `remote`，调用 `bind({ namespace })` 并注册 `web-ui.plugin.item` 卡片。样板见 `packages/dsh-remote-web-ui`；slot `order` 使用 100+。
- **皮肤类插件**：使用 `scripts/dsh-skin-new`，不走 `dsh-web-ui-all` 注册；GUI 卡片加入 `web-ui.plugin.item`，不得加入 keyed 的 `settings.plugin.item`。
## 移植 harness 插件的挂载约束

聚合包 insert 行不带 `config`，loader 会先填充 schema 默认值。`apply` 只在关键字段存在时校验；否则调用时提示“未配置”，设置页提交仍严格校验。参考 `packages/dsh-tool-describe-image`。
