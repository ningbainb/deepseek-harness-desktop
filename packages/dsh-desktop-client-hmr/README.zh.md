# Desktop Client HMR

[English](README.md) | 中文

Desktop 自有私有适配包 `@linxin666/dsh-desktop-client-hmr` 0.1.0。显式选中本 bundle 时，由 Desktop profile 组合替换已有 `client-hmr` 行，不修改官方 SDK 文件，也不增加第二个 graph owner。SDK 依赖为公开 NPM 0.2.1-rc.2 包、Cordis 4.0.5 和 Schemastery 3.18.5。

## 安装

配合 Desktop profile 组合适配器，在 `@deepseek-ai/dsh-web-app` 之后挂载本 bundle。保留官方原始 SDK 包依赖。其 YAML 刻意保持为空：

```yaml
[]
```

SDK patch 的 name 是校验条件，不是改名操作。profile 选择必须显式启用 Desktop mapper，由其在内存中的 patch 副本上映射已有 `client-hmr` insert 项及匹配的旧包名校验。行 id、配置 namespace、保存值和禁用状态保持不变，不改写官方 SDK 或用户 patch 文件。脱离该 Desktop 组合适配时，空 YAML 本身不能替换官方 owner。

集成启动器必须在挂载自身 Root Include 之前安装公开 `loader/patch-context` hook。只替换该 Include 的 patches，其余 config 字段保持不变。caller 在 migration commit 前提供事务 patches，之后每次重组均读取当前 bundle、profile、home 和 overlay 各层。因此 hook 同时覆盖官方 HMR 初始刷新与设置触发的 reload，而非仅覆盖启动器特有的 live 分支。精确固定的 rc.2 SDK 中，ConfigEditor 先写入候选再重组，回滚时也先恢复旧文件再重组。hook 要求同步组合与准备；失败会停止后续处理，不会应用未经适配的 owner。

## 配置

公开 `Config.pollIntervalMs` schema 保持整数且至少为 1，默认 500。官方 SDK 设置表单提供此字段的实时编辑，Loader 通过正常插件生命周期应用更新。每批扫描完成后才开始下一次轮询等待，不使用固定频率 interval，不允许扫描批次重叠。

## 能力

- 最多并发四个异步 `fs.promises.stat`。本适配器不执行同步文件系统扫描。
- 每个 watch 使用官方 `artifactBaseline` 作为起点，比较 `mtimeMs`、`ctimeMs`、`size`，因此 SDK 激活与 watch 安装之间发生的写入不会被遗漏。
- 文件缺失时保留 dirty，直到文件恢复。其他观察或发布失败会在后续扫描重试；诊断不包含文件路径或异常详情。
- 每次 graph 刷新都会建立新的 watch generation。删除、替换和重新加入的行会拒绝旧 generation 的结果。未变化的行保留 dirty 状态。
- 变更 bundle 通过公开 `rebuilt` 发布，每次单项发布之间让出事件循环。revision、graph 组合和 bundle 字节仍由官方 registry 管理。
- dispose 立即取消下一次 timer 并使所有待处理工作失效，不等待无法取消的文件系统操作；晚到结果不能发布，也不能再安排扫描。

## 已知限制

SDK 公开 `rebuilt()` 在实际 revision 变化时仍会执行其自身的同步元数据读取、bundle 读取与 graph 组合。本适配器消除的是反复的全量同步扫描，不是 SDK 内所有可能的同步操作。文件系统完成耗时与变更 bundle 的发布成本仍属于外部边界。

Root Include 拦截不改变 ConfigEditor 对原始候选的校验。集成方还必须为配置写回保全原始包名 guard；仅验证 reload owner 不代表设置保存成功。

## 事件传输

唯一路由为 `/plugins/events`。通过鉴权的 GET 接收初始 graph、graph 变更和 rebuilt 通知。通过鉴权的 HEAD 返回相同事件流内容类型并结束，不订阅事件。其他方法返回 405 和 `Allow: GET, HEAD`。

- Host 只订阅公开 `onGraphChanged`、`onRebuilt` 通知并读取公开 graph。不创建 Peer，不改模块表，不安装新的模块管理器。
- 每连接遵守 `write()` 背压。已接收的帧不重复写入，后续帧排队直到 `drain`。队列超过 1 MiB 时只关闭该慢连接。写入失败或连接错误也只关闭该连接。卸载会注销路由、移除订阅并销毁所有剩余流。
- 浏览器优先通过 `__DSH_TRANSPORT__.fetch` 请求文档相对路径 `plugins/events`，否则使用浏览器 fetch。发送同源凭据与生命周期 AbortSignal，因此 `dsh-runtime://app` 不依赖原生 EventSource。
- fetch 流关闭、被拒或中断后等待 1000 ms 重连。dispose 会中止流、取消重连并禁止晚到派发。有界 SSE 解码器支持分块边界、LF、CRLF、CR、注释及多行 data。单帧限制为 1,048,576 个 UTF-16 代码单元。
- 未知字符串帧类型被忽略；无效 JSON 和已知类型的无效封装被拒绝，不记录原始内容。graph 验证及同步、reload 串行化和 release 检查仍由官方 `ctx.modules.entries.sync`、`reload` controller 负责。

## 安全模型

每个接受的 GET 或 HEAD 都先将原始请求传给真实注入 Connection 的公开 `requestRejection`。所有拒绝状态码原样保留。鉴权异常返回 503，不泄露详情。不使用伪造 Peer、payload 凭据、Host 覆写或鉴权绕过。已准入的流保留订阅直到断线或卸载，沿用按请求准入的模型；适配器不另造撤销协议。

浏览器流通过已有 shell carrier 携带同源凭据。鉴权与 cookie 交换仍由 carrier 和官方 Connection 负责，本包不实现这些能力。

## 开发与验证

```sh
pnpm test
pnpm typecheck
pnpm build
```

单测覆盖并发上限、无批次重叠、baseline 竞态、dirty 恢复、graph generation、晚到 dispose、公开 schema 边界、请求拒绝、SSE 背压、有界队列、清理、浏览器重连与严格帧准入。Host 和浏览器 TypeScript program 分离；浏览器只使用 type-only SDK 导入。构建使用仓库唯一共享预设 `shared/tsdown.client.ts`。

单元检查不代表真实 HTTP stop 延迟、Electron 行为或跨平台验收。工作区依赖安装、profile 集成与真实 Runtime 验证仍由集成方负责。

## 许可证

沿用仓库 Apache-2.0 许可证。本包是私有 workspace 包，本次变更不执行发布。
