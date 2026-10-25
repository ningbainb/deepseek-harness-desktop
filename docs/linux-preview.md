# DeepSeek Harness Desktop Linux x64 Preview

English | [中文](linux-preview.zh.md)

Linux remains a Preview platform. [Desktop 5.1.0](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0) publishes Linux x64 assets alongside Windows x64 and macOS arm64; this does not make Linux stable. Before opening an AppImage or installing a deb, verify the same Release's combined `SHA256SUMS.txt` and `release-manifest.json`. Both public Linux files were independently downloaded; actual byte sizes, SHA-256 and GitHub digests match the combined receipt.

## Supported preview scope

- Architecture: x86_64 / amd64
- 5.1.0 CI-validated distribution: Ubuntu 22.04 LTS only
- Artifacts: AppImage and deb
- Updates: in-app updates are disabled; download new builds manually from this project's GitHub Releases

Ubuntu 22.04 passed native packaging, sandbox and Xvfb startup in [formal tag run 40199647851](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40199647851) at `eb1223ddfee78eccadd76d8022501cd1806d9d3d`. Ubuntu 24.04 records belong to earlier versions, not 5.1.0 acceptance. Physical-desktop deb installation and AppImage usability remain Preview user-acceptance work. Other Debian- or Ubuntu-based distributions may work but are unverified for this version; Arch Linux, Fedora, openSUSE, Alpine and ARM64 are also unverified. Packages are unsigned. Same-version local 5.1.0 beta users must manually download and overlay the formal package; no same-version auto-update is promised.

## AppImage

```bash
chmod +x DeepSeek-Harness-Desktop-5.1.0-x86_64.AppImage
./DeepSeek-Harness-Desktop-5.1.0-x86_64.AppImage
```

If FUSE 2 is unavailable, install the distribution's compatibility package or use the AppImage extraction mode. Do not use untrusted third-party installation scripts.

## deb

```bash
sudo apt install ./DeepSeek-Harness-Desktop-5.1.0-amd64.deb
```

Uninstall with:

```bash
sudo apt remove deepseek-harness-desktop
```

Removing the application does not intentionally delete sessions, skills or plugin data. The community distribution defaults to `~/.dsh-community`; keep any legacy `~/.dsh` data and any user-selected data directory backed up separately.

## Security boundary

- Linux packages use the system Git installation and never bundle Windows MinGit.
- Agent commands prefer the official sandbox's bwrap runner and can fall back to Landlock when available. If neither is usable, execution must fail explicitly instead of running without confinement.
- Release CI verifies Linux native modules, isolated startup, zero writes to the real `~/.dsh`, and Landlock write denial.
- Download only from this project's GitHub Releases and verify the SHA-256 published with the same release.
- The actual public DEB payload's telemetry endpoint and `officialBuild: true` were verified. Anonymous opt-out metrics retain their existing policy; no production event was submitted and ingestion was not verified. Runner sandbox checks do not establish confinement for every provider, plugin or external process.
