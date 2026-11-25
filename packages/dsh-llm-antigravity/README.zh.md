# @ningbainb/dsh-llm-antigravity

[English](README.md) | 中文

## 能力

社区桌面版可检测本机 Google Antigravity CLI，并通过桌面兼容层支持本机交互式 ACP。

## 安装

安装官方 Antigravity CLI 后，在终端运行 `agy` 或 `agy acp --login` 登录。

打开 **设置 > Web UI 插件 > Antigravity CLI (Gemini)**，启用集成并保存。点击 **重新检测** 查看本机 CLI 及其 ACP 能力。

## 配置

设置卡支持填写可执行文件的绝对路径、切换传输方式、设置默认推理档位和单次请求超时，以及用逗号或空格分隔额外模型 ID。自动探测会查找 PATH，Windows 下还会检查 `%LOCALAPPDATA%\agy\bin\agy.exe`。

默认通过 ACP 连接，并使用 CLI 已有的登录会话。

## 已知限制

可用模型由 CLI 和登录账号决定。设置卡显示检测结果和可用模型。桌面版普通模型后端需要独立验证按量计费凭据。

## 安全模型

请使用官方可执行文件或可信的本机安装。个人和企业 OAuth 仅限本机人工交互。CLI 可能回退到已保存的 OAuth 登录，因此桌面版限制普通模型路由、手机远程会话、省钱模式和定时任务调用 Antigravity。

[Antigravity 无头模式](https://antigravity.google/docs/cli/headless/) · [Antigravity ACP](https://antigravity.google/docs/cli/acp/)
