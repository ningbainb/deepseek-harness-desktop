# Desktop 3.3.0 upgrade and rollback

Desktop 3.3.0 starts directly from the user's existing `DSH_HOME` and `profiles/desktop`. It does not scan for a source version, create a startup migration plan, open a recovery choice page, or copy the profile into an isolated Home. A fresh install uses the same direct path with the built-in plugin set.

## Startup behavior

Startup is automatic and has one normal destination: the complete existing profile.

1. Load the current Home, settings, conversations, sessions, tasks, skins, and every installed plugin.
2. If the full profile fails, retry it once without rewriting user state.
3. If the failure is attributable to profile or plugin state and a model is configured, run one bounded repair in a private transaction workspace. The model receives only the minimum diagnostic context, never credentials, full conversations, or unrelated project files.
4. Verify the candidate with registered checks, apply it atomically, and try the full profile again.
5. If verified repair is unavailable or still fails, start the built-in plugins from the same Home. Conversations and settings remain in place.

The startup page is status-only. There are no migration, isolation, safe-mode, or plugin-source decisions for users to interpret.

## Rollback boundaries

Plugin installation and automatic repair remain transactional. Before a persistent plugin mutation, Desktop archives the affected manifest, lockfile, patch files, and package links. A failed activation restores that archive and the previous Runtime. Automatic repair applies only a verified candidate and rolls it back if the repaired full-profile start fails.

Windows application replacement is transactional. Before extraction, the installer stops the exact prior application processes, exports the existing install and uninstall registry keys, and moves recognized prior application directories to same-volume backups. It keeps those backups until the new executable, Runtime archive, and installer protocol marker are present. Successful installation commits and removes the backups; the NSIS failure callback removes a partial replacement and restores the prior directories and registry state. A non-committed journal left by interruption is rolled back when the next installer begins, while a committed cleanup journal never restores an older version.

The installer transaction covers the application directory and its registration only. It does not move or delete `DSH_HOME`, Electron `userData`, project files, conversations, or sessions. Runtime installation damage after a committed update is handled by the updater path; it is not treated as a profile or plugin problem.

Keep an independent backup before major operating-system or disk changes. Desktop rollback covers mutations it owns, not arbitrary project edits or hardware loss.

## Explicit imports

The Extension Dock's user-initiated Web Profile import remains available. It previews selected packages and attributable non-secret configuration, then applies them transactionally. This explicit import is separate from application startup and is never required merely to open Desktop.

See [compatibility policy](compatibility-policy.md), [runtime support policy](runtime-support-policy.md), and [security boundaries](security-boundaries.md).
