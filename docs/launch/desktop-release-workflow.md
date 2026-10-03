# DeepSeek Harness Desktop 5.0.0 three-platform release workflow

This guide describes repository verification for a possible release. It does not authorize a push, tag, GitHub Release, deployment, or announcement.

## Sources of truth

The Desktop version is `apps/dsh-desktop/package.json`; root `package.json` must agree. The checked-in bilingual body is [release notes](release-notes.md). Public claims must agree with the [Desktop guide](../desktop.md), [compatibility policy](../compatibility-policy.md), [Runtime support policy](../runtime-support-policy.md), [upgrade and rollback guide](../upgrade-and-rollback.md), and [privacy policy](../../PRIVACY.md).

## Channel contract

| Channel | Tag | Package version | Updater metadata | User behavior |
| --- | --- | --- | --- | --- |
| Stable | `desktop-vX.Y.Z` | Final version | `latest.yml` | Default; no prerelease and no automatic downgrade |
| Beta | `desktop-beta-vX.Y.Z-prerelease` | Prerelease version | `beta.yml` | Explicit opt-in; no automatic downgrade |

## Required verification

The [three-platform workflow](../../.github/workflows/desktop-three-platform-release.yml) builds Windows x64, macOS arm64 and Linux x64 on their native GitHub Runners. Run it once with `workflow_dispatch` to validate the exact candidate commit without publishing. All three jobs must pass in the same run before creating an authorized `desktop-v5.0.0` tag on that commit. The tag triggers a second complete validation and publication only after all platform jobs pass. Never combine successful jobs from different commits or runs into one release verdict.

Every platform runs `pnpm verify` and `pnpm feature-baseline:check` against official NPM Runtime/SDK `0.2.0-rc.2`. Windows additionally runs the complete source core regression, production packaging and packaged full regression. The direct-start matrix checks clean and preserved Homes, user plugins, settings, sessions, startup faults, repair and built-in fallback without an extra startup choice page. No failed suite may be deleted, silently skipped or given weaker assertions.

Windows verifies package integrity, isolated startup, updater metadata, signatures, checksums and manifest. macOS arm64 verifies its DMG and ZIP, bundled native modules, package integrity and native launch; Linux x64 verifies AppImage and DEB, native modules, package integrity and graphical launch with a working sandbox. macOS/Linux remain Preview with the capability boundaries in the [macOS guide](../macos-preview.md) and [Linux guide](../linux-preview.md). Windows-local results never establish either platform's acceptance.

The Windows job runs [production Setup acceptance](../../apps/dsh-desktop/scripts/verify-release-installer.mjs) only on a disposable GitHub Runner. It verifies clean installation, the checksum-verified public 4.3.0 installer followed by 5.0.0, same-version overlay reinstall, installed startup/restart, byte-for-byte Profile preservation and uninstall preserving isolated user data. Do not run this script on a maintainer's daily account. Compiled installer fault fixtures verify transaction rollback separately; they are not evidence of a deliberately interrupted production Setup. Physical-machine upgrade, multiple consecutive historical versions, shortcut/registry uniqueness and interrupted production-Setup recovery remain additional manual acceptance boundaries and must be reported as unverified unless separately exercised.

The committed telemetry resource is inert, while the official release job requires and injects the reviewed first-party HTTPS `/v1/events` endpoint from `DSH_TELEMETRY_ENDPOINT` plus the official-build marker. CI and `NODE_ENV=test` exclude acceptance activity from product events. Product events contain rotating daily and monthly anonymous actors and bounded categorical outcomes, never model prompts, credentials, conversation bodies, tool results, plugin names, or absolute user paths. Diagnostics remain user-initiated, locally exported, and redacted. Endpoint reachability is not proof of accepted event storage.

## Signing and publication

When certificate material is configured, missing credentials, an invalid Authenticode signature, or a missing timestamp fails before publication. Without certificate material, an unsigned community release is allowed, and the manifest records `unsigned`. The installer hash remains the baseline integrity check.

An authorized maintainer must compare the intended channel with updater metadata and inspect the installer, `SHA256SUMS.txt`, `release-manifest.json`, and actual signature state from the same Release. Never overwrite a public tag or asset to hide a failed gate.

The publish job verifies all five installation assets and each platform's checksum receipt, then writes combined checksums and [finalizes the public manifest](../../scripts/finalize-three-platform-receipts.mjs). Record actual installation-file byte sizes and SHA-256, not Actions ZIP sizes or intermediate `.nsis.7z` files. After verifying the public Release, update the homepage, privacy page, bilingual README, changelog and public manifest with its real assets and verification boundaries. Deploy [Pages](../../.github/workflows/pages.yml) separately by `workflow_dispatch`, then verify the public site, screenshots, privacy policy and all three platform downloads. Candidate screenshots must retain their actual source/platform attribution.

## Handoff template

```text
Scope: Desktop <version>, proposed <stable|beta>; no external publication action taken.
Version evidence: root and Desktop package versions.
Checks: exact commands and pass/fail results, including packaged direct-start matrix.
Artifacts: local paths or none; actual signature status.
Open risks: dirty files, failed gates, or none.
Required next authority: explicit maintainer decision for any external action.
```
