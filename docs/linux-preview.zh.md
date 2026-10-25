# DeepSeek Harness Desktop Linux x64 Preview

[English](linux-preview.md) | 中文

Linux 仍是 Preview 平台。[Desktop 5.1.0](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0) 与 Windows x64、macOS arm64 同版发布，不代表 Linux 已成为稳定平台。运行 AppImage 或安装 deb 前，核对同 Release 的合并 `SHA256SUMS.txt` 与 `release-manifest.json`。两个公开 Linux 安装文件均已独立下载，实际字节大小、SHA-256、GitHub digest 与合并清单一致。

## 支持范围

- 架构：x86_64 / amd64
- 5.1.0 CI 已验证系统：仅 Ubuntu 22.04 LTS
- 产物：AppImage、deb
- 更新：暂不支持应用内自动更新，请从项目 GitHub Releases 手动下载新版本

Ubuntu 22.04 在提交 `eb1223ddfee78eccadd76d8022501cd1806d9d3d` 的[正式标签运行 40199647851](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40199647851)中通过原生打包、沙箱与 Xvfb 启动验证。Ubuntu 24.04 记录属于旧版本，不作为 5.1.0 验收。实体桌面的 deb 安装与 AppImage 手工体验仍属 Preview 用户验收范围。其他基于 Debian、Ubuntu 的发行版可能可用，但本版未验证；Arch Linux、Fedora、openSUSE、Alpine 和 ARM64 也未验证。安装包未签名；同号 5.1.0 本地内测包须手动下载正式包覆盖，不承诺同号自动更新。

## AppImage

```bash
chmod +x DeepSeek-Harness-Desktop-5.1.0-x86_64.AppImage
./DeepSeek-Harness-Desktop-5.1.0-x86_64.AppImage
```

如果系统没有 FUSE 2，可以先使用发行版的软件包管理器安装对应兼容包，或使用 AppImage 的解包运行方式。不要使用来源不明的第三方安装脚本。

## deb

```bash
sudo apt install ./DeepSeek-Harness-Desktop-5.1.0-amd64.deb
```

卸载：

```bash
sudo apt remove deepseek-harness-desktop
```

卸载应用不会主动删除用户会话、技能和插件数据。社区发行版默认使用 `~/.dsh-community`；历史 `~/.dsh` 数据与用户自选数据目录也应单独保留备份。

## 安全边界

- Linux 包使用系统 Git，不携带 Windows MinGit。
- Agent 命令优先使用官方沙箱提供的 bwrap，并在可用时回退到 Landlock；两者均不可用时必须明确失败，不允许静默无沙箱执行。
- 发布前 CI 会检查 Linux 原生模块、隔离启动、真实 `~/.dsh` 零写入和 Landlock 写入拒绝行为。
- 请只从本项目 GitHub Releases 下载，并核对同一 Release 中的 SHA-256。
- 已核实公开 DEB 真实载荷的 telemetry endpoint 与 `officialBuild: true`；匿名统计与退出沿用原政策，没有提交生产事件或验收生产入库。Runner 沙箱检查不代表每个 Provider、插件或外部进程均受完整约束。
