# G01 installer upgrade transaction evidence

Date: 2026-09-08.

## Result

The Windows installer no longer destroys the previous application directory during
preflight. Preflight now begins a recoverable transaction: it exports the existing
install and uninstall registry keys, moves each recognized prior application
directory to a same-volume backup, and retains both until the new install has been
validated.

The electron-builder `customInstall` hook validates the new executable,
`resources/app.asar`, and `resources/installer-upgrade-v3` marker before committing.
The NSIS `.onInstFailed` callback removes a partial replacement, restores the prior
directory, and imports the prior registry state. A non-committed journal left by an
interrupted installer is rolled back when the next installer begins. A committed
journal is cleanup-only and can never replace the current application with its old
backup.

The transaction never includes `DSH_HOME`, Electron `userData`, project files, or
session logs. Those remain outside the application install directory.

## Automated matrix

`apps/dsh-desktop/test/installer-cleanup.test.mjs` passed 9/9 on Windows. Its new
transaction case performed these operations against disposable directories and
isolated HKCU keys:

1. Install fixture 1.0.0, then commit an upgrade to 2.0.0.
2. Begin from 2.0.0, then commit a second upgrade to 3.0.0.
3. Begin from 3.0.0, write a partial 4.0.0 application and registry entry, verify
   Commit rejects the missing upgrade marker, then invoke rollback.
4. Verify the 3.0.0 executable, Runtime archive, registry version, unique install
   directory, and an external session file were restored.

The existing tests also proved rollback for an unmarked legacy install and a marked
2.5-style install, missing previous directories, a real Windows file lock, legacy
process cleanup, and installer/uninstaller ancestor exclusion.

The updater, mirror, update-receipt, product-metrics, and release-manifest selection
passed 51/51. The selected installer filename contains its release version and the
official updater accepts a cached file only when the manifest SHA-512 and the file's
recomputed SHA-512 agree. Concurrent install requests share one shutdown and one
installer launch. Product metrics record download, install-request, and completion
as separate bounded events, while the source/target receipt counts a completed
app-owned update once after that exact target version starts.

## Installer compilation

The existing Windows `win-unpacked` application was compiled through
electron-builder 26.15.3 and makensis after the transaction hooks were added. The
compile produced:

- `DeepSeek-Harness-Desktop-Setup-3.3.0-x64.exe`
- size: 200,720,998 bytes
- SHA-256: `133081E21D29EDFE942EDD68E6E7B52C97F2868607060D37CB585E1DC6FFDEC5`
- Authenticode: `NotSigned`
- matching `latest.yml` version: 3.3.0
- matching blockmap

The installer was compiled but not executed. No production install directory,
Desktop profile, shortcut, or product registry key was changed.

## Remaining release acceptance

The repository now has transaction semantics and a compiled installer, but this is
not evidence for running two different published installer versions. A release test
machine must still execute two real upgrades against one preserved Home, verify one
Start Menu/Desktop/uninstall entry and matching installed Runtime version, then
interrupt a subsequent candidate after staging and confirm the prior released
version launches with the original session. Record the three installer hashes and
signature states with that result.
