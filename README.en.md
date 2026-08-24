# DeepSeek Harness Desktop

[中文](README.md) | English

![dsh-web-ui](docs/dsh-web-ui-banner.png)

**DeepSeek Harness Desktop** is a community-maintained, open-source Windows AI coding client. It packages DeepSeek Harness Web, the local DSH host, plugins, Skills, themes, task automation, and desktop update capabilities into a single Windows x64 installer, so the complete Harness workspace is ready after installation.

Supports **Windows 10 / 11 x64** and is released under the **BSD-3-Clause** license. The installer includes the required runtime components, so there is no need to separately configure Node.js, Git, or DSH.

[Product site](https://ningbainb.github.io/deepseek-harness-desktop/) · [Download latest](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest) · [Changelog](CHANGELOG.md) · [Desktop technical guide](docs/desktop.md) · [Compatibility policy](docs/compatibility-policy.md)

> Current stable release: **3.0.7**

If this project is useful to you, consider giving it a **Star** on GitHub so more Windows Harness users can discover it.

## Why use the desktop app

- **Ready to use**: install the EXE and launch a complete Harness environment without preparing a runtime manually.
- **Native desktop experience**: dedicated windows, update integration, window-state restore, tray support, and desktop interactions in one app.
- **Complete AI coding workspace**: conversations, files, Git, tasks, previews, Skills, plugins, and model controls in one interface.
- **Extensible**: supports plugin markets, community DSH bundles, project skills, DSH Skills, and Agents Skills.
- **Automation**: Task Board supports scheduled work, background execution, run records, and Evidence.
- **Remote workflows**: mobile remote control, SSH, SFTP, port forwarding, cluster execution, and QQ Bot integration.
- **Personalization**: multiple skins, a full-page particle theme, and the whale-girl desktop pet.
- **Controlled upgrades**: separate Stable / Beta channels with compatibility checks, migration planning, upgrade, and rollback support.

## 3.0.7 current stable release

The current 3.x series focuses on keeping the desktop app maintainable, upgradeable, and extensible over time while preserving the full Harness desktop experience.

- **Stable API boundaries**: Desktop Contract, Desktop SDK, Runtime Provider, Preset, Task / Run / Evidence, and Deep Link have explicit version boundaries.
- **Controlled Runtime**: Stable uses verified Runtime combinations governed by the supported-runtime matrix and compatibility policy.
- **Stable / Beta separation**: Stable rejects prereleases, Beta is opt-in, and switching channels does not automatically downgrade the app.
- **Migration Assistant**: upgrades produce a reviewable migration plan with clear confirmation or blocking states and support for continuing or rolling back.
- **Diagnostic bundles**: users can explicitly export privacy-redacted JSON / ZIP diagnostics for support and environment troubleshooting.
- **Telemetry off by default**: usage data is not uploaded by default; diagnostics are exported only when the user chooses to do so.
- **Release integrity checks**: Releases include `SHA256SUMS.txt` and `release-manifest.json` for validating installer assets and release metadata.

For detailed version history, see [CHANGELOG.md](CHANGELOG.md). The homepage focuses only on user-facing product capabilities.

## Core features

### Harness AI coding workspace

The desktop app runs the DeepSeek Harness Web Surface directly while the desktop host manages the local DSH Runtime. In one window you can handle AI conversations, code edits, file previews, Git operations, task execution, model switching, and plugin extensions.

![DeepSeek Harness Desktop main interface and Skills library](docs/screenshots/13-hero-main.png)

### Skills and plugin ecosystem

Search and insert installed Skills directly from the conversation input. Extension Dock supports community DSH bundles, plugin markets, and discovery/import for project, DSH, and Agents skills.

The desktop app uses an isolated `desktop` profile and does not overwrite an existing DSH setup. Plugin installation, upgrades, and Runtime lifecycle are managed by the desktop host.

### Codex models and reasoning effort

Codex Connect is bundled and can complete ChatGPT OAuth through the system browser, enabling supported OpenAI Codex models inside Harness.

The reasoning-effort slider exposes only levels supported by the active model and automatically selects a valid setting when models change.

### Task Board and automation

Task Board organizes work into Planned, Todo, In Progress, Completed, and Failed states. Tasks can be executed through real DSH Agent Sessions and record Task Runs plus Evidence for later review and continuation.

Scheduled tasks and background execution are also supported for recurring development, maintenance, and information-processing workflows.

| Board | Task details and scheduling |
| --- | --- |
| ![Task Board](docs/screenshots/09-task-board.png) | ![Scheduled task](docs/screenshots/10-task-board-detail-cron.png) |

### Git graph

Use the branch selector and Git graph to inspect branch lanes, commit history, and current repository state at a glance.

![Git graph](docs/screenshots/04-git-graph.png)

### Files, preview, and SCM right panel

Project conversations include a complete right-side workspace:

- **File tree**: browse and search workspace files;
- **Multi-tab preview**: Markdown, HTML, code, diff, CSV, PDF, Office, images, and text;
- **Edit and save**: source / preview switching and split-view workflows;
- **Git changes**: inspect SCM state and run stage / unstage / discard actions;
- **Adjustable layout**: width and collapsed state persist per project and integrate with desktop skins.

![Right panel](docs/screenshots/19-right-panel.png)

### Mobile remote control

Scan the desktop QR code to connect a phone to the current Harness workspace. The mobile interface can browse and create sessions, send and receive messages, switch models and reasoning effort, and stay synchronized with the desktop app.

It works over the local network by default and can optionally use a public tunnel when needed.

| Workspaces | Sessions |
| --- | --- |
| ![Mobile workspaces](docs/screenshots/20-mobile-workspaces.png) | ![Mobile sessions](docs/screenshots/21-mobile-sessions.png) |
| Mobile chat | Model and reasoning effort |
| ![Mobile chat](docs/screenshots/22-mobile-chat.png) | ![Model selector](docs/screenshots/23-mobile-model-sheet.png) |

### SSH remote connections

The SSH panel can manage remote hosts directly and shares connection settings with the Agent.

Supported capabilities include:

- Web terminal;
- SFTP upload / download;
- local port forwarding;
- multi-host cluster execution;
- importing hosts from `~/.ssh/config`;
- directly using configured remote hosts from Agent conversations.

### QQ Bot QR integration

The desktop app integrates the Tencent QQ Bot Connector. Bind it from Extension Dock by scanning a QR code, then connect QQ direct messages and group chats to the local Harness instance.

Credentials are protected locally with Windows system capabilities and managed by the desktop host without requiring manual configuration-file editing.

### Live token statistics

The input area can display generation speed (TPS), LLM latency, context usage, cache hit rate, and input / output token counts in real time.

![Live token statistics](docs/screenshots/18-live-stats.png)

## Skins and desktop pet

The desktop app includes multiple skins with preview-before-apply support. Available styles include Harbor, Windows XP (Luna), Minecraft-inspired, Blue Fantasy, Whale Song, Miku, Trading Terminal, and QQ nostalgia themes.

![Skin Center](docs/screenshots/03-settings-skin-center.png)

### Whale-girl desktop pet

The whale-girl pet changes animations based on Agent states such as thinking, waiting, working, and completion. It also supports interaction, naming, dragging, and hiding.

| Companion mode | Interaction panel |
| --- | --- |
| ![Whale-girl pet](docs/screenshots/11-pet-new-chat.png) | ![Pet interaction panel](docs/screenshots/12-pet-panel.png) |

### Full-page particle theme

The particle-whale theme extends beyond startup into the main interface and automatically adjusts animation intensity around input focus, dialogs, background state, and the system reduced-motion preference.

## Download and install

1. Open [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest).
2. Download `DeepSeek-Harness-Desktop-Setup-<version>-x64.exe`.
3. Run the installer.
4. If you want to verify file integrity, download `SHA256SUMS.txt` from the same Release and compare the installer's SHA-256 hash.

The installer already includes DSH, desktop plugins, skins, pnpm, MinGit, and required native dependencies. Separate Node.js or Git setup is not required.

GitHub Releases is the default download source. If GitHub is slow in your region, the community group can provide the synchronized latest installer.

## Updates and upgrades

The app checks GitHub Releases and shows update notes when a newer version is available. Users can choose to download from GitHub, join the user group, or update later.

Stable is the default update channel. Beta receives prereleases only after explicit opt-in. Upgrades preserve the existing `DSH_HOME`, desktop profile, community bundles, pet state, and skin configuration.

More information:

- [Upgrade and rollback](docs/upgrade-and-rollback.md)
- [Compatibility policy](docs/compatibility-policy.md)
- [Runtime support policy](docs/runtime-support-policy.md)
- [Full release notes](docs/launch/release-notes.md)

## Security and privacy

- DSH Runtime listens on loopback by default;
- the main desktop surface and extension capabilities use separate permission boundaries;
- external links open in the system browser;
- sensitive OAuth and QQ Bot credentials stay local;
- telemetry is disabled by default;
- diagnostic bundles are explicitly exported by the user and redact sensitive content such as Secrets, tokens, cookies, paths, prompts, sessions, and tool results.

## Community QQ Group

Group number: **1105158177** · **[Join the QQ group](https://qm.qq.com/q/vehlNjaeye)**

<a href="https://qm.qq.com/q/vehlNjaeye"><img src="website/assets/qq-group-1105158177.jpg" width="280" alt="QR code for DeepSeek Harness Desktop QQ group 1105158177"></a>

The group is open for usage discussions, plugins, Skills, model configuration, and feature suggestions.

## Documentation

- [Desktop technical guide](docs/desktop.md)
- [Compatibility policy](docs/compatibility-policy.md)
- [Runtime support policy](docs/runtime-support-policy.md)
- [Upgrade and rollback](docs/upgrade-and-rollback.md)
- [Maintainer release workflow](docs/launch/desktop-release-workflow.md)
- [Changelog](CHANGELOG.md)

## Attribution and licensing

| Package | Source | License |
| --- | --- | --- |
| dsh-task-board / dsh-git-graph / dsh-aionui-panel / dsh-pet / dsh-particle-theme / dsh-remote-web-ui / dsh-live-stats / dsh-web-ui-settings / dsh-skins / dsh-web-ui-all / skins | Independently developed by zhu1090093659 | BSD-3-Clause (zhu1090093659) |

Imported third-party code must retain its LICENSE and attribution. Active upstream projects should be forked or referenced as dependencies where possible instead of copying source code.

## Links

- This project actively participates in and supports the [LINUX DO community](https://linux.do).
