# Windows 本地打包与测试空间

Windows 本地开发、依赖安装、测试和打包使用 `D:\dshshequ\deepseek-harness-desktop`。共享构建目录为 `D:\dshshequ\.desktop-build`，与工作树同盘，使 pnpm store 和 node_modules 能通过硬链接复用包内容。macOS、Linux 仍交给原生 GitHub Actions，不在 Windows 本机安装其打包依赖。

在工作树的 PowerShell 中点源环境脚本，然后运行命令：

```powershell
. .\scripts\use-build-env.ps1 -Mode test
pnpm store path
pnpm install --frozen-lockfile
pnpm feature-baseline:check
pnpm desktop:regression:e2e
```

打包前在同一会话中运行 `. .\scripts\use-build-env.ps1 -Mode package`。脚本默认将构建目录放在仓库父目录的 `.desktop-build`，也支持 `-BuildRoot` 指定同盘目录；跨盘配置会被拒绝。安装包仍生成在工作树的正常 `dist` 路径。旧的 `use-e-build-env.ps1` 保留给已有 E 盘工作树，但当前本机工作使用通用脚本。

`pnpm desktop:pack` 会把环境脚本的 `ELECTRON_CACHE` 显式传给 electron-builder 的下载缓存选项，保留官方校验。直接调用 electron-builder 时也需传入 `--config.electronDownload.cache=$env:ELECTRON_CACHE`；其下载器不会自行读取 Electron 安装器使用的缓存环境变量。

使用仓库要求的 Node `22.19+` 或 `24+`。需要独立工具时，只准备 `tools\node-v24.19.0\node.exe` 和 `tools\pnpm-11.22.0`；脚本优先选用它们并检查 Node 版本。

## 空间控制

- 只安装锁文件声明的当前项目依赖，保留构建和测试所需的开发依赖，不用 `--prod` 省略验证工具。
- pnpm store、pnpm/npm 缓存、Electron、electron-builder、node-gyp 和 Playwright 缓存共用 `.desktop-build`；不为每个工作树重复下载。
- 仅按当前 Windows 检查需要安装浏览器或原生工具，不预装其他平台资源、WSL 发行版或整个浏览器集合。
- 不复制已有 node_modules、旧安装包、旧工作树或整份 E 盘缓存；E 盘旧数据保持原状。
- 临时文件进入 `.desktop-build\temp`，验证报告进入 `.desktop-build\artifacts`。清理仅针对已确认无用的当前任务产物，不自动清理共享 store、历史数据或用户安装目录。

本地只验收 Windows；macOS、Linux 的测试、打包和启动验收以对应原生 GitHub Actions 日志与产物为准。
