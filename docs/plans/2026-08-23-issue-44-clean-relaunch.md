# Issue 44 Clean Relaunch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure a genuinely clean Windows installation can exit and relaunch without entering repair, while allowing users to select an installation directory during an upgrade.

**Architecture:** Keep Desktop 3.0.2 on the direct-start path: the persistent `DSH_HOME` is prepared in place and no migration or isolated recovery session participates in healthy startup. Strengthen the packaged regression so neither `userData` nor `DSH_HOME` is seeded before the first launch, then verify the same generated versionless profile starts again after a graceful quit. Use electron-builder's assisted NSIS mode to expose a prefilled installation-directory page while retaining the existing exact-path upgrade cleanup.

**Tech Stack:** Electron 43, Node.js test runner, electron-builder NSIS, PowerShell release checks, pnpm.

---

### Task 1: Make the smoke runner capable of a truly empty first launch

**Files:**
- Modify: `apps/dsh-desktop/test/packaged-smoke-runner.test.mjs`
- Modify: `apps/dsh-desktop/scripts/packaged-smoke-runner.mjs`

**Step 1: Write the failing test**

Add a test that calls `runPackagedDesktop` with `seedPrimaryRuntimePermission: false`, uses `process.execPath` as the inert child, and verifies that the nonexistent `userData` directory remains absent.

**Step 2: Run the test to verify it fails**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/packaged-smoke-runner.test.mjs`

Expected: FAIL because the runner always creates the permission ledger and does not accept the new switch.

**Step 3: Implement the switch**

Add a boolean `seedPrimaryRuntimePermission` option that defaults to `true`, validate its type, and call `seedPrimaryRuntimePermissionForTest` only when it is enabled.

**Step 4: Run the focused test**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/packaged-smoke-runner.test.mjs`

Expected: PASS.

### Task 2: Reproduce the clean-install second-launch sequence exactly

**Files:**
- Modify: `apps/dsh-desktop/scripts/verify-packaged-fresh-second-launch.mjs`
- Modify: `apps/dsh-desktop/package.json`
- Modify: `.github/workflows/desktop-release.yml`

**Step 1: Tighten the packaged scenario**

Assert that both state roots are absent before launch, start with `seedPrimaryRuntimePermission: false`, wait for `ready-full`, allow the smoke hook to perform a normal `app.quit()`, and start the same executable a second time against the generated state.

**Step 2: Assert the issue cannot recur**

Require two `ready-full` records and reject `unknown-version`, migration blocking, recovery shell, free-mode session, builtins fallback, or repair states. Confirm the generated profile remains versionless and no migration completion marker or isolated session was created.

**Step 3: Expose and gate the scenario**

Add `test:fresh-relaunch:e2e` to the Desktop package and invoke it from the release workflow before the signed/unsigned installer is produced.

**Step 4: Run the source-level contract checks**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/packaged-smoke-runner.test.mjs test/direct-startup-policy.test.mjs test/profile.test.mjs`

Expected: PASS.

### Task 3: Allow installation-directory selection without weakening upgrade cleanup

**Files:**
- Modify: `apps/dsh-desktop/electron-builder.yml`
- Modify: `apps/dsh-desktop/test/installer-cleanup.test.mjs`

**Step 1: Write the failing installer contract**

Require `oneClick: false` and `allowToChangeInstallationDirectory: true` while preserving per-user installation, no elevation helper, and the existing `customCheckAppRunning` cleanup macro.

**Step 2: Run the focused installer test to verify it fails**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/installer-cleanup.test.mjs`

Expected: FAIL on the old one-click configuration.

**Step 3: Enable assisted installation**

Switch NSIS to assisted mode and enable the directory page. Keep the current install directory as the default so ordinary upgrades only need confirmation, while users can select an old/custom location for an in-place replacement.

**Step 4: Run the installer test**

Run: `pnpm --filter @deepseek-ai/dsh-desktop exec node --test test/installer-cleanup.test.mjs`

Expected: PASS, including the Windows exact-process, stale-install, and file-lock cases.

### Task 4: Build and verify the actual release artifact

**Files:**
- Verify: `apps/dsh-desktop/dist/win-unpacked/DeepSeek Harness Desktop.exe`
- Verify: `apps/dsh-desktop/dist/DeepSeek-Harness-Desktop-Setup-3.0.2-x64.exe`

**Step 1: Run repository verification**

Run: `pnpm verify`

Expected: all type checks, Desktop tests, script tests, runtime checks, docs checks, and repository gates pass.

**Step 2: Build the unpacked app and installer**

Run: `pnpm --filter @deepseek-ai/dsh-desktop pack:dir`

Run: `pnpm --filter @deepseek-ai/dsh-desktop pack:win`

Expected: both commands exit zero and the NSIS installer contains the assisted directory page.

**Step 3: Run the exact packaged relaunch regression**

Set `DSH_DESKTOP_E2E_EXECUTABLE` to the unpacked executable and run `pnpm --filter @deepseek-ai/dsh-desktop test:fresh-relaunch:e2e`.

Expected: first and second launch both reach `ready-full`; no repair or recovery path appears.

**Step 4: Verify the release artifact**

Run: `pnpm --filter @deepseek-ai/dsh-desktop pack:verify`

Run: `pnpm --filter @deepseek-ai/dsh-desktop pack:smoke`

Expected: package contents and packaged startup pass. Record the final installer size, SHA-256, and Authenticode status.
