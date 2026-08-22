# Desktop 3.0 runtime support policy

Desktop Stable runs an exact reviewed DSH runtime graph. `apps/dsh-desktop/package.json` and `pnpm-lock.yaml` are the byte authorities; `apps/dsh-desktop/runtime-support/known-good.json` and `supported-runtimes.json` are generated evidence that records what was reviewed.

## Stable admission

At startup, Desktop assesses the Runtime Provider against the packaged support matrix. The upstream version, provider ID, Desktop version range, package integrity, lockfile digest, and SHA-256 digests of the resolved Runtime `package.json` and `lib/bin.js` must match one matrix entry. This detects an altered same-version unpacked entrypoint before it starts. A packaged application stops before starting an unsupported runtime rather than falling back to an unverified selection.

| Matrix status | Stable behavior |
| --- | --- |
| `known-good` | Allowed after exact matrix match |
| `supported` | Allowed after exact matrix match |
| `candidate` | Blocked from Stable selection |
| `blocked` | Blocked from Stable selection |

The public Runtime Provider snapshot also preserves legacy `degraded` and `unsupported` values for existing clients. They are diagnostic states, not Stable admission states.

## Evidence and patches

Every reviewed matrix entry carries runtime package integrity, lockfile SHA-256 provenance, SHA-256 hashes for the Runtime package manifest and CLI entrypoint, provider capabilities, client slots, packaged-runtime identity, and compatibility patch registry evidence. The file hashes are an installation-integrity check; installer signing remains the publisher-identity trust layer. Each compatibility patch has a stable ID, exact applicable versions, upstream reference, owner, regression-test paths, removal condition, and last verification date.

The patch registry is a temporary compatibility boundary. A patch is removed only after its removal condition is met for the candidate runtime and its referenced regressions pass. A passing candidate does not automatically edit Stable metadata, the lockfile, the updater channel, or a release.

## Candidate workflow

Candidate evaluation accepts an exact version, works in a disposable detached worktree, and emits diagnostic reports. It tests the Contract, built-in plugin behavior, Task Board, worktrees, evidence, presets, deep links, scheduler, recovery, packaged startup, upgrade, and shutdown behavior without mutating the Stable checkout.

A candidate becomes Stable only in a separate reviewed change that updates the exact package and lockfile inputs, regenerates known-good and matrix evidence, evaluates every compatibility patch, and passes the release gate. `latest` is never a Stable runtime input.

## Maintenance commands

Run these only as part of an intentional reviewed runtime update:

```powershell
pnpm runtime-support:write
pnpm runtime-support-matrix:write
pnpm runtime-support:check
pnpm runtime-support-matrix:check
```

The deeper workflow and report guarantees are documented in [upstream runtime support](upstream-runtime-support.md) and [upstream compatibility](upstream-compatibility.md).
