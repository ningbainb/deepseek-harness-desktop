# dsh-client-ui-mode-switcher

English | [中文](README.zh.md)

A session-header switcher for changing the active agent mode without editing configuration files.

## Behavior

- Loads the available agent presets from the official DSH runtime and hides broken presets.
- Switches a blank session in place.
- If the current session already contains messages, starts a blank session in the same workspace before applying the selected mode, so existing history is preserved.
- Disables the selector while a switch is running and reports runtime errors in its tooltip.

The selector is hidden when the runtime exposes fewer than two usable presets.

## Install

This plugin is included in the managed desktop profile. For a standalone development profile, build the workspace and add the local package:

```sh
pnpm install
pnpm --filter @linxin666/dsh-client-ui-mode-switcher build
dsh plugin --profile web add link:$(pwd)/packages/dsh-mode-switcher
```

Restart `dsh web` after installation.

## Development

```sh
pnpm --filter @linxin666/dsh-client-ui-mode-switcher typecheck
pnpm --filter @linxin666/dsh-client-ui-mode-switcher test
pnpm --filter @linxin666/dsh-client-ui-mode-switcher build
```

## License

BSD-3-Clause
