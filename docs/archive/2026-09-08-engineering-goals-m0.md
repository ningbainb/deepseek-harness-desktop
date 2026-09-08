# 工程目标 M0 验证记录

记录日期：2026-09-08。

## 结论

本记录锁定本轮 M1 开工所需的 Runtime、SDK、机器资源、最小复现、能力边界和当前测试证据。它不是 G01-G09 的完成报告。当前 M0 的代码与本机验证条件已经具备，但“每个待办填写飞书实际 record ID”仍受飞书用户授权阻塞，因此 M0 退出条件尚未全部满足。

## 环境与资源

| 项目 | 当前值 | 说明 |
| --- | --- | --- |
| 操作系统 | Windows NT 10.0.26100.0，64 位，16 逻辑处理器 | 本轮真实 Electron 验证环境 |
| 系统 Node.js | 22.13.0 | 不满足仓库 `^22.19.0 || >=24.0.0` 约束，不用于验收 |
| 验收 Node.js | 24.19.0 | 复用 Codex 已有运行时，没有新增 Node 安装 |
| pnpm | 11.22.0 | 使用锁文件对应的仓库本地 pnpm |
| 官方 SDK | `@deepseek-ai/*` 0.1.1-rc.1 | 仅从 `node_modules` 的官方 NPM 包检查类型与导出；未写入官方源码 checkout |
| Electron | 43.4.0 | 用于桌面端真实窗口回归 |
| Playwright | 1.62.1，Chromium 151.0.7922.34 | 浏览器 worker 串行运行 |
| 物理内存 | 14,702,026,752 bytes | 系统容量快照；不是产品稳定驻留指标 |
| D 盘可用空间 | 安装前 67,597,049,856 bytes；安装及浏览器就绪后 66,725,703,680 bytes | 本轮工具链和浏览器磁盘增量约 871,346,176 bytes |

依赖安装期间保持串行。使用系统 Node 22 时，`tsdown` 的原生 TypeScript 配置加载失败；切换到 Node 24 并把对应目录置于 `PATH` 首位后安装成功。可选的 `cpu-features` 原生绑定没有编译成功，但不是当前桌面回归必需能力。没有为了通过测试删除插件、皮肤、入口或断言。

## 能力验证与采用记录

| 工作项 | 结果 | 官方或外部机制 | 依赖增量 |
| --- | --- | --- | --- |
| G01 启动与恢复 | Desktop 隔离 Profile 复现出聚合包已挂载 `@ningbainb/dsh-chat-artifacts`、但托管 Profile 未提供该包的启动失败；已补齐直接依赖、托管内置清单和工作区覆盖。官方 Host 当前环境启动到 ready，核心直接启动与修复矩阵通过。 | 继续使用官方 Runtime/Profile 和仓库现有阶段、事务修复机制，没有修改 DSH 源码。 | 仅增加现有 workspace 包的直接链接，无新外部包。 |
| G02.1 设置滚动与缩放 | resize handle 已移出可滚动 dialog，滚动条与缩放热区分别归属；真实 Electron 下包含 20 次交替滚动条拖动、移动、缩放、持久化、边界约束和 DPI=2 的测试通过。 | Electron/DOM 原生指针事件与窗口几何；无额外框架。 | 无。 |
| G02.2 图片管线 | 已拆为校验、解码、压缩、提交、失败阶段；加入文件大小、像素和边长上限，串行处理、AbortSignal、代次拒收和 URL/Canvas 清理。Chromium 主路径改为可显式 `close()` 的 ImageBitmap，旧 Image/URL 路径保留为兼容回退；捕获阶段接管大图 drop 时同步关闭原生拖放遮罩。打包应用中的坏图重试、取消重试、连续 20 次大图及大图后小图均通过。 | 借鉴 TanStack Query 请求取消文档中的 AbortSignal 生命周期机制，但保留现有状态层；继续使用官方 Conversation 草稿附件服务。 | 无；未引入 pica。 |
| G03.1/G03.2 模型一致性 | 官方 SDK 的公开客户端事件列表没有模型选择变更事件。桌面同会话窗口使用 BroadcastChannel 通知并重新读取；页面恢复可见、focus、online、打开选择器和选择成功后重新读取。以代次拒收陈旧结果，不增加常驻轮询。移动端跨设备后台即时通知仍是官方能力边界。 | 官方 Session/ModelDirectory 为真值；Web Platform BroadcastChannel 只处理同浏览器会话。 | 无。 |
| G06.4 社区插件冲突 | 官方 npm 中锁定 `dsh-paperclip@0.2.5` 及 SHA-512。实际发布的客户端在会话滚动区无条件接管文件 drop；固定浏览器复现中图片事件被取消，原生预览祖先监听器收到 0 次。已增加精确到 Desktop 3.3.0、DSH 0.1.1-rc.1、embedded Node 24.18.1 的兼容诊断。启动只检查，不自动停用或卸载；其他版本须重新验证。 | 使用现有插件兼容诊断和事务管理，不修改官方 DSH，也不把单条投诉扩展为永久禁用。 | 无；tarball 仅进入本轮隔离临时目录。 |
| G07 分层代理 | Electron fixed/NO_PROXY、407、无效 PAC 和 DNS 恢复已由受控代理覆盖。生产 `runPnpm` 以全新临时 store 安装 `dsh-paperclip@0.2.5` 时记录 50 次 CONNECT，全部为 `registry.npmjs.org:443`。 | Electron Session 负责 Desktop 网络边界；传统代理环境仅投影给协作式 Runtime 和包管理子进程，不宣称网络沙箱。 | 无；插件只进入一次性临时目录，脚本禁用，未写入 Desktop Profile。 |
| G09.1 技能发现 | 已补最小 `SKILL.md`、命名与描述规则、目录优先级、重复名称、入口符号链接与 bundle 内链接的不同限制；UI 显示有界的发现失败诊断。 | 对照 Agent Skills 规范，但仓库解析器和安全边界仍是运行时权威。 | 无。 |

开源参考均只采用机制，没有复制新的状态管理层或引入依赖。许可证和资源增量因此不产生新增包审查项。

## 当前证据

| 工作项 | 原需求定位 | 证据级别 | 2026-09-08 当前证据 | 未覆盖场景 |
| --- | --- | --- | --- | --- |
| G01 | R20、R21、R22；并保全 R04、R05、R10、R12 | 已现场验证、专项测试通过 | 官方 Host ready；Desktop 核心回归 8/8；直接启动与修复集成 10/10；DNS、更新禁用、坏插件、坏配置和 ready 超时选测 5/5；启动修复了 chat-artifacts 托管依赖缺口。Windows 打包应用通过 SSH 面板 GUI 建立 loopback 密码认证和 PTY 输入输出，完整退出重启后读取持久化主机并建立新传输，且不新增 BrowserWindow。安装器事务专项 9/9 通过，两次升级提交及第三次半安装回滚恢复了上一版本目录、注册表和外置会话；真实 3.3.0 NSIS 安装器与 blockmap 已成功编译但未执行 | 两个不同已发布安装包的连续执行仍需发布机验证；真实外部网络、服务器和凭据不由 loopback SSH 证据推断 |
| G02.1 | R24、R27 | 已现场验证 | 真实 Electron 设置窗口专项和核心门禁通过 | Windows 125%、150% 系统缩放的人工界面验收仍需测试机补充；自动化已覆盖 deviceScaleFactor=2 |
| G02.2 | R34；R14 附件子项 | 打包 Electron 专项通过 | dsh-aionui-panel 18 个测试文件，167 项通过、1 项跳过；类型检查通过。Windows 打包应用以 10,713,877 bytes、2304 x 2304 JPEG 完成 20 次连续拖放，压缩产物为 2,603,636 bytes、2048 x 2048；坏图和取消均无需刷新即可重试，大图后 266 bytes 小图仍走官方原生路径；遮罩清零，24 个对象 URL 全部撤销。Electron 活跃峰值为 1,181,204,480 bytes，第 5 至第 20 轮空闲增长 68,100,096 bytes，低于 90,898,432 bytes 预算且第 15 轮后回落 | OS Explorer 手工拖放和主观画质仍需发布测试机补充；32 MiB/3200 万像素硬边界由单测覆盖，未在低内存打包场景重复分配 20 次 |
| G03.1/G03.2 | R25；关联 R02、R06 | 专项测试通过、待设备验证 | dsh-model-preferences 4 个测试文件、10 项通过；dsh-remote-web-ui 19 个测试文件、184 项通过；三包类型检查通过 | 真实鸿蒙端和跨设备后台通知未验证 |
| G04.1-G04.3 | R15 | 打包双主体回归通过、待实体设备验证 | Desktop 直接依赖并覆盖到当前 dsh-remote-web-ui 工作区包，防止聚合包旧实现进入产物；双配对主体的 Workspace、Session、历史、发送、重命名、模型和 SSE 矩阵通过，撤销后 SSE 在 6 ms 关闭 | 两台实体设备和真实 LAN 仍需现场验收；完整本地多账户切换能力不存在 |
| G05.1-G05.4 | R03、R18、R19、R31 | 包测试、官方压缩事务测试及打包回归通过 | Memory 18/18、Personal Prompt 11/11、导入 36/36；打包态覆盖持久化、清空和损坏恢复。通用 Profile 已挂载官方压缩引擎与 `/compact`。新增 2/2 测试使用官方 SessionStore、TokenMeter 和 BasicCompactionEngine 验证摘要失败不改 surface 或原事件、原 Session 内重试成功、工具调用/结果成对进入摘要范围、压缩后续写，以及命令层无参数、无可压缩内容、成功、失败、忙碌和取消反馈 | 真实 Provider 摘要质量仍需凭据验收；不宣称模型摘要能够无损保留全部语义 |
| G06.4 | R35；R36 重复关联 | 固定版本复现与诊断测试通过 | `dsh-paperclip@0.2.5` 的 npm 完整性、客户端与宿主 bundle 哈希已记录；真实发布代码的图片 drop 复现成立；精确组合显示 `known-native-image-drop-conflict`，现有启用状态保持不变 | 新插件版本、Desktop 版本或 Runtime 版本必须另行复现后再分类 |
| G07 | R07、R17、R30 网络子项 | Electron 与真实包管理子进程路由通过 | 受控代理已覆盖 Electron fixed/NO_PROXY、407、无效 PAC、DNS 恢复；生产 `runPnpm` 以全新临时 store 安装 `dsh-paperclip@0.2.5` 时记录 50 次 CONNECT，全部为 `registry.npmjs.org:443` | 尚无配置及凭据可验证真实模型 Provider 传输；每会话禁止联网仍依赖官方工具/沙箱强制能力 |
| G08 | R29 | 官方契约测试及开发态、打包态迁移回滚专项通过 | 官方 Workspace `path` 与 Session `cwd` 均不可变；兼容流程保留旧历史和来源，创建或复用新路径 Workspace，并只让后续新 Session 使用新 cwd。缺失目标、文件目标、已关联目标、旧目录暂时丢失、禁止跨 cwd 重绑和物理回滚均由真实 API/JSONL 场景验证；开发 Electron 与 Windows `win-unpacked` 结果一致 | 原地改变既有 Workspace 路径及重绑旧 Session 仍需官方新增原子 API；物理 Git/worktree 移动和运行中任务协调不由当前 fallback 代办 |
| G09.1 | R32、R33 | 专项测试通过 | Desktop skills、conversation-skills 诊断测试通过；文档门禁通过 | 真实用户导入目录的人工可理解性验收未执行 |

功能保全门禁 `node scripts/verify-feature-baseline.mjs --check` 通过，当前识别 18 个插件、7 个内置项、14 个桌面界面和 15 个皮肤。桌面核心回归 `node apps/dsh-desktop/scripts/run-regression-e2e.mjs` 八套全部通过，最新总耗时 121.7 秒。文档门禁使用 Node 24 通过。

一次桌面启动阶段记录为：application-ready 110 ms、package-resolution 128 ms、profile-ready 78 ms、shell-ready 898 ms、runtime-ready 8,739 ms、renderer-loaded 975 ms、total-to-renderer 10,650 ms。该数值只用于本机本轮复现，不代表三轮空闲内存与启动性能基线。

在修复打包原生依赖并通过包校验后，同一台机器使用干净 Windows
`win-unpacked` 产物补测了三次冷启动和三次暖启动。冷启动
`total-to-renderer` 中位数为 10,175 ms，端到端 elapsed 中位数为
11,254.6 ms，`runtime-ready` 中位数为 8,280 ms；暖启动对应中位数为
9,803 ms、10,910 ms 和 7,801 ms。每组原始样本由
`scripts/measure-packaged-startup.mjs --iterations=3` 保留在本轮命令输出中。
这组结果是打包启动时间基线，仍不能替代三轮空闲五分钟的全进程驻留内存测量。

随后使用 `scripts/measure-packaged-memory.mjs` 完成了三轮正式驻留测量：
每轮使用全新隔离 Home，Runtime ready 后保持空闲 300 秒，每 5 秒发起一次
Windows 进程树快照，并只汇总最后 60 秒。三轮最后窗口各包含 11 个样本，
每轮进程数中位数均为 8。三个轮次中位数再取中位数后，Electron 与 DSH
完整进程树 working set 为 739,844,096 bytes（约 705.6 MiB），private bytes
为 917,565,440 bytes（约 875.1 MiB），其中 DSH Host working set 为
106,909,696 bytes（约 102.0 MiB）。完整树 working set 的三轮中位数分别为
835,366,912、739,565,568 和 739,844,096 bytes；首轮明显较高，当前证据只把
它作为冷态差异保留，不推断为泄漏。后续“增幅不超过 10%”应以相同产物、场景、
采样脚本和机器条件重新测量后比较。

G02.2 的连续图片专项使用另一条短时操作口径，不替代上述五分钟空闲基线。
首次打包测量虽已清空附件并成对撤销 URL，但第 5 至第 20 次操作的 Electron
空闲 working set 增加 144,564,224 bytes，超过当轮 98,265,907 bytes 预算，
因此保留为失败证据。改用显式关闭的 ImageBitmap 后，同场景四个分组空闲
中位数为 908,984,320、978,268,160、1,050,214,400 和 977,084,416 bytes；
第 15 轮后回落，第 5 至第 20 轮仅增加 68,100,096 bytes。完整八进程树在
第 5 与第 20 轮分别为 1,259,892,736 和 1,266,413,568 bytes。详细记录见
`docs/archive/2026-09-08-g02-image-drop.md`。

## 飞书记录定位阻塞

本地核查快照的 R01-R36 是读取顺序，不是 Base record ID。2026-09-08 通过 `lark-cli base +title-resolve` 尝试重新解析 Base 时返回 `token_missing`，当前环境没有可用的飞书用户授权。为避免把顺序号伪装成 record ID，本记录不填写虚假编号，也不自动发起设备登录。

解除条件：维护者在当前环境完成飞书用户授权后，重新读取 Base `DeepSeekharness需求收集与管理`，按标题核对并回填 G01、G02.1、G02.2、G03.1/G03.2、G09.1 对应的实际 record ID。完成该步骤前，M0 在“证据与能力已建立、记录映射受阻”状态，不能标记完全退出。

## 后续顺序

1. 在发布机用两个不同已发布版本和候选版本执行 G01 安装程序双升级及中途失败回滚；目录和注册表事务矩阵、NSIS 编译、SSH 面板挂载、输入输出和完整重启复用已有 Windows 自动化证据。
2. 在发布测试机用 OS Explorer 手工复核 G02.2 拖放和压缩画质。
3. 在真实鸿蒙设备验证 G03，同时保持“无官方模型变更事件”的能力边界说明。
4. 向官方 SDK 提交 G08 原地路径迁移、运行任务预检和原子回滚能力需求；在公开契约增加前继续使用已验证的新 Workspace fallback，不编辑官方持久化。
5. 获得飞书授权后只回填经标题核对的实际 record ID，不以 R 序号代替。
