# Windows 本地打包与测试空间

Windows 本地测试和打包统一使用 `E:\DeepSeekHarnessDesktop-Build`。该目录专门存放 E 盘工作树、pnpm store、Electron 与 Playwright 下载、node-gyp 头文件缓存、构建缓存、临时文件、WSL 验收发行版和安装包产物。macOS、Linux 仍交给 GitHub Actions，不在 Windows 本机安装其打包依赖。

使用仓库要求的 Node `22.19+` 或 `24+`。本机用于验收的 Node `24.19.0` 可放在 `E:\DeepSeekHarnessDesktop-Build\tools\node-v24.19.0\node.exe`，环境脚本会优先选用它并校验版本；不能用系统中低于要求的 Node `22.13.0` 运行完整测试。

必须从 E 盘工作树运行测试或打包：electron-builder 的缓存与工作树跨盘时可能触发 `EXDEV`，而 D 盘工作树的 `node_modules` 仍会占用 D 盘。当前 D 盘开发工作树可继续编辑；完成并确认提交后，在 E 盘创建独立工作树，再安装依赖与打包。不要直接复制现有 `node_modules`，也不要清理未确认的旧文件。

在 E 盘工作树的 PowerShell 中点源环境脚本，然后运行命令：

```powershell
. .\scripts\use-e-build-env.ps1 -Mode test
pnpm store path
pnpm install --frozen-lockfile
pnpm feature-baseline:check
pnpm desktop:regression:e2e
```

打包前重新在同一会话中运行 `. .\scripts\use-e-build-env.ps1 -Mode package`。脚本会拒绝非 E 盘工作树，而不是退回系统盘；pnpm store、Electron 缓存和测试临时文件会位于 E 盘。安装包按 E 盘工作树的正常 `dist` 路径生成，之后可归档到 `E:\DeepSeekHarnessDesktop-Build\artifacts`。本地只验收 Windows；macOS、Linux 的打包及对应平台检查由 GitHub 工作流完成。

真实 WSL 验收临时导入独立的 `dsh-agent-acceptance` 发行版，虚拟磁盘放在 `E:\DeepSeekHarnessDesktop-Build\wsl\dsh-agent-acceptance`，不使用 Docker Desktop 的内部发行版。官方 Alpine rootfs 与 SHA-256 文件保留在 E 盘 `downloads`。验收前校验其 SHA-256，再按需导入：

```powershell
wsl.exe --import dsh-agent-acceptance E:\DeepSeekHarnessDesktop-Build\wsl\dsh-agent-acceptance E:\DeepSeekHarnessDesktop-Build\downloads\alpine-minirootfs-3.24.2-x86_64.tar.gz --version 2
node apps/dsh-desktop/scripts/verify-agent-wsl-real.mjs
```

确认测试实例没有个人数据后可执行 `wsl.exe --unregister dsh-agent-acceptance` 释放空间，避免它被 Agent 当作日常终端；验收报告保留在 E 盘 `artifacts`。
