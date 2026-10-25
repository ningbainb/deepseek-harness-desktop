# macOS unsigned preview install guide

English | [中文](macos-preview.zh.md)

This page covers installing the unsigned contributor preview of **DeepSeek Harness Desktop** on Apple Silicon. Official Windows install steps remain in the root [README.en.md](../README.en.md) and [desktop.md](desktop.md).

## Scope and limits

- Apple Silicon (arm64) only. Intel Macs are not supported; Rosetta cannot run an arm64 build.
- Desktop 5.1.0 requires **macOS 13 Ventura or later**, because [Electron 44 removes macOS 12 support](https://www.electronjs.org/blog/electron-44-0#removed-macos-12-support). This is a compatibility floor, not evidence that every supported macOS version was tested. Native arm64 packaging, integrity and launch smoke passed in [formal tag run 40199647851](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40199647851) at `eb1223ddfee78eccadd76d8022501cd1806d9d3d`.
- This is an unsigned preview, not a stable distribution, and it is not on the Mac App Store.
- macOS uses the system Git. MinGit is not bundled. If `git --version` fails, install Xcode Command Line Tools with `xcode-select --install`.
- Preview builds have no in-app auto-update. **Help > Check for Updates** explains this. Download the matching version from [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases). A three-platform release includes macOS Preview assets alongside Windows and Linux; the release being marked Latest does not make the macOS package a stable or signed build.
- Starting with macOS 15 Sequoia, Apple removed the **Right-click > Open** bypass. Use the Terminal command or System Settings path below.

## Install

1. Download the arm64 `.dmg` or `.zip` from [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases) (name like `DeepSeek-Harness-Desktop-<version>-arm64.dmg`). Verify the asset against the release checksum receipt before opening it. macOS assets remain unsigned, unnotarized previews even when included in a three-platform release.
2. Open the `.dmg` and drag **DeepSeek Harness Desktop.app** to `/Applications`, or unzip the `.zip` and move the `.app` into `/Applications`.
3. Clear the quarantine attribute (downloaded unsigned apps almost always have it):

```bash
xattr -dr com.apple.quarantine "/Applications/DeepSeek Harness Desktop.app"
```

4. If Gatekeeper still blocks it: open **System Settings > Privacy & Security** and choose **Open Anyway**. Do not expect a right-click Open shortcut.
5. Launch **DeepSeek Harness Desktop**.

The [5.1.0 DMG and ZIP](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0) are public; both were independently downloaded and verified against actual bytes, GitHub digests and the combined `SHA256SUMS.txt`/`release-manifest.json`. Real physical-Mac installation, every supported OS release and paid-model flows are not implied by Runner smoke. Local betas already numbered 5.1.0 require a manual formal-package download and overlay, not a promised same-version auto-update. The actual public ZIP payload's telemetry endpoint and `officialBuild: true` were verified; production-event submission and storage were not tested.

## Contributor checklist

- The app starts and shows the main window.
- The built-in terminal works (it must not exit because `pty.node` or `spawn-helper` is missing).
- System Git is detected; a missing CLT should prompt installation instead of reporting that Git is absent.
- Exercise plugin install, SSH, Task Board, and deep links the way you normally would.

## Feedback

Open a GitHub Issue with chip generation, macOS version, reproduction steps, and a redacted diagnostic export from the app. Do not attach `.credentials.yaml`, a real `~/.dsh` tree, or secrets.
