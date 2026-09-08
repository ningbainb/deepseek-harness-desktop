# `@ningbainb/dsh-personal-prompt`

[English](README.md) | 中文

DeepSeek Harness 的安全个性化 Prompt Profile 插件。

插件维护带版本的 `personal-prompt` Settings namespace，并通过官方 `SystemPrompt.section` 与对应的 `SystemPrompt.variable` 注入。生效优先级固定为：`session` > `workspace` > `global`。第一阶段 UI 只开放全局和工作区，Session scope 保留在 schema 中以便未来升级。

Prompt 正文是用户数据，不是工具或策略定义。最终内容包裹在 `<user_preferences>` 数据边界中，模型可见内容上限为 8,000 字符，诊断日志不会记录正文。设置损坏、会话作用域未知、用户隔离服务不可用或会话归属为非本地用户时，安全降级为不附加 Prompt，不影响 Agent 正常工作。

持久化设置值遵循 `src/core/config.ts` 的 schema。下面是一个全局 Profile：

```json
{
  "version": 1,
  "enabled": true,
  "activeProfileId": "writing",
  "profiles": [
    {
      "id": "writing",
      "name": "写作偏好",
      "content": "请使用简洁中文回答。",
      "enabled": true,
      "scope": "global",
      "updatedAt": 1788796800000
    }
  ]
}
```

工作区 Profile 必须提供 `workspaceId`，会话 Profile 必须提供 `sessionId`。省略
`version` 只在读取历史设置形态时兼容，并会在使用前规范化为版本 1；持久化时执行
严格的版本 1 校验。解析时先选择最具体的匹配作用域，再优先使用该作用域内的活动
Profile；没有活动项时选择最近更新的已启用 Profile，并用稳定 ID 处理时间相同的情况。
语言或风格偏好只是提供给模型的上下文，不保证所选 Provider 一定遵守。
