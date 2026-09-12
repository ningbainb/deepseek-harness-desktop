# dsh-task-board — DSH web GUI task board plugin

English | [中文](README.zh.md)

A hot-pluggable DeepSeek Harness (DSH) client GUI plugin: it adds a **task board** entry below "新会话" (New session) in the sidebar; clicking it switches the middle column entirely to a multi-column kanban view. Tasks execute for **real** through DSH's own session mechanism (`session.prompt`), and execution status is written back to the card in real time.

- No DSH source modification: mounted as a cordis plugin + browser DOM extension (add-on shape identical to `dsh-web-ui/packages/skins/skin-center`).
- Unmounting restores the original state; other managed segments (dsh-skin / skin-center / personal config) are unaffected.
- Task data prefers a profile-isolated Host file and falls back to the retained browser v1 ledger when the Host endpoint is unavailable.

## Features

- **Save recovery**: the board and task details distinguish pending saves, unsaved drafts, and concurrent-edit conflicts. Failed changes remain in this window for retry; closing or refreshing loses them. Retry reads the latest ledger and merges only compatible changes, preserving Host execution state. Explicit reload asks before discarding a draft and replaces it only after a successful read. Scheduled tasks continue using their last saved settings; new executions require a successful save.

- **Sidebar entry**: injects a "任务看板" (task board) entry row inside the sidebar column (`[data-pane="sidebar"]` on older shells, `[class*="sidebarCol"]` on the DSH 0.1.0-rc.6 AppFrame layout) below the new-session button (wide rail shows icon + text, collapsed rail shows a bare icon, adapting to DSH skin tokens).
- **Multi-column board**: five columns — 待规划 (to plan) / 待办 (to do) / 进行中 (in progress) / 已完成 (done) / 已失败 (failed); cards show title, description, status, update time, and execution count; the top supports search filter, new task, and back to chat.
- **Task details**: click a card to open details (title/description/execution prompt/execution log) — it does **not** execute on a single click; the details offer "执行 / 重新执行" (Run / Re-run), "删除" (Delete, with confirm), "查看会话" (View session, jumps to the execution transcript), and a manual move to 待规划/待办.
- **Real execution**: on "执行" (Run), the plugin connects a workspace session through the client runtime (`workspaces.connectWorkspace`, reusing a blank session or letting the host create one), names the session after the task title, and drives a real agent via `session.prompt([{ type: 'text', text }], 'queue')`; it then subscribes to that session's snapshot and, once the round really finishes, sets the card to 已完成/已失败 and records the execution result. The execution session appears in the session list and can be opened to view the real transcript.
- **Status write-back**: card status (进行中 → 完成/失败) is driven by the real session state; after a page refresh/restart, leftover running tasks are auto-reconciled against the current session state (reconcile).
- **Scheduled tasks**: the details panel can schedule a task — an enable switch + a 5-field cron expression (分 时 日 月 周, supporting `*` / `*/n` / `a-b` / comma lists) + common presets (daily 09:00, every hour, every 10 minutes, Mondays 09:00); enabling computes and persists the "下次运行时间" (next run time), and the card shows a scheduled marker. An opt-in Desktop Runtime Provider host-job adapter can claim those slots in the Host; otherwise the existing browser path takes the same real-execution route as a manual run.
- **Host-file persistence**: the Host-owned v3 ledger stores Projects, compact Task Runs, derived Evidence, and optional durable-schedule state under `state/task-board/tasks-v3.json`; writes are serialized and atomically published, corrupt files are preserved, and v2 is copied to a backup before migration. Durable state carries an IANA time zone, bounded misfire/running policy, deterministic run key, provider evidence, and an expiring lease. Older Hosts keep the v2/localStorage fallback.
- **Worktree review**: Desktop 2.6 tasks can choose shared-workspace or Git Worktree. When the typed Runtime Provider exposes workspace/session observation capabilities, the Host creates a controlled Worktree and the detail view offers bounded Evidence plus Commit, Merge, Keep, and confirmed Discard; missing capabilities fall back explicitly to shared-workspace.
- **System-prompt injection**: the host half (`src/index.ts`) registers a `plugin:task-board` section (order 200) via `SystemPrompt.section`, declaring this plugin's existence, capabilities, and limits to every agent — it is injected when the plugin is in the composition (after mount + DSH restart) and disappears when removed (after unmount + restart), so an agent needs no external docs to know how to work with this board.

## Directory structure

```
package.json / tsconfig.json / tsdown.config.ts   # standalone repo build
build/tsdown.client.ts + build/web/src/platform.ts # client bundle preset copied from the DSH checkout (kept in sync with the running version)
src/index.ts / src/host/*.ts                       # host half: SystemPrompt + profile file store + fixed routes + durable scheduler adapter
src/client/index.ts                                # apply(ctx): wires runtime services + mounts DOM
src/client/sidebar-entry.ts                        # sidebar entry injection (self-healing MutationObserver)
src/client/board-mount.tsx                         # middle-column board mount + show/hide toggle
src/client/board/*.tsx                             # React board views (columns/cards/details/new/confirm)
src/client/board.module.css                        # styles (--dsw-* tokens, adapting to theme/skin)
src/core/tasks.ts                                  # task model + state machine (pure functions)
src/core/schedule.ts                               # cron parsing + next-run time (pure functions)
src/core/scheduler.ts / scheduler-authority.ts     # browser fallback ticker + Host/client ownership contract
src/core/store.ts / src/client/host-store.ts       # persistence seam, Host client, localStorage fallback + migration
src/core/execution.ts                              # real execution service (session connect/prompt/settlement watch)
src/core/controller.ts                             # controller (ledger state, view state, navigation awareness)
tests/*.spec.ts                                    # automated tests: storage/state transitions/execution trigger/cron/scheduling
scripts/dsh-task-board.js                          # one-click mount/unmount/status CLI
```

## Why it is wired this way (research conclusions)

- **No usable add-on slot in the sidebar**: the sidebar shell only declares two single slots, `sidebar.workspaces` / `sidebar.settings`, both already taken by ui-workspace / ui-settings; an external plugin cannot register a new slot (declaring means claiming, and duplicating throws). So the entry goes through the skin-precedent **DOM injection**, self-healed with a MutationObserver (when a React re-render touches the node it re-inserts within the same frame, no flicker).
- **The middle column cannot be replaced through a slot**: the `conversation` slot is single and already taken by ui-conversation. The board view mounts on the center column (`[data-pane="conversation"]` on older shells, `[class*="centerCol"]` on the DSH 0.1.0-rc.6 AppFrame layout) as a tail child node (outside React's ownership), toggled via the `<html data-dsh-taskboard-active>` attribute, keeping the chat subtree below mounted and stateful.
- **Persistence uses a bounded Host channel**: the host exposes only fixed ledger and event paths, resolves the file from `DSH_HOME` plus the configured profile, and never accepts a filesystem path from the browser. The client keeps localStorage v1 as a fallback and rollback source.
- **Execution rides the client runtime**: `ctx.sessions.list` subscribes to session state (`running` / `byId`), `ctx.workspaces.connectWorkspace()` creates/reuses a session, `session.prompt()` drives a real agent, and `ctx.sessions.open()` jumps to the transcript.
- **Background settlement relies on list reconciliation**: an unopened session has no chat-snapshot window (cold), so settlement keys off the session list — every list change reconciles running tasks; result judgment takes, in order, "missing from list → cancelled / still running → wait / chat snapshot visible → by lastAgentError / tail of raw history → a turn-error node proves failure / otherwise success", and reconciliation is idempotent.
- **Scheduled ownership is explicit**: an executable Desktop host-job adapter, available only after the user opts into background automation, claims due slots in the Host. It atomically advances the cron cursor and records the deterministic TaskRun before dispatch; leases prevent a second Host from taking a live slot, while an expired-owner takeover can retry only the same admitted key that has no persisted session identity. Browser tabs disable their legacy ticker only after the fixed Host status route positively reports that executable authority, and re-check that gate before every fallback admission. Every other case — old Web hosts, malformed status, or no adapter — keeps the in-tab scheduler as the safe fallback, with the existing skip-on-miss behavior.
- **Same-origin tabs share one ledger**: Host mutations emit SSE change events; local fallback mutations use browser storage events. Either channel reloads the newest ledger so a task deleted in one tab cannot keep firing or be written back from another tab's stale copy.

## Install

Install the family aggregate package `@linxin666/dsh-web-ui-all` (all plugins and skins in one) or this plugin alone:

```sh
### 从 npm 安装（推荐）
dsh plugin --profile web add @linxin666/dsh-client-ui-task-board

### 从仓库安装（开发调试）
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-task-board

```

After installing, **restart `dsh web`** — a "任务看板" (task board) entry appears below "新会话" (New session) in the sidebar; a page refresh is not enough, the process must restart.

## Build

Prerequisites: Node ≥ 20 with the official NPM SDK reachable (configure the `NPM_TOKEN` env var + project `.npmrc` if still using private-scope auth; see the repo `docs/plugins.md`). Types and runtime APIs all come from the official NPM SDK (`@deepseek-ai/*` devDependencies); **no DSH source checkout is required**.

```sh
cd ~/code/dsh-web-ui/packages/dsh-task-board
pnpm install        # first time (run pnpm install at the workspace root)
pnpm run build      # produces lib/index.js + lib/client.js (tsdown + shared/tsdown.client.ts preset)
pnpm run typecheck  # type check (SDK package types from node_modules)
pnpm test           # vitest: storage read/write / state transitions / execution trigger
```

## Mount / Unmount

This plugin uses the official profile-bundle shape (package.json declares `dsh.bundle.patch` + `dsh.client`, see `cordis.patch.yml`). Mounting = registering the dependency and bundle rows in the web profile manifest (`~/.dsh/profiles/web/package.json`) and installing:

```sh
# Mount (registers dependencies + dsh.profile.bundles, pnpm install; takes effect after restarting the GUI)
node scripts/dsh-task-board.js mount

# View status
node scripts/dsh-task-board.js status

# Unmount (removes the registered rows; restores the original GUI after restart; task data is kept)
node scripts/dsh-task-board.js unmount
```

The rows registered in the profile manifest:

```json
{
  "dependencies": { "@linxin666/dsh-client-ui-task-board": "link:/Users/zcl/code/dsh-web-ui/packages/dsh-task-board" },
  "dsh": { "profile": { "bundles": [ "...", "@linxin666/dsh-client-ui-task-board" ] } }
}
```

> Note: the profile layer (bundle rows, `dsh.client` metadata) is read when the dsh web process starts, so a **restart of the dsh web GUI** is required after mount/unmount (a page refresh is not enough).

## Data storage location

- The authoritative v3 ledger lives at `DSH_HOME/profiles/<profile>/state/task-board/tasks-v3.json`; `profileName` defaults to the running `DSH_PROFILE` (or `web`).
- A v2 document is copied to a timestamped backup, migrated without inferring Worktree isolation, read back, and verified before the v3 marker is written. The v2 source and browser v1 key remain available for older environments.
- When the v3 Host endpoint is unavailable, the board selects the compatible v2 Host or v1 localStorage path. Host updates synchronize through SSE; there is no high-frequency storage poll.

## Security model

- Host routes are exact paths, accept loopback same-origin requests only, cap request bodies, and never accept profile names or filesystem paths from the browser.
- Persisted Task Runs and Evidence contain task fields, opaque session/workspace/run references, revisions, bounded file summaries, and capability evidence, not model messages, tool output, Secrets, raw patches, or complete transcripts.

## Known limitations

- A durable Host scheduler activates only when a Desktop Runtime Provider deliberately supplies its host-job adapter (normally after the user opts into background automation). In every other runtime, including an unavailable or malformed Host status route, the browser scheduler remains the explicit fallback.
- The Host advances `nextRunAt` and writes the deterministic TaskRun before dispatch. Sleep/restart misfires default to `skip`; `run-once` deliberately coalesces one overdue slot, and `queue-next` retains at most one slot while a task is running. After an expired foreign lease, only an admitted run with no persisted session identity can be re-submitted under its same deterministic key. It does not promise execution after the application has fully exited.
- Worktree execution still requires the optional Runtime Provider capabilities; absent capabilities use shared-workspace.

## Manual verification steps

1. `npm run build` → `node scripts/dsh-task-board.js mount` → refresh `http://127.0.0.1:3080`.
2. A "任务看板" (task board) entry row appears below "新会话" in the sidebar; click it → the middle column switches to the five-column board.
3. "+ 新建任务" (New task) with title/description/Prompt → the card appears in 待办 (to do).
4. Click the card → details show content and Prompt; click "执行" (Run) → the card becomes 进行中 (in progress) (a session named after the task title appears in the session list); after the agent finishes the card lands in 已完成 (done) or 已失败 (failed), the detail execution log has a result and time, and "查看会话" (View session) jumps to the real transcript.
5. Scheduled task: details → tick "定时运行" (Scheduled run) to enable, pick the preset "每 10 分钟" (every 10 minutes, cron `*/10 * * * *`); a scheduled marker appears on the card. With the opted-in Desktop host-job adapter, close the board and wait for the next whole 10-minute mark; otherwise keep the tab open. The card enters 进行中 (in progress) and eventually completes, with "上次触发" (last trigger) and a new linkable execution-log row.
6. Refresh the page / restart DSH → tasks remain; unmount the plugin → the GUI restores to its original state.

## Acceptance checklist

- After mount, a "任务看板" (task board) entry appears in the sidebar; clicking toggles the board, and clicking a session item returns to the chat view
- New task (title + description/Prompt); tasks remain after refresh/restart (profile Host file, localStorage fallback)
- Click a card to open details (content + execution log); the details have "执行" (Run) and "删除" (Delete) buttons
- Execution really starts a session (its transcript is visible in the session list); card status follows the real execution progress; the details can jump to the execution session
- Delete has a confirm step, and the local store is synced-removed after deletion
- Scheduled tasks: cron config/preset/validation, next-run time, auto real execution at the due time, status write-back, scheduled card marker, and one explicit authority: opted-in executable Desktop Host scheduling or browser fallback (which requires the tab to stay open)
- One-click mount/unmount; after unmount the GUI restores and other managed segments are unaffected
- README + automated tests covering storage read/write, state transitions, execution trigger, cron parsing, and the scheduler
