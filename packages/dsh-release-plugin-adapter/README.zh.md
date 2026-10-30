# Release plugin adapter
[English](README.md) | 中文

提供原插件设置页导航、大肥鱼独立显示开关，以及只读支持路由。

## 能力

- 通过 Desktop 既有插件选项目录进入 Prompt Pilot 和共享浏览器的原设置页。
- 未保存显示偏好时默认显示全身大肥鱼，保留用户明确关闭的选择；显示期间暂停原桌宠的挂件与轮询，原桌宠的设置和数据保留。
- 为支持工具提供 `/api/desktop-release-plugins` 前置服务形状查询，不调用模型、浏览器、凭据或会话操作。

## 安装

依赖安装与 profile 组合由集成 Desktop 负责。本包 `cordis.patch.yml` 与三份原 vendor patch 一起挂载。保留 `@local/dsh-prompt-pilot@1.2.3`、`dsh-dafeiyu-pet@0.2.0`、`dsh-builtin-browser@0.4.14` 的原身份；已有 pet、AionUI 和官方浏览器行全部保留。

既有插件选项目录须将三个包 owner 对应到 `prompt-pilot`、`dsh-builtin-browser`、`release-plugin-adapter` section。导航优先使用 Dock 文档既有事件，其次使用 `selectDockSetting` preload；原生设置页使用公共 `@linxin666/dsh-desktop-client` 契约 `openDesktopSurface('extensions', { setting: 'plugin-options', plugin: owner })`。

## 配置

浏览器同源偏好 `dsh-release-plugin-adapter.dafeiyu-visible` 未设置时默认开启；已保存的 `true` 开启、`false` 关闭。不合法的值或无法读取存储时保持隐藏。读取默认值不写入偏好。跨窗口存储变更同步显示状态，隐藏不禁用 vendor Host。

Prompt Pilot 沿用原客户端的自动预测默认开启行为，保留已保存的关闭选择、模型选择和上下文预算。官方默认皮肤与这两项功能独立。

输入框下方的 Tab 轻提示与当前会话的灰色建议一起显示，采纳、隐藏、关闭预测或开始输入后一起消失。Tab 只填入草稿，用户确认后另行发送。

## 安全模型

支持路由使用已有 Connection 认证载体，只返回固定插件标识、缺失方法名和状态，不返回路径、令牌、凭据或对话数据。vendor 压缩包保留已审计原字节及包身份。

Desktop 自有 browser bootstrap 在导入 vendor host 前校验已安装包身份与版本、精确入口、marker、48 位十六进制随机令牌和 TCP 端口。浏览器子进程绕过 Desktop 初始化；沙箱和 RPC 认证仍由 vendor 保持。宿主托管环境在重启后重新校验，保留用户显式 Electron 覆盖。

## 已知限制

显示偏好按浏览器同源隔离。Desktop 导航依赖既有插件选项目录映射。支持路由只检查服务契约，不能证明浏览器窗口就绪。打包窗口启动和插件完整行为须由 Desktop 集成验收，本包单测不代表该验收已完成。

独立扩展坞设置窗口仍可修改共享显示偏好，同时抑制悬浮挂件；主对话窗口继续跟随该偏好。

关闭全身桌宠后，原桌宠按其已保存的启用设置恢复。临时显示优先级不写入原桌宠配置；原桌宠设置入口保持可用。
