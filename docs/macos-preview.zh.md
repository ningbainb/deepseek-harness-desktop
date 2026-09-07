# macOS 未签名预览版安装说明

本文说明如何在 Apple Silicon Mac 上安装 **DeepSeek Harness Desktop** 的未签名贡献者预览包。正式 Windows 安装仍见根目录 [README.md](../README.md) 与 [desktop.md](desktop.md)。

## 适用与限制

- 只支持 Apple Silicon（arm64）。Intel Mac 不能用，Rosetta 也无法反向兼容。
- 这是未签名预览包，不是正式发行版。不上 Mac App Store。
- mac 端使用系统 Git，不内置 MinGit。若 `git --version` 不可用，请安装 Xcode Command Line Tools：`xcode-select --install`。
- 预览版没有自动更新。应用内「检查更新」会说明原因；新版本请到 [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases) 手动下载。不要用 `/releases/latest`，预发布不会出现在 Latest 里。
- macOS 15 Sequoia 起，系统已去掉「右键 -> 打开」这条捷径，只剩下面的终端命令或系统设置路径。

## 安装

1. 从 [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases) 下载 arm64 的 `.dmg` 或 `.zip`（文件名形如 `DeepSeek-Harness-Desktop-<version>-arm64.dmg`）。预览包的标题会标明未签名、仅供贡献者验证。
2. 打开 `.dmg` 把 **DeepSeek Harness Desktop.app** 拖到 `/Applications`，或解压 `.zip` 后把 `.app` 放到 `/Applications`。
3. 去掉隔离属性（下载来的未签名包几乎都会带 quarantine）：

```bash
xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness Desktop.app"
```

4. 若仍被拦截：打开 **系统设置 -> 隐私与安全性**，在被拦记录处选择 **仍要打开**。不要指望右键打开。
5. 启动 **DeepSeek Harness Desktop**。

## 贡献者自检

- 能启动，主窗口出现。
- 内置终端可用（不因缺少 `pty.node` / `spawn-helper` 退出）。
- 系统 Git 可探测；未装 CLT 时应能看到安装引导，而不是误报「没有 Git」。
- 插件安装、SSH、任务看板、深链接按你平时的用法点一遍。

## 反馈

请开 GitHub Issue，写明芯片代际、macOS 版本、复现步骤，并在应用内导出脱敏诊断附件。不要把 `.credentials.yaml`、真实 `~/.dsh` 或密钥贴进 Issue。
