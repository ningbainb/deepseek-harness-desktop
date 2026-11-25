# Work Mode and Unified Office Connectors

DeepSeek Harness Desktop (DSH) provides a built-in **Work Mode** sidebar entry and unified office connector architecture designed for everyday productivity without duplicating the core runtime, credential handling, MCP manager, or Skill system.

## Architecture Overview

- **Agent Preset (`work-office`)**: Registered by [work-office-preset.ts](../packages/dsh-desktop-compat/src/connectors/work-office-preset.ts), reusing DSH `ctx.agentPresets`, `ctx.agents`, `@deepseek-ai/dsh-tool-office`, `@deepseek-ai/dsh-skill-office`, and the official conversation frame.
- **Declarative Catalog (`connector-catalog-v1`)**: Defined by [connector-catalog-v1.schema.json](schemas/connector-catalog-v1.schema.json). The host uses the bundled offline catalog. The catalog loader includes Ed25519 signature verification and rejects inline shell scripts for future remote catalogs. [Bundled catalog](../apps/dsh-desktop/src/connectors/builtin-catalog.v1.json)
- **Unified Runtime (`ConnectorRegistryService`)**:
  - Remote and local Stdio MCP drivers register through `ctx.mcpManager` with `toolLoading: 'on-demand'`.
  - CLI + Skill connectors register dynamically via `ctx.skills.registerProvider` only while enabled and connected.
  - A compact 1-line-per-service capability index is exposed via `ctx.systemPrompt.section` instead of dumping all CLI manuals into context.
- **Risk-Tiered Approval (`L0` - `L3`)**: Extended in [control-tool-approval.ts](../packages/dsh-desktop-compat/src/control-tool-approval.ts) so read/search actions pass smoothly while mutating, bulk, delete, and external send/share actions prompt for user confirmation via `ctx.approval`.
- **Credential & Package Isolation**:
  - The host stores connector secrets separately from `config.json` in a local encrypted vault under `<DSH_HOME>/connectors/`. Protect this directory and its local key together when backing up or moving a profile.
  - Supported connector packages install under `<DSH_HOME>/connectors/packages/`, where the host discovers them without changing the system PATH. Provider sessions and authorization are handled by their corresponding connectors.
