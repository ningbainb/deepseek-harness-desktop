# Desktop 直接加载与零点击自动修复设计

**状态：** 已确认，进入实施规划。

**日期：** 2026-08-22。

**取代范围：** 本设计取代 `2026-08-20-desktop-repair-shell-auto-migration.md` 中“正常启动先进入 Recovery Shell”“全局迁移准入”“隔离 Profile 作为主要恢复入口”和“Repair Agent 只给建议”的产品决策；旧文档中已经实现且仍有价值的用户插件归档、事务恢复、受管 Git、安装完整性验证和日志能力继续复用。

## 一、结论

Desktop 的默认启动路径改为直接使用当前用户原有的 `DSH_HOME`、`desktop` Profile、会话存储、模型配置、插件依赖、bundle 列表和 patch，不再显示启动恢复壳，不再要求迁移确认，也不再因为插件来源、发布者、兼容性声明或版本证据而预先停用插件。

新用户只创建最新版所需的内置 Profile、内置插件和插件市场入口；已有用户只合并 Desktop 管理的内置项，所有用户依赖、用户 bundle、手工 patch 和外部链接保持启用并参与第一次真实启动。

兼容升级由每个数据存储自己的宽容读取器负责：旧格式在内存中归一化，只有用户下一次正常写入该数据时才保存为最新版格式，不再存在一个能阻断整个应用的全局迁移关卡。

只有真实启动失败后才进入自动恢复链：收集故障证据，执行一次确定性重试，必要时调用用户已经配置的默认模型运行内置 Repair Agent，在事务副本中修改用户插件或 Profile 配置，验证通过后自动应用并重启完整插件集合；没有模型、模型失败或修复仍失败时，Desktop 自动使用同一 `DSH_HOME` 的内置插件 Profile 进入应用，并只显示一条非阻塞通知。

## 二、产品原则

1. 健康启动零点击，故障恢复也默认零点击。
2. 用户原目录是事实源，不复制成另一个 Home 后再要求用户判断哪个才是真的。
3. 来源、兼容性声明和旧版本证据只用于诊断，不用于启动准入。
4. 所有已启用用户插件都先真实加载一次，不能因为扫描器猜测风险而提前删除、重装或停用。
5. 只有可观察到的技术失败才能触发修复，不能把“可能不兼容”当作失败。
6. 自动修复可以修改用户插件、用户 Profile 配置和与插件直接相关的设置，但必须先备份、在副本中验证、失败自动回滚。
7. 会话、项目内容和凭据不属于 Repair Agent 的可写范围。
8. Desktop 安装文件和内置 Runtime 二进制不交给模型修改，只允许安装完整性校验和官方更新器修复。
9. 同一故障在同一 Desktop 版本中只消耗一次自动修复预算，避免重启循环和 API 费用循环。
10. 高级诊断和人工恢复入口保留在设置中，但不出现在正常启动链上。

## 三、为什么当前方案会让用户卡住

当前 `electron-app.mjs` 在设置、Profile、Runtime 和插件处理之前无条件调用 `showStartupRecoveryShell()`，所以即使新用户也会先看到恢复界面；随后 `preflightDesktopMigrationGate()` 会读取迁移 journal、版本证据、Runtime 支持证据和插件兼容性证据，只要证据缺失、冲突或不可读就返回 `migration-preflight-blocked` 并留在恢复壳。

当前恢复路径还会创建新的隔离 `DSH_HOME`，只复制部分 Profile 和配置，不复制原会话事实源，所以用户看到的是一个没有原对话的环境，容易误判为数据丢失。

当前插件恢复在崩溃后会逐个停用可归因插件，再进入全插件安全模式，最后可能隔离整个用户加载配置；这能提高保守恢复概率，却与“全部直接加载、后台自动修复、用户不做选择”的新产品目标不一致。

当前仓库已有 `repair-state.mjs` 和 `repair-plan.mjs`，但它们只描述有限动作；旧计划中的 `repair-agent-adapter.mjs` 和 `repair-service.mjs` 尚未实现，因此现有版本没有能调用用户模型并自动修复插件代码的 Repair Agent。

## 四、目标启动状态机

| 状态 | 用户看到的内容 | Desktop 行为 | 是否点击 |
| --- | --- | --- | --- |
| `preparing` | 正常启动页 | 读取原 Home，合并最新版内置项 | 否 |
| `starting-full` | 正常启动页 | 用原 `desktop` Profile 加载全部插件 | 否 |
| `retrying-full` | 简短的“正在恢复启动”状态 | 原配置不变，停止残留进程后确定性重试一次 | 否 |
| `repairing` | 简短的“正在自动修复插件”状态 | 在内置修复 Profile 中运行 Repair Agent | 否 |
| `verifying` | 同一进度状态 | 用候选 Profile 启动探针并运行定向检查 | 否 |
| `ready-full` | 完整应用 | 验证通过的修复已应用，全部插件运行 | 否 |
| `ready-builtins` | 应用加一条非阻塞通知 | 同一 Home、内置插件 Profile、原会话仍可见 | 否 |
| `installation-repair-required` | 本地安装修复页 | 仅当 Runtime 二进制缺失或损坏时交给更新器 | 可能需要更新器系统确认 |

正常启动链不再包含 `migration-review`、`migration-blocked`、`free-shell` 或要求用户选择 Profile 的状态。

## 五、新用户和已有用户的统一规则

### 新用户

当 `profiles/desktop/package.json` 不存在时，`ensureDesktopProfile()` 创建当前内置依赖、内置 bundle、工作区文件和插件市场入口，然后直接启动；不存在“从旧版迁移”的概念，也不创建迁移 journal。

### 已有用户

当 Profile 存在时，Desktop 读取原 manifest 和 patch，将当前版本管理的内置依赖与 bundle 合并进去，同时保留所有非 Desktop 管理的依赖、bundle、`file:`、`link:`、`workspace:`、本地目录、归档包、registry 包、Git 包和用户 patch；不执行来源信任、发布者、版本声明或兼容性准入。

当前 `createDesktopProfileManifest()` 已具备保留社区依赖和 bundle 的基础，实施时要把这一语义提升为明确契约，并确保启动前不再通过 `reconcileCompatibility()` 或 Profile baseline quarantine 改写用户启用状态。

### 原插件安装来源

插件安装和插件市场只保留技术校验：包规格能否解析、依赖能否安装、包是否具有 DSH bundle 入口、Runtime 是否实际能加载；不再因为来源类型、registry 归属、发布者、兼容性声明或是否手改而拒绝用户明确安装的插件。

## 六、按存储负责的兼容读取

全局迁移被移除后，每个存储必须自己声明支持的历史格式、归一化规则和写回时机。

| 数据 | 事实源 | 读取策略 | 写回策略 | Repair Agent 权限 |
| --- | --- | --- | --- | --- |
| 会话和消息 | 原 `DSH_HOME` 会话存储 | 交给当前 DSH session persistence 的兼容读取 | 仅正常会话写入 | 只读故障计数，不读正文，不可写 |
| Desktop Profile manifest | `profiles/desktop/package.json` | 接受旧字段缺失，保留未知字段和用户项 | 内置项确有变化时事务写回 | 可在副本中修改 |
| Profile patch | `profiles/desktop/cordis.patch.yml` 和 Home patch | 保留非 Desktop 管理段，宽容处理旧空文档 | 内置 managed section 变化时事务写回 | 可在副本中修改 |
| 插件依赖和代码 | 原 Profile `node_modules` 及解析后的外部根 | 不做来源和兼容性准入，直接交给 loader | 用户安装、更新或已验证修复时写入 | 仅故障相关根，可在副本中修改 |
| 模型和 Provider 设置 | `DSH_HOME/settings.yaml` 与凭据服务 | 由 DSH 设置服务读取 | 用户设置或已验证配置修复时写入 | 可改非秘密配置，不能读取或写入秘密值 |
| Task Board ledger | Profile state 下的 v2/v3 ledger | 存储层识别 v2、归一化为当前模型 | 下一次任务变更时写当前格式 | 不可写 |
| 窗口、端口、更新通道 | Electron `userData` 小型状态文件 | 缺字段用默认值，未知字段忽略，损坏单文件回默认 | 下一次对应 UI 或端口变化时写当前格式 | 不可写 |
| 迁移 journal | `userData/migration-assistant` | 只作为历史诊断和旧回滚证据读取 | 不再由启动创建或推进 | 不可写 |

未来主版本遇到真正无法兼容的单个数据存储时，只让该功能局部降级并保留原字节，不允许再阻断 Desktop、会话列表或其他插件。

## 七、完整插件启动策略

第一次启动始终使用原 `desktop` Profile，并把所有当前启用 bundle 交给 DSH loader；兼容性扫描可以异步生成诊断锁文件，但扫描失败、声明不兼容或来源未知都不能修改 manifest。

如果 Profile package manifest 或 patch 本身无法解析，Desktop 记录真实解析错误并进入自动修复，而不是先把文件隔离成基线；如果 Runtime 已经开始但插件崩溃，保留完整错误尾部、进程退出码、加载阶段和可归因插件根供修复使用。

自动恢复不再逐个停用插件，也不把 safe mode 写回原 Profile；最终内置模式使用单独的 Desktop 管理 Profile，因此下一次启动仍会再次尝试原完整 Profile，不会留下“插件莫名其妙永久没了”的状态。

## 八、Repair Agent 架构

Repair Agent 不是普通主窗口会话，也不是旧 Repair Plan 的建议器；它是 Desktop 在真实故障后启动的一次性、无界面的内置修复 Runtime。

### 修复 Runtime

新增 host-only bundle `@linxin666/dsh-desktop-repair`，通过公开 DSH SDK 消费 `agents`、`agentDefaultModel`、`sessions` 和工具服务，不修改 DSH 官方源码。

Electron main 为每个故障创建 `userData/repair-agent/incidents/<fingerprint>/`，原子写入脱敏 job、授权文件、候选 Profile 路径和结果路径，然后使用相同 `DSH_HOME`、独立 `desktop-repair` Profile、关闭后台调度和普通 Web UI 的方式启动一次性 DSH Runtime。

修复 Profile 只包含 DSH 核心、默认模型、官方 Provider、工具基础和 `@linxin666/dsh-desktop-repair`，不会加载导致主 Runtime 崩溃的用户 bundle；因为仍使用同一 `DSH_HOME`，它能通过 DSH 服务读取用户已经配置的默认模型和 Provider 凭据，但凭据值不会写入 job、日志或模型上下文。

### 模型选择

第一选择是 `agentDefaultModel.currentSelection()` 返回的默认 provider/model；只有 provider 和 model 都非空且对应 Provider 在修复 Profile 中可用时才调用。

第一次模型调用因认证、配额、模型不存在或 Provider 不可用而失败时不重试该模型；如果设置中还有一个已配置且修复 Profile 可用的模型，可以尝试一次备用模型，随后结束模型预算。

没有已配置模型时立即跳过 Repair Agent，不弹配置向导，不阻塞进入内置模式。

### 输入和工具

模型输入包含 Desktop 版本、故障指纹、错误分类、有限长度的启动日志、原 Profile 结构、已启用插件清单、可归因插件根、相关 package manifest 和配置片段；插件源码和日志都标记为不可信数据，不能改变修复任务和工具边界。

Repair Agent 可以读取故障相关的用户插件根、Profile manifest、Profile patch 和非秘密模型配置，可以在候选副本中创建、修改、移动或删除这些文件，可以运行 Desktop 提供的构建、类型检查、包测试和候选启动探针。

Repair Agent 不能读取会话正文、项目文件、剪贴板、浏览器数据或凭据明文，不能修改 Desktop 安装目录、内置 Runtime、更新器、原会话存储和非故障相关用户目录，不能向外发送消息或安装未在原 Profile 中出现的新远程依赖。

这不是重新引入插件来源拦截；用户插件在正常启动时仍全部直接加载，上述边界只限定一个无人值守、会自动写文件的内部修复进程。

### 修复事务

修复开始前，`UserPluginArchive` 对原 Profile 受影响文件和解析后的外部插件文件建立按原始字节记录的备份、SHA-256 清单和持久 journal。

Agent 只修改候选目录；候选 Profile 使用同一 Home 下的临时 Profile 名启动，关闭后台任务，不创建用户会话，达到 Runtime ready 并通过定向测试后才允许进入应用阶段。

应用阶段重新核对原文件哈希，避免覆盖用户在修复期间发生的并发修改，然后以原子替换写入经过验证的文件并立即用原 `desktop` Profile 重启全部插件。

完整 Profile 重启失败时，Desktop 自动按 journal 恢复所有原字节并删除候选目录，然后进入内置模式；任何备份或哈希校验失败都不得应用候选修复。

### 预算和防循环

故障身份为 `Desktop 版本 + Runtime 版本 + 规范化错误 + 活跃 bundle 清单摘要` 的 SHA-256 指纹，不包含凭据、路径或会话正文。

每个指纹在同一 Desktop 版本中最多执行一次 Repair Agent 流程，最多两个模型选择，每个模型最多一个修复回合、十二次工具调用、九十秒墙钟时间和有限输入输出字节；认证、配额和参数错误不做 API 重试。

修复成功后保留结果摘要和回滚点，修复失败后记录 `exhausted`；应用升级到新 Desktop 版本后可以针对同一插件故障获得一次新的修复预算。

## 九、最终内置模式

最终降级 Profile 名为 `desktop-builtins`，由 Desktop 从当前内置清单生成，使用与正常启动相同的 `DSH_HOME` 和用户凭据服务，但不挂载用户 bundle，也不改写原 `desktop` Profile。

内置模式必须继续显示原会话和正常基础功能；主窗口加载完成后只显示一条非阻塞通知：“部分插件启动失败，已使用内置模式。下次启动会再次尝试完整配置。”通知可链接到设置中的诊断详情，但没有必须点击的按钮或模态对话框。

内置模式不是持久 safe mode；退出或下一次启动仍从 `starting-full` 开始，除非同一故障指纹已经耗尽 Repair Agent 预算，此时会跳过模型费用并在完整启动失败后快速进入内置模式。

## 十、安装文件损坏

如果 DSH CLI、内置依赖闭包、签名资源或 Runtime 完整性校验失败，模型没有可执行的可靠底座，也不能修改安装目录；Desktop 本地安装修复页保持可用，调用现有 `electron-updater` 检查和安装已签名版本。

此类故障不读取或改写用户 Profile，不调用 Repair Agent，也不伪装成插件问题；更新器不可用时允许导出诊断并保留用户数据，不能让模型下载或替换任意程序文件。

## 十一、用户界面

删除正常启动前的 Recovery Shell 展示，主窗口直接显示现有启动页；启动页只展示阶段文字和进度，不提供“隔离恢复”“复制配置”“继续迁移”“回滚迁移”等需要用户理解内部架构的按钮。

自动修复期间显示稳定状态，不弹原生确认框；修复成功直接进入完整应用，修复失败直接进入内置模式。

设置页新增“启动与修复”高级区域，展示最近故障时间、是否运行过 Repair Agent、使用的 provider/model 名称、修改文件清单、验证结果、回滚结果和日志入口；不得展示 API key、会话正文、完整提示词或模型原始思维过程。

## 十二、可观测性

本地日志记录状态转换、耗时、指纹、模型 provider/model 名称、工具动作类型、修改文件相对路径、测试结果、应用或回滚结果，不记录密钥、Authorization header、完整用户路径、会话内容或模型原始输出。

产品遥测只记录聚合事件：`direct_start_ready`、`full_start_failed`、`repair_agent_started`、`repair_agent_succeeded`、`repair_agent_failed`、`builtins_fallback_ready` 和 `installation_repair_required`，并带版本、错误类别、耗时和插件数量，不带插件源码、包私有路径和用户内容。

## 十三、发布策略

第一阶段先移除无条件恢复壳和全局迁移 gate，建立直接 Profile 合并、全部插件尝试和同 Home 内置降级，优先解决新老用户启动点击和会话错觉问题。

第二阶段接入候选 Profile、事务验证和无模型的确定性恢复协调器，确保失败不会改坏原 Profile。

第三阶段启用内置 Repair Agent 和默认模型选择，完成费用熔断、候选修复、验证、自动应用和回滚。

三个阶段可以在同一功能分支连续合入，但发布门禁必须同时通过；最终对用户发布的版本默认启用完整链路，不把 Repair Agent 留成需要用户手动打开的实验按钮。

## 十四、验收标准

1. 全新 Home 首次启动不显示恢复、迁移或权限选择界面，直接进入应用。
2. 来自真实 2.3、2.4、2.5、2.6、2.7 和 3.0.1 的 Home 不依赖人为补写 `desktopVersion` 或 `version` 字段即可启动。
3. 原会话列表和消息在完整模式与内置模式中均可见，升级和恢复过程中会话存储字节不被 Repair Agent 修改。
4. `file:`、`link:`、`workspace:`、本地目录、归档包、registry、Git 和手改插件在第一次完整启动中都保持启用并被真实尝试加载。
5. 兼容性声明缺失或不匹配只产生诊断，不改写 bundle 列表。
6. 一个可复现的用户插件语法或配置故障能触发 Repair Agent，在候选副本中修复、通过测试、自动应用并以完整插件集合启动。
7. 修复候选验证失败、原文件并发变化或完整重启失败时，所有原字节自动恢复。
8. 未配置模型、API 认证失败、配额不足、超时或模型输出无效时不弹窗、不循环扣费，应用进入同 Home 内置模式。
9. 同一故障指纹在同一 Desktop 版本中不会重复调用模型。
10. 安装文件损坏只走更新器修复，不让模型改写程序目录。
11. 所有正常与自动恢复路径都没有必须点击的按钮，唯一可能的系统确认来自安装已签名更新。
12. 打包产物通过单元测试、历史 Home 矩阵、真实插件故障注入、候选回滚、无模型降级和 Windows 安装 smoke 测试。

## 十五、明确不做

本轮不承诺模型能修复所有第三方插件，不允许 Repair Agent 修改 DSH 官方源码或 Desktop 安装二进制，不为旧迁移 UI 增加更多按钮，不复制一个新的 Home 冒充原用户环境，也不在启动前要求用户理解 Profile、bundle、journal、隔离模式或兼容性矩阵。
