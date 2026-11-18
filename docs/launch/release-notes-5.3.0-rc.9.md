# DeepSeek Harness Desktop 5.3.0-rc.9

## 中文

### 本次亮点

桌面内核与配套 SDK 固定到官方 DSH 0.2.2-rc.4。Windows 安装包减少了已审核的第三方编译包中的 TypeScript 源文件写入。

Windows 启动内核时直接构造进程对象，减少 PowerShell 模块准备。启动诊断分别记录配置提交、SDK 启动和热重载队列完成的耗时。

覆盖安装在旧进程结束并释放文件后自动继续。旧卸载器报错时，安装窗口显示错误码和日志位置。

软件内「加入社群」、官网和项目文档使用同一份二群二维码。群号 `1129522514`。[加入 deepseekharness桌面版二群](https://qm.qq.com/q/9hrcdaEYPC)

### 验证

安装日志区分解包写入、升级提交和缓存复制。会话计时跟踪原生发送到本地模型请求。

### 下载与校验

Windows x64 本地体验包与 SHA-256 随构建记录提供。

### 说明

本包用于 Windows 本地体验。正式发布另行确认。

## English

### Highlights

Desktop pins the official DSH 0.2.2-rc.4 runtime and SDK cohort. The Windows installer omits reviewed TypeScript source copies from compiled third-party dependencies.

Windows launches the runtime with native process object constructors to reduce PowerShell module preparation. Startup diagnostics record settings commit, SDK startup, and hot-reload settlement separately.

Setup continues once previous processes exit and release installation files. If the previous uninstaller fails, the installer shows its result and the diagnostic log path.

The desktop app, website, and documentation share the supplied QR for QQ Group 2 (`1129522514`). [Join QQ Group 2](https://qm.qq.com/q/9hrcdaEYPC)

Open Help and choose Join QQ Group to find the code inside the app.

### Verification

Installation logs separate extraction, upgrade commit, and cache copy. Session timing follows the native send through to the local model request.

### Download and verification

The local build record contains the Windows x64 evaluation installer and SHA-256.

### Notice

Formal publication requires separate confirmation.
