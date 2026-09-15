# DeepSeek Harness Desktop 4.0.0 Linux x64 Preview 适配计划

## 目标

在不修改 DeepSeek Harness 官方源码、不影响 Windows 正式版和 macOS arm64 Preview 的前提下，新增可独立构建和验证的 Linux x64 Preview。首批支持 Ubuntu 22.04 LTS 与 Ubuntu 24.04 LTS，发布 AppImage 和 deb 两种产物。

Linux Preview 不自动进入 Windows 正式更新通道，不宣称覆盖所有 Linux 发行版，也不在缺少真实 Ubuntu 验证时标记为可发布。

## 实现范围

### 打包链路

- 为 electron-builder 增加 Linux x64、AppImage 和 deb 配置。
- 新增只允许在 Linux 主机运行的 `pack:linux` 与 `pack:linux:dir` 命令。
- 扩展打包后裁剪和恢复逻辑，只保留 Linux x64 原生模块与 node-pty 预编译。
- Linux 包使用系统 Git，不携带 Windows MinGit。
- 清理发布目录时仅删除明确列出的 Linux 生成物和 `linux-unpacked`，保留未知文件。

### 安全与运行时

- 验证官方 `@deepseek-ai/dsh-sandbox-local` 的 Linux `bwrap -> Landlock` 降级链。
- 验证 `@deepseek-ai/node-addon-system-linux-x64`、node-pty、sharp、ripgrep、lightningcss 和 require-builtin 的 Linux 原生绑定。
- Runtime 子进程保持 POSIX 进程组退出语义，避免关闭 Desktop 后残留子进程。
- 插件、技能、会话和配置继续使用隔离的 `DSH_HOME`，打包冒烟不得写入真实 `~/.dsh`。

### 桌面集成

- 使用 Linux 原生标题栏行为，保留菜单、托盘、文件选择器和 `dsh-community` 深链接。
- deb 声明系统依赖和开发工具分类；AppImage 保持单文件分发。
- Preview 默认不启用应用内自动更新，避免不同包管理方式相互覆盖。

## 接口与产物

- 新增脚本：`pack:linux`、`pack:linux:dir`、`pack:verify:linux`、`pack:verify:linux:dir`、`pack:smoke:linux`。
- 产物：
  - `DeepSeek-Harness-Desktop-4.0.0-x86_64.AppImage`
  - `DeepSeek-Harness-Desktop-4.0.0-amd64.deb`
  - `SHA256SUMS-linux.txt`
- GitHub Actions 新增手动触发的 Linux Preview 工作流，使用 Ubuntu runner 和 Xvfb 做真实 Electron 启动冒烟。

## 测试门禁

1. 配置契约：目标架构、文件名、分类、依赖、系统 Git 边界。
2. 打包契约：Linux 原生绑定齐全，无 Windows/macOS 外来二进制，无 MinGit。
3. 隔离冒烟：临时 `userData` 与 `DSH_HOME`，真实 `~/.dsh` 前后不变。
4. 功能冒烟：Runtime 启动、会话页加载、终端启动、沙箱只读命令、插件清单读取、干净退出。
5. 共享门禁：`pnpm feature-baseline:check`、`pnpm typecheck` 和相关 Desktop 单测。
6. 真实平台：Ubuntu 22.04/24.04 至少完成一种安装产物的启动和关闭验证；未通过前只上传 CI artifact，不创建正式 Release。

## 风险与止损

- AppImage 在部分 Wayland 环境可能需要 XWayland；先以 Ubuntu 默认桌面和 Xvfb 为基线。
- Linux 发行版的 glibc、FUSE 和桌面集成差异较大，首版不承诺非 Ubuntu 兼容性。
- Landlock 能力取决于内核；不可用时必须由官方沙箱链明确降级或失败，不得静默无沙箱执行。
- 若任一原生模块无法在 Ubuntu CI 装载，停止发布并保留构建日志，不通过删除断言绕过。

## 实施顺序

1. 打包配置与命令。
2. Linux 原生模块恢复、裁剪与校验。
3. 打包冒烟和平台交互修正。
4. Ubuntu CI 与双系统版本矩阵。
5. 生成 Preview 产物、校验 SHA-256，再决定是否创建独立预览 Release。
