# Visible Help Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an always-visible Help dropdown to the Desktop main window before publishing 0.1.8.

**Architecture:** Extend the injected custom title bar with a main-window-only Help button and dropdown. Route its four fixed commands through one allowlisted IPC channel so community UI, browser navigation, and update checks remain owned by the Electron main process.

**Tech Stack:** Electron 43, Node.js test runner, Playwright Electron automation, CSS/DOM injection.

---

### Task 1: Define the secure Help action contract

**Files:**
- Modify: `apps/dsh-desktop/test/ipc.test.mjs`
- Modify: `apps/dsh-desktop/src/ipc.mjs`
- Modify: `apps/dsh-desktop/src/preload.cjs`

1. Add a failing test that accepts only `community`, `feedback`, `project`, and `updates`.
2. Run `pnpm --filter @deepseek-ai/dsh-desktop test` and confirm the missing normalizer fails.
3. Add the action normalizer, `desktop:help-action` handler, and preload `helpAction` method.
4. Re-run the Desktop unit tests and confirm they pass.

### Task 2: Render the visible title-bar dropdown

**Files:**
- Modify: `apps/dsh-desktop/test/window-chrome.test.mjs`
- Modify: `apps/dsh-desktop/src/window-chrome.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`

1. Add failing assertions for a main-window Help button, four menu items, non-drag controls, Escape/outside-click closing, and child-window opt-out.
2. Run the targeted window-chrome test and confirm it fails.
3. Add the minimal title-bar DOM/CSS and pass a `showHelpMenu` flag only for the main window.
4. Connect the allowlisted actions to the QR window, fixed GitHub destinations, and manual updater.
5. Re-run Desktop unit tests and confirm they pass.

### Task 3: Verify the user-visible flow

**Files:**
- Modify: `apps/dsh-desktop/scripts/verify-window-chrome.mjs`
- Create: `apps/dsh-desktop/help-menu-preview.png` (temporary verification artifact; do not commit)

1. Extend the E2E to click `帮助 / Help`, verify all four entries, choose `加入社群`, and observe the QR child window.
2. Run `pnpm --filter @deepseek-ai/dsh-desktop test:window-chrome:e2e -- apps/dsh-desktop/help-menu-preview.png`.
3. Inspect the screenshot for placement, clipping, and caption-button overlap.
4. Run Desktop tests, release-note validation, package verification, and the repository release gates.
5. Commit only the design, implementation, source, and tests; exclude the screenshot.
