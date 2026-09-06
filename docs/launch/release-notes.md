# DeepSeek Harness Desktop 3.3.0

## 中文

### 本次亮点

- **任意文件拖拽与智能解析入会**：支持将项目文件、配置、代码及普通文档直接拖入聊天会话。代码与文本文件（<1MB）自动识别语言并格式化为标准 Markdown 代码块插入光标处；二进制、压缩包与大型文档生成安全的引用链接；项目内文件自动转为相对路径。
- **原版图片拖放机制深度兼容与隔离**：解决通用文件拖放与原版图片附件机制冲突，精确识别纯图片拖拽与粘贴（Ctrl+V），无缝委托给原版 ComposerAttachments 与缩略图预览体系，杜绝双层遮罩冲突和非图片文件误触导致的“不支持的图片格式”报错。
- **智能图像压缩与自适应降采样引擎**：新增内存级图像预检机制，单图上限安全保护（3MB），超标大图自动按比例下采样至最高 2048px 并执行自适应分级压缩（0.85 -> 0.72 -> 0.55 -> 0.4），既防止超过后端上传尺寸限制导致发送失败，又保持图文分析的细节清晰度，小图无损直通。
- **现代化模式选择器重构**：会话顶部的模式选择器由原生系统下拉框升级为精美的悬浮式卡片菜单。提供直观的模式图标、色彩指示、功能描述与流畅的动效过渡，大幅提升沉浸感与交互体验。
- **侧边栏几何对齐与拓展坞整理**：统一侧边栏左下角在展开与折叠 Rail 视图下的布局逻辑，彻底消除 UI 抖动与位置偏差；同时将桌面端原生插件入口规整至拓展坞，视觉更协调。

### 验证

- 自动化单元测试覆盖文件拖拽分类、纯图片判断算法、尺寸比例计算与压缩保护边界（18 个测试套件，162 个单元测试全部通过）。
- 端到端回归套件覆盖窗口几何一致性、设置面板、终端、会话模式切换与拓展坞状态（6/6 E2E 套件全部通过）。
- 运行时矩阵与质量基准自动化校验通过，严格保证无冗余依赖或环境破坏。

### 下载与校验

从同一 GitHub Release 下载 DeepSeek-Harness-Desktop-Setup-3.3.0-x64.exe 与对应的 SHA256SUMS.txt。请在安装前使用 SHA-256 哈希值进行完整性校验，以确保软件包来源真实且未被篡改。

### 说明

本次更新全面优化了用户与本地文件的交互链路，无论是快速发送代码片段、附加项目文档还是大分辨率截图，均可拖入即用。DeepSeek Harness Desktop 是社区维护的开源发行版，致力于提供高效纯净的本地 AI 开发环境。

## English

### Highlights

- **Universal file drag-and-drop with smart parsing**: Users can now drag any file directly into the conversation. Text and code files (<1MB) are intelligently categorized with syntax highlighting inserted as Markdown code blocks; binary, archive, and complex documents are linked securely; workspace-relative paths are preserved automatically.
- **Native image attachment isolation & conflict resolution**: Pure image drops and clipboard pastes (Ctrl+V) are cleanly distinguished and passed to the native ComposerAttachments system with thumbnail previews, eliminating duplicate drop overlays and preventing "Unsupported image format" errors when non-image files are dropped.
- **Adaptive image compression engine**: Built-in memory-level image inspection prevents payload rejections by capping safe image sizes at 3MB. Oversized images are proportionally downscaled to at most 2048px and iteratively compressed across multiple quality steps (0.85 -> 0.72 -> 0.55 -> 0.4) while preserving text legibility; smaller images remain lossless.
- **Modern session mode switcher**: The top session mode switcher is completely redesigned from an unstyled native select into a sleek, floating pill menu with category icons, descriptive summaries, and smooth micro-interactions.
- **Sidebar alignment & extension dock refinement**: Fixed bottom-left sidebar layout drift across expanded and rail modes, and consolidated desktop native plugins into the dedicated extension dock for a clean visual hierarchy.

### Verification

- Comprehensive unit tests validate classification logic, image dimension scaling, and byte limit thresholds (18 test files, 162 unit tests green).
- End-to-end regression suites verify window chrome geometries, settings windows, terminal functionality, and extension dock interactions (6/6 E2E suites passing).
- Validated with strict runtime support matrix and code quality gatekeepers.

### Download and verification

Download DeepSeek-Harness-Desktop-Setup-3.3.0-x64.exe and SHA256SUMS.txt from official GitHub Releases. Always verify the SHA-256 checksum before running the installer to ensure complete binary integrity.

### Notice

This release streamlines local file workflows into conversational coding sessions. DeepSeek Harness Desktop is an open-source community distribution focused on delivering an efficient, reliable local AI development workspace.
