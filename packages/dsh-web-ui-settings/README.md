# @linxin666/dsh-client-ui-web-ui-settings

English | [中文](README.zh.md)

The dsh web UI plugin group for the DSH settings page: it adds a first-level settings section that hosts the enable switches and configuration forms of the family plugins.

## What it is

- **One section for the family**: on the DSH settings page it registers a first-level section with a static heading and cards for the dsh web UI family plugins.
- **Desktop market remains separate**: DeepSeek Harness Desktop uses Extension Dock's native community market for discovery and transactional installation, while Extension Dock continues to own recovery and rollback. This package deliberately does not restore the obsolete in-group community card.

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
- Authenticated-proxy mode does not provide authentication itself; deployments without a correctly ordered proxy must leave `trustedProxyHosts` empty.
