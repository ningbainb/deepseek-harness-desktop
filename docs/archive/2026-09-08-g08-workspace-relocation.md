# G08 Workspace relocation compatibility and rollback evidence

Date: 2026-09-08.

## Supported result

The locked official SDK does not expose an in-place Workspace relocation
operation. `Workspace.path` and the Session header `cwd` are immutable, and a
Session can belong to a Workspace only when its canonical cwd matches that
Workspace path. Desktop therefore uses the compatible recovery path already
available through the public API:

1. Keep the old Workspace and Session identity unchanged so their provenance
   remains inspectable.
2. Validate that the new directory exists and is a directory.
3. Create or reuse the Workspace for the new canonical path.
4. Start future Sessions in that Workspace so their cwd is the new path.
5. Leave old Session logs readable without rewriting their header or editing
   the official persistence database.

The fallback is intentionally not described as moving an old Session. The
public `workspace.insertSessionBefore` operation is ordering-only and rejects a
Session whose canonical cwd differs with `workspace-move-invalid`.

## Automated scenario

`apps/dsh-desktop/scripts/verify-workspace-relocation.mjs` runs against a
fresh temporary Desktop user-data directory, DSH Home, Profile, old project
directory, and new project directory. It performs this sequence through the
real loopback API and official JSONL Session persistence:

1. Rejects a nonexistent destination and a file used as a directory with
   `workspace-invalid-path`.
2. Creates the old Workspace and a completed nonblank Session with a unique
   history marker.
3. Selects that Session, fully stops Desktop, and renames the project directory
   to simulate an external move while the application is stopped.
4. Relaunches with the old path absent, proves the selected old history remains
   visible in the conversation UI and readable through the API, and proves the
   immutable old cwd was not rewritten.
5. Creates the new-path Workspace, repeats the operation to prove idempotent
   reuse, and creates a new Session whose cwd equals the new path.
6. Confirms that attaching the old Session to the new Workspace is rejected
   instead of silently changing its provenance.
7. Stops Desktop, returns the physical directory to the old path, relaunches,
   and confirms that the old Workspace membership and history are restored.
8. Deletes the temporary new Workspace registration through the public API and
   confirms that deleting the registration does not destroy the new Session
   log.

The test preserves any empty old-path directory recreated by the Runtime during
an interrupted move before applying the physical rollback. It never overwrites
that directory and removes only its own isolated fixture in final cleanup.

## Results

The scenario passed in both modes:

- Development Electron: retained history, new Session cwd, idempotent
  new-Workspace registration, forbidden old-Session rebind, and rollback
  membership all passed.
- Windows `win-unpacked` executable: the identical black-box sequence passed
  against `dist/win-unpacked/DeepSeek Harness Desktop.exe`.
- The official contract guard in
  `apps/dsh-desktop/test/sdk-contracts.test.mjs` passed and rejects a future
  accidental assumption that relocation APIs exist.

The reusable commands are `pnpm --dir apps/dsh-desktop
test:workspace-relocation:e2e` for development and the same command with
`DSH_DESKTOP_E2E_EXECUTABLE` set to a verified packaged executable for package
acceptance. The packaged scenario is also part of the Desktop regression list.

## Remaining capability request

A single atomic user-facing action that changes an existing Workspace path and
rebinds its existing Sessions cannot be implemented without a new official SDK
contract. Such a contract would need preflight information for running tasks,
an atomic old/new mapping transaction, explicit history provenance semantics,
and a supported rollback operation. Until that exists, Desktop must not edit
official Workspace or Session persistence directly.

Physical file movement is also outside the fallback. Users or an existing Git
workflow own that action; linked worktrees, submodules, cross-volume moves, and
active tasks need separate validation. The automated test moves only its own
plain temporary directory while Desktop is stopped.
