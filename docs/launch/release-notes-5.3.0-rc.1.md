# DeepSeek Harness Desktop 5.3.0-rc.1

## 中文

### 本次亮点

此版本是基于官方 DSH 0.2.2-rc.3 的桌面候选版。每个平台和架构保留一个面向用户的安装包。Office 继续随包提供；共享浏览器的独立 Electron 改为按需准备，提供大小、进度、取消和重试。已启用浏览器的升级先准备资源，再替换程序。

新装采用精简默认值，升级保留现有配置与明确关闭的功能。模型协作、智能操控和桌面工具整合到相关设置及更多工具，原有入口保留跳转。上下文洞察固定为 dsh-context 0.85.1，基础记忆和回复偏好保留，高级提示词 2.2.0 默认关闭。项目经验 1.2.0 因用户隔离验证发现问题暂停新启用，原配置和文件保留。

### 验证

候选版使用迁移事务、安装回滚夹具及真实 SDK 输入验证。Windows 安装和启动、macOS 与 Linux 原生预览的验收状态以实现计划中的证据记录为准；本说明不代表这些门禁已全部通过。

### 下载与校验

体验包由本地 Windows 构建和 GitHub 原生预览工作流提供，实际文件、提交和 SHA-256 记录在交付证据中。此版本尚未正式发布，不改变稳定版官网链接。

### 说明

正式 Release 和 NPM 发布需要另行确认。请使用独立测试数据体验候选版，并保留迁移备份；回退程序和数据兼容分别验收。

## English

### Highlights

This desktop candidate uses official DSH 0.2.2-rc.3 and keeps one user installer for each supported platform and architecture. Office remains bundled. The shared browser prepares its separate Electron component on demand with size, progress, cancellation and retry controls. Upgrades prepare an enabled browser component before replacing the existing application.

Fresh installations use reduced defaults. Existing installations retain settings and explicit disabled states. Model collaboration and desktop controls move into related settings and More tools, with compatibility links retained. Context inspection is pinned to dsh-context 0.85.1. Personal memory and reply preferences remain available. Advanced prompt editing 2.2.0 starts disabled. Project experience 1.2.0 cannot be newly enabled because runtime verification found a user isolation problem; existing configuration and files are preserved.

### Verification

Migration transactions, installer rollback fixtures and actual SDK model-input checks support this candidate. The implementation plan records the current Windows acceptance and native macOS and Linux preview evidence. This document does not certify that every acceptance gate has passed.

### Download and verification

Local Windows builds and native GitHub preview workflows provide evaluation artifacts. Delivery evidence records their actual filenames, source commits and SHA-256 values. Stable website download links remain unchanged while this candidate is evaluated.

### Notice

Formal Release and NPM publication require separate confirmation. Evaluate with isolated test data and retain migration backups. Application rollback and data compatibility are verified separately.
