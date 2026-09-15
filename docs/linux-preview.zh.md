# DeepSeek Harness Desktop Linux x64 Preview

Linux 版本目前是独立预览通道，不会替换 Windows 正式版或 macOS arm64 Preview。

## 支持范围

- 架构：x86_64 / amd64
- CI 已验证系统：Ubuntu 22.04 LTS、Ubuntu 24.04 LTS
- 产物：AppImage、deb
- 更新：暂不支持应用内自动更新，请从项目 GitHub Releases 手动下载新版本

Ubuntu 22.04/24.04 已通过 GitHub Actions 中的真实打包、沙箱和 Xvfb 启动验收。实体桌面的 deb 安装与 AppImage 手工体验仍属于 Preview 用户验收范围，因此暂不宣称为 Linux 正式版。其他基于 Debian、Ubuntu 的发行版可能可以运行，但在完成真实测试前不属于已支持范围。Arch Linux、Fedora、openSUSE、Alpine 和 ARM64 当前均未验证。

## AppImage

```bash
chmod +x DeepSeek-Harness-Desktop-4.0.0-x86_64.AppImage
./DeepSeek-Harness-Desktop-4.0.0-x86_64.AppImage
```

如果系统没有 FUSE 2，可以先使用发行版的软件包管理器安装对应兼容包，或使用 AppImage 的解包运行方式。不要使用来源不明的第三方安装脚本。

## deb

```bash
sudo apt install ./DeepSeek-Harness-Desktop-4.0.0-amd64.deb
```

卸载：

```bash
sudo apt remove deepseek-harness-desktop
```

卸载应用不会主动删除 `~/.dsh` 中的用户会话、技能和插件数据。

## 安全边界

- Linux 包使用系统 Git，不携带 Windows MinGit。
- Agent 命令优先使用官方沙箱提供的 bwrap，并在可用时回退到 Landlock；两者均不可用时必须明确失败，不允许静默无沙箱执行。
- 发布前 CI 会检查 Linux 原生模块、隔离启动、真实 `~/.dsh` 零写入和 Landlock 写入拒绝行为。
- 请只从本项目 GitHub Releases 下载，并核对同一 Release 中的 SHA-256。
