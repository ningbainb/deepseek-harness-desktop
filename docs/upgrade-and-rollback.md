# Desktop 3.0 upgrade and rollback

Desktop 3.0 upgrades deliberately preserve a recovery boundary. The Migration Assistant service scans a fixed set of Desktop state files, produces a data-free plan, creates a private snapshot before mutation, writes an atomic journal, and can resume or restore that snapshot after interruption.

## Supported source family

The migration matrix covers Desktop 2.3 through 2.7. A scan classifies the plan as `safe`, `needs-confirmation`, or `blocked` based on version evidence, profile ownership, runtime support, plugin compatibility, preset/SDK/provider compatibility, and task storage. Recognized Task Store v2/v3 state is detected, validated, and captured only inside the allowlisted snapshot/journal boundary. The legacy 2.3 browser-localStorage task path is deliberately `needs-confirmation`: the scan does not expose browser contents or task/run counts. After explicit confirmation, supported preserved-origin v1 data is read only from its same-origin key through a hidden CSP/no-scheduler/no-permission probe, copied only into an empty v3 Host ledger, and verified by task count and fingerprint; the original browser value is retained. An unknown, missing, or changed origin blocks the copy and keeps recovery/rollback guidance available. Keep a separate offline backup and use the recovery guidance for that legacy data.

Blocked plans do not start automatically. Typical blockers include malformed or conflicting version evidence, unsupported legacy state, a newer state that would be downgraded, blocked runtime support, or incompatible plugins. A `needs-confirmation` plan requires explicit confirmation before it can create a journal.

## Snapshot and journal

The private snapshot contains only the Desktop profile manifest, profile lockfile, managed settings patch, task state, Desktop state, and runtime-support state. It records sizes and hashes for verification but never treats a project directory as migration input. By default, recent snapshots are retained privately for a bounded period; unreadable recovery data is retained for explicit repair instead of being deleted automatically.

The journal moves through `started`, `step-complete`, `committed`, and `rolled-back`. Each step is atomically recorded after it completes. After an interruption, reopening the service lists pending steps without rerunning completed ones. A rollback restores the exact allowlisted snapshot bytes and keeps project content outside the migration boundary untouched.

## Before proceeding

1. Review the scan and its guidance before confirming a plan.
2. Resolve `blocked` runtime or plugin compatibility problems instead of bypassing them.
3. Keep a separate offline backup for unsupported legacy state or any state you do not recognize.
4. If a migration is interrupted, resume its journal or roll it back before starting another migration.

Desktop Stable accepts only its selected update channel and never accepts a downgrade. A Stable channel installation does not consume prerelease artifacts. Release artifact hashes, updater metadata, and optional signature verification are checked independently of migration state.

See [compatibility policy](compatibility-policy.md), [runtime support policy](runtime-support-policy.md), and [security boundaries](security-boundaries.md).
