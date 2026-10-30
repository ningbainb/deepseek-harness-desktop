# 5.2.0 自定义供应商 Key 保存修复与本地验收

日期：2026-10-29。交付范围：Windows x64 本地未签名测试安装包，未提交、推送或发布。
Runtime 为官方 NPM 0.2.1-rc.4，Electron 44。保留既有工作树修改，不修改官方 DSH 源码或 SDK 文件。

## 已复现的问题与修复

用户反馈的入口为“模型窗口 / 自定义供应商”。普通创建、编辑、重启和隔离升级在旧测试包中可以通过，不能据此否认反馈，也不能确认所有供应商的鉴权错误都有同一个原因。

已复现一条真实故障路径：在隔离数据目录让凭据文件路径发生 I/O 拒绝时，原表单先保存供应商配置，再保存 Key；第二步失败后，供应商已经存在，但没有可用凭据。旧包原生复现记录为：

`E:/DeepSeekHarnessDesktop-Build/artifacts/desktop-5.2.0-key-persistence-20261029/custom-provider-io-refusal-red/result.json`

修复在既有自有设置插件中实现，通过现有 profile / Cordis 挂载。新建供应商使用尚未配置的凭据引用时，先通过官方凭据 SDK 保存并确认 Key，再交回官方原表单创建供应商。写入失败时保留输入草稿、显示通用错误提示并阻止创建供应商，不展示服务原始错误或 Key。

Host 使用现有本地桥接访问校验，并按凭据引用串行执行实时存在性检查、首次保存和确认，覆盖主窗口与扩展坞的不同浏览器分区。客户端同时防止重复点击、输入变化、隐藏表单和已销毁窗口触发迟到提交。

SDK 耦合集中在精确声明的 `packages/dsh-web-ui-settings/src/custom-provider-key-sdk-adapter.ts` 中；未增加通配导入豁免。功能基线仅增加本次能力，未移除入口、插件或断言。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 设置插件全量测试 | 354/354，通过；包含本次定向测试 |
| 最终 SDK 适配文件定向复测 | 38/38，通过 |
| TypeScript、共享构建与 SDK 导入边界 | 通过，边界脚本测试 6/6 |
| 功能保全基线 | 24 插件、20 内置包、36 桌面表面、15 皮肤，通过 |
| 内置适配门禁 | 54 包，通过 |
| Desktop 核心回归 | 32/32 套，通过，零豁免 |
| 核心回归中的启动与修复集成组 | 460/460，零跳过，Windows 控制台观察器正向对照通过 |
| 本次代码独立审查 | 已解决跨窗口与隐藏表单两项发现，无剩余 P1/P2 |
| 完整 Windows 构建、pack:verify、当前运行时输入校验 | 通过 |
| 实际 Setup 提取与 CRC | 26,168 个归档文件一致 |
| 随包离线运行时还原 | 18 个文件 SHA-256 一致，最终目录 26,186 个文件 |
| 新包隔离验收 | 下列 9/9 项全部通过 |

新包验收按顺序执行，全部使用从实际新 Setup 提取并离线还原的程序：

1. 实际 Setup 提取、归档文件完整性与离线运行时还原。
2. 提取资源与当前源码构建输入比对。
3. 打包后启动冒烟、协议链接与任务看板 Worktree 操作。
4. 真实 SDK 凭据写入拒绝：供应商未创建、Key 草稿保留、错误提示可见。
5. 原生界面创建自定义供应商、模拟模型流式对话、完全退出、重启后续聊。严格核对 Bearer；Key 来自文件，未通过环境变量注入；无页面错误，进程清理通过。
6. 浏览器控制拒绝与一次性允许。
7. Agent 模型鉴权与真实工具调用、较大工具结果和历史恢复、三次会话往返切换、输入框与桌宠避让。零付费请求。
8. 实际旧 5.1.0 创建数据并读取旧 SDK 会话，再由新包升级和重启读取。两份文件凭据、供应商、插件设置、已启用 bundles、会话身份与 A→B→A 可见内容保留；旧版和新版 EXE/ASAR 未被测试修改。
9. 最终发布清单校验。

源码证据根：`E:/DeepSeekHarnessDesktop-Build/artifacts/desktop-5.2.0-key-persistence-20261029`。

新包证据根：`E:/DeepSeekHarnessDesktop-Build/artifacts/desktop-5.2.0-key-fix-pack-20261029`。
该目录中的 `build-state.json`、`acceptance-state.json`、`final-identity.json` 记录完整构建、九项验收和最终身份；`packaged-key-io-refusal`、`packaged-key-create-restart`、`upgrade-preservation-vWpH46` 保留原生结果及截图。

## 安装包身份

文件：`E:/DeepSeekHarnessDesktop-Build/worktrees/desktop-5.0.0/apps/dsh-desktop/dist/DeepSeek-Harness-Desktop-Setup-5.2.0-x64.exe`

- 大小：338,905,905 字节，323.21 MiB。
- SHA-256：`6b83643caa744ae35490a83d86308027e15ffdc5f72af604375457bc0704acbd`。
- Authenticode：`NotSigned`，清单中的签名状态为 `unsigned`。
- Setup、`release-manifest.json` 和 `SHA256SUMS.txt` 中的大小与哈希一致。
- 已验收源码输入哈希在构建前和最终交付检查时一致。工作树仍包含未提交修改，HEAD 仅是来源标识，不能替代这些输入哈希。
- 旧测试包已保全在证据目录的 `previous-accepted` 下，其哈希以 `12c6e5a6` 开头；它不包含本次修复，不能当作新包交付。

## 适用边界

已修复的是上述已复现的创建顺序故障；缺少具体用户环境与服务端报错，不能断言覆盖所有“Key 无效”原因。已经丢失且没有备份的 Key 无法凭空恢复，需要重新填写。

已有配置或共享引用保留官方原保存顺序，不在预检中提前替换。串行队列限定于同一 Runtime 内的预检，不覆盖其他进程或外部 SDK 写入；成功预检后若取消或配置创建被拒绝，可能留下未引用的凭据。

本次通过的是 Windows 隔离自动验收及真实 Setup 字节校验。没有在当前账号执行 Setup 新装、正式覆盖安装或回滚，没有验收真实 Windows 安装向导、注册表和快捷方式效果；macOS/Linux 未在本次修复中构建或验收。没有上传、发布或将测试结果当成正式发布声明。
