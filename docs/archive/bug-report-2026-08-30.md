# dsh-web-ui-desktop-direct-repair 3.1.0 最新包实测 Bug 报告

- 排查日期：2026-08-30
- 排查对象：`dsh-web-ui-desktop-direct-repair` 工作区当前 `main` 分支，包含现有未提交改动
- 测试对象：`@deepseek-ai/dsh-desktop` 3.1.0 Windows NSIS 安装包及其 `win-unpacked` 目录
- 打包命令：`pnpm --filter @deepseek-ai/dsh-desktop pack:win`
- 测试方式：源码单元测试、打包目录 E2E、真实 NSIS 静默安装、安装后启动与功能回归

## 一、总体结论

最新包可以完成构建、安装和启动，核心运行时、内置终端、粒子主题、会话技能、目录选择、更新关闭、首次启动、配置迁移、预设深链和直接启动矩阵均通过。但当前不建议直接作为无人值守发布版本，原因如下：

1. 重复打包时 `dist` 中的旧安装包和旧校验元数据不会被自动清理或重建，发布校验需要人工移动旧文件并手工更新 `SHA256SUMS.txt`。
2. Codex 会话导入成功后，导入会话标题可能从源会话标题退化为首条用户消息，导致导入前后身份不一致。
3. 启动页在完整 IPC 注册前调用 `desktop:info` 和 `desktop:status`，打包 E2E 中稳定出现未注册 handler 错误。
4. `test:window-chrome:e2e` 的精确文本断言没有同步当前新增的菜单项，导致发布测试失败。

## 二、构建产物与测试结果

### 2.1 最终安装包

| 项目 | 结果 |
| --- | --- |
| 安装包 | `apps/dsh-desktop/dist/DeepSeek-Harness-Desktop-Setup-3.1.0-x64.exe` |
| 大小 | `201,933,699` bytes |
| SHA-256 | `A87C1A281C12F23A05A6190D34F36E4584C264821E1922EC5432F8DA035E6FC6` |
| blockmap | `209,383` bytes |
| `pack:verify` | 通过，验证 83 个 packaged runtime packages |
| NSIS 静默安装 | 通过，退出码 0 |
| 安装后首次启动 | 通过；本次冷启动约 60.3 秒 |
| 安装后第二次启动 | 通过；约 6.9 秒 |
| Windows 签名 | 当前为 unsigned；仓库配置为可选签名，本次未启用强制签名 |

### 2.2 自动化结果

| 检查项 | 结果 |
| --- | --- |
| `pnpm --filter @deepseek-ai/dsh-desktop test` | 通过：804 项中 802 passed、0 failed、2 skipped；跳过项是 Windows symlink 权限限制 |
| `pack:smoke` 与 preset/task-board 场景 | 通过 |
| `test:terminal:e2e` | 通过 |
| `test:particle-theme:e2e` | 通过，平均帧时间约 8.35 ms，P95 约 8.5 ms |
| `test:conversation-skills:e2e` | 通过 |
| `test:directory-picker:e2e` | 通过，但输出启动期 IPC handler 错误 |
| `test:discovery-surfaces:e2e` | 通过 |
| `test:update-shutdown:e2e` | 通过 |
| `test:fresh-relaunch:e2e` | 通过 |
| `test:direct-start-matrix:e2e` | 通过，7/7 |
| `test:profile-reset:e2e` | 通过 |
| `test:star-prompt:e2e` | 通过 |
| `test:profile-migration:e2e` | 通过 |
| `test:preset-deep-link:e2e` | 通过 |
| `test:runtime-provider:e2e` | 通过 |
| `verify-packaged-orphaned-managed-link.mjs` | 通过 |
| `test:window-chrome:e2e` | 失败：精确 chrome 文本断言不匹配，并伴随 `desktop:info/status` 未注册错误 |

## 三、Bug 列表

### BUG-1【高，发布阻断】重复打包无法自动产生可发布且可验证的 `dist`

**位置**：`apps/dsh-desktop/package.json:44-48`；`apps/dsh-desktop/src/release-manifest.mjs:160-173, 363-370, 414-427, 477-485`。

**复现步骤**：

1. 在已有历史产物的 `dist` 目录执行 `pnpm --filter @deepseek-ai/dsh-desktop pack:win`。
2. 执行 `pnpm --filter @deepseek-ai/dsh-desktop release:manifest:verify`，首次得到 `release artifact size mismatch: DeepSeek-Harness-Desktop-Setup-3.1.0-x64.exe`。
3. 执行 `release:manifest:write`，由于旧的顶层 exe 仍存在，得到 `unexpected top-level Windows executable`。
4. 将旧文件移出 `dist` 后再次执行 `release:manifest:write`，命令成功。
5. 再执行 `release:manifest:verify`，得到 `SHA256SUMS.txt does not match DeepSeek-Harness-Desktop-Setup-3.1.0-x64.exe`。
6. 只有在人工重写 `SHA256SUMS.txt`、再次写入 manifest 后，校验才通过。

本次残留的两个旧顶层安装包已保留并移动到 `apps/dsh-desktop/dist/previous-artifacts-20260830/`，没有删除用户数据。

**原因**：`pack:win` 只调用 `electron-builder`，没有隔离或清理旧 `dist`，也没有串联 manifest 和 checksum 写入。`release:manifest:write` 只写 `release-manifest.json`，不会更新 `SHA256SUMS.txt`；而 verify 会同时严格检查两者。

**影响**：打包命令表面成功，但发布门禁无法通过。若跳过 verify，可能把旧产物或与当前安装包不一致的元数据一起发布。

**修复建议**：使用每次构建的干净输出目录，或在打包前安全清理受控的 `dist`；将安装包、`SHA256SUMS.txt`、`release-manifest.json` 的生成串联进发布脚本；最后强制执行一次完整 verify。checksum 生成逻辑应与 manifest 写入职责明确绑定。

### BUG-2【中，用户可见】Codex 会话导入后的标题与源会话标题不一致

**复现环境**：最新 `win-unpacked` 可执行文件，使用内置“从其他 AI 工具导入”流程导入 Codex 会话。

**复现步骤与实际结果**：

1. 在 Codex 源会话列表中选择标题为 `调研 Code is Cloud 导入功能` 的会话。
2. 预览成功后确认导入；返回结果 `ok: true`，`importedEventCount: 3931`，工作区和会话均创建成功，handoff 窗口也正常关闭。
3. 主界面中的新会话标题变成首条用户消息的截断文本，而不是源列表中的 `调研 Code is Cloud 导入功能`。
4. 本次打包实测结果为 `mainContainsTarget: false`；这表示标题没有保留，并非历史事件没有导入，导入结果本身仍报告成功。

**原因定位**：

- 快速扫描在 `codex.mjs:175-194` 读取 `session_index.jsonl` 的 `thread_name/title`，并在 `codex.mjs:215-241` 将其作为列表标题。
- 完整读取从 `codex.mjs:564` 开始，将 `sessionTitle` 初始化为空（约 `codex.mjs:592`），没有复用快速扫描得到的索引标题。
- 读取首条用户消息时，`codex.mjs:632-637` 会把空标题设置为首条用户消息；最终 `codex.mjs:1064-1065` 使用该值写入导入会话标题。

**影响**：用户在导入前后无法通过标题确认这是同一个会话，长会话尤其容易被误认为导入错对象。

**修复建议**：让完整读取复用发现阶段的索引标题，或根据会话 id 再加载 `session_index.jsonl`；只有在索引标题不存在或是通用标题时，才回退到首条用户消息。

### BUG-3【中】启动期 IPC 注册顺序导致 `desktop:info/status` handler 报错

**复现结果**：`test:window-chrome:e2e` 与 `test:directory-picker:e2e` 使用打包程序启动时均输出：

```text
Error occurred in handler for 'desktop:info': Error: No handler registered for 'desktop:info'
Error occurred in handler for 'desktop:status': Error: No handler registered for 'desktop:status'
```

测试随后依靠前端 fallback 继续执行，因此部分场景仍显示通过，但启动日志已污染，且不应视为正常行为。

**位置与原因**：

- `apps/dsh-desktop/src/ui/startup.mjs:317` 直接调用 `window.dshDesktop.getInfo()`，`startup.mjs:336-337` 同时读取 info/status。
- `apps/dsh-desktop/src/ipc.mjs:237-260` 的 `registerDesktopStartupIpc` 只注册 `desktop:contract`、窗口主题、更新状态和 action，没有注册 info/status。
- 完整注册在 `apps/dsh-desktop/src/ipc.mjs:447-518` 才加入这两个 handler。
- 生命周期上，`electron-app.mjs:667` 先注册 startup IPC，直到 `electron-app.mjs:1423-1431` 才卸载 startup IPC 并注册完整 IPC。

**影响**：产生可见错误日志；启动页当前会回退到硬编码版本 `3.1.0` 和 stopped 状态。后续版本若仍使用该 fallback，可能显示过期信息或掩盖真正的启动状态问题。

**修复建议**：启动页只调用 startup IPC 已保证存在的 channel；或在 startup IPC 中提供安全的 info/status 实现，并在完整注册时无缝替换。应移除硬编码版本 fallback，改用构建时注入或 startup contract 返回的版本。

### BUG-4【中，测试阻断】window-chrome E2E 精确文本断言落后于当前菜单实现

**位置**：`apps/dsh-desktop/scripts/verify-window-chrome.mjs:97`；`apps/dsh-desktop/src/window-chrome.mjs:326,338`；`apps/dsh-desktop/src/menu.mjs:103`。

**实际结果**：测试要求的文本为：

```text
工具 / Tools内置终端 / Built-in TerminalCtrl+Alt+T扩展坞 / Extension DockCtrl+Shift+X帮助 / Help加入社群提交建议GitHub 项目隐私政策检查更新
```

打包程序实际渲染为：

```text
工具 / Tools内置终端 / Built-in TerminalCtrl+Alt+T扩展坞 / Extension DockCtrl+Shift+X从其他 AI 工具导入 / Migrate from Other AI Tools帮助 / Help加入社群提交建议GitHub 项目隐私政策导出诊断日志检查更新
```

当前实现已经包含会话导入和诊断日志菜单项，但测试的 exact assertion 没有更新，因此 `test:window-chrome:e2e` 退出码为 1。

**影响**：发布测试门禁失败；同时 exact `textContent` 断言会把合法菜单扩展误报为窗口 chrome 故障。

**修复建议**：先确认新增菜单项是否是预期产品契约；若是，应更新 fixture/assertion，并改为对关键菜单项做语义断言，避免整段拼接文本造成脆弱测试。若不是，则应回退对应菜单实现。

## 四、观察项与限制

1. NSIS 安装后的冷启动本次约 60.3 秒，第二次约 6.9 秒；第二次恢复正常，暂列性能观察项，尚不足以单独判定为稳定性 Bug。
2. `release:signatures:verify` 返回两个 executable 均为 `unsigned`。当前仓库签名配置是 optional，本次没有把它判为代码 Bug；正式发布若要求签名，应在发布机启用证书并设置强制校验。
3. 源码测试的 2 个 skip 与 Windows symlink privilege 有关，不是测试失败。
4. 报告初稿阶段没有修改业务源码；随后已按本报告实施修复，并保留了旧安装包归档。

## 五、建议修复顺序

1. 先修复 BUG-1，确保干净环境下从打包到 manifest/checksum/verify 可以一条命令完成。
2. 修复 BUG-3，消除启动期未注册 IPC 错误。
3. 修复 BUG-2，保留 Codex 源会话索引标题。
4. 对齐 BUG-4 的产品契约和 E2E 断言。
5. 在修复后重新执行 `pack:win`、`pack:verify`、`release:manifest:verify`、NSIS 安装测试和全部打包 E2E。

## 六、修复结果

- BUG-1：新增发布目录清理和统一 `pack:win` 包装器；同一命令会清理旧生成物、准备 bundled Git、构建 NSIS、重建 `SHA256SUMS.txt` 和 `release-manifest.json`，并立即校验。
- BUG-2：Codex 导入读取 `session_index.jsonl` 的非通用标题，并在完整读取时保留该标题；新增回归测试。
- BUG-3：startup IPC 在窗口加载前提供 `desktop:info` 和 `desktop:status`，启动页移除硬编码版本 fallback；真实 packaged 启动未再出现未注册 handler。
- BUG-4：window-chrome E2E 改为关键文本语义断言，并同步 Tools/Help 菜单项精确契约。

验证结果：完整桌面单元测试 807 项中 805 项通过、2 项因 Windows 符号链接权限跳过、0 项失败；`pack:win`、`pack:verify`、manifest 校验、packaged smoke、window chrome、directory picker 均通过；NSIS 静默安装退出码为 0，安装态 smoke、window chrome、directory picker 均通过。