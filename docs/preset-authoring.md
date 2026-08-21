# Desktop 3.0 preset authoring

A `.dshpreset` is a portable, reviewable description of an allowed Desktop environment. Exporting from Extension Dock is the preferred way to create one because Desktop selects portable fields and computes the integrity manifest for you.

## Format and compatibility

Preset v1 requires `dsh-preset.json`, `packages.lock.json`, `settings.json`, `task-templates.json`, `README.md`, and `integrity.json`. Optional skills live below `skills/<safe-id>/` and each skill contains `SKILL.md`. The integrity file supplies a SHA-256 digest for every other archive entry and does not hash itself.

Use exact semantic versions for `source.desktopVersion`, `source.runtimeVersion`, and every package lock entry. Package entries are registry package names with exact versions and SHA-512 integrity; URL, Git, filesystem, and version-range dependencies are not portable preset inputs.

The extracted [minimal preset fixture](examples/desktop-preset/dsh-preset.json) shows the required source files. It is documentation source material, not a ZIP to install directly; use Extension Dock or a conforming ZIP creator to produce the final `.dshpreset` archive and its integrity manifest.

## Safe content

`requiredSecrets` contains names such as `EXAMPLE_API_KEY`, never values. Portable settings are limited to Desktop's allowlist. Skills may contain bounded Markdown, text, JSON, YAML, or YML data, but no executables, scripts, hidden credential files, symbolic links, paths outside the archive, or unsafe text.

Task templates, settings, descriptions, and README text must not contain private keys, tokens, passwords, local paths, Git URLs, arbitrary URLs, or credential-shaped content. Archive limits, safe paths, file types, and compression limits are enforced before import planning.

## Import behavior

Desktop parses, validates, checks archive integrity, assesses exact registry packages and compatibility, and presents a trust summary before the user confirms. Integrity proves that archive contents match their own manifest; it does not prove publisher identity or authorize code.

After confirmation, Desktop prefetches approved packages, stages settings, applies the batch atomically, restarts Runtime when necessary, waits for health, and restores the prior state on failure. A double-click file association only opens the preview; it never installs a preset automatically.

Preset v1 readers intentionally ignore unknown additive optional manifest fields and never copy them into the trusted import plan. A newer unsupported format major asks the user to upgrade Desktop; an older unsupported major asks the user to use the migration assistant before import.

See [Desktop Presets](presets.md), the [preset v1 schema](schemas/dshpreset-v1.schema.json), and [upgrade and rollback](upgrade-and-rollback.md).
