# DeepSeek Harness Desktop 5.3.0-rc.5

## 中文

### 本次亮点

Windows 安装包裁去本版侧栏未使用的图标集，保留侧栏所需图标、两种模块格式和许可证。安装继续在所选程序盘解压和提交文件。

### 验证

体验包交付记录包含安装包校验和隔离载荷的对照计时。桌面内核使用官方 DSH 0.2.2-rc.3。

### 下载与校验

Windows x64 提供一个体验安装包。SHA-256 随本机构建记录提供。

### 说明

体验包用于本地验证，正式发布需要另行确认。

## English

### Highlights

The Windows installer omits icon sets unused by the bundled sidebar. The icon sets used by the sidebar, both module formats, and the license are retained. Setup extracts and commits the application on the selected program drive.

### Verification

The evaluation build record includes package verification and isolated payload timing. The timing separates archive extraction and writing the application files from the subsequent verification and commit. Desktop uses official DSH 0.2.2-rc.3. The Windows installer uses the existing upgrade transaction and retains the previous application backup until validation and commit succeed.

### Download and verification

The evaluation build provides one Windows x64 installer. Its SHA-256 checksum is included in the local build record.

### Notice

This is a local evaluation build. Formal publication requires separate confirmation.
