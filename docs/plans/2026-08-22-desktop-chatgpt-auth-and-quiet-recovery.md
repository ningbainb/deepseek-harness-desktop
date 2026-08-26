# Desktop ChatGPT Authorization And Quiet Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore the ChatGPT OAuth entry in Desktop settings while keeping healthy startup free of recovery choices or migration prompts.

**Architecture:** Mount the official `@deepseek-ai/dsh-authorization` service in the Desktop profile so RC.1's built-in `llm-pi-ai` provider can register its `openai-codex` flow. Extend the existing loopback-only Web UI settings bridge with a value-free authorization controller and a first-level ChatGPT settings card. Keep the current direct-start coordinator: full Runtime first, bounded retry and automatic repair only after real failures, then a same-Home built-ins fallback with no user decision page.

**Tech Stack:** Electron, DSH RC.1 Cordis services, TypeScript, React, loopback HTTP routes, Vitest, Node test runner.

---

### Task 1: Prove the missing authorization composition

**Files:**
- Modify: `apps/dsh-desktop/test/profile.test.mjs`
- Modify: `apps/dsh-desktop/src/profile.mjs`

**Step 1: Write the failing test**

Assert that `DESKTOP_PATCH_CONFIG` inserts exactly one `@deepseek-ai/dsh-authorization` row and continues to retire the three conflicting legacy Codex packages.

**Step 2: Run test to verify it fails**

Run: `node --test apps/dsh-desktop/test/profile.test.mjs`

Expected: FAIL because the package is declared but not mounted.

**Step 3: Write minimal implementation**

Add an authorization insert to the Desktop-managed patch without changing the legacy patch prefix used to recognize older profiles.

**Step 4: Run test to verify it passes**

Run: `node --test apps/dsh-desktop/test/profile.test.mjs`

Expected: PASS.

### Task 2: Add a local authorization controller

**Files:**
- Create: `packages/dsh-web-ui-settings/src/chatgpt-auth.ts`
- Create: `packages/dsh-web-ui-settings/src/chatgpt-auth-protocol.ts`
- Modify: `packages/dsh-web-ui-settings/src/bridge.ts`
- Modify: `packages/dsh-web-ui-settings/src/index.ts`
- Modify: `packages/dsh-web-ui-settings/package.json`
- Modify: `packages/dsh-web-ui-settings/tsdown.config.ts`
- Test: `packages/dsh-web-ui-settings/tests/chatgpt-auth.spec.ts`

**Step 1: Write failing controller and route tests**

Cover unavailable flow, value-free configured state, begin, notices, prompts, answers, cancellation, logout, duplicate attempts, method validation, loopback/same-origin rejection, and disposal.

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @linxin666/dsh-client-ui-web-ui-settings test`

Expected: FAIL because the controller and routes do not exist.

**Step 3: Implement the minimal host bridge**

Use the fixed credential key `llm-pi-ai/openai-codex`. The browser receives only status, method labels, bounded notices, prompt descriptions, and generic failures; OAuth grants and API keys never enter the response. Reuse the existing loopback, canonical Host, same-origin, and authenticated-proxy guard. Authorization runs asynchronously so the page can poll while the official flow waits for a browser callback or human answer.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @linxin666/dsh-client-ui-web-ui-settings test`

Expected: PASS.

### Task 3: Restore the Settings entry

**Files:**
- Create: `packages/dsh-web-ui-settings/src/client/chatgpt-auth-client.ts`
- Create: `packages/dsh-web-ui-settings/src/client/ChatGptAuthSection.tsx`
- Create: `packages/dsh-web-ui-settings/src/client/chatgpt-auth.module.css`
- Modify: `packages/dsh-web-ui-settings/src/client/index.ts`
- Modify: `packages/dsh-web-ui-settings/src/client/locales.ts`
- Test: `packages/dsh-web-ui-settings/tests/chatgpt-auth-section.spec.tsx`

**Step 1: Write failing UI tests**

Cover signed-out, signed-in, unavailable, progress, generic prompts, external browser handoff through the existing hidden `about:blank` OAuth bootstrap, cancellation, logout, and failure states.

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @linxin666/dsh-client-ui-web-ui-settings test`

Expected: FAIL because the section is not registered.

**Step 3: Implement the minimal section**

Register `设置 -> ChatGPT 登录` as a first-level section. Keep one primary action per state, poll only while the section is mounted, never display a credential, and retain keyboard-accessible controls and status announcements.

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @linxin666/dsh-client-ui-web-ui-settings test`

Expected: PASS.

### Task 4: Lock quiet startup behavior

**Files:**
- Modify: `apps/dsh-desktop/test/startup-surface.test.mjs`
- Modify: `apps/dsh-desktop/test/startup-repair-coordinator.test.mjs`

**Step 1: Add regression assertions**

Assert that healthy startup publishes only full-start and ready states, never creates fallback/repair work, and that startup HTML exposes no button, dialog, migration, isolation, or recovery-session choice.

**Step 2: Run targeted tests**

Run: `node --test apps/dsh-desktop/test/startup-surface.test.mjs apps/dsh-desktop/test/startup-repair-coordinator.test.mjs`

Expected: PASS with no product-code change unless a regression is exposed.

### Task 5: Build and verify

**Files:**
- Regenerate: `packages/dsh-web-ui-settings/lib/*`
- Modify if required: generated runtime evidence and coupling audit artifacts.

**Step 1: Typecheck and test the package**

Run: `pnpm --filter @linxin666/dsh-client-ui-web-ui-settings typecheck && pnpm --filter @linxin666/dsh-client-ui-web-ui-settings test && pnpm --filter @linxin666/dsh-client-ui-web-ui-settings build`

Expected: all commands pass.

**Step 2: Run Desktop tests**

Run: `pnpm --filter @deepseek-ai/dsh-desktop test`

Expected: all tests pass, with Windows symlink skips only where already documented.

**Step 3: Run repository gates**

Run: `pnpm test:scripts && pnpm docs:check && pnpm verify`

Expected: all gates pass and `git diff --check` reports no errors.

**Step 4: Commit in bounded changes**

Commit the plan, Host/profile behavior, UI behavior, and generated evidence separately with conventional commit subjects and no emoji.
