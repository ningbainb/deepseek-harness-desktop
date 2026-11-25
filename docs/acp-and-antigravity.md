# Generic ACP Adapter and Google Antigravity Integration

DeepSeek Harness Desktop integrates external interactive coding agents via the official **Agent Client Protocol (ACP v1)** using unmodified stdio JSON-RPC binaries rather than non-standard CLI output scraping or third-party harness wrapping.

## Architecture Overview

- **Protocol Client (`AcpClient`)**: Implemented in [acp-client.ts](../packages/dsh-desktop-compat/src/acp/acp-client.ts), supporting `initialize` capability negotiation, `authenticate`, `session/new`, `session/load`, `session/set_model`, `session/set_config_option`, `session/prompt`, `session/cancel`, `session/update` normalization, `session/request_permission`, and workspace-confined `fs/*` operations.
- **Agent Manager (`AcpAgentManager`)**: Implemented in [acp-agent-manager.ts](../packages/dsh-desktop-compat/src/acp/acp-agent-manager.ts), managing built-in Google Antigravity (`agy acp`), user custom ACP agents (`<DSH_HOME>/acp/agents.json`), persisted ACP session mappings, and DSH `ctx.approval` bridging.

## Google Antigravity Terms Compliance

In accordance with Google Antigravity Additional Terms Section 6 and the official maintainer guidance in issue `google-antigravity/antigravity-cli#1493`:

1. **`oauth-personal` / `oauth-business`**: Permitted exclusively for direct, human-driven interactive ACP sessions (`invocationSource === 'human-interactive'`). Blocked from DSH `LlmAdapter` harness wrapping, scheduled tasks, background automation, subagents, Agent Teams, PTC workflows, Value Mode routing, auto-prompting, and remote bots.
2. **`gemini-api-key` / `agent-platform`**: A setting alone cannot prove the CLI's billing mode. The CLI can reuse a saved Google login, so this Desktop integration keeps model backend access disabled until API-billed credentials can be independently verified.
3. **Interactive transport**: The built-in ACP agent stays interactive-only for every declared authentication mode.
