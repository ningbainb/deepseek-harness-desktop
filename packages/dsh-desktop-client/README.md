# dsh-desktop-client

English | [中文](README.zh.md)

`@linxin666/dsh-desktop-client` is the public, browser-safe SDK for optional DeepSeek Harness Desktop integrations. It uses only the versioned Desktop Contract and returns an `unavailable` result when loaded in ordinary DSH web.

## What it does

- Reads Desktop information, Contract capabilities, and runtime status.
- Subscribes to runtime status and validated Deep Links.
- Shows Desktop notifications and opens the Extensions or Updates surface when available.
- Exposes the narrow `extensions.open` surface plus the bounded first-three-launch Dock hint state; it never grants extension management authority to the main page.
- Opens a workspace-relative file through the Desktop validator and the platform default application.

## Install

```sh
pnpm add @linxin666/dsh-desktop-client
```

## Configuration

No configuration or Desktop-only import is required.

```ts
import {
  getDockEntryState,
  hasCapability,
  openDesktopSurface,
  openWorkspaceFile,
  showNotification,
  subscribeDeepLinks,
  taskDeepLink,
} from '@linxin666/dsh-desktop-client'

const dock = await getDockEntryState()
if (dock.available) {
  await openDesktopSurface('extensions')
}

if (await hasCapability('notifications.show')) {
  await showNotification({
    category: 'task',
    id: 'task:example:complete',
    title: 'Task complete',
    body: 'The example task completed.',
    deepLink: taskDeepLink('example'),
  })
}

if (await hasCapability('workspace-files.open')) {
  await openWorkspaceFile({ root: workspaceRoot, path: 'reports/result.md' })
}

const dispose = subscribeDeepLinks((link) => console.info('Desktop route', link))
// Dispose when the plugin unloads.
dispose()
```

## Security model

The SDK never exposes the preload object, Electron, arbitrary IPC, filesystem access, Shell access, plugin mutation, credentials, private keys, Tokens, or DSH runtime objects. Opening Extension Dock requires only `extensions.open`; install, update, removal, and trust operations remain unavailable to the main surface. The optional workspace-file helper accepts an explicitly supplied registered workspace root plus a relative path. Desktop resolves the root through its workspace registry, revalidates the final canonical file, and only then hands it to the operating system.

## Known limitations

Desktop integrations are optional. Ordinary DSH web returns `unavailable`, subscriptions are no-ops, and no background process or network request is created. The public Host route does not authenticate that a supplied registered root is the browser's currently selected session; plugins should pass the current workspace root supplied by their UI. Version 1.x adds capabilities only; removals require SDK 2.0 or a future Desktop major release, with at least one Desktop minor of deprecation notice.
