# `@ningbainb/dsh-personal-prompt`

[English](README.md) | 中文

DeepSeek Harness 的安全个性化 Prompt Profile 插件。

插件维护带版本的 `personal-prompt` Settings namespace，并通过官方 `SystemPrompt.section` 与对应的 `SystemPrompt.variable` 注入。生效优先级固定为：`session` > `workspace` > `global`。第一阶段 UI 只开放全局和工作区，Session scope 保留在 schema 中以便未来升级。

Prompt 正文是用户数据，不是工具或策略定义。最终内容包裹在 `<user_preferences>` 数据边界中，模型可见内容上限为 8,000 字符，诊断日志不会记录正文。设置损坏、会话作用域未知、用户隔离服务不可用或会话归属为非本地用户时，安全降级为不附加 Prompt，不影响 Agent 正常工作。
