# Background mode and scheduler

DeepSeek Harness Desktop runs background automation only after the user selects **Minimize to tray and enable background automation**. The default close behavior is **Quit**; **Ask every time** asks at close time but does not enable background automation.

## Window and tray lifecycle

The close preference is one of `quit`, `minimize-to-tray`, or `ask`. Closing or minimizing the main window in the opt-in mode hides it and keeps the Desktop Runtime alive. Without that opt-in, the titlebar minimize action retains ordinary taskbar behavior. **App > Minimize to tray** (`Ctrl+Shift+M`, or `Cmd+Shift+M` on macOS) provides one-time residency without rewriting the saved close choice or restarting the Runtime. Changing the close choice to **Quit** restores a hidden main window before removing its tray. If tray creation fails, minimization retains taskbar access instead of hiding the only reachable window. The native tray restores the window on click or double-click, shows current task/runtime state, opens Extension Dock, checks for updates, and provides an explicit quit action.

Update installation, explicit quit, crash recovery, and operating-system shutdown bypass background hiding. A fully exited Desktop application never claims to run scheduled work.

Renderers receive only the read-only `background` summary nested in the existing Runtime Status Contract response. The Tray object, close-preference writer, and Electron objects are never exposed to renderer or plugin code.

## Durable Host scheduling

With background automation enabled, Desktop starts the DSH runtime with `DSH_DESKTOP_BACKGROUND_AUTOMATION=1`. `@linxin666/dsh-desktop-compat` provides a host runner that uses the Runtime Provider's registered workspace and session lifecycle; it does not fabricate shell execution.

Task Board persists the schedule, timezone, misfire policy, lease, provider evidence, next slot, and execution key. Host admission writes the running record before invoking an agent. A conflicting browser admission reloads the ledger and never starts an agent. Host admission likewise leaves a browser-owned running record untouched, so a browser settlement cannot be overwritten.

Ownership is evaluated per task. The Host owns only tasks it can actually run; tasks without a project, with an effective Git worktree, a blank prompt, an unavailable workspace, or no default model remain on the browser scheduler. The browser scheduler remains present and skips only the published Host-owned task ids, preventing a global Host switch from starving legacy tasks.

## Fallback and recovery

When no compatible Host runner is active, the Task Board reports `client-fallback` and retains browser scheduling. Lease expiry replay is deliberately narrow: only an unfinished deterministic Host execution with no persisted session id can be resumed with the same execution key. A runner must reuse that key's session identity and return canonical Task Run and Evidence records.

See [Task Board v3](task-board-v3.md) for Project, Task Run, Worktree, and Evidence behavior, and [Desktop](desktop.md#close-behavior-and-background-automation) for the user-facing close preference.
