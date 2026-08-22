# Desktop Client SDK quickstart

Use `@linxin666/dsh-desktop-client` when a DSH Web plugin can enhance itself inside DeepSeek Harness Desktop but must remain usable in ordinary Web. The SDK is browser-safe and is the only supported plugin entry point for Desktop-only conveniences.

## Discover Desktop and capabilities

```ts
import { createDesktopClient } from '@linxin666/dsh-desktop-client'

const desktop = createDesktopClient()
const contract = await desktop.getContract()

if ('available' in contract) {
  // Ordinary DSH Web: render the normal web experience.
} else if (await desktop.hasCapability('notifications.show')) {
  // Desktop enhancement is available on this renderer surface.
}
```

Capability detection is required because Contract API version and Desktop product version do not grant every capability on every surface. `getDesktopInfo`, `getContract`, `getRuntimeStatus`, notifications, deep links, Desktop-surface opening, and workspace-file opening all return an unavailable result or a bounded failure when the surrounding Desktop feature is absent.

## Send a notification

```ts
import { createDesktopClient, runDeepLink } from '@linxin666/dsh-desktop-client'

const desktop = createDesktopClient()
await desktop.showNotification({
  category: 'run',
  id: 'example-run-complete',
  title: 'Run complete',
  body: 'Review the recorded evidence before applying changes.',
  deepLink: runDeepLink('example-run'),
})
```

Use a stable deduplication ID. Desktop validates the category and deep link, suppresses unsafe input, and may decline native notification delivery when a Desktop window is focused.

## Open an approved workspace document

```ts
const result = await desktop.openWorkspaceFile({
  root: selectedWorkspaceRoot,
  path: 'reports/result.md',
})

if (!result.opened) {
  // Keep the plugin UI usable; explain the bounded reason if one is supplied.
}
```

`root` must be the canonical workspace root selected by the plugin UI and `path` must be a relative allowlisted document below it. Desktop resolves and rechecks the real file before native opening; it does not return the absolute path to browser code. Scripts, executables, shortcuts, traversal, `.git` paths, alternate data streams, URLs, and unregistered roots are rejected.

## Hand a plugin install source to Extension Dock

```ts
const result = await desktop.requestPluginInstall({ source: '@linxin666/dsh-web-ui-all' })

if (!('available' in result) && result.accepted) {
  // Extension Dock opened on the plugins tab with the source pre-filled.
  // The user reviews the form; nothing has been installed yet.
}
```

A marketplace panel stays a pure index with this handoff: it passes only a remote npm, git, or HTTPS reference, never spawns `pnpm`/`dsh` itself, and every install still runs through the Extension Dock form, its native approval dialog, and the transactional rollback on failure. Local filesystem references remain exclusive to the native file picker.

## Do not use private bridges

Do not read `window.dshDesktop` directly, import Electron, pass raw IPC names, or depend on profile paths. The SDK deliberately exposes no filesystem handle, credential, Runtime Provider controller, tray object, update installer, or direct plugin installer; `requestPluginInstall` only hands a validated source to Extension Dock for the user's confirmation.

For a package declaration that advertises the SDK and required Desktop capabilities, see [plugin Desktop manifests](plugin-desktop-manifest.md). The full API reference is [Desktop Client SDK](desktop-client-sdk.md).
