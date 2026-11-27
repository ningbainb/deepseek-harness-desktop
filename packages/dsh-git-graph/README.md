# dsh-git-graph

English | [中文](README.zh.md)

The Git branch icon in the conversation toolbar opens a searchable branch picker and the Git graph. Hovering the icon or reading its accessible name identifies the current branch. Git operations run in the host process against the session’s worktree.

Behavior aligns with ZCode's `GitBranchSwitcher`: searchable popover, a checkmark on the current item, bottom actions "创建并检出新分支… / Git 图谱" (Create and check out new branch… / Git graph), a switch guard (unresolved conflicts / an operation in progress / the target branch checked out by another worktree) and readable errors.

## Repository layout and build

The plugin lives in `packages/dsh-git-graph`. Its host and client projects resolve SDK types from the official `@deepseek-ai/*` npm dependencies. Run these commands from the workspace root.

```sh
pnpm install
pnpm --filter @linxin666/dsh-client-ui-git-graph typecheck
pnpm --filter @linxin666/dsh-client-ui-git-graph test
pnpm --filter @linxin666/dsh-client-ui-git-graph build
```

The package uses the repository's shared browser build preset in `shared/tsdown.client.ts`. The host serves the resulting `lib/client.js` at `/plugins/<id>/client.js`.

## Activation

The profile loads the Git service and its `/git/*` routes through `cordis.patch.yml`. Its client registers the branch icon in the conversation input toolbar when the session has a Git workspace.

### Generic install (any machine)

This plugin is merged into the dsh-web-ui family monorepo (`github.com/zhu1090093659/dsh-web-ui`). The plugin is published to npm; one-line install recommended:

```sh
dsh plugin --profile web add @linxin666/dsh-client-ui-git-graph
```

Or install the family aggregate package `@linxin666/dsh-web-ui-all` all at once (same one-line `dsh plugin --profile web add @linxin666/dsh-web-ui-all`).

Install from the repository when you need to debug code:

```sh
git clone https://github.com/zhu1090093659/dsh-web-ui.git
cd dsh-web-ui
pnpm install && pnpm -r build
dsh plugin --profile web add link:$(pwd)/packages/dsh-git-graph
```

> The `github:` install form applies to a standalone repo whose package sits at the repository root (the `prepare` script builds self-contained; pnpm ≥10 rejects it the first time, add the package key to the profile's `pnpm-workspace.yaml` `allowBuilds` per the printed error and retry). For subpackages of a monorepo use the `link:` form above.

### Local development loop (this repo checkout)

```sh
dsh plugin --profile <name> add link:/absolute/path/to/dsh-git-graph
```

A `link:` install references the local directory directly; a rebuild takes effect immediately without reinstalling (after a code change, `pnpm run build` then refresh the page). Note that `link:` takes an absolute path (`~` is expanded by the shell, not by pnpm semantics).

## Uninstall

```sh
dsh plugin --profile web remove @linxin666/dsh-client-ui-git-graph
```

## Design notes

- Boundary and load-chain research and key decisions: see [docs/ADR-001-plugin-boundary.md](docs/ADR-001-plugin-boundary.md).
- The host half's `/git/*` only accepts paths of registered workspaces (realpath check) and loopback clients (loopback socket + loopback Host, the same fence as dsh-ssh); the browser cannot run git against arbitrary directories, and a LAN-exposed dsh web answers non-loopback clients with 403.
- Desktop Worktree routes under `/git-worktree/*` are loopback-only and ID-only: the renderer sends `workspaceId`, `taskId`, `runId`, or `worktreeId`, never an absolute path, base ref, or Git argv. The Host resolves canonical workspace roots, places execution trees under `DSH_HOME/worktrees`, bounds diff previews, and requires explicit confirmation before a dirty discard.
- The switch semantics are workspace-level: `git switch --no-guess <branch>` operates on the repoRoot checkout tree and affects all sessions of that workspace; project switch = activate the target workspace and open its (reused or newly created) blank session, without changing the cwd of existing sessions.
- The icon mounts in the official session toolbar (`conversation.input.left`). The same control serves blank and active sessions in a Git worktree. The native menu anchors to its trigger, and switching sessions closes the previous worktree’s menu and dialogs.
- Workspace selection is not inside this plugin: the official workspace pill (`conversation.input.selector.workspace`) is the only entry; this plugin only provides git branch context.
- Branch state refresh: fetch on mount / popover open / successful switch + host SSE (`/git/events`, polling workspace state every 30s while subscribed, each probe bounded by a 15s deadline so a hung git never stalls the stream) pushing external changes + refresh on window focus (throttled to once per 5s).

## Check chain

```sh
pnpm run typecheck
pnpm test
pnpm run build
```
