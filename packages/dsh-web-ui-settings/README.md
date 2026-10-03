# @linxin666/dsh-client-ui-web-ui-settings

English | [中文](README.zh.md)

The dsh web UI plugin group for the DSH settings page: it adds a first-level settings section that hosts the enable switches and configuration forms of the family plugins.

## What it is

- **One section for the family**: on the DSH settings page it registers a first-level section with a static heading and cards for the dsh web UI family plugins.
- **Desktop market remains separate**: DeepSeek Harness Desktop uses Extension Dock's native community market for discovery and transactional installation, while Extension Dock continues to own recovery and rollback. This package deliberately does not restore the obsolete in-group community card.
- **One-click Desktop Dock entry**: on supported Desktop hosts, an Extension Dock button appears immediately beside Settings. The first three eligible launches show a non-modal hint; ordinary Web hosts render no Desktop-only entry.
- **Native plugin configuration**: the Dock reuses upstream plugin forms through its own SDK slot aliases, without redeclaring the official settings or plugin-manager slots. Injection, stores, locale and nested child-slot lifetimes remain attached to the original plugin; independent settings cards keep their existing entry points.
- **Plugin changes without stale pages**: Desktop refreshes the Dock document after a runtime restart even when the private carrier URL stays unchanged. Ordinary tab switches still keep drafts mounted; a refresh with unsaved edits requires saving, returning to editing, or explicitly discarding them.
- **ChatGPT sign-in**: when the DSH 0.1.5 authorization and OpenAI Codex provider services are present, a first-level settings section starts the official ChatGPT OAuth flow with one click and continues in the system browser.
- **bai provider onboarding**: `Settings → Models` and the Dock's combined `AI settings → Models and capabilities` page place bai first, then offer browser sign-in, explicit Key authorization, automatic model sync, and manual Key entry. A successful check discovers `/v1/models` and writes the official `llm-pi-ai` provider profile. Billing and Key management open the supplier console.

The Desktop home workspace selector and sidebar project creation use the same centered folder form. The home selector also lists existing projects; selecting one opens it without renaming it. Browser-only hosts retain the official directory browser.

While editing a native directory path, delayed composer autofocus cannot cancel the editor. Deliberate pointer/Tab navigation, other dialog targets, closing and window-focus loss keep their normal behavior. This narrow plugin guard does not modify the official directory browser.

The docked native file-preview toolbar reserves space for the retained terminal/browser workbench controls, keeping both sets of actions directly accessible. Native fullscreen controls keep their own layout.

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

Desktop plugin details expose the original `plugins.row.config` keyed pages in an unprivileged Dock document. The selected package is matched exactly against registered `<package>#<entry>` keys; these forms retain the plugin's own controls and persistence rather than replacing redacted configuration objects. Standalone Settings cards remain available. Unavailable pages show a message instead of silently opening another plugin.

- The ChatGPT surface calls the official `ctx.authorization` flow for `llm-pi-ai/openai-codex`; it does not read, copy, import, or rewrite the OAuth grant.
- The local HTTP bridge returns only flow status, bounded notices, prompts, and credential-presence metadata from `describeRecord`. Access tokens, refresh tokens, and stored record payloads never enter the browser bundle or bridge response.
- Authorization routes use the same loopback, canonical Host, same-origin, and authenticated-proxy checks as the settings bridge. Provider errors are reduced to stable codes before crossing the boundary.
- The bai provider uses the official `llm-pi-ai` `openai-completions` configuration capability. It does not replace the official `ModelDirectory`; models come from `/v1/models` for the user-owned Key.
- The bai Key enters the official credential service only through a protected local POST route. The route returns presence, model count, and model names only; it never returns the Key or writes it to settings files, URLs, or logs.
- Browser connection starts only on a guarded local request. A temporary listener binds to `127.0.0.1`, accepts one form POST from the exact bai origin with a random 256-bit state, and expires after five minutes. The website asks the user to authorize a Key; passwords and website sessions stay on the website. Cancelling or plugin disposal closes the listener. An authorized write already in progress settles before another action. Account balance remains in the console.
- Chat has no independent bai sign-in or promotion button. Only a selected or effective default bai route without authorization opens the sign-in/top-up dialog; ordinary model pickers and official/third-party sends remain untouched. The guard reads the official session ModelDirectory and retains drafts and attachments. A genuinely new user starts with a non-routable bai sign-in placeholder, not an invented catalog model; authorization prefers `deepseek-flash` when returned by bai, otherwise its first available model. Initial writes wait for the official successful-startup commit. Passive startup opens no browser. Existing defaults, official grants and other providers are preserved.
- The host resolves the locally stored Key for `/v1/models` on startup and every five minutes, with a protected manual refresh action. Concurrent refreshes share one request. Failed, oversized, empty or obsolete responses retain the last model list. Refresh and renewed authorization retain provider configuration and per-model capabilities. First-user detection distinguishes SDK-populated fields from user configuration and respects existing official, OAuth and API Key grants. Keys never enter responses, URLs or model-refresh events. Top-up is a browser action only; no payment is automated.
- A new bai turn failure classified as `AUTH` or HTTP 401 also opens browser reauthorization when a rejected Key remains stored locally. The observer uses the official retained Session event source and actual request provider; old history, other providers, rate limits and transport failures never trigger bai login. Credentials and conversation history are not erased, and failed prompts are not automatically resent.

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
- bai balance, top-ups, Key revocation, and account management remain in the bai console; this package does not proxy payments or hold a project-shared Key.
