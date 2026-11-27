# 对话可视化 Artifact

[English](README.md) | 中文

`@ningbainb/dsh-chat-artifacts` 在 DSH 对话中渲染由 HTML、CSS 和 SVG 构成的自包含可视化内容。助手可用它展示架构图、报告、数据看板和交互原型。

## 能力

静态 Artifact 中的 Mermaid 源码可放在已转义的 `<pre class="mermaid">` 内。点击**在本机渲染 Mermaid**按需加载可选的本地运行时。内联 SVG 和已渲染的 Mermaid 图可从卡片导出为 SVG 或高清 PNG。

- `render_artifact` 在模型生成 HTML 时流式展示无脚本预览。回合结束后，每份 Artifact 的最新版本仍显示在助手回复下方。插件渲染器不可用时，标准工具卡片会显示简短的文本结果。
- `patch_artifact` 接收 Artifact ID 和一组按顺序执行的 `oldString`、`newString` 文本替换。每个 `oldString` 在前面的替换完成后必须恰好匹配一处。工具保存完整快照，重新打开对话后仍可选择先前版本。
- 助手根据对话前后文判断什么时候需要图解。追问同一主题时，可以更新已有图解。模型会收到当前会话的少量最近 Artifact 标识，用于找到相关图解。
- 卡片提供预览、源码和分屏视图，全屏工作区支持桌面、平板和手机宽度。预览随 DSH 主题变化。
- 桌面版生成完毕的预览会在对话里随内容调整高度。常规图表和报告跟随主对话滚动。
- 已生成完毕的 `html-live` Markdown 代码块，以及包含完整 HTML 文档的 `html` 代码块，可按需打开静态预览。
- 显式配置的服务器可通过 SEP-1865 提供 MCP Apps 卡片。表格、计数器及其他控件可调用来源服务器的工具，卡片同时提供原始工具结果与重新加载入口。

## 安装

通过标准插件加载器将包加入 DSH profile。`cordis.patch.yml` 挂载宿主插件，包元数据注册浏览器渲染器。`dsh-web-ui-all` 已同时包含两者。

## 配置

模型向 `render_artifact` 提供 HTML 片段，并可将 `mode` 设为 `static` 或 `interactive`。默认使用 `static`，回放缺少 `mode` 的已保存 Artifact 时也采用该模式。需要在生成结束后运行内联 JavaScript 的控件可使用 `interactive`。

在 Chat Artifact 的 profile 配置中设置 `mcpAppServers`。应用服务器支持 `stdio`，也可使用基于 HTTPS 或回环 HTTP 的 `streamable-http`。每个应用服务器要使用独立的名称。当前锁定的 DSH MCP 插件会丢弃普通模型工具的应用元数据，因此这里的独立连接器为每个配置服务器建立一条连接，供模型工具与交互界面共用。

```yaml
- id: chat-artifacts
  config:
    mcpAppServers:
      reports:
        transport: stdio
        command: reports-mcp
        readOnlyTools: [read_report]
```

## 安全模型

- 宿主在保存前校验 HTML，客户端在渲染前再次校验已保存的记录。记录无效时显示错误，并在有可用源码时展示长度受限的片段。
- 静态预览禁用 Artifact 自带的脚本。在受原生防护的桌面版中，生成完毕的静态预览仅允许运行宿主通过随机 nonce 授权的尺寸和主题脚本。浏览器、远程 Web 端、生成中的预览及静态导出都无需运行该脚本。生成完毕的交互预览仅在受原生防护的桌面窗口中运行。
- 交互 iframe 使用不透明源，无法访问宿主 DOM、Cookie、原生凭据、Electron IPC 或 Node API。沙箱与原生导航防护拦截弹窗和导航，内容安全策略阻止外部网络访问。浏览器存储仅保存在内存中，随当前 iframe 销毁而清除。
- `window.dshUi.sendAction(action, payload)` 需要 iframe 内的真实用户交互。卡片会显示请求供用户核对。点击**填入输入框**才会将内容加入对话草稿，发送消息仍需用户另行操作。
- 受原生防护的桌面版用双层沙箱渲染 MCP Apps，默认关闭网络。卡片可按需启用应用声明的网络来源并重载视图。宿主将资源与工具请求限定到来源服务器、会话和用户。
- 应用反向调用工具时，只有 profile 的 `readOnlyTools` 白名单和 MCP 只读声明同时满足，才可以直接执行。其他调用在运行中的回合走 DSH 单次审批。回合结束后，受防护的桌面版可弹出原生单次审批。外部链接与消息草稿各自需要确认。

## 已知限制

- HTML 片段的 UTF-8 大小上限为 512 KiB，标题上限为 160 个字符，描述上限为 500 个字符。初始预览高度为 240 至 720 像素，默认 420 像素。桌面版的预览生成后可随内容展开至 3200 像素，超出部分仍可滚动查看。
- **导出静态 HTML**下载 `.html` 预览。**复制 HTML**复制原始源码，交互 Artifact 的内联脚本也会一并复制。
- 长对话中的屏外 iframe 可能卸载。重新加载时，iframe 的内存状态会重置，已保存的 Artifact 和版本记录仍可查看。
- MCP Apps 卡片会保留原始结果，用于交互视图不可用时的回退。交互视图依赖当前桌面宿主及来源服务器，宿主重启、服务器断连或应用绑定过期后可能无法重新加载。

SEP-1865 SDK 版本与开源参考项目见 [NOTICE.md](NOTICE.md)。
