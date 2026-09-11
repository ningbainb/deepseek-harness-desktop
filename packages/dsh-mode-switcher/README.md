# dsh-client-ui-mode-switcher

English | [中文](README.zh.md)

A session-header switcher for changing the active agent mode without editing configuration files.

## Behavior

- Loads the available agent presets from the official DSH runtime and hides broken presets.
- Switches a blank session in place. If either the list row or the loaded native projection records a started conversation, it is not reused as a blank draft.
- If the current session already contains messages, creates a blank session with the requested preset in the same workspace or its original directory, preserving existing history. An unrelated workspace is never chosen as a fallback.
- Creation or refresh failure keeps the original conversation selected; a late result does not replace a conversation the user has since opened.
- Current DSH uses official Remote calls and session projections without changing the global default. Older hosts retain their preset-label synchronization and restore the user's original default afterwards.
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
