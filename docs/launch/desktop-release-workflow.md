# DeepSeek Harness Desktop 3.0.5 release preparation and handoff

This guide describes repository verification for a possible release. It does not authorize a push, tag, GitHub Release, deployment, or announcement.

## Sources of truth

The Desktop version is `apps/dsh-desktop/package.json`; root `package.json` must agree. The checked-in bilingual body is [release notes](release-notes.md). Public claims must agree with the [Desktop guide](../desktop.md), [compatibility policy](../compatibility-policy.md), [Runtime support policy](../runtime-support-policy.md), [upgrade and rollback guide](../upgrade-and-rollback.md), and [privacy policy](../../PRIVACY.md).

## Channel contract

| Channel | Tag | Package version | Updater metadata | User behavior |
| --- | --- | --- | --- | --- |
| Stable | `desktop-vX.Y.Z` | Final version | `latest.yml` | Default; no prerelease and no automatic downgrade |
| Beta | `desktop-beta-vX.Y.Z-prerelease` | Prerelease version | `beta.yml` | Explicit opt-in; no automatic downgrade |

## Required verification

Run `pnpm verify` for the complete repository gate. A release candidate must also package an unsigned directory first and run the direct-start matrix against that exact executable before any signed installer is produced.

The direct-start matrix covers clean installs, real preserved Homes from Desktop 2.3 through 2.7 and 3.0.1, user plugins, settings, sessions, syntax failures, startup throws, invalid repair candidates, native ABI failures, verified repair, and same-Home built-ins fallback. It asserts that no startup choice page appears and that preserved state remains in the same Home.

The Desktop Release workflow then packages the selected updater channel, runs packaged directory-picker, terminal, window-chrome, profile, direct-start, smoke, shutdown, signature, checksum, and manifest checks. These gates verify a candidate; they do not make a local artifact published.

The committed telemetry resource is inert, while the official release job requires and injects the reviewed first-party endpoint plus the official-build marker. Product events contain rotating daily and monthly anonymous actors and bounded categorical outcomes, never model prompts, credentials, conversation bodies, tool results, plugin names, or absolute user paths. Diagnostics remain user-initiated, locally exported, and redacted.

## Signing and publication

When certificate material is configured, missing credentials, an invalid Authenticode signature, or a missing timestamp fails before publication. Without certificate material, an unsigned community release is allowed, and the manifest records `unsigned`. The installer hash remains the baseline integrity check.

An authorized maintainer must compare the intended channel with updater metadata and inspect the installer, `SHA256SUMS.txt`, `release-manifest.json`, and actual signature state from the same Release. Never overwrite a public tag or asset to hide a failed gate.

## Handoff template

```text
Scope: Desktop <version>, proposed <stable|beta>; no external publication action taken.
Version evidence: root and Desktop package versions.
Checks: exact commands and pass/fail results, including packaged direct-start matrix.
Artifacts: local paths or none; actual signature status.
Open risks: dirty files, failed gates, or none.
Required next authority: explicit maintainer decision for any external action.
```
