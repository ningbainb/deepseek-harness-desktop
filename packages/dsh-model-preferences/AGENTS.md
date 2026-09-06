# dsh-model-preferences — 包级规则

模型目录和模型选择仍由官方 `@deepseek-ai/dsh-client-ui-model-selection` 服务负责。
本包只投影排序、置顶、供应商隐藏和最近使用记录，并通过官方 settings、slot、command
契约接入；不得复制或替换 `ModelDirectory` 的请求、generation、routable 或错误状态机。

浏览器半区只使用官方 SDK 的 type-only 导入和值导入白名单中的 UI 原语。模型身份始终
按 `{ provider, model }` 结构比较，不能把显示字符串当作权限或选择依据。
