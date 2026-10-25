# Desktop 管道 WebRoute 适配器

[English](README.md) | 中文

这个私有包在不打开 TCP 监听端口的前提下，为 Desktop 本地载体保留经过审查的
`WebRoute` 注册子集。它不是 Web 部署服务器，也不会用于 Remote Gateway 模式。

已支持并验证的 API 包括精确路由与最长前缀路由注册、fallback 注册、首页注入与
转换、流式响应体、请求取消和升级路由查找。`host` 固定为 loopback，`port` 使用
哨兵值 `0`；不会创建网络 socket。

官方 `webApp.getAdvertisedUrl()` 上下文契约返回真实的桌面界面地址 `dsh-runtime://app/`，不会宣称存在 HTTP 监听端口，也不会开启浏览器跳转。

## 安全模型

私有 WebSocket 升级与 HTTP 路由使用同一官方浏览器会话 Cookie，由 Host 内部通过 Connection 的授权首页交换获取。渲染进程载荷提供的凭据会被忽略。升级处理器保留自己的 Connection 鉴权检查；适配器不会伪造 Peer 或关闭请求边界。

HTTP 流式响应使用 Node Writable 背压，缓冲高水位为 64 KiB。响应队列满时向生产者返回 `false`，只在下游实际消费后发送 `drain`，因此客户端热更新连接的有界队列在真实私有管道载体中同样有效。响应取消会终止待完成写入，不等待缺席的消费者。

此适配器是临时边界。当 `docs/architecture/transport-inventory.json` 中所有内置
JSON、资源、SSE 和双工路由都有载体无关的 owner，且对应行为契约可以在没有
`webServer` 服务的情况下通过时，即可删除此适配器。
