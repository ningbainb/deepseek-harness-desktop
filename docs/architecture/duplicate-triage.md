# 独立重复函数的归属与迁移边界

从仓库根目录运行 `pnpm --silent architecture:map`，取 `independentDuplicateFunctions`。一组以函数名、正文和文件集合标识；同名函数可能出现多组，有时函数正文只差一条注释也会分组。判定时还要追踪调用者、闭包中的常量和服务、发布入口，以及失败和卸载路径。发现时的 63 组均已逐项核对，逐组证据保存在本轮 Windows 验收目录的 `duplicate-triage.json`，含函数、文件、调用点、归属、结论、验证方式及复扫中已消失的组。

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
| 桌面 E2E 的 `rpc`、`createWorkspace`、三组 `dismissStartup` | RPC 的权威测试实现是 `runtime-rpc-fixture.mjs`，覆盖 session.list 的特殊参数、返回 envelope、HTTP 状态及业务失败。创建工作区还要校验 workspaceId 和历史回包形状。四处提示关闭逻辑匹配可见 Continue，另三处会倒查可见弹窗并核对引导正文。合并时必须保存这些选择器和等待条件，确保确认框仍由原用例操作。 |
| 直启矩阵和旧 localStorage 的 `requiredText`，打包脚本的 `run`、`fileHash`，受管 Git 的 `successfulGitSpawn` | 非空字符串判断留在各入口。macOS/Linux 可共用等待进程退出的执行器，各自负责参数、签名和原生验收。两项浏览器打包核验可共用流式 SHA-256。两项 Git 测试可共用只在测试使用的子进程替身，继续以各自的版本、信号和输出断言检验真实行为。 |

## 插件路由与状态

| 所有者与候选 | 结论和验证边界 |
| --- | --- |
| 本地浏览器路由的 `isLoopbackRequest`、`forbidden`，测试中的 `fakeCtx`、`fakeResponse`、`drive` | AionUI、Git Graph 和 SSH 都检查 socket、Host、Sec-Fetch-Site 和可选的 Origin.host。可同步这一纯谓词并保留已公开的导出。AionUI 与 Git Graph 的拒绝响应、路由模拟器可以随之迁移，原来的 JSON、原始文件、SSE 正反断言各自保留。授权、工作区许可与 SSH 操作仍由端点负责。 |
| desktop-compat 的 `isLoopbackRequest`、`readJsonBody`、`writeJson`、`sendJson` | 会话导入、工作区打开在一个包内使用同一本地请求约束、带 nosniff 的响应及桌面 capability。请求体上限分别是 32 MiB 和 1 MiB，业务解码与 token 策略归各端点。ACP 与办公连接器可共享只带 no-store 的 JSON 输出；前者保留签名原文、真实手势和会话控制，后者保留 owner 与专用 header 检查。 |
| Remote UI 与设置代理桥的 `isLoopbackHostname` | 两者都将 127/8、localhost、[::1] 归类为回环主机。Remote UI 另判 socket、配对和 API 暴露模式；设置桥检查规范 authority、同源、代理白名单和 token。此谓词不能替代严格限制 127.0.0.1 的请求级守卫。 |
| 多个独立发布插件的 `writeJson`、`sendJson`、`requireMethod`、`isPlainObject` | 实时统计、记忆、任务与 relay 的输出有 no-store 和 no-referrer；Remote、SSH、设置桥的另一组仅加 no-referrer，先序列化再写状态头。nbfast、IM Hub 与 Win Control 的设置接口使用 no-store。Pet/皮肤的 405 使用自己的 JSON 错误体；归档和导入对普通对象的原型检查后还各有校验。可以先收拢同一 Remote 包内的 JSON 写入器。跨上游 npm 包引入默认响应或校验服务会改变独立交付边界。 |
| nbfast、IM Hub 和 Win Control 的 `getHostService`、`getService`、`readSettings`，其他三个插件的 `fieldValue` | 四个运行时服务查询共用 shared/host/get-host-service.ts，按 ctx.get、属性回退、捕获异常的原顺序执行，保留旧导出。设置读取分别绑定不同文件、规范化函数、默认值和类型。`fieldValue` 只处理直接值或动态 getter，各插件决定何时读取及回退值。 |
| 客户端翻译的 `t`、`dictionary` 与会话的 `mainViewSessionId` | AionUI、图片描述以及 Pet、任务板分别用各自的键集合、词典及语言状态。Remote UI 与任务板各用 mainView 的保留计数读取当前会话。为这些短表达式增加跨包依赖的收益低。 |
| Live Stats、Dock、SSH 和任务板的 `sidebarRoot`、`newSessionButton` | shared/client/sidebar-entry-anchor.ts 定位侧栏列与新会话整行，为旧版直接子按钮保留回退。四个插件各自负责放置、清理与点击。测试覆盖空侧栏延迟挂载和新布局下的入口顺序。 |

每次迁移先确定实际受益的调用者，保留原公开路径和独立安装条件。判断相等时应核对输入输出、异常、资源清理与权限。复扫时按函数与文件集合追踪，保留在同期改动中已移除的候选，避免把新增的同名函数当作旧结论。
