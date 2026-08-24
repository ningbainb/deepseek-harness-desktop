# Preset File Ingress Design

## Context

The packaged preset deep-link check exposed a startup race. Electron receives a .dshpreset command-line argument before the direct-start coordinator has created profiles/desktop/package.json. The existing pending queue prevents command-line loss but dispatches its preview immediately after the main-process wiring is installed, so the preview can fail with ENOENT.

## Options

1. Retry preview with backoff. This keeps the race implicit, adds timing sensitivity, and can still fail on a slow first launch.
2. Bootstrap the profile a second time in the command-line ingress path. This duplicates the coordinator's ownership and risks competing profile writes.
3. Keep the queue and gate only preset preview on the full-profile bootstrap promise. This preserves startup parallelism and deep-link behavior while making the required file contract explicit.

Option 3 is selected.

## Data flow and failure handling

Command-line and open-file events continue to enqueue at most eight preset paths. Dispatch waits for a one-shot profile-ready promise, then calls the existing preset service and extension window flow. The promise is released in a finally block whenever the full profile bootstrap completes or fails. Therefore a profile error cannot leave an unresolved queue forever; preview still fails closed with the existing redacted log message. The dsh:// router remains independent and keeps its current readiness gate.

## Verification

Unit behavior remains covered by the existing preset and ingress tests. The packaged smoke test is the primary regression check because it launches the real unpacked executable with a fresh Home, opens a preset and a deep link together, asserts preview-only behavior, and verifies queued navigation after Runtime readiness. Direct-start matrix and fresh-relaunch checks remain separate release gates.