# Desktop Plugin Compatibility and Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bind built-in plugins to tested Desktop releases, add guarded and recoverable community updates, and reduce/profile startup overhead without adding startup network work.

**Architecture:** A pure compatibility module evaluates package manifests against an actual host-version snapshot. The Extension Dock lazily probes and prefetches exact registry candidates, then a transactional plugin mutation performs a short offline switch with rollback around the DSH health check. Runtime package roots are cached and profile link checks are parallelized, while a benchmark records cold and warm timings.

**Tech Stack:** Electron 43, Node.js, pnpm 11, semver 7, npm registry metadata, Node test runner, HTML/CSS/JavaScript.

---

### Task 1: Compatibility contract and host snapshot

**Files:**
- Create: `apps/dsh-desktop/src/extensions/plugin-compatibility.mjs`
- Create: `apps/dsh-desktop/test/plugin-compatibility.test.mjs`
- Modify: `apps/dsh-desktop/package.json`
- Modify: `pnpm-lock.yaml`

**Steps:**
1. Add `semver` as an exact desktop dependency and write failing tests for bundle validation, Node engines, required and optional peers, explicit Desktop/DSH ranges, prereleases, and compatible/incompatible/unknown results.
2. Run `node --test apps/dsh-desktop/test/plugin-compatibility.test.mjs` and confirm the module is missing.
3. Implement normalized host snapshots, installed peer lookup, bounded public reason objects, and three-state assessment.
4. Run the new test and the existing plugin/profile tests.
5. Commit the compatibility core.

### Task 2: Lazy registry probe and prepared candidates

**Files:**
- Create: `apps/dsh-desktop/src/extensions/plugin-registry.mjs`
- Create: `apps/dsh-desktop/test/plugin-registry.test.mjs`
- Modify: `apps/dsh-desktop/src/extensions/plugins.mjs`
- Modify: `apps/dsh-desktop/test/plugins.test.mjs`

**Steps:**
1. Write failing tests for fixed-origin encoded registry requests, timeouts, exact latest resolution, four-request concurrency, cache expiry, and public error states.
2. Implement the registry client and community-only update probe without touching application startup.
3. Extend local inventory with actual installed versions and compatibility assessments; built-ins report Desktop ownership and skip registry probes.
4. Add candidate preparation that rejects incompatible manifests, requires an `allowUnknown` flag for unknown candidates, and preloads the exact package through `pnpm store add`.
5. Run focused tests and commit lazy probing/preparation.

### Task 3: Transactional offline mutation and rollback

**Files:**
- Modify: `apps/dsh-desktop/src/extensions/plugins.mjs`
- Modify: `apps/dsh-desktop/src/extension-ipc.mjs`
- Modify: `apps/dsh-desktop/test/plugins.test.mjs`
- Modify: `apps/dsh-desktop/test/extension-ipc.test.mjs`

**Steps:**
1. Write failing tests proving preparation happens before `controller.stop`, apply uses an exact offline spec, and install/update startup failure restores manifest, lockfile, enabled bundles, and the old runtime.
2. Implement file snapshots and a mutation transaction with commit/rollback methods serialized by the existing plugin queue.
3. Update extension IPC to prepare while DSH runs, stop only for apply, validate and restart, and roll back plus restart the previous profile on any failure.
4. Keep removal serialized and make its failure restore the previous enabled state.
5. Run focused tests and commit transactional updates.

### Task 4: Startup reconciliation and Extension Dock UI

**Files:**
- Modify: `apps/dsh-desktop/src/preload.cjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/src/extension-ipc.mjs`
- Modify: `apps/dsh-desktop/src/ui/extensions.html`
- Modify: `apps/dsh-desktop/src/ui/extensions.css`
- Modify: `apps/dsh-desktop/src/ui/extensions.mjs`
- Modify: `apps/dsh-desktop/test/plugins.test.mjs`
- Modify: `apps/dsh-desktop/test/extension-ipc.test.mjs`

**Steps:**
1. Add failing tests for startup quarantine of explicitly incompatible community bundles and for fixed check/update preload channels.
2. Reconcile local installed compatibility before the first DSH start, disabling but retaining explicitly incompatible bundles.
3. Add renderer-safe check/update IPC methods and UI status badges, actual versions, update actions, incompatibility reasons, and unknown-risk confirmation.
4. Capture Extension Dock at 1440 by 900 and check keyboard labels, busy states, long package names, and error output bounds.
5. Run focused tests and commit the guarded UI flow.

### Task 5: Profile and startup performance

**Files:**
- Modify: `apps/dsh-desktop/src/profile.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/src/runtime-controller.mjs`
- Create: `apps/dsh-desktop/scripts/measure-startup.mjs`
- Modify: `apps/dsh-desktop/test/profile.test.mjs`
- Modify: `apps/dsh-desktop/test/runtime-controller.test.mjs`
- Modify: `apps/dsh-desktop/package.json`

**Steps:**
1. Record the current baselines in benchmark output: about 65–97 ms fresh profile, 50–70 ms unchanged profile, 25.2 seconds first cold runtime, and 2.8–3.0 seconds warm runtime.
2. Write failing tests that accept a reusable runtime-root map, perform independent link checks concurrently, and expose bounded startup duration fields.
3. Resolve runtime roots once in Electron, reuse them for every profile repair, parallelize distinct link/retirement checks, and log startup phase timings.
4. Add `desktop:perf` JSON output with an optional warm-profile budget assertion and no network dependency.
5. Compare before/after medians, run desktop tests, and commit the performance work.

### Task 6: Documentation, migration, and release verification

**Files:**
- Modify: `docs/desktop.md`
- Modify: `docs/plugins.md`
- Modify: `docs/launch/release-notes.md`
- Modify: `apps/dsh-desktop/scripts/verify-profile-migration.mjs`
- Modify: `apps/dsh-desktop/scripts/verify-package.mjs`

**Steps:**
1. Document `dsh.compatibility.desktop` and `dsh.compatibility.runtime`, built-in Desktop ownership, three-state community results, and rollback behavior without duplicating generated version lists.
2. Extend packaged migration verification with a preserved unknown plugin and a quarantined explicitly incompatible plugin.
3. Verify the package contains semver and the compatibility/update modules, while built-in versions resolve from packaged manifests.
4. Run `pnpm desktop:test`, affected UI tests, `pnpm docs:check`, `pnpm --filter @deepseek-ai/dsh-desktop pack:dir`, and `pack:verify:dir`.
5. Review `git diff --check`, build the 0.1.9 installer, calculate SHA-256, and commit release documentation.
