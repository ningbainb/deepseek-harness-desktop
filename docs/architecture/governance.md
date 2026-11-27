# 工程架构地图与变更边界

从仓库根目录运行 `pnpm --silent architecture:map` 可以导出 JSON。报告以 pnpm 实际识别的工作区为包清单，列出每个包的目录、同名工作区依赖声明及其类别和版本约束。实际安装版本和模块身份由锁文件及 `pnpm runtime-graph:check` 校验。文件图的每条边都指向被依赖方，包含静态值导入、显式类型导入、字面量动态导入和字面量 require。报告还列出同名且函数体相同的顶层函数候选。

`pnpm architecture:check` 在 CI 中检查静态相对值导入的环，并输出闭合路径。扫描输入为 Git 工作目录中已跟踪及未忽略的新 JS/TS 源码，含测试；已删除文件从图中移除。常规构建输出、供应商代码和 fixtures 目录被排除，无构建步骤的工作区主入口单独纳入。计算出的模块名、跨包 SDK 注入、非相对别名与 Cordis 挂载需要结合下面的契约清单阅读。重复函数的检测范围是至少 120 个字符的具名顶层函数体；短函数、方法及异名同义实现仍需人工检查。

## 从需求找到所有者

| 修改的概念 | 权威位置与调用方向 | 验证入口 |
| --- | --- | --- |
| 客户端界面与样式 | 插件 client 半区消费官方 slot、locale 与主题；共享设置卡片来自 shared/client/settings，发布用副本由脚本同步 | sync-shared:check、对应插件 Vitest、skin-center:check |
| 业务规则 | 插件 core 持有纯规则，host 适配官方服务，client 负责交互；任务、记忆、模型选择按插件归属 | 各包 tests、feature-baseline:check |
| API 与通道 | Electron preload、IPC、私有管道和远程 LAN 网关分别有独立边界；请求、响应、调用面、取消策略与认证主体由 transport 清单登记 | docs:check、插件路由与隔离测试 |
| 状态与持久化 | runtime 拥有会话和工作区；用户范围插件管理 principal；桌面壳持有窗口偏好；移动页面持有导航和实时订阅 | data-ownership 清单、迁移测试、移动视图测试 |
| 数据访问与缓存 | 移动 api.ts 负责 RPC，mux.ts 管理事件连接，messages.ts 折叠事件；模型目录由提供方查询和刷新 | 移动 API、mux、消息折叠及模型目录测试 |
| 配置与环境 | package.json、锁文件、aggregate.yml、profile 组合分别负责声明、解析、挂载与启动配置；Windows 缓存和临时路径从 use-build-env.ps1 设置 | aggregate:check、runtime-support:check、runtime-graph:check |
| 错误与重试 | api-retry-policy.mjs 负责缺省 API 重试；移动 rpc.ts 区分传输与服务异常，views/presentation.ts 提供显示文案 | 重试策略单测、移动端错误及取消测试 |
| 日志与可观测性 | log-store.mjs 负责桌面日志，telemetry-config.mjs 和 telemetry-client.mjs 负责遥测配置与传送，启动计时单独采集 | desktop/test 下的日志、遥测和启动测试 |
| 权限与身份 | 主 runtime 权限、renderer 权限、OS 凭据、远程配对和插件资源所有权分别在各自信任边界执行 | transport 中的 authPrincipal、远程 gate 和 isolation 测试 |
| 名称与目录 | npm name 是包标识，目录和安装位置由 pnpm 提供；新插件和宿主/客户端半区遵循 packages/AGENTS.md | 导出的 packages 图、包级类型检查、dsh-imports:check |
| 公共基础设施 | shared/tsdown.client.ts 管构建预设，family-package-manifests.mjs 管插件家族清单发现 | 发布、文档、链接、质量和运行时图测试 |
| 测试与交付 | 插件构建与单测、结构门禁、源码 Electron E2E、原生平台打包分层执行。发布验收以原生作业为准 | 根 verify、desktop:regression:e2e、三端 release 工作流 |

状态模式、标识映射及回滚范围见[状态所有权清单](data-ownership.json)。传输与原生依赖另有[接口清单](transport-inventory.json)及[原生能力清单](native-dependency-inventory.json)。官方 runtime 与桌面壳的历史边界见[Runtime 决策](desktop-4-runtime-boundary.md)。

## 架构决策

1. 发布版本检查和制品收集需要相同的完整清单，profile 链接另有 scope 筛选，审计只遍历实体目录。六个命令共用清单发现，保留各自排序、解析及报错语义。aggregate.yml 是另一种挂载标记，缺失 package.json 的聚合目录仍需被发现，因此聚合工具继续从标记出发。
2. 安装时由 pnpm 拒绝它识别的工作区循环；源码级静态环由 TypeScript AST 检查。引入新的包级依赖前，可沿报告中的导入路径找到已有的反向依赖。类型引用、动态加载与运行时服务注入有不同的初始化语义，分别记录。
3. 移动 App 持有导航和 MuxClient 生命周期，三个视图直接消费 API 和展示函数。将查询留在根组件再向下传递会扩大视图参数。将共享操作放回已有 API 后，子视图可独立测试。包通过 src 子路径导出源码，因此 App.tsx 继续导出旧名称，内部调用方已完成迁移。
4. 路由清单必须指向仓库实际存在的文件或目录。兼容跨包复合路由的多个来源以及显式的官方 SDK 包引用。缺失迁移测试、失效本地源路径和缺少所有者均会使门禁失败。

变更批次、证据和需产品决策的事项记录在[治理进度与任务池](../archive/architecture-governance-5.7.md)。

## 5.7 三个 Wave 的所有者

| 功能 | 修改起点 | 必须保留的跨边界契约 |
| --- | --- | --- |
| nbfast | packages/dsh-fast-ops | 对外显示名、旧名搜索、工具 ID、修订校验及长输出引用分属不同兼容契约。 |
| ACP | dsh-desktop-compat/src/acp 与 dsh-llm-antigravity/src/client | 按会话选择引擎；Antigravity 的启动与发送需要主窗口真实用户操作。 |
| 文档摄取 | dsh-doc-ingest；附件入口在 dsh-aionui-panel | 文档提取负责边界和大小校验，内容经用户批准才能进入知识库。 |
| 本地搜索 | dsh-local-search；交互入口在 dsh-memory | SQLite 索引按身份隔离，工作区和日期约束由查询执行，向量后端按配置选择。 |
| MCP Apps 与图表 | dsh-chat-artifacts | iframe 消息、来源服务及当前会话绑定，写回调要经过审批。 |
| 工作区检查点 | dsh-checkpoints；消费者包括 Agent、ACP、nbfast、MCP Apps | 独立对象库、预览修订校验及恢复前原生确认。 |

各 Wave 的实现与验收范围见[5.7 测试版说明](../launch/release-notes-5.7.0-test.1.md)。
