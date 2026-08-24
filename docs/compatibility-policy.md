# Desktop 3.0 compatibility policy

DeepSeek Harness Desktop 3.0.3 keeps its public integration boundary deliberately small: the Desktop Contract and `@linxin666/dsh-desktop-client` SDK are the supported interfaces for plugins and desktop-aware web surfaces.

## Public contract

Desktop Contract `1.x` exposes a renderer surface, a capability list, and an optional Runtime Provider snapshot. The SDK exposes typed capability discovery, runtime status, notifications, deep-link subscription, fixed Desktop surfaces, and bounded workspace-file opening. Use feature detection for optional capabilities; ordinary DSH Web returns `{ available: false, reason: 'unavailable' }`.

The public Contract does not include Electron, preload objects, IPC channel names, filesystem paths, shell access, credentials, plugin-install internals, Runtime Provider handles, or DSH internal services. A plugin must not reach around a missing capability through an undocumented bridge.

## Versioning and deprecation

Desktop Contract `1.x` and SDK `1.x` accept additive optional fields and capabilities. Existing methods and accepted fields remain available across Desktop 3.x; a documented deprecated API remains for at least one Desktop minor release before removal is considered. Breaking changes require a new public major.

## Plugin loading

Desktop 3.0.3 does not block normal startup because a user plugin lacks publisher, registry, or compatibility metadata. The complete current profile is loaded directly. Compatibility declarations under `dsh.compatibility` remain useful diagnostic evidence in Extension Dock, but they are not a startup authorization list.

New plugin installs are explicit user actions. Desktop validates the selected package reference, applies it transactionally to the persistent profile, and restores the previous archive if installation or activation fails. The built-in plugin market gives fresh users a normal discovery path without adding a startup choice screen.

## Runtime evidence

The packaged official Runtime remains evidence-gated. Stable accepts only an exact `known-good` or `supported` entry whose Runtime version, provider, Desktop range, package integrity, lockfile, and patch evidence match. Installation damage is routed to updater repair because a model must not rewrite packaged application binaries.

Plugin compatibility records, `desktop-plugins.lock.json`, diagnostics, and release manifests are evidence rather than authorization files. The full-profile retry and transactional repair policy is documented in [upgrade and rollback](upgrade-and-rollback.md).

## Scope

This policy covers the public Desktop Contract, SDK, public schemas, Runtime Provider assessment, plugin compatibility metadata, and portable preset metadata. It does not promise source compatibility for internal Electron modules, private preload details, profile layout, task-store internals, or upstream DSH internals.

See [schema versioning](schema-versioning.md), [SDK quickstart](sdk-quickstart.md), and [security boundaries](security-boundaries.md).
