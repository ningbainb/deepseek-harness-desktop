# dsh-aionui-panel — DSH Web GUI right-panel system

English | [中文](README.zh.md)

> A pixel-faithful re-implementation of AionUi's right-panel system (Apache-2.0 licensed reference implementation, not a copy): Explorer project panel (file tree / filename search / Git changes) + Preview panel (multi-tab preview of 10+ formats) + a unified draggable layout system, with per-project preference persistence.

## Install

Install the family aggregate package `@linxin666/dsh-web-ui-all` (all plugins and skins in one) or this plugin alone:

```sh
# Recommended: install directly from npm
dsh plugin --profile web add @linxin666/dsh-client-ui-aionui-panel

# Or from the repository (development loop)
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-aionui-panel

```

After installing, **restart `dsh web`**. With the native Sidebar SDK available, DSH owns the default right-side surface and its session tabs, without forced expansion or navigation on session changes. The edge expand control opens the preserved compatibility tools; older hosts use those columns directly.

Panel headers reserve space for the sibling workbench controls. Explorer close remains inside its toolbar; replacing the application frame remounts panel content and preserves the panel stores.

After the native right dock takes over, the compatibility Explorer and editor yield their layout space without closing tabs or changing saved preferences. Collapsing the native dock does not reopen the old columns. The edge expand button or an explicit edit action returns to compatibility tools. When an empty conversation omits the native header return button, one composer control opens the same native sidebar through its public controller; it yields to the native header button when present.

## Usage

Web preview opens through the official Sidebar tab system when available, including the native new-tab guide. The compatibility preview plus creates an independent native web tab without discarding editor buffers; older hosts retain the URL tab. Native browser addresses and unfinished address-bar edits live for the tab record, surviving hide and remount but not application restart. Native tabs and floating headers own closing, without a duplicate address-bar button; Ctrl/Cmd+W in the address bar remains available, and compatibility viewers retain their close button. Legacy committed addresses persist locally with project tab metadata and are never read as filesystem paths. Both viewers retain an opaque iframe sandbox without popup authority; sites that reject embedding may remain unavailable.

With the native Sidebar SDK available, the Explorer toolbar opens the original DSH Files page or a native Git changes tab. The native new-tab guide also offers File tools (search, drag, path references and editing). These pages share the existing workspace stores and editor buffers; their native title strip owns closing and splitting, with no nested Files/Changes toolbar. Hidden desktop Explorer bodies suspend their UI, while stores and unsaved editor tabs remain intact. Tools only act for their current owning conversation; older hosts retain the desktop columns.

In a project session (the current session has a working directory), compatibility tools expose these capabilities:

- **Explorer (rightmost column, default 260px, range 220–500px)**: `File / Changes` tabs; folder rows expand/collapse, while common documents and images open through a registered native DSH Sidebar reader when available. The context-menu `Edit / compatibility preview` retains Desktop editing; existing editor buffers keep their owner. Switching preview owners hides the other surface without closing its tabs. Filename search is debounced by 150ms and reveals results in the tree. `Changes` reads real Git status and supports stage / unstage / discard with bulk confirmation.
- **Drag a file to the input box**: internal file-tree rows insert workspace-relative paths. When the official generic-file lifecycle is available, DSH owns new uploads, progress, retry and removal; the duplicate picker is omitted. Large images retain validation/compression, and mixed batches preserve order before native admission. Legacy `.dsh-attachments/` draft references retain existence checks, missing-file warnings and removal. Older shells retain the sequential upload queue (100 MB per file), or text/path fallback without that queue. PDF, Office and binary contents are not pre-parsed by this plugin.
- **Preview (second column from right, default 480px, range 340–1200px)**: multi-tab preview supporting markdown / html / code / diff / csv / pdf / word / excel / ppt / image / text / url; source/preview toggle, split-screen editing (ratio persisted), save (mtime conflict detection), download, refresh (4-state: dead buttons are not rendered), dirty dot, middle-click close, right-click menu batch close (dirty confirm), and tab-overflow gradient indicator.

Interaction details:

- Drag the left edge handle to resize (merged per frame via rAF, body user-select:none); double-click the handle to reset to the default width.
- Two-level width clamping (Explorer first, Preview second) mathematically guarantees the chat area stays >= 360px; out-of-range values are written back to persistence.
- Collapse = width shrinks to 0 while stores retain tree expansion and preview tabs; hidden Explorer children unmount to release focus listeners, with no transition animation. A floating expand button appears on the right after collapsing.
- Light/dark themes follow the GUI (`body[data-ds-dark-theme]`), and prefers-reduced-motion globally disables animations.
- Preferences persist per project (localStorage keys matching AionUi): `chat-workspace-width-px` / `chat-preview-width-px` / `preview-panel-split-ratio` / `project-panel-collapse:<root>` / `explorer-ui:<root>` / `scm-ui:<root>` / `preview-ui:<root>` (LRU capped at 12 scopes). Reads are always range-checked; invalid values fall back to defaults.

## Data sources

The real filesystem and the real git repository, no mocks:

- The host half (`src/index.ts` + `src/host/`) serves directory listing, file reads (text capped at 80k chars / image data URLs), writes (mtime conflict detection), filename search (skipping .git / node_modules), git status (porcelain v1 -z) / stage / unstage / discard, and an SSE change stream (fs watching + git polling) over the `/aionui-panel/*` HTTP routes.
- All operations pass through a workspace guard: paths must fall inside a registered workspace (realpath normalization + prefix check); the browser can only read/write relative paths under the project root.
- Every `/aionui-panel/*` route (JSON operations, raw reads, and the SSE events stream) is loopback-only: non-loopback clients get `403 forbidden: loopback-only` before any workspace access, matching the dsh-ssh fence.
- The recursive watcher ignores changes under `node_modules` / `.git`; the SCM poll runs every 30s per workspace (each probe bounded by a 15s deadline), and roots that are not git repositories stop being re-probed thanks to a TTL cache. File edits surface via the watcher immediately; `.git`-only changes (commits/checkouts from other tools) appear within one poll interval or on window focus (throttled to once per 5s).
- The browser half (`src/client/`) treats the current session cwd as the project root; switching sessions switches projects.

## Structure

- `src/index.ts` — host half entry (cordis plugin: route registration + systemPrompt announcement).
- `src/host/` — fs/git data services and the route layer (workspace gate).
- `src/core/types.ts` — shared wire types across both halves.
- `src/client/` — browser half: framework-agnostic state core (`store.ts`), drag engine (`drag.ts` + `hooks/useResizableSplit.ts`), DOM layout controller (`layout.ts`, appending panel tracks to the shell's three-column grid), React components (explorer / scm / preview).
- `tests/` — pure-logic tests for the clamp formula, porcelain parsing, persistence validation, markdown/csv rendering, store behavior, etc. (vitest, 37 tests).

## Build

```sh
export NPM_TOKEN='<token>'   # only if private scope auth is still required
pnpm install
pnpm -r build
```

## Attribution

This project is a re-implementation of the AionUi (iOfficeAI/AionUi, Apache-2.0) right-panel system: sizes, colors, motions and interaction parameters come from measured research against v2.1.53 (research report and screenshots live in the aionui-research repository), the implementation is entirely new code and does not copy the source in bulk. Upstream copyright belongs to the AionUi project; this project preserves attribution under the Apache-2.0 convention.

## Security model

The legacy attachment endpoint accepts only same-origin loopback requests for an existing direct session. The host session header supplies the working directory, which is checked against the workspace registry; caller-selected directories, traversal and external symlinks are rejected. Its streams are capped at 100 MB and create exclusive new files; failures clean up incomplete copies. File contents are never executed. Removing a legacy card removes the draft reference, not the source file or uploaded copy, preserving historical references. Copies live inside the workspace and may appear in the file tree and Git untracked list; ignore rules are not changed automatically. Unpaired remote access remains rejected. Native uploads follow the official DSH admission and storage policy; this plugin does not bypass its checks. Anonymous outcome signals contain only fixed state codes, never filenames, paths, attachment ids or content.
