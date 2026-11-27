# @ningbainb/dsh-llm-antigravity

[English](README.md) | 中文

## 能力

社区桌面版可检测本机 Google Antigravity CLI，并通过桌面兼容层支持本机交互式 ACP。

从会话的 **+** 菜单选择 **ACP 引擎**，或输入 `/acp` 打开工作台。工作台还会发现 Claude Code ACP、OpenAI Codex ACP、OpenCode 和桌面 Profile 中 `acp/agents.json` 配置的引擎。选择引擎后可以使用当前对话的输入框，也可以在 DeepSeek 对话旁打开独立的 ACP 辅助窗。模型与推理档位依据当前引擎公开的会话选项显示。

## 安装

安装官方 Antigravity CLI 后，在终端运行 `agy` 或 `agy acp --login` 登录。

打开 **设置 > Web UI 插件 > Antigravity CLI (Gemini)**，启用集成并保存。点击 **重新检测** 查看本机 CLI 及其 ACP 能力。

可用 `npm install -g @agentclientprotocol/claude-agent-acp` 或 `npm install -g @agentclientprotocol/codex-acp` 安装相应适配器。OpenCode 可通过官方安装指南或 `npm install -g opencode-ai` 安装。引擎菜单可复制这些命令，请在供应商 CLI 内登录。对于这些适配器，**诊断引擎**会在时限内完成 ACP 协商；Antigravity 与仅限人工交互的自定义引擎使用文件系统探测。既有 Antigravity 设置卡通过官方 CLI 查询模型。

## 配置

设置卡支持填写可执行文件的绝对路径、切换传输方式、设置默认推理档位和单次请求超时，以及用逗号或空格分隔额外模型 ID。自动探测会查找 PATH，Windows 下还会检查 `%LOCALAPPDATA%\agy\bin\agy.exe`。

默认通过 ACP 连接，并使用 CLI 已有的登录会话。

## 已知限制

可用模型由 CLI 和登录账号决定。设置卡显示检测结果和可用模型。桌面版普通模型后端需要独立验证按量计费凭据。

## 安全模型

请使用官方可执行文件或可信的本机安装。个人和企业 OAuth 仅限本机人工交互。CLI 可能回退到已保存的 OAuth 登录，因此桌面版限制普通模型路由、手机远程会话、省钱模式和定时任务调用 Antigravity。

ACP 路由要求通过认证的本机桌面所有者访问。在 Electron 中，仅限人工交互的引擎每次启动会话或发送提示词时，还需要对应桌面操作产生的一次性证明。外部工具可在对话内请求确认。持久授权和涉及安全的设置要求原生会话明确启用全权限无人值守。桌面 Profile 保存有大小上限、已脱敏的轮次摘要，便于切换引擎后查阅。引擎声明支持加载会话时可续用其供应商会话。

## 上游参考

客户端遵循 ACP v1（Apache-2.0）。感谢 Claude Agent ACP 0.113.0、Codex ACP 2.12.1（Apache-2.0）、OpenCode 1.19.6（MIT）的维护者，以及 Google Antigravity 提供的公开 CLI。版本链接及适配说明见 [NOTICE.md](NOTICE.md)。

[Antigravity 无头模式](https://antigravity.google/docs/cli/headless/) · [Antigravity ACP](https://antigravity.google/docs/cli/acp/)
