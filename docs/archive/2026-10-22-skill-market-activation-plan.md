# Skill Market Activation and Recovery Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution or superpowers:subagent-driven-development for independently reviewed tasks. Steps use checkboxes for tracking.

**Goal:** Make the complete embedded market available through an informed first activation without sacrificing local skills or recoverable source data.

**Architecture:** Extend the existing Skill Center/Dock and Desktop serialized profile workflow, not a replacement marketplace. Keep the public upstream market behind a default-inactive profile row. Apply version-pinned community-package fixes for source replacement and commit ordering; never modify official DSH code.

**Tech Stack:** Electron, Node ESM, PowerShell, official NPM DSH SDK 0.2.1-rc.2, dsh-agent-plugins-market 0.11.1, node:test and native Playwright Electron.

**Spec:** [Approved design](2026-10-22-skill-market-activation-design.md).

## Global Constraints

- Preserve all existing worktree changes, local skills, conversations, providers, sources and explicit enable/disable choices; no reset, clean, commits, pushes or releases without a new request.
- Official source and SDK implementations receive no edits. Mount plugins through profile and Cordis patches; retain the six targeted SDK overrides and single-cohort verification.
- Default feedback, translation, automatic updates and project-layout scans off. Preserve explicit user choices.
- Work only in the E worktree; dot-source scripts/use-e-build-env.ps1 in the same PowerShell session before pnpm. Keep test roots, caches and evidence on E.
- Do not modify known-good.json or supported-runtimes.json, remove features, skip failures or relax assertions/deadlines. Native Windows results do not certify macOS/Linux or Setup installation.

## Review Focus

- Simultaneous activation and another settings write must serialize or reject a stale revision, never overwrite the later provider configuration (Task 1).
- Existing shared Agent declarations must be explained rather than copied, migrated or silently executed before activation (Task 1).
- Replacement rollback must preserve the last complete source even when its own restoration fails, and report the recovery location (Task 2).
- Local/adopted sources and linked/out-of-root paths must never be deleted as managed staging (Task 2).
- Cancelling confirmation must send no install/activation request; a timed-out submitted operation must not be described as cancelled (Task 3).

## Task 1: Explicit first activation in the retained Skill Center

**Files:** Create apps/dsh-desktop/src/skill-market-activation.mjs and test/skill-market-activation.test.mjs; modify src/ui/extensions.html, src/ui/extensions.mjs, src/ipc.mjs, src/desktop-contract.mjs, src/electron-app.mjs and the existing preload contract implementation.

**Interfaces:** A native activation service exposes describe() -> Promise<{ enabled, packageVersion, dshHome, agentsHome, revision }> and activate({ confirmed: true, expectedRevision }) -> Promise<{ enabled, restartRequired }>. Renderer inputs cannot choose paths, package versions, commands or arbitrary patch content. Describe reads effective state; activate uses the existing serialized profile transaction and a byte-preserving snapshot. A cancelled dialog invokes neither mutation nor activation.

- [ ] Write failing tests for cancelled activation/no filesystem changes, absent confirmation, stale revision, concurrent provider edits, explicit existing enable/disable state, apply failure and rollback failure retaining the recovery snapshot.
- [ ] Run node --test apps/dsh-desktop/test/skill-market-activation.test.mjs and observe the named assertions fail.
- [ ] Implement the service and fixed IPC contract using native-owned roots and existing profile transaction/restart machinery. Preserve source settings and write only the market enable override. Persist an activation record only after configuration commit; do not use it to replace an explicit disabled override.
- [ ] Add a neighboring market action to the current Skills panel, retaining Import/Open directory and local inventory. The native confirmation explains local process execution, hooks and existing Agent declarations and shows effective roots. Add status/retry messaging without crowding the main sidebar.
- [ ] Run activation, IPC, contract and Dock tests. Confirm activation failures restore original bytes and no unrelated configuration is lost.

## Task 2: Recoverable source replacement and state commit

**Files:** Extend patches/dsh-agent-plugins-market@0.11.1.patch for the pinned community package's archive.js, source-store.js and catalog-context.js; add apps/dsh-desktop/test/skill-market-recovery.test.mjs and test/fixtures/skill-market-recovery-fixture.mjs. Update pnpm lock and builtin adaptation patch evidence.

**Interfaces:** Upstream archiveInstall and source mutation entry signatures remain unchanged. Replacement stages content beside the managed destination, retains a journal and backup, and returns only after filesystem and catalog commit are consistent. Failed commit must not publish the new in-memory catalog. Recovery leaves the prior source usable or reports preserved recovery content; it never silently deletes the sole complete copy.

- [ ] Build isolated fixtures that exercise actual pinned package source update/refresh and installed-state writes. Cover successful replacement, invalid archive, interrupted download, destination rename/copy failure, state write failure, rollback failure, restart recovery, local/adopted directories and traversal/symlink rejection. Use child-process-local filesystem fault injection, not production test-only switches or real user paths.
- [ ] Run node --test apps/dsh-desktop/test/skill-market-recovery.test.mjs and retain the destructive-window/state-divergence RED evidence before implementation.
- [ ] Implement the minimal community-package patch: stage/validate before touching the destination, journal before swapping, keep a same-volume backup until state commit, recover incomplete transactions before reading sources, and commit disk state before publishing in-memory state. Do not label an already-submitted mutation as cancelled when a UI timeout occurs.
- [ ] Apply through pnpm install --ignore-scripts in the prepared E environment; verify the installed patch postimages and all seven existing market tests as well as recovery tests. Re-review the patch without changing official SDK files.

## Task 3: Native activation, discovery and failure acceptance

**Files:** Extend apps/dsh-desktop/scripts/verify-skill-market.mjs and its existing regression-suite registration; update scripts/feature-baseline.json, docs/skills.md and the builtin adaptation validation records only with executed evidence.

**Interfaces:** Use the native activation entry from Task 1 and the unchanged upstream capability-confirmation UI. The current isolated market acceptance fixture remains a prerequisite and does not substitute for native activation or transactional recovery tests.

- [ ] Extend the native test to prove default inactivity, visible risk explanation, zero mutation requests on Cancel, explicit activation, search/details, install confirmation/cancellation, actual composer discovery, restart persistence and unchanged original local skill bytes. Start each fixture with isolated DSH_HOME and DSH_AGENTS_HOME.
- [ ] Add a failed source-replacement UI case proving the prior suite remains discoverable and retry status is accurate. Verify no unintended model translation or public feedback by controlled endpoints and actual request/host-state evidence.
- [ ] Run the focused native test, pnpm feature-baseline:check, Desktop unit tests and pnpm desktop:regression:e2e -- --source --collect-failures with an evidence receipt. Report every failure; do not rerun whole gates until green or erase the prior Window Chrome failure with isolated successes.
- [ ] Ask the read-only reviewer to verify implementation, data preservation and the five Review Focus cases. Keep the result source-only; do not package, promote or publish until all required release gates are met.

## Handoff

Recommended execution: inline implementation in this existing dirty worktree, followed by independent review. The service and recovery changes share profile/state semantics, and this avoids competing writes to shared manifests and the lockfile. Await plan review and execution-method selection before beginning Tasks 1-3. The already-approved package integration and its isolated acceptance can continue meanwhile.
