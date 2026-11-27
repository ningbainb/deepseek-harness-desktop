# 工程架构地图与变更边界

从仓库根目录运行 `pnpm --silent architecture:map` 可以导出 JSON。报告以 pnpm 实际识别的工作区为包清单，列出每个包的目录、同名工作区依赖声明及其类别和版本约束。实际安装版本和模块身份由锁文件及 `pnpm runtime-graph:check` 校验。文件图的每条边都指向被依赖方，包含静态值导入、显式类型导入、字面量动态导入和字面量 require。报告还列出同名且函数体相同的顶层函数候选。

`pnpm architecture:check` 在 CI 中检查静态相对值导入形成的环。对插件 src 下的模块，同时纳入相对类型引用，包括手写声明、类型重导出、import() 类型查询及 import type = require()。出现环时输出闭合文件路径。扫描输入为 Git 工作目录中已跟踪及未忽略的新 JS/TS 源码，含测试；已删除文件从图中移除。常规构建输出、供应商代码和 fixtures 目录被排除，无构建步骤的工作区主入口单独纳入。计算出的模块名、跨包 SDK 注入、非相对别名与 Cordis 挂载需要结合下面的契约清单阅读。重复函数的检测范围是至少 120 个字符的具名顶层函数体；短函数、方法及异名同义实现仍需人工检查。

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
5. 两个预设插件分别发布到 npm，各自携带注册、目录同步和格式校验代码。权威源码位于 `shared/host/presets`。沿用已有生成机制可保留旧导入路径，且无需让任一插件依赖另一个插件，或给用户额外安装运行时包。CI 核对每份副本的内容和归属，并检查发布依赖及旧声明入口。
6. 输入框的行布局、键盘焦点和菜单定位由官方会话工具栏与菜单组件负责。Git 图标挂入 `conversation.input.left`，分支名进入菜单、原生提示和无障碍名称。ACP 工作台通过当前会话的原生命令入口打开，实际启动与发送仍使用 Electron 的交互证明。

依赖图中的 `duplicateFunctions` 保留所有物理重复位置。`independentDuplicateFunctions` 将同一源码和受管副本折算为一个修改位置，`mirroredDuplicateFunctions` 给出已匹配的源与目标。只有同步清单和函数体同时匹配才能折算。从另一代皮肤移植的像素绘制和行情函数仍作为独立实现列出。

变更批次、证据和需产品决策的事项记录在[治理进度与任务池](../archive/architecture-governance-5.7.md)。

## 桌面状态与插件契约的归属

| 修改内容 | 修改起点 | 契约与验证 |
| --- | --- | --- |
| 修复结果与插件归档快照 | 修复流程或归档服务定义字段，immutable-snapshot.mjs 生成只读副本 | 支持由普通记录、数组和标量组成的数据。测试验证嵌套对象身份、深冻结和源对象可修改性。 |
| 可选文件 | read-file-if-present.mjs | 路径缺失返回 undefined，其他错误向上传播。调用方决定读取 Buffer 或 UTF-8 文本、是否解析以及损坏后的恢复策略。 |
| 私有桌面 JSON | atomic-write-adapter.mjs 的 writePrivateJson | 四个使用相同编码、文件权限 0600、创建目录权限 0700 的状态存储共用该入口。视图、数据结构和更新队列由各状态所有者维护。 |
| 其他已迁移文件 | 对应的状态所有者调用适配器的 writeFileAtomic | 窗口偏好、profile 和连接器目录缓存沿用默认文件权限 0666 再应用 umask。网关、更新偏好、连接器状态/密文与 QQ 配置明确指定 0600。保持现有目录创建规则和序列化字节。 |
| 模型目录与设置选项目录 | value-mode 的 model-catalog 和 web-ui-settings 的 plugin-options-directory | 视图和加载器从数据所有者取得同一契约。原有视图子路径继续导出公开类型。 |
| Git 分支选择器 | dsh-git-graph 的 BranchChip 与 slot-contracts | 工具栏使用当前会话的工作区。切换、创建、搜索分支和打开图谱沿用原宿主接口。历史源码类型仍从原位置导出。 |
| 工作区 Git 子进程 | shared/host/workspace-git-env.ts | AionUI 和 Git 图谱分别保留执行、错误及重试策略。共享实现清除继承的仓库定位和整组索引配置变量，让 Git 使用所选目录。 |
| Profile 文件与目录项 | 桌面 profile-files.mjs | Profile 准备、隔离恢复、插件暂存与归档共用目录项存在性判定。检查保留断链，只有 ENOENT 表示缺失。事务路径另按原有平台策略刷盘，各自负责回滚次序。 |
| 首次提示与版本引导 | 桌面 version-prompt-state.mjs | 星标提示和更新引导各自串行处理自己的状态文件，共用已展示的版本历史、原子写入及认领规则。升级引导独立处理 pending 状态。 |
| 桌面主进程授权的 JSON 请求 | dsh-desktop-compat 的 desktop-json-post.ts | 会话导入和工作区文件打开在读取请求体前核验本地来源和启动令牌，分别保留 32 MiB 和 1 MiB 上限。业务校验、响应状态和工作区所有者仍由各自路由决定。 |
| Electron 源码验收中的 Host RPC | 桌面 scripts/runtime-rpc-fixture.mjs | 统一请求信封与 HTTP 状态检查。成功路径读取值，负面用例可检查宿主返回的错误；工作区创建夹具支持两种历史回包。 |
| 桌面与插件的修复路径边界 | shared/host/repair-path.mjs | 四个调用点共用词法包含检查，分别保留真实路径、链接与权限校验。 |
| 可选的 Cordis 服务查询 | shared/host/get-host-service.ts | nbfast、IM Hub、Win Control 共用运行时获取策略。插件保留自己的服务注册和不可用时的业务行为。 |
| 图片输入能力 | dsh-tool-describe-image 的 model-capability | 探测器从 Cordis 注入的 Agent 与 LLM 服务读取元数据。公开包源码子路径单独编译，以验证调用方可以只导入探测器或 Git 芯片。 |

磁盘原子替换、单个 store 的更新队列、跨进程锁和迁移日志解决不同的问题。一次替换成功仅保证读者看到完整文件。涉及读改写的所有者仍负责其原有的串行化、冲突检查或回滚。版本迁移、修复目录以及用户文件恢复保留专门的备份和故障处理。

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
