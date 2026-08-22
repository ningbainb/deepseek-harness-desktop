# DeepSeek Harness Desktop 隐私政策

最后更新：2026 年 8 月 20 日

DeepSeek Harness Desktop 是社区维护的开源桌面发行版。本政策说明 3.0 发行线的 Desktop 应用和项目网站如何处理信息。

## 遥测默认关闭

Desktop 3.0 默认不配置遥测端点，不会自动采集或上传产品事件、诊断日志或安装信息。正常启动、使用、更新和退出不会向项目服务发送遥测。

项目官网不会自动上报安装包点击，安装链接保持直达 GitHub Release。官网可以读取 GitHub 公开的 Release、Star 和安装包下载计数来刷新页面；这不是向本项目上传的遥测。

## 用户主动导出的诊断包

Desktop 只会在用户确认将诊断包导出到自选位置后创建该包。导出前会显示内容清单。JSON/ZIP 包含清单和哈希，可包含有界的系统与组件版本、Runtime matrix 和 patch 评估、迁移/恢复状态、更新频道、Task/Scheduler 有界计数、安装/签名信息和有界脱敏的最近错误。

诊断包保留在用户选择的位置。Desktop 和官网不会自动接收、保存或保留它；是否先审阅并随后分享给维护者由用户决定。

## 本地优先的数据边界

对话、提示词、AI 回复、API 密钥、账号配置、工作区、文件、插件配置和个人偏好保存在设备或用户自行选择的服务中。Desktop 不会为了遥测或诊断上传它们。

当用户配置并调用模型 Provider、远程连接、QQ Bot 或其他第三方服务时，相关数据会作为用户选择的操作发送，并受该服务商自身政策约束。这不属于 Desktop 3.0 的自动遥测或诊断导出。

## 诊断包明确排除的内容

集中脱敏至少排除：

- 对话、提示词、AI 回复、会话标题、文件内容和项目内容；
- API Key、Token、Cookie、Authorization 请求头、账号凭据、密码和 SSH 私钥；
- 完整 Prompt、完整 Session History 和 Tool Result；
- 用户名、真实 Home 路径、文件路径、URL 凭据和 query、机器码、硬件序列号和长期设备标识。

脱敏会删除常见的 key、token、authorization、private key、cookie、用户目录和 URL 凭据或查询参数模式。无法被安全归类的内容不会因为诊断便利而被保留。

## 处理、保留和政策更新

因为 Desktop 和官网不会自动发送项目遥测，项目不会因正常使用或安装包点击建立个人、设备或会话级事件历史。GitHub 和用户主动选择的第三方服务会按各自政策处理连接请求。

如果用户自愿通过 Issue、邮件或其他渠道发送诊断包，应先自行审阅，且该渠道的规则适用。未来如考虑任何自动上传能力，项目会重新评估产品交互、代码和本政策；本政策不授权收集上述明确排除的任何内容。

## 联系方式

如对隐私或诊断边界有疑问，请提交 [GitHub Issue](https://github.com/ningbainb/deepseek-harness-desktop/issues)。网站公开版本见 [website/privacy.html](website/privacy.html)。
