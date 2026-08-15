# Desktop Base Aggregate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish one DSH aggregate package containing every approved Desktop community plugin while excluding Tencent QQ Bot.

**Architecture:** Add a manifest-only package whose pinned npm dependencies provide upstream code and whose `cordis.patch.yml` activates their bundle rows. Keep third-party provenance explicit and verify the published tarball and a clean DSH profile before release.

**Tech Stack:** Node.js 22+, pnpm 11, npm registry, DeepSeek Harness bundle patches, Node test runner.

---

### Task 1: Add the package contract test

**Files:**
- Create: `scripts/desktop-base-package.test.mjs`

**Step 1:** Assert the package name, initial version, public registry, exact pinned dependencies, and `dsh.bundle.patch` declaration.

**Step 2:** Assert every row from `packages/dsh-web-ui-all/cordis.patch.yml` is present alongside `dsh-market`, `llm-openai-codex`, and `reasoning-slider`.

**Step 3:** Assert no Tencent package or QQ Bot patch row is included.

**Step 4:** Run `node --test scripts/desktop-base-package.test.mjs` and expect failure because the package does not exist yet.

### Task 2: Implement the aggregate package

**Files:**
- Create: `packages/dsh-desktop-base/package.json`
- Create: `packages/dsh-desktop-base/cordis.patch.yml`
- Create: `packages/dsh-desktop-base/README.md`
- Create: `packages/dsh-desktop-base/README.zh.md`
- Create: `packages/dsh-desktop-base/LICENSE`
- Create: `packages/dsh-desktop-base/THIRD_PARTY_NOTICES.md`

**Step 1:** Create `dsh-desktop-base@0.1.0` with exact dependencies and npm public publish metadata.

**Step 2:** Copy the required child patch rows, retaining the conservative Codex Connect configuration.

**Step 3:** Document installation, migration, exclusions, conflicts, ownership, and third-party licenses.

**Step 4:** Run the focused test and expect it to pass.

### Task 3: Verify the release artifact

**Files:**
- Verify: `packages/dsh-desktop-base/*`

**Step 1:** Run `pnpm test:scripts` and expect all script tests to pass.

**Step 2:** Run `npm pack --dry-run --json` in the package directory and verify only the intended files are included.

**Step 3:** Pack the tarball, install it into a temporary DSH profile, and run `dsh --dump-config` to verify all expected ids appear and QQ Bot does not.

**Step 4:** Check `npm whoami`, the selected version, and `https://registry.npmjs.org/` immediately before publishing.

**Step 5:** Run `npm publish --access public --registry https://registry.npmjs.org/` only after the maintainer confirms the version and registry and npm authentication succeeds.
