# Prompt Pilot 1.2.3 跨文档偏好同步补丁

状态：补丁已通过 pnpm 安装并记录锁文件哈希，原包内存验证 10/10 通过；隔离 Windows 原生验收已通过配置同步、草稿保留、A/B 会话隔离与 Tab 仅填入草稿。打包版验收仍在进行。客户端首次载入修补版本后建立同步监听。

## 接口核实与选择

核实对象是 `vendor/plugins-20261026/dsh-prompt-pilot-1.2.3.tgz`。
SHA-256：`9941974e4175a2854b54a09a6966bde1cd2c9557e407b70b2e66ba7274fb0d2a`。

- 包身份为 `@local/dsh-prompt-pilot@1.2.3`，客户端模块身份为 `@local/dsh-prompt-pilot`。
- `./client` 导出 `client.js`；ModuleLoader factory 仅返回 `inject` 和 `apply`。
- `preference`、`snapshot`、`subscribe`、`updatePrefs` 全部位于 `apply` 私有闭包中。
- 未公开 preference setter、service 或自定义同步事件，也未使用 SDK settings store。
- `settings.section` 与 `conversation.input.overlay` 使用同一文档内的闭包；SDK slot 注册只能挂载组件，无法设置另一个文档里的私有状态。
- `client-source.js` 是构建源，`build.mjs` 生成 `client.js` 和旧入口 `client-inline.js`。

因此不在 adapter 猴子补丁 ModuleLoader、React、Storage.prototype 或 DOM，不复制设置界面，不重载主窗口。采用社区依赖的安装层 patch，通过官方 `ctx.effect` 管理订阅生命周期。

## 补丁行为

`1.2.3.patch` 为三个客户端文件各添加相同的 15 行 storage 订阅，保留源码与两个产物一致。

仅响应当前 localStorage 的 `dsh-prompt-pilot-v1` 或 clear 事件。收到事件后重读最新存储值，调用 vendor 原有 `normalizePreferences`；仅当 enabled、route 或 budget 变化时更新原闭包并通知原订阅者。接收端不写存储，避免事件回环。重读而不直接采用 `event.newValue`，防止排队的旧事件回滚最新选择。

删除 key 或 clear 后恢复 vendor 默认值；非法 JSON 或读取权限错误保留当前内存值；无关 key、sessionStorage 和相同值不触发更新。卸载 effect 移除监听，重新加载插件只注册当前生命周期的监听。原有预测组件通过自己的 `useSyncExternalStore` 和 effect 依赖更新，原有清理逻辑取消旧请求；补丁不接触草稿或输入动作。

## 已安装的挂载方式

不要更改原始 tgz、模块名、版本或现有 profile/cordis 挂载。当前 adapter 客户端不需要新增运行时接线。

在根 `pnpm-workspace.yaml` 已有的 `patchedDependencies` 下追加一项，保留其他项：

```yaml
patchedDependencies:
  '@local/dsh-prompt-pilot@1.2.3': patches/@local__dsh-prompt-pilot@1.2.3.patch
```

`apps/dsh-desktop/package.json` 中现有的 `file:../../vendor/plugins-20261026/dsh-prompt-pilot-1.2.3.tgz` 依赖保持原样。不要把该差异用 `git apply` 应用到仓库或官方源码；三个路径均相对于社区包安装根目录，由 pnpm 应用。

已在 E 盘构建环境执行 pnpm 安装，锁文件记录 patch 哈希及对应社区包解析项，并核验实际安装的三个入口均已应用补丁。补丁应用于 workspace 安装，不手改 node_modules。打包验收仍需确认归档包含修补后的 `client.js`。测试验证由修补后的 source 重建仍得到相同产物；补丁同时覆盖旧入口，避免旧客户端元数据仍引用 `client-inline.js` 时漏修。

该方案没有对正在运行的私有闭包做热注入。安装修补版本后，首次载入该客户端才建立订阅；后续 Dock 设置修改实时同步，不需要为同步重载主窗口。不要为了本次验证强制刷新带草稿的主窗口。

## 已有验证与待验收边界

从仓库根目录运行，无新增依赖、无 Electron：

```powershell
. ./scripts/use-e-build-env.ps1
node --test packages/dsh-release-plugin-adapter/tests/prompt-pilot-storage.test.mjs
```

包的 `test` 已串接上述测试再执行既有 Vitest 测试；单独入口为 `test:prompt-pilot`。

测试直接校验、解压读取原 tgz 到内存，严格匹配 unified diff 上下文并在内存应用补丁。执行原 vendor factory、设置组件、订阅和预测 effect，覆盖三入口双向同步、无回写、排队旧事件、异常读取、clear/remove、卸载重挂及原有请求取消边界。React hooks 和浏览器存储边界受控，不代表原生窗口验收。

反证命令：将 `PROMPT_PILOT_TEST_ORIGINAL=1` 后执行同一测试，预期跨文档同步用例失败。默认命令必须全部通过。测试不写 node_modules，也不运行安装、vendor 构建脚本或 Electron。

隔离 Windows 原生记录位于构建产物目录 `desktop-5.2.0-adaptation-20261026/release-plugins-native-11/result.json`。10 组插件检查已通过，包含自动预测关闭同步、预算修改后未发送草稿保留、主文档不重载、A/B 延迟回复隔离与 Tab 不提交第三轮。用户开始输入后，vendor 按当前会话与轮次主动收起建议；设置变化不得在该草稿上重新弹出建议。完整源码回归、打包行为及安装升级验收需另行记录，不能由此推断通过。
