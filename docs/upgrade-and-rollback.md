# Desktop 3.4.0 upgrade and rollback

Desktop 3.4.0 starts the DSH 1.1.5 Runtime directly from the user's existing `DSH_HOME` and `profiles/desktop`. It does not scan for a source version, create a startup migration plan, open a recovery choice page, or copy the profile into an isolated Home. A fresh install uses the same direct path with the built-in plugin set.

## Star prompt after upgrading

Each local user upgrading to 3.4.0 sees the 3.4.0 Star prompt once, including users who already saw the 3.3.0 prompt. Closing it records the version locally, so restarting does not show it again. Opening a preview does not consume or reset this record. The prompt invites the user to visit GitHub; it does not automatically star the repository or require a Star to continue using Desktop.

## Startup behavior

Startup is automatic and has one normal destination: the complete existing profile.

1. Load the current Home, settings, conversations, sessions, tasks, skins, and every installed plugin.
2. If the full profile fails, retry it once without rewriting user state.
3. If the failure is attributable to profile or plugin state and a model is configured, run one bounded repair in a private transaction workspace. The model receives only the minimum diagnostic context, never credentials, full conversations, or unrelated project files.
4. Verify the candidate with registered checks, apply it atomically, and try the full profile again.
5. If verified repair is unavailable or still fails, start the built-in plugins from the same Home. Conversations and settings remain in place.

Session enumeration also guards one legacy encoding mismatch observed during upgrades. If a `.jsonl.zstd` artifact begins with a valid plaintext Session header, Desktop copies the exact original beside it as `.desktop-plaintext-backup-v3.4.0`, writes the official checksummed independent-header and body frames through a temporary file, atomically replaces the mislabeled artifact, and retries the official reader. Any file that does not pass this narrow check remains byte-for-byte unchanged and is isolated from the list rather than deleted. Redacted diagnostics report counts only and never include a Session id or path.

Historical Session observation also covers one released-v0 row emitted by earlier Desktop builds. When the official v0-to-v1 converter refuses a `permission/preset` row whose data contains exactly `preset` plus `origin: "default"`, Desktop streams the independent Zstandard frames into a candidate, removes only that confirmed legacy member, and requires the complete candidate to pass the official migration catalog through the current format. The exact source is preserved as `.desktop-v0-permission-preset-backup-v3.4.0` before an atomic replacement. A different origin, another extra member, an incomplete frame or row, an identity mismatch, or any later migration failure leaves the source unchanged. If the Runtime cannot read the published candidate, Desktop atomically restores the backup. Diagnostics expose counts and recovery kinds only, never Session ids, paths, or conversation content.

The startup page is status-only. There are no migration, isolation, safe-mode, or plugin-source decisions for users to interpret.

## Rollback boundaries

Plugin installation and automatic repair remain transactional. Before a persistent plugin mutation, Desktop archives the affected manifest, lockfile, patch files, and package links. A failed activation restores that archive and the previous Runtime. Automatic repair applies only a verified candidate and rolls it back if the repaired full-profile start fails.

Windows application replacement is transactional. Before extraction, the installer stops the exact prior application processes, exports the existing install and uninstall registry keys, and moves recognized prior application directories to same-volume backups. It keeps those backups until the new executable, Runtime archive, and installer protocol marker are present. The transaction helper is re-staged in a dedicated installer support directory before preflight, commit, immediate rollback, and the NSIS failure callback, so launching the old uninstaller cannot remove the helper with its own plugin directory. Successful installation commits first, then starts a hidden cleanup process so the installer UI does not wait for recursive deletion of the old application tree. If that cleanup cannot start or finish, the committed journal and backup remain available for the next installer to clean; they are never treated as rollback candidates. On a commit failure, the installer runs rollback before reporting the outcome and claims that the previous version was restored only after rollback succeeds. A non-committed journal left by interruption is rolled back when the next installer begins.

The installer transaction covers the application directory and its registration only. It does not move or delete `DSH_HOME`, Electron `userData`, project files, conversations, or sessions. Runtime installation damage after a committed update is handled by the updater path; it is not treated as a profile or plugin problem.

`pnpm --filter @deepseek-ai/dsh-desktop test:installer-lifecycle:e2e` compiles and executes the production NSIS hooks against small isolated payloads and unique test registry keys. It covers fresh installation, upgrade, commit failure, and an aborted install section, with Chinese, space, and apostrophe paths plus deletion of the early transaction helper. Both files and registry versions must agree after rollback, and a session sentinel must remain unchanged. This is executable installer-hook coverage; a full old-release-to-new-release overlay in an isolated Windows environment remains a separate release acceptance check. The verifier uses the cached NSIS compiler, or `DSH_NSIS_COMPILER` when explicitly supplied.

Keep an independent backup before major operating-system or disk changes. Desktop rollback covers mutations it owns, not arbitrary project edits or hardware loss.

## Explicit imports

The Extension Dock's user-initiated Web Profile import remains available. It previews selected packages and attributable non-secret configuration, then applies them transactionally. This explicit import is separate from application startup and is never required merely to open Desktop.

See [compatibility policy](compatibility-policy.md), [runtime support policy](runtime-support-policy.md), and [security boundaries](security-boundaries.md).
