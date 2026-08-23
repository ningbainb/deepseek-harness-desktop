# DSH Desktop 3.0.2 发布前 QA 快照

日期：2026-08-23。

## 结论

Node 24.19.0 下的源码门禁、Windows x64 正式包门禁、历史配置直启矩阵、真正全新配置第二次启动、恢复路径、插件市场安装、ChatGPT OAuth、更新退出、主要桌面界面和发布资产一致性全部通过；本轮未发现仍未修复的 Critical、High 或 Medium 发布阻断问题。

Windows 安装器按产品决策保持未签名，最终 Authenticode 状态为 `unsigned`，用户侧会看到未知发布者提示。

## 本轮发现与修复

| 严重性 | 问题 | 处理 | 回归证据 |
| --- | --- | --- | --- |
| Medium | 首个启动页在完整 IPC 注册前加载，标题栏会请求 `desktop:window-chrome-theme`、`desktop:update-status` 和 `desktop:contract`，日志出现 `No handler registered` | 增加最小只读启动 IPC，并在完整 IPC 接管后注销；最终清理延后到应用退出 | IPC 单测和打包目录选择 E2E 通过，目录选择脚本会把这三类日志直接判为失败 |
| Medium | 直接恢复完整插件后没有把恢复策略状态推进到当前版本，留下陈旧 `policyVersion` 证据 | `clearRecoveryMode()` 同步写入当前恢复策略版本，并补持久化断言 | 插件恢复单测、打包资料恢复 E2E 和旧配置直启矩阵通过 |
| Low | 内置终端 E2E 仍寻找已移除的旧按钮，无法覆盖当前工具菜单入口 | 改为通过 `工具 / Tools` 打开 `内置终端 / Built-in Terminal` | 最终打包版 PowerShell PTY、Git、pnpm、工作目录、输出与关闭清理全部通过 |

## 用户反馈覆盖

| 反馈 | 最终结果 |
| --- | --- |
| [#44](https://github.com/ningbainb/deepseek-harness-desktop/issues/44) 和全新安装首次正常、退出后再次进入修复页 | 真正零状态首次退出后，第二次启动再次达到 `ready-full`；版本字段缺失的 Desktop Home 同样直接启动 |
| 2.3 至 3.0.1 配置和原 key 丢失 | 2.3、2.4、2.5、2.6、2.7、3.0.1 与 fresh 七组打包直启全部达到 `ready-full`；旧凭据引用兼容测试通过 |
| 无 API 时自动修复卡在 88% | 无可用模型时不调用模型修复并收敛到同 Home 内置配置；对应单测与打包启动路径通过 |
| 正常启动仍弹恢复界面 | 健康完整配置直接启动，不经过迁移选择；孤儿管理链接自动接管后也不进入恢复状态 |
| 市场插件安装不了 | 最终包从实时市场成功安装 `dsh-status-rotator`，安装后 Runtime 保持主界面且通过启动检查 |
| ChatGPT 登录入口消失 | 最终包授权桥返回 `available=true`、`writable=true`，提供 `oauth` 方法；OpenAI Codex 模型组可选择 |
| 拓展坞入口难发现 | 入口保持在左下角设置附近并一次点击打开；前三次启动提示位于视口内，文案为“插件、技能和桌面核心功能在这里” |
| [#34](https://github.com/ningbainb/deepseek-harness-desktop/issues/34) Windows 启动卡 08% | Windows Runtime 包装器不使用会导致控制台宿主崩溃的 `-WindowStyle Hidden` 路径；单测与多轮打包启动通过 |
| [#8](https://github.com/ningbainb/deepseek-harness-desktop/issues/8) 安装更新提示文件占用 | NSIS 进程归属、旧安装暂存、文件锁分类、v1/v2 退出协议与打包 update shutdown E2E 通过 |
| [#3](https://github.com/ningbainb/deepseek-harness-desktop/issues/3) 工作区选择失败 | 官方应用内目录浏览器打包 E2E 通过，不依赖旧 Win32 选择器工作进程 |

## 验证范围

- Node 24.19.0 `pnpm verify` 全部通过，包括类型检查、桌面端测试、32 个工作区包测试、150 项脚本测试、运行依赖、导入边界、耦合审计、Runtime 支持矩阵、社区质量、共享文件、发布说明、网站、聚合、画廊、皮肤中心、社区索引和文档门禁。
- 桌面测试为 629 项通过、2 项因本机未开启 Windows 符号链接权限而跳过、0 项失败；跳过项只覆盖文件符号链接逃逸场景，同类目录链接与路径约束测试已通过。
- 最终 Node 24 打包版覆盖 2.3 至 3.0.1 与 fresh 直启、fresh 二次启动、资料恢复、清空重建、Runtime provider、孤儿链接、目录选择、终端、窗口、设置、粒子主题、会话 Skills、预设 Deep Link、任务板 Worktree、更新退出、拓展坞、实时市场安装、ChatGPT OAuth、包结构和冷启动。
- Dogfood 检查按首次使用、主要任务、边界状态、恢复状态和视觉完整性逐项执行；最终截图未发现横向溢出、遮挡、提示越界或入口不可达。
- 正式包内匿名统计配置为 `officialBuild=true` 且使用仓库发布变量指向 `/v1/events`；源码和开发构建配置保持 `officialBuild=false`，避免开发流量污染日活、月活、地域和更新统计。

## 发布资产

| 字段 | 值 |
| --- | --- |
| 版本 | `3.0.2` Stable，Windows x64 |
| 安装器 | `DeepSeek-Harness-Desktop-Setup-3.0.2-x64.exe` |
| 大小 | `201828165` 字节 |
| SHA-256 | `e3522b068c5ea3d85f923fb2747b081cb8538ba233a92f45673628e40179b023` |
| 签名 | `unsigned`，预期显示未知发布者 |
| 包内 Runtime | `0.1.1-rc.1`，83 个运行包通过结构校验 |
| 冷启动 | `7538.9 ms` 测试总时长，`6271 ms` 到 renderer |
| 更新资产 | 安装器、blockmap、`latest.yml`、`SHA256SUMS.txt` 与 `release-manifest.json` 交叉校验通过 |

## 发布操作边界

本轮没有把安装器覆盖安装到维护者当前真实用户环境，也没有发布 GitHub Release；正式上线前应在一次性 Windows 虚拟机完成可见安装、未知发布者提示、安装目录选择、覆盖更新和卸载的人工冒烟，然后由 `desktop-release.yml` 在 Node 24 环境重新执行同一套门禁并上传资产。
