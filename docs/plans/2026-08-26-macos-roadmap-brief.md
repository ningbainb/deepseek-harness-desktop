# macOS 版技术选型与路线图（摘要）

> 2026-08-26 · 完整版见 `docs/plans/2026-08-24-macos-desktop-roadmap.md`
> 基线：dsh-desktop 3.0.1 · Electron 43.4.0 · DSH 0.1.1-rc.1 · 分析口径 main@60b26ca

## 结论

**复用现有 Electron 壳做跨平台化，不重写。** 同时把"深度 macOS 化"（窗口 chrome、应用菜单、生命周期、托盘）当发版门槛而不是二期优化。

## 为什么不重写

这个仓库不是"Windows 应用"，是一个薄的 Electron 生命周期壳，包着平台无关的 Node 运行时（DSH）和 16 个与壳解耦的 Web 插件包：

- 真正 `import 'electron'` 的只有 2 个文件 + 5 个 preload，约 3,800 行；
- packages/ 的 8.8 万行 TS 跑在 DSH 的 loopback Web Surface 里，**换任何壳都原样可用**；
- Windows 专属代码集中在打包/签名/安装器/自动更新，不在应用逻辑里。

壳层复用率：Electron 跨平台化约 **89%**，Tauri 壳约 58%，Swift 壳约 51%，全重写约 3%。三个独立评审视角给 Electron 方案 9/8/9 分，Tauri 4/4/4，Swift 3/5/3。

## 四个已验证的事实（都是实际解包/grep 出来的，不是推断）

1. **DSH 沙箱在 mac 有原生后端**：`dsh-sandbox-local@0.1.1-rc.1` 的 `PLATFORM_CHAINS.darwin = ["seatbelt"]`，走系统 `sandbox-exec`，不需要额外原生模块。Agent 命令执行的沙箱强度能对齐 Windows。
2. **node-pty 有官方 darwin 预编译**：`darwin-arm64` 的 `pty.node` + `spawn-helper` 官方 tarball 自带，内置终端不用自建交叉编译链。
3. **koffi（Win32 FFI）只有两处调用点**，都已被 win32 分支包裹，mac 上整体绕开。
4. **代码里已埋好大量 darwin 分支**：终端默认 shell、深链接、符号链接、pnpm shim、safeStorage 走 Keychain 等。方向正确，但从未被 CI 验证过。

## 四项范围决策

| 决策 | 代价 |
|---|---|
| 只做 arm64，不做 Intel/x64，不做 universal | 2020 年及以前的 Intel Mac 不支持（arm64 包在 Intel 上 Rosetta 救不了）。背景是 macOS 27 彻底弃 Intel |
| 不上 Mac App Store，走 Developer ID 直发 | MAS 强制 App Sandbox，会禁掉 DSH 依赖的任意目录访问、无限制 spawn、内嵌可执行调用，结构性冲突。注意跳过 MAS 省不掉 $99/年 |
| 先出未签名贡献者预览版，认可后再买 Developer ID | 预览期要手动解除 quarantine，且**完全没有自动更新**（Squirrel.Mac 强制校验签名），每版手动重装 |
| mac 端弃用内置 MinGit（1,613 行），改系统 git 探测 + 引导 `xcode-select --install` | 不存在 MinGit for macOS；README"安装包已含 MinGit"的承诺需在 mac 章节改写 |

## 阶段与工期

按 1 名全职工程师折算约 **13.5–20 个全职周**（阶段 5 与 6 可并行，压缩后约 2.5–4 个月）。

| 阶段 | 内容 | 周 |
|---|---|---|
| 0 | 前置验证：依赖 darwin 就绪度扫描、mac 上 dev spike 跑现有壳、Seatbelt 冒烟 | 1–2 |
| 1 | 平台适配层：进程组树杀、隐性缺口清单、managed-git 换系统探测、生命周期与 Dock、**Electron 43 → 45** | 2–3 |
| 2 | 打包链路：`.icns`、`electron-builder.yml` 的 `mac:` 节、after-pack 参数化并反转 prebuilds 裁剪正则、verify-package mac 版 | 2–3 |
| **2.5** | **贡献者预览版**：未签名 pre-release + 安装说明 + 禁用应用内更新入口 + 反馈闭环。**末尾是 G1 付费门** | 0.5–1（+1–2 周反馈窗口） |
| 3 | 签名与公证：Developer ID、entitlements、内嵌二进制逐个签名清单化并在 CI 断言、notarytool + staple | 1–2 |
| 4 | 自动更新：放开 darwin 门禁、latest-mac.yml / beta-mac.yml、Squirrel.Mac 全流程、优雅停 Runtime | 1–2 |
| 5 | 原生体验：`hiddenInset` + 红绿灯让位、`role:'appMenu'`、托盘模板图标、暗色联动、TCC 权限旅程、**中文 IME 专项实测** | 2–4 |
| 6 | CI/CD 双平台化：workflow matrix、PowerShell 内联脚本收编为 .mjs、16 个 e2e 支持 `.app` 路径、单测补 darwin 断言 | 2–3 |
| 7 | Beta 与社区验证：插件兼容性加 os 维度门禁、接入崩溃采集、设备矩阵测试、文档 | 2–4 |
| 8 | Stable 与长期维护机制 | 1–2 |

**G1 门是整条路线唯一的付费决策点**：贡献者认可才买 Developer ID 并进入阶段 3–4；不认可就停在预览期继续迭代，零成本。

## 三条主要风险

- **签名黑洞**：任何一个内嵌二进制漏签 → 公证失败或运行时被拦。对策是把它变成机器检查（遍历 .app 内全部 Mach-O 断言签名），不靠人肉清单。
- **after-pack 陷阱**：只删 win32 早退、不反转 prebuilds 裁剪正则，会产出"能装能启、终端不可用"的包。裁剪正则现在把 `darwin-` 当 foreign 二进制删。
- **arm64 单架构没有退路**：原先"砍 x64 保 arm64"这个阀门不存在了，某原生模块缺 `darwin-arm64` 预编译会直接成阻塞项，靠阶段 0 的依赖扫描前置排查。

## 需要项目方拍板的四件事

1. **落地形态**：仓库规则是新功能 PR 会被关、走 Issue。macOS 这条线建议开一个 tracking Issue，在原仓开 `codex/macos-*` 分支分阶段提小 PR，不攒巨型 PR。
2. **范围**：arm64-only + 不上 App Store 是否认可。
3. **Apple 账号主体与费用**：谁出 $99、挂谁的主体。宜早定 —— Team ID 变更会让 Squirrel.Mac 签名链对不上，老用户自动更新全断、只能手动重装。
4. **协作口径**：PR 粒度；`pr-contribution-rules` 对 owner 免截图证据、对外部贡献者不免，平台适配类改动是否照跑该门槛。

另：`CONTRIBUTING.md` 目前是纯 Windows 的（PowerShell、`$env:CSC_IDENTITY_AUTO_DISCOVERY`），mac 开发环境章节本身就需要补，可作为独立的文档型 PR 先行。
