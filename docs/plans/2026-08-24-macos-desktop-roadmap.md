# DeepSeek Harness Desktop：macOS 版技术选型与开发路线图

> 2026-08-24 · 基线：dsh-desktop 3.0.1 · Electron 43.4.0 · DSH 0.1.1-rc.1
> 分析口径：main@60b26ca，只读分析，未修改仓库任何文件
> 2026-08-26 决策更新：项目方已定案四项范围问题（arm64 单架构 / 先出未签名贡献者预览再买 Developer ID / 不做 Mac App Store / mac 端弃用内置 MinGit）。§4–§7 已按此同步，摘要见 [§0.1](#s0-1)。

## 推荐路线

**方案 A：复用现有 Electron 壳做跨平台化，配合"深度 macOS 化"改造。**

三个独立评审视角（迁移成本与功能完整度 / macOS 原生体验与性能 / 发布工程与长期维护）打分一致：**A 方案 9 / 8 / 9 分**，显著领先 Tauri 重写（4/4/4）、Swift 原生壳（3/5/3）与完全原生重写（1/2/2）。这不是"不敢重写"的保守结论——代码事实、上游生态、行业对标三条证据链都指向同一个方向，且拍板前最关键的两个技术未知量已实际验证并确认无阻塞。

---

## 目录

- [§0 执行摘要与已验证的关键事实](#s0)
- [§0.1 已定案的范围决策（2026-08-26）](#s0-1)
- [§1 仓库现状：架构、Windows 依赖与可复用性](#s1)
- [§2 macOS 技术栈调研摘要](#s2)
- [§3 四个方案的对比评审](#s3)
- [§4 推荐技术路线细则](#s4)
- [§5 总体路线图（阶段 0–8，含新增阶段 2.5）](#s5)
- [§6 关键风险与止损准则](#s6)
- [§7 立项决策状态：已定案与仍待拍板](#s7)
- [§8 方法论与材料清单](#s8)

---

<a name="s0"></a>
## §0 执行摘要与已验证的关键事实

这个仓库的真实形态比"Windows 桌面应用"这个标签乐观得多：**它是一个薄的 Electron 生命周期壳，包着一个平台无关的 Node.js 运行时（DSH）和 16 个与壳完全解耦的 Web 插件包**。全仓约 15 万行壳相关代码里，真正 `import 'electron'` 的只有 2 个文件（加 5 个 preload 共约 3,800 行）；产品的绝大部分功能（任务看板、SSH、手机远程、Git 图谱、皮肤、桌宠、粒子主题）住在 packages/ 的约 8.8 万行 TS 里，跑在 DSH 的 loopback Web Surface 中，**换任何壳它们都原样可用**。Windows 专属代码高度集中在打包/签名/安装器/自动更新这一层，而不是应用逻辑里。

因此选型问题实际上是："为了 macOS 体验，值不值得扔掉一个已经稳定发版到 3.0.1、拥有 108 个单测 + 16 个 e2e 脚本 + 完整发布治理体系的壳，换一个要从零重建这一切的壳？"四位评审的一致答案是不值得——Electron 壳跨平台化后可复用约 **89–94%** 的代码资产，而 Tauri / Swift 壳分别只剩约 58% / 51%（壳层口径），且各自带着未解决的关键阻塞项（详见 §3）。

### 拍板前已实际验证的四个关键事实

> **已验证：DSH 沙箱在 macOS 上有原生后端。**
> 从 npm 实际解包本仓锁定的 `@deepseek-ai/dsh-sandbox-local@0.1.1-rc.1`，其 `lib/index.js` 中 `PLATFORM_CHAINS = { darwin: ["seatbelt"], win32: ["windows-acl"], … }`，包描述明确写有 "macOS Seatbelt"。darwin 走系统自带 `sandbox-exec`，不需要任何额外原生模块——此前"依赖图中无 darwin 后端"的悲观推断是误判。**Agent 命令执行的沙箱强度可以对齐 Windows 版，这个最大的功能天花板不存在。**

> **已验证：node-pty 有官方 darwin 预编译。**
> 实际下载 `node-pty@1.2.0-beta.15` 官方 tarball，内含 `prebuilds/darwin-arm64` 与 `prebuilds/darwin-x64` 的 `pty.node` + `spawn-helper`。内置终端不需要自建交叉编译链；`spawn-helper` 是非 .node 可执行文件，需纳入签名清单（本仓已全量 `asarUnpack`，解包问题天然不存在）。

> **已验证：koffi（Win32 FFI）只有两处调用点，macOS 上可整体绕开。**
> `windows-console-preload.cjs`（kernel32 AttachConsole）与 `launch-safe-mode.mjs`（user32 GetAsyncKeyState），都已被 `win32` 分支包裹，非 Windows 平台不加载。库本身自带 darwin 预编译，无需移除依赖。

> **已验证：代码里已埋好大量 darwin 分支。**
> 终端默认 shell（darwin → `/bin/zsh`）、深链接 `open-url`/`open-file` 事件、符号链接 `junction/dir` 双分支、pnpm POSIX shim、`safeStorage`（macOS 自动走 Keychain）等——原始设计文档（docs/plans/2026-08-14-dsh-desktop-design.md）本就声明"架构保持对 macOS/Linux 可移植，版本 1 以 Windows 为发布目标"。这些分支从未被 CI 验证过，但方向正确。

> **前置项：唯一可能卡住全局的是行政流程，不是技术——但已按决策改为门控启动。**
> macOS 的**公开分发**必须有 Apple Developer Program 账号（$99/年）。没有签名+公证，macOS 上**自动更新完全不可用**（Squirrel.Mac 强制校验签名，与 Windows"不签名也能更新"本质不同），Gatekeeper 还会拦截首次启动。项目方已定案：**先做未签名的贡献者预览版验证产品，认可后再付费购买**（详见 [§0.1](#s0-1)）。这条路走得通的前提是接受预览期"手动解隔离 + 无自动更新"；同时因为选个人主体（无需 D-U-N-S、当天可下证），原先"组织认证耗数周"的进度风险已被消解，不再需要与技术工作并行抢跑。

---

<a name="s0-1"></a>
## §0.1 已定案的范围决策（2026-08-26）

以下四条由项目方拍板，本文档 §4–§7 已全部按此口径同步。**核心是交付顺序变了**：不再是"先买账号、签名后发 Beta"，而是"先做出能装能跑的未签名包 → 交给 GitHub 贡献者互看 → 认可后才付 $99 买 Developer ID"。

| # | 决策 | 影响 | 已接受的代价 |
|---|---|---|---|
| 1 | **只做 Apple Silicon（arm64），不做 Intel/x64，也不做 universal** | 产物从 4 个降到 2 个；CI 单 arch 构建时长减半；`after-pack.cjs:83` 裁剪正则只保留 `darwin-arm64`；universal / `lipo` / `mergeASARs` 整条讨论作废 | 2020 年及以前的 Intel Mac 完全不支持——arm64 包在 Intel 上连 Rosetta 都救不了（Rosetta 只能 x64→arm64，反向不行）。背景板是 macOS 27 即将彻底弃 Intel |
| 2 | **不做 Mac App Store，走 Developer ID 直发（GitHub + QQ 群）** | 省掉审核与强制 App Sandbox——后者会直接禁止 DSH 依赖的任意目录访问、无限制 spawn、内嵌可执行调用，与产品能力结构性冲突 | 无。但要认清：**跳过 MAS 省不掉 $99/年**，这是两件独立的事（见下方对照表） |
| 3 | **先出未签名贡献者预览版，认可后再买 Developer ID（个人主体）** | 阶段 3（签名）与阶段 4（自动更新）整体后移到 G1 门之后；新增[阶段 2.5](#s5) 作为预览与反馈窗口 | 预览期用户必须手动解除隔离属性，且**完全没有自动更新**，每版都要重新下载安装 |
| 4 | **mac 端弃用内置 MinGit（1,613 行），改系统 git 探测 + 引导 `xcode-select --install`** | `managed-git.mjs:528` 的 `probeSystemGit()` 本身跨平台，直接复用；`managed-git.mjs:196/220/314/329` 四处硬断言 `platform must be win32`，这套东西在 mac 上本就跑不起来 | README 第 259 行"安装包已包含 …… MinGit ……，不需要额外安装 Node.js 或 Git"的承诺，需要在 mac 章节改写为"需要系统 git，首次启动会引导安装" |

### 为什么"不做 App Store"省不掉那 $99

|  | Mac App Store | Developer ID 直发 |
|---|---|---|
| 分发渠道 | Apple 商店 | 自己的 GitHub / 官网 |
| 需要 Apple Developer Program | 需要 | **同样需要** |
| 审核与 App Sandbox | 有审核，强制 App Sandbox | 无审核，可用 hardened runtime + entitlements |
| 本项目适用性 | 否（结构性冲突） | 是（目标形态） |

苹果没有免费的 Developer ID 证书：免费 Apple ID 只能拿到 "Apple Development" 证书（仅限本机调试、需注册设备），既不能分发也不能公证。

### 未签名预览期的三条硬约束

1. **Gatekeeper 拦截**：从 GitHub 下载的包带 `com.apple.quarantine`，未签名 app 打开时典型报错是"「App」已损坏，无法打开，你应该将它移到废纸篓"。解法是 `xattr -dr com.apple.quarantine /Applications/<App>.app`，或 系统设置 → 隐私与安全性 → 下拉点"仍要打开"。
2. **macOS 15 Sequoia 起 Apple 移除了"右键→打开"这条老捷径**，只剩上面那条更长的系统设置路径——安装说明必须写清，否则贡献者第一步就卡住。
3. **自动更新彻底不可用**：mac 上 electron-updater 走 Squirrel.Mac，会校验新版本签名与当前运行 app 的签名匹配，未签名直接报错不更新。也就是说现有那套 Stable/Beta 双通道 + 镜像加速 + 优雅停 Runtime 的更新体系（代码零平台字符串、mac 本可原样复用）在预览期**一行都用不上**。应用内更新入口应在未签名构建下显式禁用并给出说明，而不是让它报错。

### 两个附带确认

- **个人主体当天可下证**：个人账号不需要 D-U-N-S 认证，原 §6 里那条标"高·进度"的行政风险随之降级。但 **个人 → 组织的主体迁移必须在有真实用户之前完成**：Team ID 变更会让 Squirrel.Mac 的签名链对不上（老用户自动更新全断、只能手动重装），Keychain 里存的凭据也会失效。若未来大概率要转公司主体，就该在买账号那一刻直接买组织账号。
- **CI 成本顾虑可划掉**：本仓是 public 仓库，GitHub Actions 的标准 macOS runner 对公开仓库免费，原"runner 配额与计费倍率"不再是待确认项。

---

<a name="s1"></a>
## §1 仓库现状：架构、Windows 依赖与可复用性

### 1.1 三层架构与运行模型

桌面壳（`apps/dsh-desktop`）用 `ELECTRON_RUN_AS_NODE=1` + `process.execPath` 把 Electron 自身当 Node 用，spawn `@deepseek-ai/dsh` CLI（`--profile desktop --port 0 --no-open`），从 stdout 解析 loopback URL 并做 HTTP 就绪探测，然后把该 URL 加载进主窗口。**Desktop 没有独立打包 Node.js 二进制**——这是"换壳"方案都必须自带 Node 的原因。约 46 个 `@deepseek-ai/dsh-*` 包（纯 JS）作为 npm 依赖随应用分发；`~/.dsh/profiles/desktop` 是壳自己维护的符号链接账本（非 pnpm install 产物），只有用户装社区插件时才真正调用内嵌 pnpm 执行 `pnpm add`。

窗口拓扑共 8 类（主窗口、扩展坞、社区窗、终端 WebContentsView、恢复壳、Free Mode 隔离窗、迁移锚点/探针）；安全模型全窗口统一 `contextIsolation + sandbox + nodeIntegration:false`，27 个 `desktop:*` + 28 个 `extensions:*` IPC 通道全部经 surface 注册表做发送者身份校验，导航白名单只放行 loopback 同源与 https 外链。这套安全纵深是 Electron 特性组合，换壳需整体重建。

### 1.2 代码量与可复用性总账

| 区域 | 约行数 | 与壳的关系 | 结论 |
|---|---:|---|---|
| `packages/` 16 个 Web 插件包 | 87,916 | 跑在 DSH Runtime 内，**零 electron import** | 任何方案下直接复用 |
| `apps/dsh-desktop/src` 纯逻辑层（profile、插件管线、迁移、Free Mode、更新通道逻辑等） | ≈19,200 | 零 electron import，win32 分支均为局部隔离 | 直接/小改复用 |
| 依赖注入型 Electron 适配层（menu、tray、window-chrome、notifications 等 22 个文件） | 7,171 | 不 import electron，但调用 Electron 形状对象 | 仅 Electron 方案全额保留 |
| `electron-app.mjs` + `main.mjs` + 5 个 preload | 3,782 | 唯一真正的 Electron 绑定点 | 仅 Electron 方案可复用 |
| managed-git（MinGit 托管）三件套 | 1,613 | 硬编码 win32-only | macOS 上整体废弃，换系统 git 探测 |
| koffi Win32 FFI 调用点 | 41 | kernel32 / user32 专属 | 删除/替换 |
| `test/` 108 个 node:test 单测 | 22,526 | **无一启动 Electron 进程** | 跟随源码保留（Electron 方案约 90%） |
| `scripts/` Playwright `_electron` e2e（16 个） | 2,458 | 绑死 Electron driver | 仅 Electron 方案可复用 |
| `scripts/` 打包/发布脚本 | 1,603 | electron-builder + MinGit + Authenticode | 需为 mac 参数化/新写 |
| `shared/` | 1,688 | browser-safe / 跨平台 Node API | 直接复用 |

**三条路线的复用率**（壳专属层口径：src+test+scripts 共 60,396 行）：Electron 跨平台化 ≈ **89%**；Tauri 壳 ≈ **58%**；Swift 混合壳 ≈ **51%**；完全原生重写 ≈ **3%**。计入 packages/ 与 shared/ 的全口径分别为 94% / 80% / 77% / 58%——差距集中在壳层，而壳层正是发布治理、安全模型和测试资产所在。

### 1.3 Windows 专属依赖穷尽扫描（42 项判定点）

穷尽扫描结论：**A 类（必须做 macOS 等价实现）17 项、B 类（已跨平台可直接用）15 项、C 类（macOS 上整体删除）6 项、D 类（产品决策/上游配合）4 项**。A 类按紧迫度排序的前几项，恰好就是"能不能打出一个可分发的 mac 包"的阻塞项：

- `electron-builder.yml` 完全没有 `mac:` 配置节，也没有 `.icns` 图标——mac 打包能力当前为零，这是从零起草而非改字段；
- `electron-app.mjs:3392` 自动更新被硬编码为 `process.platform === 'win32'` 才加载——不改这一行，mac 包永远收不到更新；
- `after-pack.cjs:303` 整个打包裁剪钩子在非 win32 时直接 return——mac 包会跳过全部体积优化与 peer 依赖恢复（后者可能造成"打包能过、启动即崩"）；**且第 83 行的裁剪正则把 `darwin-` 预编译当 foreign 二进制删除，改造时必须同步反转，否则会产出终端不可用的 mac 包**；
- `release-manifest.mjs` 签名校验完全基于 PowerShell Authenticode，需新增 `codesign / spctl / stapler` 等价校验；`verify-package.mjs` 硬编码 win32-x64 与 conpty 断言，需要 mac 版；
- CI 三条桌面流水线全部 `runs-on: windows-latest`，无任何 macOS runner；
- 窗口 Chrome（`titleBarOverlay` 是 Windows/Linux 专属 API、右侧 140px 按钮留白）、应用菜单（无 `role:'appMenu'`）、生命周期（`window-all-closed` 无条件 quit、无 `activate`）三件套是"一眼看出是移植品"的来源，必须按 macOS 惯例重做。

另有一批**不报错但静默劣化**的隐性缺口，比显式 win32 分支更危险：非 win32 的进程终止只发单个 `SIGTERM`（不杀进程组，mac 上会残留孤儿进程）；Shift 键安全模式在非 Windows 直接 return false；遥测把 darwin 归类为 `'windows-other'`；`dsh-aionui-panel` 的路径边界检查把"文件系统大小写不敏感"错误地限定为 win32（macOS APFS 默认同样大小写不敏感，属安全相关缺口）；Preset 导入禁用后缀名单缺 `.command/.scpt/.workflow`。这些都已进入 §5 的阶段任务。

### 1.4 发布与更新链路现状

发布链是一条成熟的十三步流水线（tag 校验 → 18 步 verify → 打包 → 打包体 e2e → 包校验 → 签名校验 → SHA256SUMS → release-manifest → GitHub Release），配 Stable/Beta 双通道与"证据驱动"的 Runtime 支持矩阵治理。评审确认其中**真正 Windows 硬编码只有四处，全部可参数化**；更新通道逻辑（update-mirrors / update-channel-preferences / update-surface / release-channel 四组件）**零平台字符串，mac 可原样复用**。还有一个重要的减法：746 行 NSIS+PowerShell 的"安装前清理旧进程"体系解决的是 Windows 安装器覆盖运行中 .exe 的专属问题，**Squirrel.Mac 是整包替换 .app，这套体系在 mac 上不需要复刻**——把它当必做项会凭空高估工作量。同理，迁移助手（1,598 行）服务的是 Windows 老版本升级矩阵，mac 是全新平台没有历史用户，首发不需要。

---

<a name="s2"></a>
## §2 macOS 技术栈调研摘要（截至 2026-08-24）

### 2.1 Electron 生态现状

- **版本窗口**：最新稳定版 45（EOL 2027-04-27）；本仓的 43.4.0 仍在支持期但 EOL 2027-01-05 **只剩约 5 个月**——应借这次改造一并升级，避免半年内二动打包链。macOS 26 Tahoe 的 WindowServer 卡顿 bug 已在 37.6.0+ 修复，43 不受影响。最低系统要求 macOS 10.15+。
- **打包**：electron-builder mac 默认 `dmg + zip`，**zip 是 Squirrel.Mac 自动更新的硬依赖**（缺失则 latest-mac.yml 生成不出来）；universal 构建可行但 node-pty 的 spawn-helper 需 `x64ArchFiles` 特殊声明，且本仓 `asarUnpack: node_modules/**` 使 mergeASARs 收益基本蒸发——首发做 arm64 + x64 双分包比 universal 更划算。（**本条为决策前的调研结论；项目方已定案只做 arm64 单架构，见 [§0.1](#s0-1) 决策 1。**）
- **签名与公证**：唯一路径是 `xcrun notarytool`（altool 已移除）；Hardened Runtime 必选，Electron 需要 `allow-jit`、`allow-unsigned-executable-memory`、`disable-library-validation` 等 entitlements；**包内每一个二进制（.node、spawn-helper、内嵌 git/node、每个 Helper.app）都必须逐个签名**，公证后必须 staple。工具链用 `@electron/osx-sign + @electron/notarize`（electron-builder 内置集成，App Store Connect API Key 认证最适合 CI）。
- **自动更新**：electron-updater 双平台同一套 API，通道机制通用（latest.yml → latest-mac.yml）；**mac 上未签名+未公证 = 自动更新完全不可用**。
- **体验要点**：`titleBarStyle:'hiddenInset'` + `trafficLightPosition` 做自定义标题栏；托盘需模板图标适配深浅色菜单栏；TCC 权限需 Info.plist 声明 `NS*UsageDescription`，子进程不继承主进程 TCC 授权，需实测。

### 2.2 Tauri 2.x

稳定线 2.11.5，月更节奏健康，3.0 未 GA（主要面向 Linux GTK4）。生态本身不差，但对**本项目的具体形态**有三个结构性问题：

1. 主界面是 `http://127.0.0.1:port` 的远程页面，而 [Issue #11934](https://github.com/tauri-apps/tauri/issues/11934)（needs triage 未解决）报告 loopback 页面即使按文档配置 remote capability，`window.__TAURI__` 仍为 undefined——这条桥是整个壳的命脉；
2. [Issue #11992](https://github.com/tauri-apps/tauri/issues/11992) 报告 sidecar（externalBin）与 macOS 公证组合失败，而 DSH 必须以 Node sidecar 形态存在；
3. 官方推荐的 sidecar 打包方式（pkg 编译单文件）与 DSH"运行时用 pnpm 动态装第三方 npm 插件"的模型**结构性冲突**。

另有 WKWebView 的 xterm.js 死键 bug（#5894，≥6.1.0-beta.220）、数据目录不可自定义、updater 无增量更新等摩擦。真实迁移案例（Fluxzy、Hoppscotch）证明"前端不变 + sidecar"形状迁移较顺，但 updater 与 electron-updater 不互通会造成存量用户断链。

### 2.3 Swift/SwiftUI 原生

最关键的调研发现与"同时支持 Apple Silicon 与 Intel"的诉求直接相关：**macOS 26 Tahoe 是最后一个支持 Intel 的版本（仅 4 款 2019–2020 机型），macOS 27 预计一个多月后发布并彻底放弃 Intel，Xcode 27 在部署目标 ≥27 时默认不再构建 x86_64**——"双架构"的价值窗口不足一年，且 Apple 官方路线是收窄而非维持。

SwiftUI 在 2026 年仍撑不起复杂专业桌面应用（WWDC26 主题仍是与 AppKit 互操作），实际会是 SwiftUI+AppKit 混合栈。WKWebView 承载重型 Web 应用无理论障碍但边角案例多（Craft.do 一手记录的输入焦点、选中覆盖层、系统小版本静默行为变更等"维护税"）。Sparkle 2 更新框架成熟。

最有分量的反例：**OpenAI 曾以"heroic effort"为 ChatGPT 打造纯原生 mac 应用，2026 年又转回 Electron**——资源远超本项目的团队都难以长期承担原生壳维护成本。

### 2.4 同类产品对标

AI 编程桌面客户端品类几乎清一色 Electron：**VS Code、Cursor、Windsurf、Trae（字节）、Qoder（阿里云）、Claude Desktop、ChatGPT Desktop（现状）**全部走 Electron 路线（多数为 VS Code fork）。Anthropic 公开的选型理由（团队 Web 技术熟练度、跨平台代码复用、AI agent 可维护性）可直接复用于本项目决策备忘。

例外样本 Zed / Warp 是从渲染层自研 Rust+GPU 的独立产品，团队投入量级完全不同，不是"内嵌 agent runtime + 插件市场"形态的对标。前车之鉴：Claude Desktop 的自动更新曾被报告绕过用户配置强制重启、个别案例清空会话目录——**更新逻辑必须与用户数据目录、正在运行的 Agent 会话严格解耦**，这条教训已写进路线图阶段 4 的完成标准。

---

<a name="s3"></a>
## §3 四个方案的对比评审

| 方案 | 迁移成本/功能 | macOS 体验/性能 | 发布工程/维护 | 一句话判词 |
|---|---:|---:|---:|---|
| **A · Electron 跨平台化** | 9 | 8 | 9 | 唯一"改造既有链路"而非"重建第二条链路"的方案；缺陷全部是可穷举的清单，不是架构风险。 |
| **B · Tauri 2 重写壳** | 4 | 4 | 4 | 两个未解官方 issue（#11934 IPC 桥、#11992 sidecar 公证）恰好各自命中本项目命脉；收益（体积/内存）被常驻 Node 运行时严重稀释。 |
| **C · Swift 原生壳 + WKWebView** | 3 | 5 | 3 | 原生感天花板最高，但承担 B 的全部 Node 捆绑成本再加一门 Swift/AppKit 栈与双壳并行的契约同步税；OpenAI 原生→Electron 是直接反例。 |
| **D · 完全原生重写** | 1 | 2 | 2 | 不是移植而是另起产品：抛弃 8.8 万行 Web 插件与整个 npm 社区插件生态，"功能对齐"命题下自证不可行。 |

### 为什么不是"为了不重写而不重写"

1. **体验差距的真实来源不在壳。** 本应用的冷启动由"spawn Node → DSH boot → HTTP 就绪探测"主导，常驻内存由 DSH Node 运行时 + 全量解包的 node_modules + 用户插件主导——换掉 Chromium 只动了其中一段。而换壳的代价（WKWebView 的 xterm.js 死键 bug、PDF 内嵌只渲染首页、数据目录限制）恰好砸在终端、文档预览这些本应用最吃引擎的地方。**对这个具体产品，Electron 不是体验妥协，反而是引擎匹配度最高的选择。**
2. **"原生=双架构"的理由正在消失。** Intel 支持窗口不足一年，Electron 路线反而是唯一能今天就同时发 arm64 + x64 分包、且不押注 Xcode 未来行为的路线。
3. **安全模型是净资产不是包袱。** 现有 contextIsolation + sandbox + surface 注册表 + 导航白名单的纵深防御，在 Tauri 的 remote-URL capability 模型下反而是净劣化（第三方插件操纵页面渲染即可尝试触达 Rust 后端命令）。
4. **行业已替我们试过错。** 同品类全部在 Electron 上，两个反方向的实验（ChatGPT 原生、Zed/Warp 自研）分别证明了原生壳的维护税和自研渲染的投入量级，都不适合社区维护的项目。

> 保留的火种：A 落地后可花 3–5 天做一次 Tauri PoC（验证 #11934 在 2.11.5 上是否已修复 + sidecar 公证实测），作为长期观察项——但不押注主线。

---

<a name="s4"></a>
## §4 推荐技术路线细则

**方案 A：复用现有 Electron 壳做跨平台化，同时把"深度 macOS 化"作为发版门槛而非二期优化。**

| 决策点 | 选择 | 理由 |
|---|---|---|
| Electron 版本 | 借本次改造升级 43.4.0 → 45.x | 43 EOL 2027-01-05 只剩约 5 个月；45 支持到 2027-04-27，避免半年内二动打包链 |
| 打包目标 | `dmg + zip`，**仅 arm64**（已定案：不做 x64，不做 universal） | zip 是自动更新硬依赖；asarUnpack 全量解包使 mergeASARs 收益蒸发；单架构让产物降到 2 个、CI 时长减半、裁剪正则只留 `darwin-arm64`。代价见 [§0.1](#s0-1) 决策 1 |
| 签名/公证 | **分两期**：贡献者预览期允许未签名（手动分发、更新入口禁用）；公开 Beta/Stable 起 Developer ID 直发 + notarytool + staple，mac 通道 `REQUIRE_SIGNING` 设为**硬门禁** | 已定案先验证产品再付费（[§0.1](#s0-1) 决策 3）。但 Windows"允许发未签名社区版"的宽松策略在 mac 长期不成立——不签名等于自动更新不可用 + Gatekeeper 拦截，所以只能是限定人群的预览期，不能是发布形态 |
| 自动更新 | electron-updater + Squirrel.Mac，复用现有 Stable/Beta 通道逻辑 | update-* 四组件零平台字符串可原样复用；只需放开 darwin 门禁 + latest-mac.yml/beta-mac.yml |
| 托管 Git | **已定案**：mac 端废弃 MinGit 托管子系统（1,613 行），改为系统 git 探测 + 引导 `xcode-select --install` | macOS 生态惯例，且**根本不存在"MinGit for macOS"**（git-for-windows 只出 Windows 构建），自己 vendor 一份 git 就要多签名/公证一批 Mach-O，为系统自带的东西付这个成本不划算；`probeSystemGit` 已跨平台可复用。README 的"内置 MinGit"承诺需在 mac 章节改写；"内置可复现 git"若产品坚持，另行立项，不排期 |
| NSIS/关机回执体系 | 不复刻。保留 `update-shutdown-receipt.mjs`（纯跨平台）做优雅停 Runtime | Squirrel.Mac 整包替换 .app，不存在"覆盖运行中 exe"问题 |
| 迁移助手 | mac 首发裁剪迁移矩阵（保留代码，不跑 2.3–2.7 场景） | mac 是新平台，没有历史用户数据可迁移 |
| 窗口/菜单/生命周期 | `hiddenInset` + `trafficLightPosition` 重排自定义标题栏（红绿灯在左）；menu 补 `role:'appMenu'/'window'`；`window-all-closed` 区分 darwin + 注册 `activate`；托盘用模板图标 | 这四条是"一眼看出是 Windows 移植品"的直接来源，列为发版门槛 |
| 进程管理 | 非 win32 分支补进程组树杀：spawn 加 `detached:true`，停止用 `process.kill(-pid, 'SIGTERM')` + 超时升级 SIGKILL | 对齐 Windows `taskkill /T` 语义，否则 Agent 工具调用的孙进程会在 mac 上残留 |
| 插件生态 | 插件兼容性 schema 新增 **os 维度**声明与安装门禁 | 现 schema 无 os 字段，Windows-only 社区插件在 mac 扩展坞会显示"兼容"、装完运行时才炸 |
| 可观测性 | mac 首发接入 Electron `crashReporter` 或本地崩溃日志落盘 + 复用诊断导出 | 当前代码库无任何崩溃采集；mac 平台特有故障若只能靠用户截图排查，"长期维护"无法成立 |

---

<a name="s5"></a>
## §5 总体路线图（阶段 0–8，含新增阶段 2.5）

按 1 名全职工程师折算，总量约 **13.5–20 个全职周**（阶段 5 与 6 可并行，压缩后约 2.5–4 个月；社区业余节奏需按投入比例放大）。arm64 单架构与 mac 端弃用 managed-git 各减少一点工作量，新增的阶段 2.5 补回约 0.5–1 周工程量、另需 1–2 周日历上的贡献者反馈窗口。每个阶段附完成标准与止损点，允许在检查点降级范围而不是硬着头皮推进。

**阶段 2.5 末尾的 G1 门是本路线唯一的付费决策点**：贡献者认可才买 Developer ID 并进入阶段 3–4；不认可就停在预览期继续迭代，不花钱。

### 阶段 0：前置验证与立项准备（1–2 周 · 立即启动）

**目标**：消除全部"决策级"未知量，让后续阶段没有回头路风险；行政流程与技术验证并行。

**主要工作**：
- **行政（本阶段只做功课，不付费）**：按 [§0.1](#s0-1) 决策 3，Apple Developer Program 账号推迟到 G1 门之后再买；本阶段只把清单备齐——个人主体路径确认（无需 D-U-N-S、当天下证）、未来个人→组织迁移的时间窗约束、证书与 App Store Connect API Key 的保管人、CI secrets 注入方案。macOS runner 对 public 仓库免费，配额与计费倍率已不是待确认项。
- **上游 darwin 就绪度审计收尾**：沙箱 Seatbelt 与 node-pty prebuilds 已验证；剩余工作是对全部 `@deepseek-ai/dsh-*` 依赖批量扫描 os/cpu 字段与原生模块，产出完整清单；实际跑一次 Seatbelt 后端冒烟（`sandbox-exec` 探测是否 fail-closed 生效）。
- **本机 dev spike**：在 mac 上 `pnpm --filter @deepseek-ai/dsh-desktop dev` 直接启动现有壳（代码理论上能启动），记录全部崩溃点/异常，测冷启动与 RSS 基线；用 Safari 打开 DSH loopback URL 过一遍全功能（顺带归零 WebKit 风险敞口的证据空白）。
- **事实澄清**：验证 Codex Connect 真实运行时状态（`CODEX_PROVIDER_CONFLICTS` 与 README 矛盾），确定 mac 版功能对齐清单口径。（原"收集 Intel 用户占比数据"一项随 arm64 单架构定案取消。）
- （可选加分）对 Cursor/Claude Desktop 安装包做一次 `codesign -dv` / `lipo` 分析，抄同行已验证的 entitlements 与分发决策。

**完成标准**：darwin 就绪度清单发布；dev 版在 mac 上可启动并加载 Web Surface；账号采购清单备齐（不购买）；§7 仍待拍板的两项有结论；立项评审通过。

**止损点**：若 dev spike 暴露 DSH Runtime 本身在 darwin 有阻塞性缺陷（当前证据表明概率很低），升级为上游 issue 并重新评估范围。账号类止损项已随"个人主体 + 推迟购买"消解，本阶段不再有行政阻塞面。

---

### 阶段 1：平台适配层与可运行开发版（2–3 周）

**目标**：让应用在 macOS 开发模式下功能完整地跑起来；把"静默劣化"类缺口一次清完。

**主要工作**：
- 进程组树杀（`detached` + 负 PID + SIGKILL 升级），覆盖 runtime-controller 与 terminal-session；
- 隐性缺口清单：telemetry darwin 分类、primary-runtime-permission 对话框文案通用化（UAC → TCC 语义）、preset 禁用后缀补 `.command/.scpt/.workflow`、aionui-panel 路径大小写不敏感修正（含 fs-service）、plugin-recovery 补 mac 故障特征、安全模式的 mac 入口（菜单项 + 启动参数，替代 GetAsyncKeyState）；
- managed-git 替换：darwin 走系统 git 探测 + CLT 安装引导，git-graph 的 `git.exe/git` 分支联调；
- 生命周期：`window-all-closed` darwin 分支 + `activate` 处理 + Dock 行为；单实例与 `open-url`/`open-file` 真机验证；
- **升级 Electron 43 → 45**（在打包链改造前完成，避免二次调试）。

**完成标准**：mac dev 版完整启动：DSH 就绪 → 主窗口 → 终端 / 插件安装（真实 pnpm add）/ SSH / 任务看板 / QQ Bot 凭据（Keychain）/ 深链接手动冒烟全通过；无孤儿进程残留（Activity Monitor 验证）。

---

### 阶段 2：macOS 打包链路（2–3 周）

**目标**：产出可安装、体积合理的未签名 dmg/zip（arm64 单架构），打包校验体系对 mac 生效。

**主要工作**：
- 制作 `.icns` 图标（从现有 PNG 源图生成完整 iconset）；
- `electron-builder.yml` 新增 `mac:`/`dmg:` 节：`target:[dmg,zip]`、`arch:[arm64]`、`category`、`hardenedRuntime`、两份 entitlements plist、`LSMinimumSystemVersion`、协议与文件关联的 Info.plist 落位；
- `after-pack.cjs` 按 `electronPlatformName` 参数化（复用 `prunePackagedRuntime(target)` 既有签名），**同步反转 prebuilds 裁剪正则**（mac 包只保留 `darwin-arm64`，剔除 win32/linux 与 darwin-x64）；sharp 皮肤图压缩与 peer 恢复对 mac 生效；
- 新写 `verify-package` mac 版：`.app` bundle 结构、Info.plist 关键字段、darwin prebuilds（含 spawn-helper）、locales .lproj 路径、体积预算断言；packaged smoke mac 版。

**完成标准**：本地产出 2 个产物（arm64 的 dmg + zip）均可安装运行；`pack:verify:mac` 通过；mac 包体积与 Windows 包同数量级（裁剪生效的直接证据）。

**止损点**：arm64 单架构后不再有"砍 x64 保 arm64"这个缓冲——若某原生模块（如 ssh2 的 cpu-features）缺 `darwin-arm64` 预编译，只能自建编译或换实现，须立刻升级为独立议题（阶段 0 的依赖批量扫描正是为了提前发现它，而不是在这里才撞上）。

---

### 阶段 2.5：贡献者预览版与 G1 付费门（工程约 0.5–1 周 + 反馈窗口 1–2 周）

**目标**：把能装能跑的未签名 arm64 包交到 GitHub 贡献者手上，用真实反馈决定要不要为签名付费。这是 [§0.1](#s0-1) 决策 3 落地的阶段。

**主要工作**：
- 未签名 dmg/zip 以 GitHub **pre-release** 形式分发，标题与正文都明确标注"未签名 macOS 预览版·仅供贡献者验证"，不进官网下载位、不进普通用户可见的更新通道；
- 写《macOS 预览版安装说明》（中英双语）：`xattr -dr com.apple.quarantine /Applications/<App>.app` 与 系统设置 → 隐私与安全性 → "仍要打开" 两条路径都给，并明确写出 **macOS 15 Sequoia 起没有"右键→打开"捷径**；
- **应用内更新入口在未签名构建下显式禁用**，配文案说明"预览版不支持自动更新，请到 Release 页手动下载"——避免用户点了之后撞 Squirrel.Mac 的签名校验报错；
- 反馈闭环：一个 mac 专用 tracking issue + Issue 模板（芯片代际 / macOS 版本 / 复现步骤 / 脱敏诊断导出附件）；
- 冒烟范围（贡献者侧自检清单）：安装、首启、内置终端、插件安装（真实 pnpm add）、SSH、任务看板、系统 git 探测与 CLT 引导、深链接。

**完成标准**：约定数量的贡献者在自己的 Mac 上装起来并跑通核心路径；P0/P1 反馈清零或有明确处置；产出一份"是否继续投签名"的书面结论。

**G1 门（人工决策，本路线唯一付费决策点）**：
- 贡献者认可 → 购买 Apple Developer Program（个人主体 $99/年，当天下证），进入阶段 3；
- 反馈显示还不值得 → 停在未签名预览期继续迭代，零成本，随时可再开门。

**止损点**：若安装摩擦本身成为反馈主体（贡献者卡在 Gatekeeper 上而非产品问题），说明预览期的信息成本被低估——补文档与图文步骤，必要时提前过 G1 门用签名换取信噪比，而不是让反馈窗口空转。

---

### 阶段 3：签名与公证（1–2 周 · G1 门通过后启动）

**前置**：G1 门已通过，Apple Developer Program 账号已下证、证书与 API Key 已入库。

**目标**：产物通过 Gatekeeper：干净机器首启无"已损坏"，断网首启不被拦截。

**主要工作**：
- Developer ID 证书接入 electron-builder；entitlements 调优（allow-jit / allow-unsigned-executable-memory / disable-library-validation 起步，按需收紧）；
- 内嵌二进制逐个签名清单化：每个 `.node`、node-pty 的 `spawn-helper`、Electron 各 Helper.app——建立"签名对象清单"并在 CI 断言，杜绝漏签；
- notarytool（App Store Connect API Key）+ staple 集成；从预期的 CI 出口网络实测公证提交耗时（国内网络可用性验证）；
- `release-manifest.mjs` 新增 `verifyMacSignature`（codesign --verify --deep --strict / spctl --assess / stapler validate），产物白名单扩展 .dmg/.zip/latest-mac.yml，保持 `REQUIRE_SIGNING` 语义并在 mac 通道设为硬门禁。

**完成标准**：未装过开发工具的干净 Mac 上：下载 dmg → 安装 → 首启无警告；`spctl -a` 与 `stapler validate` 通过；签名校验进入 release-manifest 证据链。

---

### 阶段 4：自动更新链路（1–2 周）

**前置硬依赖**：阶段 3 完成。Squirrel.Mac 校验签名匹配，未签名构建下这整条链路无法启用——这也是阶段 2.5 必须禁用应用内更新入口的原因。

**目标**：Stable/Beta 双通道在 mac 上端到端可用，且更新绝不破坏用户数据与运行中会话。

**主要工作**：
- 放开 `electron-app.mjs` 更新门禁至 darwin；latest-mac.yml / beta-mac.yml 通道产物接入发布流程；
- Squirrel.Mac 全流程：后台下载 → 用户确认 → 优雅停 Runtime（复用 update-shutdown-receipt）→ quitAndInstall → 重启验证；
- 吸取 Claude Desktop 教训：更新与 `~/.dsh`、Desktop Profile、运行中 Agent 会话严格解耦，"稍后更新"与禁用开关真实生效；
- `update-mirrors` 对 mac 产物（zip/dmg）的镜像支持评估（国内 GitHub 下载慢的既有痛点）。

**完成标准**：从签名版 vX 自动更新到 vX+1 的演练在 stable 与 beta 两通道各成功一次；更新前后 `~/.dsh` 数据与任务账本完好；拒绝/延后更新路径可用。

---

### 阶段 5：macOS 原生体验深度适配（2–4 周，可与阶段 6 并行）

**目标**：关闭"一眼看出是移植品"清单；让 mac 用户感到这是为他们做的应用。

**主要工作**：
- 窗口 Chrome 重设计：`hiddenInset` + `trafficLightPosition`，自定义拖拽条/菜单条为左侧红绿灯让位（反转现在的右侧 140px 留白）；
- 应用菜单：补 `role:'appMenu'`（About/Services/Hide/Quit）与 `role:'window'`，快捷键全面走 `CmdOrCtrl` 审计；
- 托盘模板图标（深浅色菜单栏自适应）+ Dock 徽标策略；通知中心注册验证（依赖稳定 bundle id）；
- 暗色模式联动（nativeTheme）与窗口 chrome 主题同步；vibrancy 按需评估，不强上；
- TCC 权限旅程设计：Info.plist usage descriptions、文件夹访问首启引导、子进程权限实测；
- **中文输入法专项实测**：终端面板、聊天输入框、设置面板在系统拼音下的组合键与候选词窗口定位；验证自定义拖拽区（-webkit-app-region）不吞 IME 事件；
- 皮肤体系 mac 回归：Windows XP/QQ 怀旧等皮肤在 mac 字体/滚动条环境下的显示校验。

**完成标准**：HIG 自查清单通过；四条"移植品特征"（标题栏、菜单、生命周期、托盘）全部关闭；中文 IME 实测通过并留档。

---

### 阶段 6：CI/CD 与测试体系双平台化（2–3 周，可与阶段 5 并行）

**目标**：一个 tag 出双平台产物；每个 PR 双平台验证；测试资产在 mac 上真实生效。

**主要工作**：
- `desktop-ci.yml` / `desktop-release.yml` matrix 化（windows-latest + 固定版本 macos runner；macos-14+ runner 本身即 Apple Silicon，单架构无需在 matrix 内再分 arch）；workflow 内 PowerShell 内联脚本收编为跨平台 .mjs；
- 16 个 Playwright e2e 支持 `.app/Contents/MacOS/…` 可执行路径（driver 本身跨平台）；打包体 e2e 在 mac runner 上跑通核心子集；
- 108 个单测中涉及平台分支的用例补 darwin 断言（不再只靠"不崩溃"）；
- runtime-support 证据矩阵 per-platform 生成验证（mac 打包产物哈希重新生成，确认 `runtime-support:check` 在 mac 不红）；
- 迁移对话框自动化（PS1 UIAutomation）在 mac 上按裁剪决策处理：首发无迁移需求，仅保留最小替代（osascript）或跳过。

**完成标准**：PR 双平台 CI 绿且时长可接受（runner 成本有数据）；`desktop-vX.Y.Z` 单 tag 产出双平台全部产物 + 双份 manifest 证据。

---

### 阶段 7：Beta 发布与社区验证（2–4 周，Beta 周期）

**目标**：真实用户、真实设备矩阵下收敛质量；补齐插件生态与可观测性两块制度性缺口。

**主要工作**：
- Beta 通道首发 mac 版（arm64 单架构，已签名+公证；未签名预览版在此时停止分发）；QQ 群同步安装包；
- 插件兼容性 os 维度落地：schema 扩展（按 docs/schema-versioning.md 加法兼容规则）+ 扩展坞安装门禁 + 市场过滤，防止 Windows-only 插件成为 mac 用户主要故障源；
- 可观测性：接入 crashReporter 或本地崩溃日志落盘，接通既有脱敏诊断导出；遥测平台分类修正随首发生效；
- 设备矩阵测试：芯片代际（M1–M4）× 系统版本（按支持范围，至少 macOS 14/15/26）；触控板手势、Retina、深浅色切换等 Windows 从未覆盖的交互面；
- 文档：docs/desktop.md 补 macOS 章节（安装、权限、签名状态、与 Windows 版差异）、升级与回滚的 mac 语义、README 双语更新。

**完成标准**：Beta 用户反馈闭环运转 ≥2 周；关键与高优 bug 清零；崩溃采集有真实数据流入；文档就绪。

**止损点**：若某长尾功能（如 QQ Bot、特定皮肤）在 mac 上暴露深层问题，标注"已知差异"随 Stable 发布，不无限期阻塞。

---

### 阶段 8：Stable 发布与长期维护机制（1–2 周 + 常态化）

**目标**：双平台同版本号、同功能集地进入常态发版；把 mac 维护变成机制而不是激情。

**主要工作**：
- Stable 首发：双语 release notes、官网/README 更新（产品定位从"Windows 客户端"改写）、发布 runbook 文档化；
- 长期机制：Electron 大版本升级节奏（跟随支持窗口）、macOS 年度大版本 beta 期回归计划、上游 DSH 支持矩阵 per-platform 治理、双平台同步发版检查单；**若计划转公司主体，迁移必须在 mac 有真实用户前完成**（Team ID 变更断掉老用户自动更新）；
- 可选二期背书项排期：Tauri PoC 观察项；x64/universal 已定案不做，仅在出现真实 Intel 用户诉求时重新评估；mac 托管 git manifest 仅在产品坚持"内置可复现 git"时另行立项。

**完成标准**：Stable 发布且首周无 P0；后续版本双平台同 tag 同发；维护 runbook 与值守约定成文。

---

<a name="s6"></a>
## §6 关键风险与止损准则

| 风险 | 等级 | 应对 / 止损准则 |
|---|---|---|
| Apple 开发者账号行政流程 | ~~高~~ → 低·进度 | 已定案走**个人主体**（无需 D-U-N-S、当天下证）且推迟到 G1 门后购买，数周等待的风险不存在。残留约束：个人→组织迁移必须在 mac 有真实用户前完成（Team ID 变更断自动更新、Keychain 凭据失效） |
| 未签名预览期的分发摩擦：Gatekeeper 拦截 + 完全无自动更新 | 中·体验/运营 | 阶段 2.5 的安装说明双语双路径 + 禁用应用内更新入口 + 只面向贡献者不扩散到普通用户；若摩擦压过产品反馈，提前过 G1 门换信噪比 |
| arm64 单架构：Intel Mac 用户完全不支持 | 低·范围（已接受） | 已定案代价，macOS 27 弃 Intel 为背景板；同时也意味着阶段 2 少了一个缓冲阀门，`darwin-arm64` 预编译缺失将直接成为阻塞项，靠阶段 0 依赖扫描前置排查 |
| 签名黑洞：任何一个内嵌二进制漏签 → 公证失败或运行时拦截 | 高·质量 | 阶段 3 建立"签名对象清单"并在 CI 断言（遍历 .app 内全部 Mach-O 验证签名），把 pass/fail 问题变成机器检查 |
| after-pack 改造陷阱：只删 win32 早退、不反转 prebuilds 裁剪正则 → 产出"能装能启、终端不可用"的包 | 中·质量 | 阶段 2 与 verify-package mac 版同步落地，`darwin-arm64` prebuilds（含 spawn-helper）存在性作为打包断言 |
| 国内网络：notarytool 提交、Gatekeeper 在线校验、GitHub 下载速度 | 中·运营 | 阶段 3 从真实 CI 出口实测公证耗时；staple 保证断网首启可用；阶段 4 评估 update-mirrors 扩展 + 延续 QQ 群同步安装包 |
| 插件生态无 os 门禁：Windows-only 社区插件在 mac 上装完即炸 | 中·生态 | 阶段 7 的发版门槛：schema 加法扩展 + 安装拦截 + 市场过滤；同时给 plugin-recovery 补 mac 故障特征 |
| 中文 IME 与终端/拖拽区兼容性（零证据空白区） | 中·体验 | 阶段 5 专项实测；若发现拖拽区吞 IME 事件，缩小 drag region 并回归 |
| 已写好但从未验证的 darwin 分支（symlink、shell、SIGTERM 路径等） | 中低 | 不当作"已完成"——阶段 1 全部列入首批冒烟对象，阶段 6 补 darwin 断言 |
| Electron 43 EOL（2027-01） | 中低 | 阶段 1 升级到 45；以后跟随"最新 3 个大版本"支持窗口滚动 |
| Codex Connect 文档与代码矛盾（功能对齐清单口径） | 低·范围 | 阶段 0 十几分钟实测澄清；同步修正 README/docs 表述 |
| ~~DSH 沙箱无 darwin 后端~~ | 已解除 | 已验证 0.1.1-rc.1 内置 Seatbelt（`PLATFORM_CHAINS.darwin=["seatbelt"]`）；阶段 0 仅需真机冒烟确认 fail-closed 行为 |
| ~~node-pty 无 darwin 预编译~~ | 已解除 | 官方 tarball 自带 darwin-arm64/x64 的 pty.node + spawn-helper；spawn-helper 进入签名清单即可 |

### 总体止损原则

每个阶段的"完成标准"同时是检查点：达不成时的动作顺序是**缩小范围 → 降级承诺 → 推迟长尾**，而不是硬扛或推倒重来。arm64 单架构定案后，原先"随时摘掉 x64 包"那个阀门已不存在，现在的两个预设阀门是：① **G1 门可以无限期不开**——停在未签名贡献者预览期迭代不花钱、不承诺自动更新，比"先买账号再发现产品不值得"的顺序更省；② 任何单个长尾功能（QQ Bot、个别皮肤、手机远程公网隧道）都可以标注"已知差异"随后补齐。整条路线没有"押注在未解决第三方 issue 上"的环节——这正是选 A 而非 B/C 的核心收益。

---

<a name="s7"></a>
## §7 立项决策状态：已定案与仍待拍板

### 已定案（2026-08-26，详见 [§0.1](#s0-1)）

1. **Apple Developer 账号**：走**个人主体**（$99/年，无需 D-U-N-S，当天下证），且**推迟到阶段 2.5 的 G1 门之后再购买**——先做未签名贡献者预览版验证产品，认可后才付费。证书与 App Store Connect API Key 的保管人在阶段 0 定人。若未来大概率转公司主体，应在买账号那一刻直接买组织账号，避免 Team ID 变更断掉老用户的自动更新。
2. **分发渠道**：只做 Developer ID 直发（GitHub + QQ 群），**不做 Mac App Store**——MAS 强制 App Sandbox 会直接禁止 DSH 依赖的任意目录访问、无限制 spawn、内嵌可执行调用，与产品能力结构性冲突。注意跳过 MAS 省掉的是审核与 App Sandbox，省不掉那 $99/年。若产品侧未来想要 MAS 背书，需单独立项，不进本路线。
3. **Intel（x64）支持范围**：**不做**。只出 arm64 单架构，不做 universal。Intel Mac（2020 年及以前）完全不支持，Rosetta 无法反向救；背景板是 macOS 27 即将彻底弃 Intel。原计划的"社区设备画像取数"随之取消。
4. **"内置 Git"产品承诺在 mac 上的形态**：改为**系统 git 探测 + 引导 `xcode-select --install`**。不存在 MinGit for macOS，自己 vendor 一份 git 要多签一批 Mach-O，不划算；`probeSystemGit()` 已跨平台可复用。README 承诺需在 mac 章节改写为"需要系统 git，首次启动会引导安装"。

### 仍待拍板

1. **Codex Connect 宣传口径**：代码显示该插件已因上游 `llm-pi-ai` 适配器接管而退役、能力已内建，README 仍宣传独立插件——阶段 0 实测后统一口径，避免 mac 版对着一条死代码路径做"功能对齐"。
2. **贡献者预览与 Beta 的首发功能范围**：哪些长尾功能（QQ Bot、特定皮肤、手机远程公网隧道）允许以"已知差异"随首发发布；以及阶段 2.5 请多少位 / 哪些贡献者参与、G1 门通过的判定口径（几人跑通核心路径算认可）。

---

<a name="s8"></a>
## §8 方法论与材料清单

本报告由多代理工作流产出并经人工（主循环）复核关键事实：**6 个只读代码分析代理**（架构地图 / 功能清单 / Windows 依赖穷尽扫描 / DSH 运行时与插件体系 / 构建发布链路 / 可复用性量化）+ **4 个联网调研代理**（Electron-macOS / Tauri / Swift 原生 / 同类对标）并行工作，再由 **3 个独立视角评审代理**打分、**1 个完整性批判代理**查漏（其提出的 13 个缺口已全部纳入 §5–§7 或在本轮直接验证关闭）。合计约 195 万 token 的分析量，454 次工具调用，全程未修改仓库任何文件。

关键硬事实（node-pty darwin 预编译、dsh-sandbox-local 的 Seatbelt 后端、koffi 调用点、terminal darwin 分支）由主循环从 npm registry 实际解包/在仓库中直接 grep 验证，非转述。调研结论均标注一手来源（Electron/Tauri/Apple 官方文档、GitHub issue 原帖、当事团队技术博客），时效基准 2026-08-24。

> **局限性声明**：工时估算基于改造点清单的工程判断，未经与执行团队实际技能盘点对照（批判代理指出的缺口之一），建议阶段 0 由候选负责人按自身经验复核；Tauri #11934 在 2.11.5 上的状态未实测（对 A 路线无影响，仅影响观察项优先级）。
