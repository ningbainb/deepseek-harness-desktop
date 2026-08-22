# @linxin666/dsh-client-ui-web-ui-settings

English | [中文](README.zh.md)

The dsh web UI plugin group for the DSH settings page: it adds a first-level settings section that hosts the enable switches and configuration forms of the family plugins.

## What it is

- **One section for the family**: on the DSH settings page it registers a first-level section with a static heading and cards for the dsh web UI family plugins.
- **Desktop market remains separate**: DeepSeek Harness Desktop uses Extension Dock's native community market for discovery and transactional installation, while Extension Dock continues to own recovery and rollback. This package deliberately does not restore the obsolete in-group community card.
- **One-click Desktop Dock entry**: on supported Desktop hosts, an Extension Dock button appears immediately beside Settings. The first three eligible launches show a non-modal hint; ordinary Web hosts render no Desktop-only entry.
- **ChatGPT sign-in**: when the RC.1 authorization and OpenAI Codex provider services are present, a first-level settings section starts the official ChatGPT OAuth flow with one click and continues in the system browser.

## Install

### From npm (recommended)

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-web-ui-settings
```

### From the repository (development)

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-web-ui-settings
```

Restart `dsh web` for the section to appear in the settings page.

## Security model

- The ChatGPT surface calls the official `ctx.authorization` flow for `llm-pi-ai/openai-codex`; it does not read, copy, import, or rewrite the OAuth grant.
- The local HTTP bridge returns only flow status, bounded notices, prompts, and credential-presence metadata from `describeRecord`. Access tokens, refresh tokens, and stored record payloads never enter the browser bundle or bridge response.
- Authorization routes use the same loopback, canonical Host, same-origin, and authenticated-proxy checks as the settings bridge. Provider errors are reduced to stable codes before crossing the boundary.

## Proxy configuration

The bridge remains loopback-only when `trustedProxyHosts` is empty. An authenticated reverse proxy on the same host may opt in an exact authority and name the environment variable carrying its shared token:

```yaml
- id: ui-web-ui-settings
  config:
    trustedProxyHosts:
      - dsh.example.com
    proxyTokenEnv: DSH_WEB_UI_SETTINGS_PROXY_TOKEN
```

Keep the token out of profile configuration. The proxy must authenticate before forwarding, replace the internal token header, and forward only to DSH's loopback listener.

## Known limitations

- The section shows on the dsh settings page only when its prerequisite (`@deepseek-ai/dsh-client-ui-settings`) is present.
- The Extension Dock shortcut additionally requires a Desktop host advertising the narrow `extensions.open` capability.
- ChatGPT sign-in requires the host authorization service and a registered `llm-pi-ai/openai-codex` flow. Opening the OAuth page also requires a local Desktop/system-browser environment.
- Authenticated-proxy mode does not provide authentication itself; deployments without a correctly ordered proxy must leave `trustedProxyHosts` empty.
