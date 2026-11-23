# @ningbainb/dsh-llm-antigravity

[English](README.md) | 中文

## 能力

社区桌面版内置此提供商，可使用本机 Google Antigravity CLI 账号可用的模型。

## 安装

安装官方 Antigravity CLI 后，在终端运行 `agy` 或 `agy acp --login` 登录。

打开 **设置 > Web UI 插件 > Antigravity CLI (Gemini)**，刷新模型，再在模型选择器或模型路由设置中选择 **Antigravity CLI (Gemini)** 的模型。提供商默认启用，CLI 返回已登录的模型目录后即可选择模型。

## 配置

设置卡支持填写可执行文件的绝对路径、切换传输方式、设置默认推理档位和单次请求超时，以及用逗号或空格分隔额外模型 ID。自动探测会查找 PATH，Windows 下还会检查 `%LOCALAPPDATA%\agy\bin\agy.exe`。

默认传输通过 stdin 和 stdout 流式交换 NDJSON。ACP 为每次请求开启独立的 stdio 会话。两种传输都会将对话文本发送给 Antigravity，并把结构化 DSH 工具请求交回 DSH 的审批和执行流程。Antigravity 管理其已有的登录会话。

## 已知限制

图片和文件附件以文本占位符表示。可用模型和推理档位由 CLI 和登录账号决定。

## 安全模型

请使用官方可执行文件或可信的本机安装。DSH 在临时目录启动 CLI，并通过 stdin 发送提示词。插件请求严格的工具权限，并取消 ACP 权限请求。DSH 只接收结构化桥接工具请求。工具声明和返回值可包含工作区数据，请在适合发送至 Antigravity 的会话中选择此提供商。

[Antigravity 无头模式](https://antigravity.google/docs/cli/headless/) · [Antigravity ACP](https://antigravity.google/docs/cli/acp/)
