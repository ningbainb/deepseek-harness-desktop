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

An unpackaged Desktop can evaluate an exact prerelease with `DSH_DESKTOP_CANDIDATE_VERSION`, `DSH_DESKTOP_CANDIDATE_EVIDENCE` and `DSH_DESKTOP_CANDIDATE_MATRIX`. Both evidence paths must be absolute; `DSH_HOME` and `DSH_DESKTOP_USER_DATA` must be separate explicit directories beneath the process temporary directory. Candidate admission retains package, CLI, lockfile, provider, Desktop and patch provenance checks and reports `candidate`, never `supported`. Packaged Desktop rejects this path. Stable evidence and public updater assets remain unchanged during evaluation.

The private pipe overlay disables Web startup, HTTP server and Web runtime ownership. Its connection entry explicitly clears profile-level Web startup injection and trusted-host configuration; the official Connection plugin retains its own credentials dependency. Authenticated pipe handshakes and SDK credentials checks remain mandatory. Profile composition and real settings reload, restart and environment-repair verification cover this boundary without changing official SDK source.

Logical event and history streams use Connection's SDK-owned browser Peer. The legacy operator is used only when that earlier SDK interface is present; Desktop does not fabricate a principal or bypass the Gateway's Peer checks. Settings consumers accept official snapshots without the legacy `mode` property while retaining Desktop-owned `host` and `memory` values where supplied.

The pinned sidebar's NPM patch delegates each Host request to Connection's public authentication fence; it retains the existing Desktop client, terminal routing, layout anchors and preference migration. GUI acceptance checks use bounded, awaited polling for asynchronous predicates, so an unresolved Promise cannot count as a successful readiness or persistence check.

Desktop's profile-mounted client HMR adapter scans bundle metadata asynchronously with four concurrent reads and no overlapping batches. Official module reconciliation still owns graph and rebuild delivery and can perform synchronous work. Runtime readiness is announced only after the SDK startup listeners and its public initial HMR queue settle; no fixed startup delay or longer shutdown deadline substitutes for that completion barrier.

The application's own root Include applies Desktop composition through the SDK's public config-context waterfall on initial and subsequent reloads. ConfigEditor retains its original membership, schema, file-lock, persistence and rollback implementation. Only a uniquely mapped client HMR entry receives a stable configuration-name view for its original SDK guard; the actual Loader entry and module owner stay unchanged, and stale entries are not rebound by ID.

## Maintenance commands

Run these only as part of an intentional reviewed runtime update:

```powershell
pnpm runtime-support:write
pnpm runtime-support-matrix:write
pnpm runtime-support:check
pnpm runtime-support-matrix:check
```

The deeper workflow and report guarantees are documented in [upstream runtime support](upstream-runtime-support.md) and [upstream compatibility](upstream-compatibility.md).
