# 独立重复函数的归属与迁移边界

从仓库根目录运行 `pnpm --silent architecture:map`，取 `independentDuplicateFunctions`。一组以函数名、正文和文件集合标识；同名函数可能出现多组，有时函数正文只差一条注释也会分组。判定时还要追踪调用者、闭包中的常量和服务、发布入口，以及失败和卸载路径。发现时的 63 组均已逐项核对，逐组证据保存在本轮 Windows 验收目录的 `duplicate-triage.json`，含函数、文件、调用点、归属、结论、验证方式及复扫中已消失的组。

以 `1df4efba` 复扫，63 个独立分组中已关闭 24 个，保留 38 个，还有 1 个须原生平台复验。第 60 组已统一 Remote 包内的两个调用位置，SSH 和设置桥仍独立发布，因此该组计入保留项。

## 桌面与验收工具

| 所有者与候选 | 结论和验证边界 |
| --- | --- |
| Minecraft 两代皮肤的 `mulberry32`、`cloud`、`hill`、`tree`、`house`、`lake`、`mushroom`、`pumpkin`、`ground` | 九个函数服务于同一套种子和像素图形。V1 插件缓存画面，V2 的独立 hooks 在每次启用时绘制，停用时清理。桌面源码准备与打包都校验离线资产散列。继续保留两个可独立装载的入口。 |
| Trading 两代皮肤的 `trendOf`、`timeoutSignal`、`toNumber`、`parseTencentRow`、`classifyDirectSymbol`、`tzMinutes`、`continuousPhase`、`splitPhase`、`marketSessions`、`placeholderQuote`、`pctText`、`priceText` | 行情解析、开收市与显示的十二个算法对应。V2 只有 hooks 上下文，缺少 V1 的 Longbridge RPC 与工作区服务，走公开数据降级。若决定让两代皮肤共用构建输入，需要界定 npm 版本与桌面散列的发布次序，并测试各自的离线与卸载行为。 |
| 主窗口、扩展和兼容 preload 的 `createSubscription` | 三个沙箱入口各自固定允许的通道，剥离 Electron event 后转发 payload，并返回原监听器的解绑函数。兼容文件被外部启动器直接引用，沙箱无法 require 同目录模块。在现有直接启动契约下保留本地实现。 |
| 社区 Home 迁移与旧插件恢复的 `exists`、`writeJsonAtomic` | 恢复模块中无调用的私有 `exists` 已删除。社区 Home 的同名函数使用 `stat`，会追随链接。两种恢复日志现共用桌面原子 JSON 写入器，保留 UTF-8、换行和默认权限。状态机各自负责健康确认、回滚和重启。 |
| Profile 隔离与维护的 `pathExists`，技能导入和事务测试的 `exists`，profile 与集成测试的 `readJsonIfPresent` | Profile 维护、基线隔离、插件暂存和归档通过 `profile-files.mjs` 判断目录项是否存在或读取其元数据。悬空链接算作存在，只有 ENOENT 表示缺失。技能导入负责编排自己的目标冲突检查。文件系统测试保留独立探针，以实际磁盘结果验证暂存、还原及旧配置迁移。 |
| 桌面和修复插件的 `isWithin` | shared/host/repair-path.mjs 持有四处修复路径共同使用的词法判断，允许根目录自身。桌面与独立修复包分别随包携带。备份物化、插件工具和 incident 校验保留各自的真实路径、链接与权限检查。 |
| 桌面与遥测 Worker 的 `exactFields` | 生产者构造事件，value-mode 适配器验证输入。独立部署的 Worker 为历史 schema 2–6 保有自己的字段白名单。可复用测试载荷验证兼容性，接收方仍单独拒绝附带字段。 |
| 桌面 E2E 的 `rpc`、`createWorkspace`、三组 `dismissStartup` | RPC 的权威测试实现是 `runtime-rpc-fixture.mjs`，覆盖 session.list 的特殊参数、返回 envelope、HTTP 状态及业务失败。创建工作区还要校验 workspaceId 和历史回包形状。七个验收入口通过 dismiss-onboarding-fixture.mjs 处理启动提示。只有可见的目标弹窗及其中的确认按钮可以被点击，首次引导和恢复提示保留各自的正文匹配与等待条件。 |
| 直启矩阵和旧 localStorage 的 `requiredText`，打包脚本的 `run`、`fileHash`，受管 Git 的 `successfulGitSpawn` | 非空字符串判断留在各入口。macOS/Linux 可共用等待进程退出的执行器，各自负责参数、签名和原生验收。三个 Windows 验收脚本和一项预检测试共用 file-sha256-fixture.mjs 的流式 SHA-256。托管 Git 安装和运行时测试共用成功的子进程替身，仍各自提供预期版本，并单独模拟超时及可执行文件缺失。 |

## 插件路由与状态

| 所有者与候选 | 结论和验证边界 |
| --- | --- |
| 本地浏览器路由的 `isLoopbackRequest`、`forbidden` | 七个包从 shared/host/loopback-request.ts 同步本地来源判定，检查 socket、Host、Sec-Fetch-Site 和可选 Origin。保留原导出。知识搜索的身份、记忆和任务路由的专用请求头，以及桌面主进程的 capability 继续由各端点核验。 |
| AionUI 与 Git 图谱测试中的 `fakeCtx`、`fakeResponse`、`drive` | `ce0c9b10` 将路由注册、JSON 输出和 SSE 字符串写入捕获归到 shared/tests/host-route-fixture.ts。原始文件输出仍按 Buffer 验证，调用者继续检查拒绝响应、关闭事件及清理。两包共 38 项定向测试通过。 |
| desktop-compat 的 `isLoopbackRequest`、`readJsonBody`、`writeJson`、`sendJson` | 会话导入、工作区打开在一个包内使用同一本地请求约束、带 nosniff 的响应及桌面 capability。请求体上限分别是 32 MiB 和 1 MiB，业务解码与 token 策略归各端点。ACP 与办公连接器共用同包 src/json-response.ts，按原顺序先写 no-store 响应头再序列化。ACP 仍校验签名原文和真实手势，办公连接器仍校验 owner 与专用请求头。 |
| Remote UI 与设置代理桥的 `isLoopbackHostname` | 两者都将 127/8、localhost、[::1] 归类为回环主机。Remote UI 另判 socket、配对和 API 暴露模式；设置桥检查规范 authority、同源、代理白名单和 token。此谓词不能替代严格限制 127.0.0.1 的请求级守卫。 |
| 多个独立发布插件的 `writeJson`、`sendJson`、`requireMethod`、`isPlainObject` | 实时统计、记忆、任务与 relay 的输出有 no-store 和 no-referrer；Remote、SSH、设置桥的另一组仅加 no-referrer，先序列化再写状态头。nbfast、IM Hub 与 Win Control 的设置接口使用 no-store。Pet/皮肤的 405 使用自己的 JSON 错误体；归档和导入对普通对象的原型检查后还各有校验。Remote 配对和更新路由已迁到本包 src/json-response.ts。移动安全接口先写响应头再序列化，出错时机有别，保留原处理。SSH 与设置桥各自独立发布，同一分组继续记录三个发布位置。 |
| nbfast、IM Hub 和 Win Control 的 `getHostService`、`getService`、`readSettings`，其他三个插件的 `fieldValue` | 四个运行时服务查询共用 shared/host/get-host-service.ts，按 ctx.get、属性回退、捕获异常的原顺序执行，保留旧导出。设置读取分别绑定不同文件、规范化函数、默认值和类型。`fieldValue` 只处理直接值或动态 getter，各插件决定何时读取及回退值。 |
| 客户端翻译的 `t`、`dictionary` 与会话的 `mainViewSessionId` | AionUI、图片描述以及 Pet、任务板分别用各自的键集合、词典及语言状态。Remote UI 与任务板各用 mainView 的保留计数读取当前会话。为这些短表达式增加跨包依赖的收益低。 |
| Live Stats、Dock、SSH 和任务板的 `sidebarRoot`、`newSessionButton` | shared/client/sidebar-entry-anchor.ts 定位侧栏列与新会话整行，为旧版直接子按钮保留回退。四个插件各自负责放置、清理与点击。测试覆盖空侧栏延迟挂载和新布局下的入口顺序。 |

每次迁移先确定实际受益的调用者，保留原公开路径和独立安装条件。判断相等时应核对输入输出、异常、资源清理与权限。复扫时按函数与文件集合追踪，保留在同期改动中已移除的候选，避免把新增的同名函数当作旧结论。

## 已关闭分组的定位

编号沿用发现清单的 `initialGroup`。`closedSinceDiscovery` 保留每个原函数的调用证据、关闭提交和当前修改位置。

| 发现编号 | 治理提交 | 当前修改位置 |
| --- | --- | --- |
| 24、25 | `718b62fa` | 桌面 scripts 下的 runtime-rpc-fixture.mjs 处理 RPC；agent-workspace-navigation-fixture.mjs 负责创建工作区。 |
| 26 | `1ef396e1` | 桌面 scripts/file-sha256-fixture.mjs。 |
| 27–29 | `8f18972b` | 桌面 scripts/dismiss-onboarding-fixture.mjs。 |
| 30、31 | `a38e91c5` | community-home-migration.mjs 保留有调用方的 stat 探测；同组恢复日志的原子 JSON 写入由 atomic-write-adapter.mjs 提供。 |
| 35、37 | `4ca8027d`、`3d645fbd` | 桌面 src/profile-files.mjs 判定目录项；shared/host/repair-path.mjs 判定修复路径的词法范围。 |
| 39 | `f123f3e5` | 桌面 test/fixtures/managed-git-spawn.mjs。 |
| 41 | `152517d8` | shared/host/loopback-request.ts。 |
| 43–45 | `ce0c9b10` | shared/tests/host-route-fixture.ts，仅供仓库测试使用。 |
| 46 | `c42cab60` | desktop-compat 的 src/json-response.ts，供 ACP 和办公连接器使用。 |
| 47–49 | `945b8d12`、`152517d8` | desktop-compat 的 desktop-json-post.ts 持有带 capability 的请求处理及回包；其中的本地来源检查随后迁到 shared/host/loopback-request.ts。 |
| 50、63 | `5c8a3dad` | shared/host/get-host-service.ts。 |
| 53、61、62 | `944c2589` | shared/client/sidebar-entry-anchor.ts。 |
