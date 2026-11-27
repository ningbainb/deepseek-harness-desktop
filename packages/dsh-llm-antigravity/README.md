# @ningbainb/dsh-llm-antigravity

English | [中文](README.zh.md)

## What it does

Community Desktop detects the local Google Antigravity CLI and supports direct interactive ACP through the Desktop compatibility layer.

The composer’s **ACP engines** menu also discovers Claude Code ACP, OpenAI Codex ACP, OpenCode, and agents configured in `acp/agents.json` under the desktop profile. Select an engine to use the current conversation’s composer, or open an independent ACP pane beside DeepSeek chat. Model and reasoning controls use the options advertised by the active engine.

## Install

Install the official Antigravity CLI and sign in with `agy` or `agy acp --login` in a terminal.

Open **Settings > Web UI Plugins > Antigravity CLI (Gemini)**, enable the integration and save. Use **Check again** to inspect the local CLI and its ACP capabilities.

Install Claude Code or Codex adapters using `npm install -g @agentclientprotocol/claude-agent-acp` or `npm install -g @agentclientprotocol/codex-acp`. Install OpenCode through its official installation guide or with `npm install -g opencode-ai`. The engine menu can copy these commands. Sign in through the provider CLI. **Check engine** uses a bounded ACP negotiation for these adapters. Antigravity and interactive-only custom engines use filesystem discovery. The existing Antigravity settings card checks models through the vendor CLI.

## Config

The card lets you set an absolute executable path, switch transport, select default reasoning effort, change the per-request timeout and add model IDs separated by commas or whitespace. Automatic discovery checks PATH and, on Windows, `%LOCALAPPDATA%\agy\bin\agy.exe`.

ACP is the default transport and uses the CLI's existing sign-in session.

## Known limitations

Model availability depends on the CLI and the signed-in account. The settings card shows diagnostics and available models. Desktop's ordinary model backends require independently verified API-billed authentication.

## Security model

Use the official executable or a trusted local installation. Personal and business OAuth are restricted to direct local interaction. The CLI can fall back to a saved OAuth login, so Desktop keeps Antigravity out of ordinary model routing, remote mobile sessions, Value Mode, and scheduled tasks.

The ACP routes require an authenticated loopback desktop owner. In Electron, each interactive-only session start and prompt also requires a fresh proof from the desktop interaction that initiated it. External tools can request confirmation in the chat. Persistent approvals and security-sensitive settings require a native session that explicitly permits full unattended access. The desktop profile stores bounded, redacted turn excerpts for review after switching engines. An engine can continue its provider session when it advertises session loading.

## Upstream references

The client follows ACP v1 (Apache-2.0). We thank the maintainers of Claude Agent ACP 0.113.0 and Codex ACP 2.12.1 (Apache-2.0), OpenCode 1.19.6 (MIT), and Google Antigravity for the public interoperable CLI. Versioned links and integration notes are in [NOTICE.md](NOTICE.md).

[Antigravity headless mode](https://antigravity.google/docs/cli/headless/) · [Antigravity ACP](https://antigravity.google/docs/cli/acp/)
