# Optional Desktop Release Signing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow official Desktop releases without a certificate while automatically enforcing signed, timestamped artifacts whenever signing material is configured.

**Architecture:** A single GitHub Actions PowerShell step detects certificate material and exposes one boolean policy output. Packaging, signature verification, manifest creation, and manifest verification consume that output. Existing manifest code remains the source of truth for the actual per-artifact signature state. After verification, the workflow derives a bilingual signing-status section from that manifest for the GitHub Release body, while public documentation explains the unsigned Windows trust prompt honestly.

**Tech Stack:** GitHub Actions, PowerShell, Node.js 24, `node:test`, Electron Builder, pnpm.

---

### Task 1: Lock the workflow policy with a failing test

**Files:**
- Modify: `apps/dsh-desktop/test/release-manifest.test.mjs`

**Step 1: Replace the old always-signed assertion**

Assert that the release workflow has a signing-policy step, detects `CSC_LINK`, `WIN_CSC_LINK`, and `CSC_NAME`, and uses the step output in all four release gates.

**Step 2: Run the focused test**

Run: `node --test apps/dsh-desktop/test/release-manifest.test.mjs`

Expected: FAIL because the workflow still hard-codes `REQUIRE_SIGNING: 'true'`.

### Task 2: Implement automatic signing policy selection

**Files:**
- Modify: `.github/workflows/desktop-release.yml`

**Step 1: Add the signing-policy step**

Derive `required=true` when any certificate selector is present and `required=false` otherwise. Write only the boolean to `$GITHUB_OUTPUT`.

**Step 2: Share the policy across all release gates**

Replace the four hard-coded signing values with `${{ steps.signing.outputs.required }}`. Keep all certificate and password environment mappings intact.

**Step 3: Run the focused test**

Run: `node --test apps/dsh-desktop/test/release-manifest.test.mjs`

Expected: PASS.

**Step 4: Generate truthful published notes**

After manifest verification, derive one consistent executable signature state from `release-manifest.json`, append its bilingual explanation to a generated Release body, and publish that generated file.

### Task 3: Document the official unsigned fallback

**Files:**
- Modify: `docs/launch/desktop-release-workflow.md`
- Modify: `docs/launch/release-notes.md`
- Modify: `docs/desktop.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

**Step 1: State the automatic policy**

Document that configured certificate material makes signing and a timestamp mandatory, while absent material permits an unsigned official community release.

**Step 2: State the observable trust result**

Explain that `release-manifest.json` is authoritative, unsigned installers may show an unknown-publisher or SmartScreen prompt, and users must verify the same-release SHA-256 checksum.

**Step 3: Check documentation contracts**

Run: `pnpm docs:check`

Expected: PASS.

### Task 4: Verify and rehearse the unsigned release

**Files:**
- Verify only; fix only defects exposed by these checks.

**Step 1: Run focused and full verification**

Run: `pnpm verify`

Expected: all repository checks pass on Node.js 24.

**Step 2: Package without certificate material**

Run the Windows packaging command with `REQUIRE_SIGNING=false`, then run package verification, packaged smoke tests, signature verification, manifest writing, and manifest verification.

Expected: every gate passes and `release-manifest.json` records Windows executables as `unsigned`.

### Task 5: Publish Desktop 3.0.0

**Files:**
- Update the existing GitHub pull request and release state.

**Step 1: Push and verify the pull request**

Push the policy commit, update the pull request description, mark it ready, and wait for all required checks.

**Step 2: Merge and verify the default branch**

Merge without bypassing branch protection and wait for the merge commit checks to pass.

**Step 3: Create the release tag**

Create and push `desktop-v3.0.0` at the verified default-branch commit. Do not move or recreate the public tag.

**Step 4: Verify the published Release**

Wait for the Desktop Release workflow, then verify the installer, checksum file, updater metadata, manifest, release notes, version, channel, and recorded unsigned signature status.
