# DeepSeek Harness Desktop

[中文](README.md) | English

![dsh-web-ui](docs/dsh-web-ui-banner.png)

## Community QQ Group

Group number: **1105158177** · **[Join the QQ group](https://qm.qq.com/q/vehlNjaeye)**

<a href="https://qm.qq.com/q/vehlNjaeye"><img src="website/assets/qq-group-1105158177.jpg" width="280" alt="QR code for DeepSeek Harness Desktop QQ group 1105158177"></a>

## Windows Desktop

DeepSeek Harness Desktop brings the complete DSH Web surface to a Windows EXE. It does not rewrite the interface: a hardened Electron window launches the official `@deepseek-ai/dsh` host locally and loads every plugin and skin from this repository unchanged.

[Explore the product site](https://ningbainb.github.io/deepseek-harness-desktop/) · [Download the Windows x64 installer](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest) · [Desktop technical guide](docs/desktop.md) · [Maintainer release workflow](docs/launch/desktop-release-workflow.md) · [Changelog](CHANGELOG.md)

If this project helps you, Star the [GitHub repository](https://github.com/ningbainb/deepseek-harness-desktop) so more desktop users can discover it.

### Latest release: 2.2.0

`desktop-v2.2.0` is the current stable release: [read the full release notes](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v2.2.0) · [download the installer directly](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v2.2.0/DeepSeek-Harness-Desktop-Setup-2.2.0-x64.exe) · [download the SHA-256 checksum file](https://github.com/ningbainb/deepseek-harness-desktop/releases/download/desktop-v2.2.0/SHA256SUMS.txt)

| Version | Highlights |
| --- | --- |
| **2.2.0** | Hides Windows terminal descendants, cleans up attributed app/plugin background processes, migrates recognized dependencies and legacy safe-mode false positives, reuses the runtime port, and adds visible one-click safe-mode recovery. |
| **2.1.0** | Adds measured mainland-China update mirrors, snapshot/isolation/safe-mode plugin recovery, unified skin persistence, reliable update-process cleanup, quiet background commands, Unicode-workspace restart protection, and a visible Tools menu entry for Extension Dock. |
| **2.0.0** | Restores queued messages after cancellation, bounds incomplete-runtime failures, adds the Skills menu, model API recovery, sticky reasoning controls, and live SSH monitoring, and aligns Desktop-owned surfaces with the native Harness visual system. |
| **0.1.9** | Fixes conversation-bubble and full-response copying; downloads updates in the background; refreshes the startup and update surfaces with a particle whale and frosted glass; and adds guarded community-plugin compatibility checks, offline switching, rollback, and performance limits. |
| **0.1.8** | Bundles ChatGPT OAuth, OpenAI Codex models, a model-aware reasoning-effort slider, and Help-menu community and feedback actions; keeps `dshmarket` as the only default store and repairs blank patches plus stale store and skin links during migration. |
| **0.1.7** | Introduces a deep-ocean startup experience with state-driven progress and a 32px macOS-inspired frosted-glass window bar; bounds large-file preview memory, Git polling, and SSH transfer work; and strengthens first-install cold-start tolerance plus release gates. |
| **0.1.6** | Bundles Tencent's official QQ Bot and QR Connector. Bind, refresh, cancel, rebind, or unbind from Extension Dock, then connect QQ direct messages and group chats to the desktop Harness. AppSecret is protected by Windows credential encryption and supplied only to the DSH child process. |
| **0.1.5** | Synchronizes native title-bar colors with light/dark mode, keeps full-screen dialogs inside the safe viewport, fixes packaged skin discovery and switching, and bundles `dshmarket` plus `dsh-plugin-hub`. |
| **0.1.4** | Moves the pet to the global Shell Overlay so it appears on home and settings screens, restores all five Web UI plugin settings cards, and lists all nine packaged skins in Skin Center. |
| **0.1.3** | Adds stable GitHub Release checks, bilingual update notes, user-confirmed downloads, taskbar progress, and a second confirmation before installation. |

### 2.0 Core Features

- **Reliable queued-message continuation**: messages sent while an agent is working remain in FIFO order; cancelling the active turn re-arms the queue without loss, duplication, or reordering.
- **Conversation Skills library**: search installed skills beside the input box, inspect their source and description, navigate with the keyboard, insert with Enter, and close with Esc.
- **Automatic model API recovery**: bounded backoff retries recover from rate limits, timeouts, network loss, and retryable server errors while manual cancellation remains immediate.
- **Live SSH monitoring and safe operations**: refresh CPU, memory, disk, load, process, and failed-service data every three seconds, then confirm before terminating a process or restarting a systemd service.
- **Collapsible long reasoning**: the disclosure control stays pinned at the top of the conversation while a long reasoning block is open.
- **Runtime integrity preflight**: critical packaged files are checked before launch; an incomplete installation stops cleanly with a repair message instead of entering a restart loop.
- **More reliable updates and installation**: new releases download in the background, installation waits for confirmation, and Desktop fully reaps the DSH child process before exit to reduce false file-in-use reports.
- **Native Harness visual system**: the title bar, Extension Dock, and startup surface share one restrained system style, with a particle whale that swims, breathes, and moves its tail.

#### 2.0 System Interface

![DeepSeek Harness Desktop 2.0 main interface and Skills library](docs/screenshots/13-hero-main.png)

#### 2.0 Desktop Surfaces

| Particle-whale startup | Plugin and skill Extension Dock |
| --- | --- |
| ![Desktop startup](docs/screenshots/desktop-startup.png) | ![Plugin and skill Extension Dock](docs/screenshots/desktop-extension-dock.png) |

- Bundles the dsh-web-ui 0.1.15 suite with the task board, Git graph, right panel, SSH, mobile remote, live stats, pet, plus Describe Image and the Liangshen agent;
- Bundles Tencent's official QQ Bot, with in-dock QR binding for QQ direct messages and group chats — no YAML editing or background terminal required;
- Bundles ChatGPT OAuth, OpenAI Codex models, and a reasoning-effort slider; sign-in uses the system browser and credentials stay local;
- Uses an isolated `desktop` profile without overwriting an existing DSH setup, and binds only to loopback;
- Adds crash recovery, sanitized rotating logs, window-state restore, strict navigation, and denied-by-default permissions;
- Checks stable GitHub Releases, downloads discovered updates in the background, shows bilingual release notes, and asks before restarting to install;
- Adds a dock for transactional community DSH bundle management, built-in plugin stores, and safe discovery/import of project, DSH, and Agents skills;
- Bundles official DSH, pnpm, and native dependencies, so users do not need a separate Node.js installation.

The desktop app already includes the task board, Git graph, right panel, mobile remote control, remote connection, whale-girl pet, live token statistics, Codex Connect, the reasoning-effort slider, plugin market, and Skin Center. Install the EXE and start working — no separate DSH or Node.js setup and no plugin commands are required.

## Feature Plugins

### QQ Bot QR Binding (Desktop 0.1.6)

The desktop app bundles Tencent's official `@tencent-connect/dsh-qqbot` 0.3.0 and `@tencent-connect/qqbot-connector` 1.2.0. Open the QQ Bot card in Extension Dock to request an auto-refreshing QR code; scan it with mobile QQ to connect direct messages and group chats to the local Harness. The same card supports cancellation, rebinding, and complete unbinding.

The plugin remains disabled until credentials exist, so a hidden background process never waits for terminal QR setup or delays Web UI readiness. Successful binding enables the plugin and restarts DSH automatically. AppSecret is encrypted by Electron `safeStorage` with Windows credential protection; it is never sent to renderer code, written to logs, or stored in plaintext in `cordis.patch.yml`, and is supplied only through the DSH child environment at runtime.

### Codex Models and Reasoning Effort (Desktop 0.1.8)

The desktop app bundles `dsh-codex-connect` 0.1.0-alpha.4.5 for ChatGPT OAuth through the system browser and OpenAI Codex models in Settings. It does not replace the active model, take over global search, or enable the remote image tool by default; an existing Codex Provider stays authoritative, and OAuth credentials remain in the local DSH home.

The bundled `reasoning-slider` 0.0.2 exposes only the reasoning-effort levels a model actually supports and falls back automatically after model switches. The top Help menu also provides a QQ group QR code, one-click community access, and a GitHub suggestion action, with every external link delegated to the system browser.

### Task Board

Open it from the sidebar. Tasks are organized into five columns: Planned, To-do, In Progress, Done, and Failed. Clicking "Run" on a card hands the task to a real DSH agent session; when it finishes, the card status updates automatically. To review what happened, jump directly into the execution session for the full transcript.

Tasks also support scheduled execution: configure a cron expression in the detail view (e.g. auto-upgrade DSH at 23:00 daily, generate a weekly report at 09:00 every Monday), and the task runs on its own at the scheduled time.

| Multi-column board | Scheduled execution |
| --- | --- |
| ![Task board](docs/screenshots/09-task-board.png) | ![Scheduled task detail](docs/screenshots/10-task-board-detail-cron.png) |

### Git Graph

The branch picker above the input box handles branch switching and commit history browsing; the Git graph visualizes branch lanes and commit history, making it easy to trace changes along the timeline even in large repositories.

![Git graph](docs/screenshots/04-git-graph.png)

### Right Panel

When a project session is open, two panels appear to the right of the chat area — "Preview" and "Files/Changes":

- **File tree**: browse the working directory; click a file to open it in the preview panel, click a folder row to expand it, and search for files by name;
- **Preview**: multi-tab preview for markdown, HTML, code, diff, CSV, PDF, Office, images and plain text, with source/preview switching, split-screen editing and saving;
- **Changes (SCM)**: a real git changes panel with stage / unstage / discard;
- Panel widths are draggable (double-click a handle to reset), and the collapsed state plus widths persist per project;
- All eleven selectable skins adapt the right panel — switching skins restyles the panels to match the theme.

![Right panel](docs/screenshots/19-right-panel.png)

### Whale-Girl Pet

A whale girl who lives at the edge of the interface and switches animations with the agent's state: thinking, waiting, working, celebrating. Click her to interact (pet her head), feed her dried fish to raise affinity, and grow her from a baby whale to "deep-sea bond". She can be renamed, dragged to any position, or hidden whenever you want.

| Working companion | Interaction panel |
| --- | --- |
| ![Whale pet](docs/screenshots/11-pet-new-chat.png) | ![Pet interaction panel](docs/screenshots/12-pet-panel.png) |

### Live Token Stats

Real-time usage shown directly below the input box: generation speed (TPS), LLM time, context usage, cache hit rate, and input / output token counts — the cost of every generation stays visible at a glance.

![Live token stats](docs/screenshots/18-live-stats.png)

### Mobile Remote Control

The phone icon at the bottom of the sidebar opens the pairing panel: scan the QR code (or copy the link) to pair, and the phone lands on a standalone mobile surface that remote-controls the current dsh web workspace — browse and create sessions, send and receive messages, switch models and reasoning effort, and adjust the permission preset, all in sync with the desktop. Pairing tokens are one-time and time-limited; "Stop" revokes every paired device at any time. The QR defaults to the LAN, or turn on the cloudflared public tunnel so the phone can pair from any network.

| Workspaces | Sessions & new session |
| --- | --- |
| ![Mobile workspaces](docs/screenshots/20-mobile-workspaces.png) | ![Mobile sessions](docs/screenshots/21-mobile-sessions.png) |
| Chat (folded reasoning & tool calls) | Model & reasoning-effort picker |
| ![Mobile chat](docs/screenshots/22-mobile-chat.png) | ![Model picker](docs/screenshots/23-mobile-model-sheet.png) |

### Remote Connection

The "SSH" sidebar entry opens the remote-ops panel. Hosts support key / password auth and one-click import from `~/.ssh/config`; config lives in `~/.dsh/dsh-ssh.json`. Real operations on configured hosts:

- **Web terminal**: xterm.js PTY with live output and auto-fit;
- **File transfer**: SFTP upload / download with progress and a remote directory browser;
- **Port forwarding**: local tunnels to remote internal services (databases, APIs, admin consoles), bound to 127.0.0.1 only;
- **Cluster runs**: one command across many hosts concurrently, filtered by alias / environment / tags;
- **Agent direct control**: agents share the same host config — just say "check xxx" in chat and the agent runs remote commands for you.

### Settings Hub

All family plugins' toggles and parameters live under "Settings > Plugin config", and changes apply immediately. The desktop app explicitly exposes all five bundled cards — Remote Control, Skin Center, Live Token Estimates, Task Board, and Pet — instead of losing entries to the DSH Host settings-namespace filter.

![Plugin config hub](docs/screenshots/02-settings-web-ui-plugins.png)

### Plugin Stores and Extension Dock

The desktop profile bundles only `dshmarket` 1.3.0 as its default plugin market. Marketplace installs target the isolated `desktop` profile and support community DSH bundle discovery, installation, transactional rollback, and upgrade preservation. Runtime restarts remain owned by the desktop host so the market cannot launch a second DSH process. Project, DSH, and Agents skills can also be discovered in Extension Dock and imported after safety checks.

## Skins

The skin center ships eleven selectable skins, including Harbor and QQ2006. Each supports try-on before applying: preview applies instantly and reverts fully on exit; once you are satisfied, apply it with one click.

![Skin center](docs/screenshots/03-settings-skin-center.png)

### Windows XP (Luna)

A faithful recreation of the classic Luna interface: blue gradient window chrome, a green Start button, the Bliss blue-sky desktop, and square corners throughout.

![Windows XP skin](docs/screenshots/16-skin-xp-light.png)

### Minecraft Voxel

Inspired by the Minecraft main menu: a pixel-art panorama skybox rotates slowly behind the interface, buttons adopt the gray stone slab style, and inputs become wooden sign posts.

![Minecraft skin](docs/screenshots/15-skin-minecraft-light.png)

### Blue Fantasy

Whale artwork lies beneath translucent panes, wrapped in a periwinkle-indigo palette — particularly striking in dark mode.

![Blue Fantasy dark](docs/screenshots/17-skin-blue-fantasy-dark.png)

### Whale Song

The deep-sea whale-goddess theme: a text-free ambience painting (a blue-haired goddess with a whale pod on the left, an ice-blue constellation grid with gold-thread accents, and generous open water on the right) sits beneath translucent panes, wrapped in an ice-blue / cyan / navy / cobalt palette — with a night-cruise dark variant.

![Whale Song light](docs/screenshots/24-skin-whale-song-light.png) · ![Whale Song dark](docs/screenshots/25-skin-whale-song-dark.png)

### Hatsune Miku

An electronic-idol surface with cyan notes, a waveform status bar, and translucent stage panels, designed to keep both light/dark modes and every feature plugin readable.

### Trading Terminal

A live-data stock-trading skin: a scrolling ticker tape (A-shares / HK / US / indices / crypto / FX, 红涨绿跌), live quote chips in the title bar, and a status bar with A-share / HK / US trading sessions plus HK/US index cells. With `dsh-fun-ticker` installed the tape follows your watchlist (served through its same-origin proxy); with `dsh-longbridge` installed the index cells render the broker snapshot. With neither plugin installed the skin still works standalone on public feeds (Tencent / Binance / Frankfurter) — and every fetch path fails safe to `--` cells.

![Trading Terminal light](docs/screenshots/26-skin-trading-light.png) · ![Trading Terminal dark](docs/screenshots/27-skin-trading-dark.png)

Three more: QQ2008 Retro (crystal blue with penguin motifs), Tonghuashun Trading (market elements woven into the interface), and Dragon Heir (cinnabar dragon seal theme).

## Download, Verification, and Upgrades

1. Download the latest Windows x64 installer from [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest).
2. Run `DeepSeek-Harness-Desktop-Setup-<version>-x64.exe`. DSH, plugins, skins, pnpm, and native dependencies are all included in the installer.
3. To verify file integrity, download `SHA256SUMS.txt` from the same Release and compare the installer's SHA-256 digest.

The app checks stable GitHub Releases, displays bilingual update notes, and asks for confirmation before both downloading and restarting to install. In-place upgrades preserve the existing `DSH_HOME`, desktop profile, community bundles, pet state, skin configuration, and encrypted QQ Bot credentials.

The installer is not commercially code-signed, so Windows SmartScreen may report an unknown publisher. Use only the installer linked from this project's Release page. The default install path is recommended to avoid legacy Win32 path-length limits.

## Sources & Licensing

| Package | Origin | License |
| --- | --- | --- |
| dsh-task-board / dsh-git-graph / dsh-aionui-panel / dsh-pet / dsh-remote-web-ui / dsh-live-stats / dsh-web-ui-settings / dsh-skins / dsh-web-ui-all / skins | Authored by zhu1090093659 | BSD-3-Clause (zhu1090093659) |

Third-party code merged in must keep its LICENSE and attribution; active third parties with an upstream are forked or referenced as dependencies instead of vendored.
