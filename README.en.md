# DeepSeek Harness Desktop

[中文](README.md) | English

![DeepSeek Harness Desktop](docs/dsh-web-ui-banner.png)

## 👥 DeepSeek Harness Desktop Community

QQ Group: **1105158177**

**[👉 Join the QQ Group](https://qm.qq.com/q/vehlNjaeye)**

<a href="https://qm.qq.com/q/vehlNjaeye"><img src="website/assets/qq-group-1105158177.jpg" width="280" alt="QR code for DeepSeek Harness Desktop QQ group 1105158177"></a>

Join the community to discuss:

- Usage and configuration
- Plugins and Skills
- Model setup and usage tips
- Automation workflows
- Themes and desktop pets
- New releases and feature suggestions

> **GitHub downloads slow in your region?**  
> The community group also provides synchronized copies of the latest installer and a place to get help with installation and usage.

---

**DeepSeek Harness Desktop** is a community-maintained, open-source Windows AI coding client.

It brings **DeepSeek Harness Web, the local DSH runtime, Skills, plugins, task automation, Git, remote development, and desktop extensions** together in one Windows application, giving you a complete Harness AI coding experience without complicated setup.

Supports **Windows 10 / 11 x64** and is released under the **BSD-3-Clause** license.

The installer includes the main runtime components, so you do not need to separately configure Node.js, Git, or DSH.

[🌐 Product Site](https://ningbainb.github.io/deepseek-harness-desktop/) · [⬇️ Download Latest](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest) · [📖 Documentation](docs/desktop.md) · [📝 Changelog](CHANGELOG.md)

> If this project is useful to you, consider giving it a **Star ⭐**.  
> Your support helps more Windows users discover DeepSeek Harness Desktop.

---

## ✨ Why DeepSeek Harness Desktop

### 📦 Ready to Use

Install the EXE and launch a complete Harness environment.

There is no need to manually prepare Node.js, Git, pnpm, or the DSH Runtime. The desktop app manages the required components and runtime environment for you.

### 🤖 Complete AI Coding Workspace

Use one desktop app for:

- AI conversations and code changes
- Project file browsing and editing
- Git / SCM operations
- Markdown, HTML, code, Diff, PDF, Office, and other file previews
- Model switching and reasoning-effort controls
- Skills and plugin usage
- Agent task execution
- Token and performance statistics
- Multi-project development workflows

### 🧩 Skills and Plugin Ecosystem

Supports multiple extension paths:

- DSH Skills
- Agents Skills
- Project Skills
- Community DSH Bundles
- Plugin Marketplace
- Desktop extensions

Search, install, and use extensions directly inside Harness to build a development workflow that fits your needs.

### ✅ Task Board and Automation

The built-in Task Board organizes work as:

**Planned → Todo → In Progress → Completed / Failed**

Tasks can be executed through real DSH Agent Sessions and record Task Runs plus Evidence for later review and continuation.

Scheduled tasks and background execution are also supported for recurring development, maintenance, and automation workflows.

### 🌐 Remote Development

The desktop app can work with both local and remote environments through:

- Mobile remote control
- SSH
- Web Terminal
- SFTP
- Port forwarding
- Multi-host cluster execution
- QQ Bot integration

You can connect to your Harness workspace from a PC, phone, or chat client.

### 🎨 Personalized Desktop Experience

Beyond coding features, Desktop also includes:

- Multiple themes and skins
- Full-page particle themes
- Whale-girl desktop pet
- Dedicated desktop windows
- Window-state persistence
- Desktop notifications
- System tray integration
- Stable / Beta update channels

---

## 🖥️ Harness AI Coding Workspace

The desktop app runs the DeepSeek Harness Web Surface directly while the desktop host manages the local DSH Runtime.

In one window, you can handle AI conversations, code changes, file management, Git operations, task execution, model switching, and plugin extensions.

![DeepSeek Harness Desktop main interface and Skills library](docs/screenshots/13-hero-main.png)

## 🧩 Skills and Plugins

Search and insert installed Skills directly from the conversation input.

Extension Dock supports:

- Community DSH Bundles
- Plugin Marketplace
- Project Skills
- DSH Skills
- Agents Skills

The desktop app uses an isolated `desktop` profile and does not overwrite an existing DSH setup.

Plugin installation, updates, and runtime lifecycle are managed by the desktop host.

## 🧠 Codex Models and Reasoning Effort

Built-in **Codex Connect** can complete ChatGPT OAuth through the system browser and enable supported OpenAI Codex models inside Harness.

When switching models, the desktop app shows the reasoning-effort levels supported by the active model and automatically handles valid configuration.

## ✅ Task Board and Automation

Use the Task Board to manage Agent work in one place.

| Board | Task details and scheduling |
| --- | --- |
| ![Task Board](docs/screenshots/09-task-board.png) | ![Scheduled task](docs/screenshots/10-task-board-detail-cron.png) |

Tasks can be executed through DSH Agent Sessions and save Task Run and Evidence records.

In addition to manual tasks, scheduled tasks and background execution can be used for recurring development, information processing, and maintenance workflows.

## 🌿 Git Graph

Use the branch selector and Git graph to inspect branch relationships, commit history, repository status, and branch lanes at a glance.

![Git graph](docs/screenshots/04-git-graph.png)

## 📁 Files, Preview, and SCM

Project conversations include a complete right-side workspace:

- **File tree**: browse and search workspace files
- **File preview**: Markdown, HTML, code, Diff, CSV, PDF, Office, images, and text
- **Edit and save**: source / preview switching and split-view workflows
- **Git changes**: inspect real SCM state and run Stage / Unstage / Discard
- **Adjustable layout**: panel width and collapsed state can persist per project

![Right panel](docs/screenshots/19-right-panel.png)

## 📱 Mobile Remote Control

Scan the desktop QR code to connect a phone to the current Harness workspace.

The mobile interface can browse workspaces, create and view sessions, send and receive messages, switch models, adjust reasoning effort, and stay synchronized with the desktop app.

It works over the local network by default and can optionally use a public tunnel when needed.

| Workspaces | Sessions |
| --- | --- |
| ![Mobile workspaces](docs/screenshots/20-mobile-workspaces.png) | ![Mobile sessions](docs/screenshots/21-mobile-sessions.png) |
| **Mobile chat** | **Model and reasoning effort** |
| ![Mobile chat](docs/screenshots/22-mobile-chat.png) | ![Model selector](docs/screenshots/23-mobile-model-sheet.png) |

## 🖥️ SSH Remote Development

The built-in SSH panel can manage remote servers directly and share connection settings with the Agent.

Supported capabilities include:

- Web Terminal
- SFTP upload / download
- Local port forwarding
- Multi-host cluster execution
- Importing hosts from `~/.ssh/config`
- Using configured remote hosts directly from Agent conversations

Harness can therefore work with remote servers and development environments as well as local projects.

## 💬 QQ Bot Integration

The desktop app integrates the Tencent QQ Bot Connector.

Bind it from Extension Dock by scanning a QR code, then connect QQ direct messages and group chats to the local Harness instance.

Connection information is managed by the desktop host without requiring manual configuration-file editing.

## 📊 Live Token and Performance Statistics

The input area can display:

- TPS generation speed
- LLM request latency
- Context usage
- Cache hit rate
- Input Tokens
- Output Tokens

![Live token statistics](docs/screenshots/18-live-stats.png)

## 🎨 Themes and Skins

The desktop app includes multiple themes with preview-before-apply support.

Available styles include Harbor, Windows XP / Luna, Minecraft-inspired, Blue Fantasy, Whale Song, Miku, Trading Terminal, QQ nostalgia, and more.

![Skin Center](docs/screenshots/03-settings-skin-center.png)

### 🐳 Whale-girl Desktop Pet

The built-in whale-girl desktop pet changes animations based on Agent states such as thinking, working, waiting, and completion.

It also supports interaction, naming, dragging, and hiding.

| Companion mode | Interaction panel |
| --- | --- |
| ![Whale-girl pet](docs/screenshots/11-pet-new-chat.png) | ![Pet interaction panel](docs/screenshots/12-pet-panel.png) |

### ✨ Full-page Particle Theme

The particle-whale theme can be applied not only to the startup page but also to the main Harness interface, automatically adjusting visual effects around input state, dialogs, background activity, and the system reduced-motion preference.

---

## ⬇️ Download and Install

1. Open [GitHub Releases](https://github.com/ningbainb/deepseek-harness-desktop/releases/latest).
2. Download `DeepSeek-Harness-Desktop-Setup-<version>-x64.exe`.
3. Run the installer.
4. Launch **DeepSeek Harness Desktop**.

The installer already includes DSH, desktop plugins, skins, pnpm, MinGit, and the required native dependencies. Separate Node.js or Git setup is not required.

If GitHub downloads are slow in your region, you can also join the community group at the top of this page to get the synchronized installer.

## 🔄 Updates

DeepSeek Harness Desktop supports in-app update checks. When a new version is available, you can review the release information and choose whether to upgrade.

Two update channels are available:

- **Stable**: the default channel and the best choice for most users.
- **Beta**: opt-in access to newer features.

Upgrades are designed to preserve existing DSH_HOME, Desktop Profile, community Bundles, Skills, skin configuration, and desktop-pet state whenever possible.

More information:

- [Upgrade and rollback](docs/upgrade-and-rollback.md)
- [Compatibility policy](docs/compatibility-policy.md)
- [Runtime support policy](docs/runtime-support-policy.md)
- [Full release notes](docs/launch/release-notes.md)

## 🔐 Security and Privacy

DeepSeek Harness Desktop is designed to keep user data and the runtime environment local whenever possible.

Key behaviors include:

- DSH Runtime listens on loopback by default
- The main desktop surface and extension capabilities use separate permission boundaries
- External links open in the system browser
- OAuth, QQ Bot, and other credentials stay local
- Telemetry is disabled by default
- Diagnostic information is exported only when the user explicitly requests it
- Exported diagnostics redact sensitive content such as Tokens, Secrets, Cookies, paths, Prompts, Sessions, and Tool Results

## 📚 Documentation

- [Desktop technical guide](docs/desktop.md)
- [Compatibility policy](docs/compatibility-policy.md)
- [Runtime support policy](docs/runtime-support-policy.md)
- [Upgrade and rollback](docs/upgrade-and-rollback.md)
- [Maintainer release workflow](docs/launch/desktop-release-workflow.md)
- [Changelog](CHANGELOG.md)

## 📄 Open Source and Licensing

DeepSeek Harness Desktop is released under the **BSD-3-Clause** license.

| Package | Source | License |
| --- | --- | --- |
| dsh-task-board / dsh-git-graph / dsh-aionui-panel / dsh-pet / dsh-particle-theme / dsh-remote-web-ui / dsh-live-stats / dsh-web-ui-settings / dsh-skins / dsh-web-ui-all / skins | Independently developed by zhu1090093659 | BSD-3-Clause (zhu1090093659) |

Imported third-party code should retain its LICENSE and attribution. Active upstream projects should preferably be forked or referenced as dependencies instead of copying source code.

## ❤️ Links

This project actively participates in and supports the [LINUX DO community](https://linux.do).

---

<p align="center">
  <b>Make DeepSeek Harness a Windows AI coding workspace you can use every day.</b>
</p>

<p align="center">
  If you like this project, consider giving it a ⭐ Star.
</p>
