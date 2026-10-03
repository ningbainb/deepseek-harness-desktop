# Community 0.4.4 compatibility repair

## Observed contracts

- The installed `@linxin666/dsh-client-ui-community-plugins@0.4.4` exports an inert Host entry and `community.json`; it has no client entry or enabled setting.
- The retained package gate requires a real `settings.installSection` integration and the `community-plugins` namespace. Do not remove or weaken those assertions.
- Official SDK 0.1.5 provides `SettingsProvider.installSection(owner, namespace, schema, entry, hooks)`. `setSource` receives a thunk; `onChange` re-reads that source after attach, detach, and committed changes.
- Official SDK 0.2 provides `SettingsForms`, not `installSection`. It derives editable forms from a mounted plugin's exported Config, with volatile fields, keyed by profile entry id. The current aggregate mounts the data package as `ui-community-plugins`.

## Functional repair

1. Patch only the community NPM package, never the official SDK. Export an actual enabled Config whose volatile field the 0.2 Loader can describe, validate, update, persist, and reset. Keep the data export and the existing mount-once lifetime contract intact.
2. Retain a real legacy registration branch through `settings.installSection` when that method exists. Its source and change hooks must drive the accepted enabled state. A string, comment, unreachable function, or empty adapter is not an implementation.
3. Map the legacy public namespace `community-plugins` to the actual `ui-community-plugins` form on the 0.2 client. Retain the legacy namespace when an old provider serves it. Expand the compatibility allowlist only to a registered community form, never arbitrary namespaces.
4. Restore the community card through the existing `web-ui.plugin.item` slot. Bind it to the actual form, expose a persisted enabled switch, hide only the index body when disabled, retain search and collapse state, and report refusal or read-only state. Read contributor data from the retained registry; keep Workshop's unrelated plugin-management functions intact.
5. Record the NPM patch in patchedDependencies and update the lockfile only after the main agent announces that the 195 source-pipe test has ended. Do not directly edit installed packages or modify the module tree while that test runs.

## Required tests

- Apply the patch to a copy or in memory, preserving the installed SDK and package tree.
- Exercise actual legacy registration: describe the namespace, change enabled through the provider, observe the hook's new source, reject invalid enabled values, reset to defaults, and dispose the owner.
- Exercise actual SDK 0.2 Config reflection and revision-fenced mutation on an isolated Loader/profile fixture. Verify a saved value survives fixture reload; a conflicting or invalid write does not overwrite the accepted value.
- Exercise the client: toggle enabled, await accepted scope state, verify the list body changes, preserve search/collapse state, show a denied write, and retain the disabled/read-only switch as a visible control.
- Check the retained package contract against executable patched artifacts, not merely against patch text.

## Acceptance boundary

Small isolated tests do not prove real Desktop startup, packaged integrity, or platform browser dispatch. The main agent must coordinate an exclusive runtime/Electron acceptance window before those checks. No publication, app packaging, fake markers, or test bypasses are authorized.

## Launcher 0.3.13: confirmed shared blocker

- The installed Host calls `settings.installSection` unconditionally. SDK 0.2 has no such method; the existing client-only patch does not repair that call.
- Its existing Config fields have no volatile metadata, so SDK 0.2 cannot generate a writable form for them. Merely guarding the legacy call would leave enabled and launcher options disconnected from the Host routes.
- The reviewed NPM patch now keeps a separate legacy schema/registration branch and exports a genuine SDK schema with live fields for 0.2. The native branch calls `configure` for the custom-card presentation and listens to `loader/volatile-update`; it re-reads live Config references and synchronizes create/shutdown routes and model guidance.
- The launcher client must use accepted ready enabled state, not treat an unavailable namespace as enabled. The compatibility allowlist must admit the registered `desktop-launcher` form, including explicit package-name selection.
- Verify enabling/disabling routes, option updates, model-guidance toggling, reset/default behavior, invalid writes, and legacy attach/change/disposal before calling the patch complete. The patch is not installed while the main source-pipe test is running; native/profile persistence and real Electron acceptance remain unverified.
