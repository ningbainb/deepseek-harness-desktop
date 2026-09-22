# Upstream runtime support matrix

Desktop Stable pins an exact DSH runtime graph. `apps/dsh-desktop/package.json` and `pnpm-lock.yaml` remain the package-byte authority; the files in `apps/dsh-desktop/runtime-support/` are derived, machine-readable evidence and never promote a candidate by themselves.

Desktop 4.3.0 Stable pins DSH `0.1.6-alpha.2` and a source-verified `dsh-web` alpha 0.3.23 cohort at commit `29fd16ae968fb617323be179915f480b289a3886`. Every later runtime change must return to the candidate workflow; a package version alone never promotes itself. The source cohort and Desktop-only exceptions are tracked in [the sync ledger](upstream-web-sync.md).

## Stable matrix

`known-good.json` records exact package, peer, provider-capability, client-slot, compatibility-patch, and packaged-runtime evidence. `supported-runtimes.source.json` is the reviewed metadata input, and `supported-runtimes.json` is its atomic, validated derivative. Matrix entry statuses are `known-good`, `supported`, `candidate`, and `blocked`.

Only `known-good` and `supported` entries may be selected by Stable. `candidate` and `blocked` entries are diagnostic workflow artifacts, not updater targets. A candidate becomes Stable only through a separate reviewed change that updates package metadata and the lockfile, regenerates Stable evidence, and passes the release gate.

Regenerate stable evidence after an intentional package, lockfile, capability, slot, patch, or Desktop-version change:

```powershell
node scripts/generate-runtime-support.mjs --write
node scripts/generate-runtime-support-matrix.mjs --write
node scripts/generate-community-plugin-quality-report.mjs --write
node scripts/generate-runtime-support.mjs --check
node scripts/generate-runtime-support-matrix.mjs --check
node scripts/generate-community-plugin-quality-report.mjs --check
```

The generators validate JSON before and after their atomic replacement. Stable generation rejects candidate or blocked support status.

## Candidate Matrix workflow

[DSH Candidate Matrix](../.github/workflows/dsh-candidate-lite.yml) accepts an exact `@deepseek-ai/dsh` version through `workflow_dispatch`. Its weekly schedule is inert until a reviewer commits one exact version to `apps/dsh-desktop/runtime-support/candidate-queue.json`; it never resolves `latest`.

The workflow snapshots the clean Stable checkout, creates a detached temporary worktree, and changes candidate packages and peers only in that worktree. It runs dependency/export and Contract checks, built-in plugin, Task Board, Git Graph, Worktree, Evidence, Preset, Deep Link, rollback, scheduler, provider lifecycle, directory picker, packaged smoke, upgrade, and shutdown coverage. It then uploads Markdown and JSON reports plus a temporary candidate matrix.

Reports compare current and candidate package identity, peers, client slots, provider capabilities, CWD and event semantics, compatibility patches, and packaged runtime identity. Their patch assessment marks each patch as retained, requiring re-verification or removal review, or newly introduced. A successful report has status `candidate` and recommends an independent upgrade change; any failed check, CWD/event-semantic break, or Stable mutation has status `blocked`.

Candidate work never changes the Stable checkout, Stable package manifest, lockfile, release notes, updater metadata, `main`, or a release. The workflow proves this with both Git state and hashes before publishing evidence.

## Community plugin quality report

`community-plugin-quality.json` is a local-only report generated from checked-out plugin manifests and fixed evidence input. It records the exact package version, license, declared `dsh.compatibility` metadata, install scripts, local build/typecheck/test command combinations, tested Desktop/DSH combination, CI status, and smoke date.

The generator does not fetch a registry, repository, or network resource. Normal Desktop startup also does no quality-report or registry request; Registry work remains an explicit Extension Dock action or an explicit generation/CI command.

`desktopVerified` is deliberately narrow: it means the locally recorded license, exact-version, compatibility declaration, build/test declaration, CI, and smoke conditions are all present for the stated Desktop/DSH pair and date. It does not mean a security audit, it expires as versions change, and absent local evidence remains `false` rather than guessed.

## Focused verification

```powershell
node --test scripts/runtime-support.test.mjs scripts/runtime-support-matrix.test.mjs scripts/dsh-candidate-report.test.mjs scripts/dsh-candidate-execution.test.mjs scripts/resolve-dsh-candidate-input.test.mjs scripts/community-plugin-quality-report.test.mjs
```
