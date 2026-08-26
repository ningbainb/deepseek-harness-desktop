# Desktop Client SDK

`@linxin666/dsh-desktop-client` is the browser-safe public client for the versioned DeepSeek Harness Desktop Contract. It is independently versioned at `1.0.0` and contains no Electron, Node filesystem, Runtime Provider, or `@deepseek-ai/dsh*` runtime import.

## API boundary

The SDK exposes typed wrappers for Desktop information and Contract discovery, Runtime Status subscription, notifications, Deep Link helpers, and the fixed Desktop surfaces `extensions` and `updates`. It returns `{ available: false, reason: 'unavailable' }` outside Desktop instead of requiring callers to special-case normal DSH Web.

`getRuntimeStatus()` includes the read-only background summary when Desktop provides it. It does not expose a Tray handle, close-preference writer, background scheduler controller, raw preload object, IPC channel, Electron object, credential, direct plugin installer, or DSH internal service.

## Safe workspace external open

Desktop `1.2` also offers `openWorkspaceFile({ root, path })` behind the `workspace-files.open` Contract capability. This is a bounded workspace-document capability, not arbitrary file or Shell access:

- `path` must be a relative path under a registered canonical workspace root.
- The Desktop Host resolves the final `realpath`, requires a regular file, and rejects `.git` paths, traversal, URLs, alternate data streams, trailing-dot type bypasses, scripts, executables, shortcuts, and other non-allowlisted targets.
- Electron revalidates the request and the Host-returned target before calling its native open operation. The resolved absolute target is never returned to browser code.
- Each Desktop Host launch receives a fresh opaque capability from Electron main through its private child-process environment. The route rejects a missing or incorrect capability before parsing the request or consulting a workspace, so a same-origin renderer cannot call it directly as an absolute-path oracle. The capability is not exposed by preload, the SDK, Contract/status data, or logs.

This private capability authenticates Electron main to the Host; it is not a browser-session identity. The public DSH route protocol does not provide a renderer-session credential, so plugins should continue to pass the workspace root selected by their UI. The Host enforces that this explicit root exactly matches a registered canonical workspace root.

Any main-surface plugin can use this single SDK method after capability detection. The Aion Preview panel is one consumer; the Desktop capability remains available even when that panel is disabled.

## Plugin install handoff

Desktop `1.3` also offers `requestPluginInstall({ source })` behind the `plugins.install.request` Contract capability. It hands a remote npm, git, or HTTPS plugin reference to Desktop:

- The source is validated in Electron main against the persistent plugin installer's remote-reference rules. Local filesystem references, `git+file:`, and malformed values are rejected before anything opens.
- The call itself installs nothing. Desktop opens Extension Dock on the plugins tab with the source pre-filled; the user's install action owns the persistent transaction and rollback on failure.
- A marketplace panel can therefore stay a pure index: it never spawns `pnpm`/`dsh` itself and never bypasses the Extension Dock's install-time protections.

## Compatibility and SemVer

Plugin manifests declare the required Desktop API range and capabilities under `dsh.compatibility`; Extension Dock assesses these declarations before activation. Capability detection is a feature probe, not a plugin identity ACL.

SDK `1.x` adds compatible optional fields and methods only. A deprecated API remains through at least one Desktop minor release. Breaking changes require SDK `2.0.0` or a future Desktop major release.

See the package's [English README](../packages/dsh-desktop-client/README.md), [中文 README](../packages/dsh-desktop-client/README.zh.md), and [plugin Desktop compatibility](desktop-plugin-compatibility.md).
