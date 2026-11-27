# ACP interoperability references

The local desktop adapter implements the public [Agent Client Protocol v1 specification](https://agentclientprotocol.com/protocol/v1/overview). The project and the [TypeScript SDK 2.12.0](https://github.com/agentclientprotocol/typescript-sdk/tree/6b84c6da9430a1e4aba9c87c0b45f8b43a6aea9a) are Apache-2.0. ACP v2 remained a preview when reviewed on November 27, 2026. The desktop adapter sends v1 JSON-RPC over stdio and implements the protocol in the existing TypeScript host.

| Reference | Version and license | Use in DeepSeek Harness Desktop |
| --- | --- | --- |
| [Claude Agent ACP](https://github.com/agentclientprotocol/claude-agent-acp/tree/v0.113.0) | 0.113.0, Apache-2.0 | Discover the current adapter executable. Session permission, tool, thought, and option events use ACP v1. The official CLI owns sign-in. |
| [Codex ACP](https://github.com/agentclientprotocol/codex-acp/tree/v2.12.1) | 2.12.1, Apache-2.0, Copyright 2025 JetBrains s.r.o. | Discover the current adapter executable. The adapter owns Codex App Server and login. A filesystem-only check reports the presence of a CLI credential file. |
| [OpenCode](https://github.com/anomalyco/opencode/tree/v1.19.6) | 1.19.6, MIT, Copyright 2025 opencode | Use the native opencode acp command. Expose model and reasoning settings through the ACP option IDs supplied by the session. |
| [Google Antigravity CLI](https://antigravity.google/docs/ide/extensions/acp) | [1.5.16 release notes](https://antigravity.google/docs/changelog?tab=hub), [Google terms](https://antigravity.google/terms) | Launch the official agy acp command for local human interaction. Google sign-in and provider settings remain inside the CLI. |

Upstream CLI installations run independently of the desktop bundle. The installation guide points to the current package names. On Windows, Desktop resolves the declared executable entry of supported adapter packages and launches it directly.
