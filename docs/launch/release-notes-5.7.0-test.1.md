# DeepSeek Harness Desktop 5.7.0-test.1

## 中文

### 本次亮点

- ACP 工作台增加按会话选择的本机 Agent。nbfast 提供语法级大纲与搜索、带预览及版本校验的改写，以及原始终端输出的按需引用。
- 办公模式支持本机 Office 和 PDF 解析及经授权的网页提取。记忆和知识库支持中英代码混合召回、会话范围筛选与显式选定来源。
- MCP Apps 在会话内提供受控工具交互。普通 Artifact 支持离线 Mermaid 渲染与 SVG、PNG 导出。工作区检查点支持分栏差异、单文件恢复、整轮恢复和撤销。

### 验证

测试候选版以同一工作树的源码门禁、定向测试和 Windows 桌面回归记录为验收依据。受管 Git、原生扩展及可选降级随测试记录核对。macOS 和 Linux 验收由各自的原生 Runner 执行。

### 下载与校验

此候选版使用 Windows unpacked 测试目录。通过测试后更新桌面测试版的应用程序目录，测试配置、凭据与历史记录继续使用原有 `test-data`。

### 说明

检查点历史由独立对象库保存。恢复前需审查受影响文件并在桌面确认。MCP Apps 服务通过桌面 Profile 显式配置。

## English

### Highlights

- The ACP workbench selects local agents per conversation. nbfast adds code outlines, structure-aware search and rewrites with revision checks, and terminal summaries that reference their original output.
- Work Mode extracts local Office and PDF content and approved web pages. Memory and knowledge search supports mixed Chinese, English, and code queries, conversation filters, and explicitly selected sources.
- MCP Apps provide scoped interactions within a conversation. Regular artifacts render Mermaid offline and export SVG and PNG. Workspace checkpoints support split diffs, file or turn restore, and undo.

### Verification

Acceptance is based on source gates, focused tests, and the Windows Desktop regression record from this worktree. The record covers native dependencies and their applicable fallbacks. macOS and Linux acceptance uses each platform's native runner.

### Download and verification

This candidate uses the Windows unpacked test directory. After acceptance, the test application's program files are refreshed in place and continue to use the existing `test-data` for configuration, credentials, and history.

### Notice

Checkpoints keep a separate object store and require a reviewed native confirmation to restore files. MCP Apps servers are configured explicitly in the Desktop profile.
