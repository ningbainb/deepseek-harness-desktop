# 对话可视化 Artifact

[English](README.md) | 中文

@ningbainb/dsh-chat-artifacts 增加模型可调用的 render_artifact 工具和
官方 DSH Tool UI renderer。工具成功后，可视化内容会直接出现在对话中，
正常的助手文字仍然保留并负责解释内容。

## 范围

第一版包含：

- 带内联 CSS 和 SVG 的自包含 HTML 片段；
- 支持架构图、流程图、时间轴、比较矩阵、路线图、Dashboard、表格、
  线框图、报告和其他类型的 render_artifact 工具；
- 支持实时渲染和 Session 回放的持久化展示元数据；
- 展开/收起、查看源码、复制 HTML 和渲染失败降级；
- 长对话中的 iframe 懒加载，以及亮色/暗色主题变量。

这是一个双面插件。Host 侧注册工具和系统提示词说明，浏览器侧在官方
tool.call.toolview slot 中按 render_artifact 注册 renderer。如果浏览器
侧不可用，DSH Generic Tool Card 仍会收到简短的文本结果。

## 安全模型

Host 会在内容进入 Session 日志前拒绝危险内容。浏览器侧对回放元数据再次
校验，并且只使用以下方式渲染：

| 表面 | 策略 |
| --- | --- |
| JavaScript | 校验阶段拒绝，并使用 sandbox="" 与 script-src 'none' 禁用 |
| 网络 | 拒绝外部 URL、CSS import、表单和连接 API；CSP 使用 connect-src 'none' |
| 浏览器桥接 | 不提供 parent 访问、popup、Electron、Node 或自动下载 API |
| 资源 | 仅允许内联 CSS/SVG，以及媒体 data: 或 blob: URL |
| 恢复 | 无效元数据降级为普通错误行，并提供有上限的源码文本 |

输入是 HTML 片段，不是任意的完整文档壳。iframe 会在经过校验的片段外层
加入自己的 CSP 和主题样式。

## 限制

- HTML UTF-8 大小上限为 512 KiB。
- 请求的 frame 高度必须在 240–720 像素之间，默认值为 420。
- 标题上限为 160 个字符，描述上限为 500 个字符。
- 第一版不执行任意 JavaScript，也不加载外部库。

## 安装

通过标准插件加载器把包加入 DSH profile。cordis.patch.yml 负责挂载 Host
侧，包元数据负责告知 Web 客户端加载浏览器侧。dsh-web-ui-all 聚合包已
同时把本插件加入 patch source 和依赖。

## 后续工作

以下能力明确不在第一版范围内：

- update_artifact 和带版本的 Artifact 编辑；
- 设置页开关和 HTML 持久化操作；
- Mermaid 与受控图表 DSL renderer；
- 全屏 Artifact 工作区、导出和 conversation node。

这些能力可以复用当前的持久化 artifactId 和 keyed Tool UI 扩展，不需要
修改当前的对话协议。
