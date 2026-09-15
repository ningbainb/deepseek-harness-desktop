# DeepSeek Harness Desktop Linux x64 Preview

Linux is distributed through a separate preview channel. It does not replace the Windows stable release or the macOS arm64 Preview.

## Supported preview scope

- Architecture: x86_64 / amd64
- CI-validated distributions: Ubuntu 22.04 LTS and Ubuntu 24.04 LTS
- Artifacts: AppImage and deb
- Updates: in-app updates are disabled; download new builds manually from this project's GitHub Releases

Ubuntu 22.04 and 24.04 pass real GitHub Actions packaging, sandbox, and Xvfb startup checks. Physical-desktop deb installation and AppImage usability remain Preview user-acceptance work, so this is not yet presented as a Linux stable release. Other Debian- or Ubuntu-based distributions may work, but they are not supported until validated. Arch Linux, Fedora, openSUSE, Alpine and ARM64 are currently unverified.

## AppImage

```bash
chmod +x DeepSeek-Harness-Desktop-4.0.0-x86_64.AppImage
./DeepSeek-Harness-Desktop-4.0.0-x86_64.AppImage
```

If FUSE 2 is unavailable, install the distribution's compatibility package or use the AppImage extraction mode. Do not use untrusted third-party installation scripts.

## deb

```bash
sudo apt install ./DeepSeek-Harness-Desktop-4.0.0-amd64.deb
```

Uninstall with:

```bash
sudo apt remove deepseek-harness-desktop
```

Removing the application does not intentionally delete sessions, skills or plugin data stored under `~/.dsh`.

## Security boundary

- Linux packages use the system Git installation and never bundle Windows MinGit.
- Agent commands prefer the official sandbox's bwrap runner and can fall back to Landlock when available. If neither is usable, execution must fail explicitly instead of running without confinement.
- Release CI verifies Linux native modules, isolated startup, zero writes to the real `~/.dsh`, and Landlock write denial.
- Download only from this project's GitHub Releases and verify the SHA-256 published with the same release.
