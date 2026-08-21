# Desktop 3.0 compatibility policy

DeepSeek Harness Desktop 3.0.0 keeps its public integration boundary deliberately small: the Desktop Contract and `@linxin666/dsh-desktop-client` SDK are the supported interfaces for plugins and desktop-aware web surfaces.

## Public contract

Desktop Contract `1.x` exposes a renderer surface, a capability list, and an optional Runtime Provider snapshot. The SDK exposes typed capability discovery, runtime status, notifications, deep-link subscription, the fixed Desktop surfaces, and bounded workspace-file opening. Use feature detection for every optional capability; ordinary DSH Web returns `{ available: false, reason: 'unavailable' }`.

The public Contract does not include Electron, preload objects, IPC channel names, filesystem paths, shell access, credentials, plugin-install internals, Runtime Provider handles, or DSH internal services. A plugin must not reach around a missing capability through an undocumented bridge.

## Versioning and deprecation

Desktop Contract `1.x` and SDK `1.x` accept additive optional fields and capabilities. Existing methods and accepted fields remain available across Desktop 3.x; a documented deprecated API remains for at least one Desktop minor release before a removal is considered.

A breaking public API change requires a new public major rather than a silent change to a `1.x` Contract or SDK. Plugin authors should declare the Desktop API range they require and probe individual capabilities at runtime, because an API version alone does not grant a capability on every renderer surface.

## Compatibility evidence

Plugins declare Desktop, Runtime, Contract API, capability, surface, and bounded runtime-test evidence under `dsh.compatibility`. The declaration lets Extension Dock explain and assess a bundle; it does not grant permission or make an unavailable feature available. See [plugin Desktop manifests](plugin-desktop-manifest.md) for the canonical shape.

Runtime selection is additionally gated by the packaged supported-runtime matrix. Stable accepts only an exact `known-good` or `supported` entry whose Runtime version, provider, Desktop range, and package integrity match. Candidate, blocked, unknown, degraded, or unsupported runtime state never becomes Stable merely because it is installed. See [runtime support policy](runtime-support-policy.md).

## Failure behavior

An incompatible plugin is blocked and an undeclared plugin remains `unknown` until the user explicitly reviews it in Extension Dock. A missing SDK capability is a normal compatibility outcome, not a reason to access private Desktop state. A blocked runtime, migration blocker, invalid signature, or failed integrity check is a stop condition rather than a bypassable warning.

`desktop-plugins.lock.json`, a runtime matrix, diagnostic bundles, and release manifests are diagnostic or verification records. None is an authorization file, a package manager lockfile, or a mechanism for promoting unreviewed software.

## Scope

This policy covers the public Desktop Contract, SDK, public schemas, Runtime Provider assessment, plugin compatibility metadata, and portable preset metadata. It does not promise source compatibility for internal application modules, private preload details, profile file layout, task-store internals, or DSH upstream internals.

See [schema versioning](schema-versioning.md), [SDK quickstart](sdk-quickstart.md), and [security boundaries](security-boundaries.md) for the corresponding authoring rules.
