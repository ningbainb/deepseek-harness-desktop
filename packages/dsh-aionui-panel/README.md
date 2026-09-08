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

After installing, **restart `dsh web`** and open a project session to see the "预览" (Preview) and "文件/变更" (Files/Changes) panels to the right of the chat area.

Panel headers reserve space for the sibling workbench controls. Explorer close remains inside its toolbar; replacing the application frame remounts panel content and preserves the panel stores.

## Usage

When a project session (the current session has a working directory) is open, two panels appear to the right of the chat area:

- **Explorer (rightmost column, default 260px, range 220–500px)**: `File / Changes` two tabs; clicking a row in the file tree expands/collapses a folder, clicking a file opens it in the preview panel, and the top filename search (150ms debounce, clicking a result locates it in the tree without interrupting flow); the `Changes` tab reads the real git status and supports stage / unstage / discard (untracked via delete, tracked via restore, bulk discard asks for confirmation).
- **Drag a file to the input box**: internal file-tree rows insert workspace-relative paths. External non-image files in local sessions upload sequentially into removable attachment cards with pending, ready, failed and retry states, capped at 100 MB per file. Files are stored under `.dsh-attachments/` in the session workspace and sent as real references; PDF, Office and binary contents are not pre-parsed. Images retain the native attachment and large-image validation/compression flows. Older hosts without a file queue retain text insertion and path-reference fallback.
- **Preview (second column from right, default 480px, range 340–1200px)**: multi-tab preview supporting markdown / html / code / diff / csv / pdf / word / excel / ppt / image / text / url; source/preview toggle, split-screen editing (ratio persisted), save (mtime conflict detection), download, refresh (4-state: dead buttons are not rendered), dirty dot, middle-click close, right-click menu batch close (dirty confirm), and tab-overflow gradient indicator.

Interaction details:

- Drag the left edge handle to resize (merged per frame via rAF, body user-select:none); double-click the handle to reset to the default width.
- Two-level width clamping (Explorer first, Preview second) mathematically guarantees the chat area stays >= 360px; out-of-range values are written back to persistence.
- Collapse = width shrinks to 0 while the component stays mounted (tree expanded state / preview tabs are not lost), no transition animation; a floating expand button appears on the right after collapsing.
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

Attachment uploads accept only same-origin loopback requests for an existing direct session. The host session header supplies the working directory, which is checked against the workspace registry; caller-selected directories, traversal and external symlinks are rejected. Streams are capped at 100 MB and create exclusive new files; failures clean up incomplete copies. File contents are never executed. Removing a card removes the draft reference, not the source file or uploaded copy, preserving historical references. Copies live inside the workspace and may appear in the file tree and Git untracked list; ignore rules are not changed automatically. Unpaired remote access remains rejected.
