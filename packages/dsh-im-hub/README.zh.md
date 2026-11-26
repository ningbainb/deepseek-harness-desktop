# dsh-im-hub

[English](README.md) | 中文

## 能力

面向 DeepSeek Harness 社区桌面版提供零重依赖的 4 通道国内 IM 远程接入中心（**飞书 WS 长连接**、**钉钉 Stream**、**企业微信群机器人/自建应用回调**、**通用 HMAC Webhook**），内置统一语义核心、会话串行队列、控制指令（`/new`、`/stop`、`/status`、`/workspace`、`/approve`、`/reject`、`/help`）以及与桌面端并行抢占的双端工具审批机制，且与内置 QQ 机器人（`@tencent-connect/dsh-qqbot`）独立共存、互不冲突。

## 致谢与来源

统一语义核心与轻量原生适配器架构借鉴并创造性转化自 [`xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im)（MIT 协议），精简去除了重型原生依赖，纯 Node 24 ESM 原生融入桌面端。
