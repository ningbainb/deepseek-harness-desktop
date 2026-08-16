# Desktop plugin compatibility and performance design

## Requirements

Desktop must expose the actual versions of its DSH runtime and plugins, keep built-ins aligned with the application release, detect community updates, prevent known-incompatible installs, and recover the previous profile when a candidate breaks startup. Existing community plugins that do not publish compatibility metadata must remain usable. No plugin check or registry request may run on normal application startup.

The reference performance budgets are an unchanged-profile p95 below 150 ms, a warm DSH-ready time below 5 seconds on the development machine, and no regression beyond the existing 30-second first-run cold-scan envelope. Update checking should use at most four concurrent registry requests with a ten-second request timeout. Package download occurs while DSH is running; perceived downtime contains only the offline link switch and one normal runtime restart. Logs must not expose registry credentials or environment tokens.

## Architecture

The compatibility core receives a candidate package manifest and a host snapshot containing the Desktop version, Electron Node version, official DSH version, and actual installed peer package versions. It first verifies `dsh.bundle.patch`, then evaluates `engines.node`, required peer ranges, and the optional publisher contract `dsh.compatibility.desktop` plus `dsh.compatibility.runtime`. Any failed required constraint produces `incompatible`. At least one satisfied DSH/desktop constraint with no failures produces `compatible`; a structurally valid bundle without enough host constraints produces `unknown`.

The registry client uses only the fixed npm registry origin and validated package names. Extension Dock inventory is local and immediate. Opening the dock starts a bounded background probe for community packages; built-ins are labelled Desktop-managed and never probed. Candidate preparation resolves an exact version, assesses it, and executes `pnpm store add <name>@<version>`, which warms the package store without changing the profile. The mutation phase stops DSH, snapshots `package.json` and `pnpm-lock.yaml`, applies the exact version with `pnpm add --offline --save-exact`, validates the installed manifest, and starts DSH. Any failure restores the snapshot, runs an offline frozen install, and restarts the previous profile.

## Data flow and user experience

Extension IPC returns renderer-safe inventory fields: package name, installed/requested version, built-in ownership, enabled state, compatibility status/reasons, latest version, and update availability. The preload exposes fixed list, check, install, update, and remove methods; it never exposes arbitrary commands or URLs. Extension Dock displays actual versions and compact status badges. A compatible update has a one-click action, an incompatible update explains the blocking constraints, and an unknown update asks for confirmation before preparation. Successful mutations report that DSH restarted; a rolled-back mutation reports both the original failure and successful recovery.

At application launch, a local-only reconciliation inspects installed community manifests before starting DSH. Explicitly incompatible bundles are removed from the enabled bundle list but not uninstalled. Unknown bundles are preserved. The user can update or remove a disabled package from Extension Dock. Built-in versions come from the packaged manifests, so the desktop version matrix cannot drift from the files actually shipped.

## Performance and observability

The application resolves packaged runtime roots once and reuses that immutable map for profile repair, QQ binding, and plugin mutations. Independent managed-link checks run concurrently because every package owns a distinct target path. Startup logging records application-ready, profile-ready, runtime-ready, and renderer-loaded durations. A reproducible benchmark script measures fresh/unchanged profile preparation and cold/warm runtime readiness and emits JSON for release comparison.

Registry checks and package preparation are lazy Extension Dock work. Compatibility inventory caches installed manifest assessments until the profile manifest or lockfile changes. Update probes have an in-memory age limit so closing and reopening the dock does not immediately repeat network requests. These changes target real wait time: the measured 25-second first launch is a cold file scan, while the ordinary warm runtime path is about three seconds and should stay below five seconds.

## Failure modes and tests

Registry timeout leaves installed plugins untouched and marks update state unavailable. Invalid or malicious manifests are rejected before download. A missing required peer, mismatched range, non-bundle package, changed candidate version, offline apply failure, failed health probe, and rollback failure each have distinct bounded errors. Rollback failure keeps DSH stopped and directs the user to logs rather than claiming recovery.

Unit tests cover semantic ranges including prereleases, optional peers, three-state assessment, fixed registry URLs, concurrency, inventory serialization, exact candidate preparation, offline mutation, rollback, and incompatible startup quarantine. IPC tests cover the fixed channels and renderer-safe fields. Integration tests simulate a community package upgrade whose first runtime start fails and prove the old version is restored. Performance tests assert that unchanged profile preparation remains inside a generous local budget, while the benchmark records rather than hard-fails on cold antivirus variance.

The governing decision is [ADR-0001](../adr/0001-desktop-plugin-version-policy.md).
