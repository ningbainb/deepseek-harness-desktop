# Native Community Market Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the bundled dshmarket surface with a native Extension Dock market backed by the live awesome-dsh-plugin catalog and Desktop's transactional installer.

**Architecture:** A main-process catalog service fetches and validates one fixed JSON endpoint, projects bounded catalog entries, and owns opaque-id-to-install-spec resolution. Extension IPC exposes list and install operations to a local renderer tab; installation delegates to the existing full-access transaction with one concise native confirmation. Desktop retires dshmarket from managed profile composition.

**Tech Stack:** Electron main/preload IPC, Node.js ESM, native HTML/CSS/JavaScript, `node:test`, pnpm monorepo tooling.

---

### Task 1: Catalog service contract

**Files:**
- Create: `apps/dsh-desktop/src/extensions/community-market.mjs`
- Create: `apps/dsh-desktop/test/community-market.test.mjs`

**Step 1: Write failing parser tests**

Cover a catalog with npm, GitHub-only, monorepo-subpath, malformed, oversized, duplicate, and deprecated entries. Assert a clone-safe bounded projection and exact install specs.

**Step 2: Run the focused test**

Run: `node --test test/community-market.test.mjs`

Expected: FAIL because the module does not exist.

**Step 3: Implement the minimal service**

Implement a fixed URL, timeout and byte budgets, response validation, deterministic ids, localized descriptions, npm-first source derivation, conditional request validators, and in-memory id lookup. Inject the fetch function and clock for deterministic tests.

**Step 4: Run the focused test**

Run: `node --test test/community-market.test.mjs`

Expected: PASS.

### Task 2: Main-process IPC and installation routing

**Files:**
- Modify: `apps/dsh-desktop/src/extension-ipc.mjs`
- Modify: `apps/dsh-desktop/src/electron-app.mjs`
- Modify: `apps/dsh-desktop/src/free-mode-plugin-approval.mjs`
- Modify: `apps/dsh-desktop/test/extension-ipc.test.mjs`
- Modify: `apps/dsh-desktop/test/free-mode-plugin-approval.test.mjs`

**Step 1: Write failing IPC tests**

Assert that `extensions:market-list` returns the projected catalog, `extensions:market-install` accepts only an opaque catalog id, resolves the main-process install spec, and routes to the existing serialized full-access transaction. Assert that cleanup removes both handlers.

**Step 2: Write failing confirmation-copy test**

Assert that a market-context approval uses one concise install/cancel dialog and keeps the same once-only permission grant semantics.

**Step 3: Implement the handlers**

Inject a catalog service into `registerExtensionIpc`, register the two channels, and call the existing installer with `{ allowUnknown: true, fullAccess: true }`. Pass `market` confirmation context internally without exposing it on the generic renderer install channel.

**Step 4: Inject Electron networking**

Create the catalog service in `electron-app.mjs` with `net.fetch`, and pass it to Extension IPC. Forward the market confirmation context to the approval service.

**Step 5: Run focused tests**

Run: `node --test test/community-market.test.mjs test/extension-ipc.test.mjs test/free-mode-plugin-approval.test.mjs`

Expected: PASS.

### Task 3: Preload bridge and native market tab

**Files:**
- Modify: `apps/dsh-desktop/src/preload-extension.cjs`
- Modify: `apps/dsh-desktop/src/ui/extensions.html`
- Modify: `apps/dsh-desktop/src/ui/extensions.css`
- Modify: `apps/dsh-desktop/src/ui/extensions.mjs`
- Modify: `apps/dsh-desktop/test/preload-surfaces.test.mjs`
- Create: `apps/dsh-desktop/test/community-market-ui.test.mjs`

**Step 1: Write failing surface tests**

Assert the `市场` tab, search/category/sort/pager controls, list and install bridge methods, local-only CSP, and absence of iframe/webview/remote script markup.

**Step 2: Expose narrow preload methods**

Add `listCommunityMarket()` and `installCommunityMarketPlugin(id)` using the two fixed IPC channels.

**Step 3: Implement the tab markup and styling**

Add a native catalog masthead, filters, result grid, error/retry state, empty state, and pager. Match Extension Dock's restrained industrial settings aesthetic, with a denser editorial card grid and both light and dark theme support.

**Step 4: Implement renderer state**

Load once on tab activation, render localized bounded text with escaping, filter/sort/page locally, mark installed packages, invoke one market installation, show transaction progress, and refresh inventory after success.

**Step 5: Run focused tests**

Run: `node --test test/community-market-ui.test.mjs test/preload-surfaces.test.mjs`

Expected: PASS.

### Task 4: Retire dshmarket from Desktop composition

**Files:**
- Modify: `apps/dsh-desktop/package.json`
- Modify: `apps/dsh-desktop/src/profile.mjs`
- Modify: `apps/dsh-desktop/src/extensions/community-catalog.mjs`
- Modify: `apps/dsh-desktop/test/profile.test.mjs`
- Modify: `apps/dsh-desktop/test/community-catalog.test.mjs`
- Modify: `apps/dsh-desktop/test/runtime-integration.test.mjs`
- Remove: `apps/dsh-desktop/test/skin-market-persistence.test.mjs`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Remove: `patches/dshmarket@1.16.2.patch`
- Modify: `packages/dsh-web-ui-settings/README.md`
- Modify: `packages/dsh-web-ui-settings/README.zh.md`
- Modify: `packages/dsh-web-ui-settings/README.i18n.yaml`

**Step 1: Update profile expectations**

Assert that dshmarket is absent from built-in and managed runtime packages and present in the retired managed-package list.

**Step 2: Remove the one-off dshmarket community card**

Keep attributed repository-only community entries; discovery now belongs to the native market tab.

**Step 3: Remove package and patch dependencies**

Update the workspace catalog and lockfile with pnpm, then remove dshmarket-only integration tests and patch content.

**Step 4: Update paired documentation**

Describe Extension Dock's native market in both languages and regenerate the README i18n record with the repository's documented command.

**Step 5: Run focused tests**

Run: `pnpm desktop:test`

Expected: PASS with no dshmarket runtime route assertions.

### Task 5: Full verification and visual QA

**Files:**
- Verify only; fix the files above if checks expose a defect.

**Step 1: Run type and unit verification**

Run: `pnpm typecheck`

Run: `pnpm --filter @linxin666/dsh-desktop-client test`

Run: `pnpm desktop:test`

Expected: all checks pass.

**Step 2: Run repository checks affected by dependency and docs changes**

Run: `pnpm runtime-deps:check`

Run: `pnpm docs:check`

Run: `pnpm sync-shared:check`

Expected: all checks pass.

**Step 3: Capture Extension Dock**

Run: `pnpm --filter @deepseek-ai/dsh-desktop capture:extensions`

Expected: the market tab loads the live catalog, filters and pagination remain usable at 760px minimum width, and no external-page sandbox bar appears.

**Step 4: Package and smoke-test**

Run: `pnpm desktop:pack`

Run: `pnpm --filter @deepseek-ai/dsh-desktop pack:verify`

Run: `pnpm --filter @deepseek-ai/dsh-desktop pack:smoke`

Expected: package verification and isolated startup smoke pass.
