# DeepSeek Harness Desktop 5.1.0 three-platform release workflow

This guide records required release gates and the verified 5.1.0 release boundary. [Tag workflow 40199647851](https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/40199647851) passed Windows, macOS, Linux and publication at `eb1223ddfee78eccadd76d8022501cd1806d9d3d`. The [public Release](https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.1.0) was published on 2026-10-25 at 15:09:51 UTC; all five installation assets were independently downloaded and matched to byte sizes, SHA-256, GitHub digests and the combined receipt. This documentation update performs no deployment or external publication action.

## Sources of truth

The Desktop version is `apps/dsh-desktop/package.json`; root `package.json` must agree. Version 5.1.0 uses official NPM Runtime/SDK `0.2.1-rc.2` and Electron `44.0.0`. The checked-in bilingual body is [release notes](release-notes.md); [5.0.1 notes](release-notes-5.0.1.md) remain historical. Public claims must agree with the [Desktop guide](../desktop.md), [compatibility policy](../compatibility-policy.md), [Runtime support policy](../runtime-support-policy.md), [upgrade and rollback guide](../upgrade-and-rollback.md), and [privacy policy](../../PRIVACY.md).

## Channel contract

| Channel | Tag | Package version | Updater metadata | User behavior |
| --- | --- | --- | --- | --- |
| Stable | `desktop-vX.Y.Z` | Final version | `latest.yml` | Default; no prerelease and no automatic downgrade |
| Beta | `desktop-beta-vX.Y.Z-prerelease` | Prerelease version | `beta.yml` | Explicit opt-in; no automatic downgrade |

## Required verification

The [three-platform workflow](../../.github/workflows/desktop-three-platform-release.yml) builds Windows x64, macOS arm64 and Linux x64 on their native GitHub Runners. Run it once with `workflow_dispatch` to validate the exact candidate commit without publishing. All three jobs must pass in the same run before creating an authorized `desktop-v5.1.0` tag on that commit. The tag triggers a second complete validation and publication only after all platform jobs pass. Never combine successful jobs from different commits or runs into one release verdict.

Every platform runs `pnpm verify` and `pnpm feature-baseline:check` against official NPM Runtime/SDK `0.2.1-rc.2`. Windows additionally runs the complete source core regression, production packaging and packaged full regression. The direct-start matrix checks clean and preserved Homes, user plugins, settings, sessions, startup faults, repair and built-in fallback without an extra startup choice page. No failed suite may be deleted, silently skipped or given weaker assertions. Local Windows beta receipts do not substitute for the frozen release commit's gates or macOS/Linux native results; original failures remain separate from successful retries.

Windows verifies package integrity, isolated startup, updater metadata, signatures, checksums and manifest. macOS arm64 requires macOS 13 Ventura or later with Electron 44 and verifies its DMG and ZIP, bundled native modules, package integrity and native launch; Linux x64 verifies AppImage and DEB, native modules, package integrity and graphical launch with a working sandbox. macOS/Linux remain Preview with the capability boundaries in the [macOS guide](../macos-preview.md) and [Linux guide](../linux-preview.md). Windows-local results never establish either platform's acceptance or testing of every supported OS version.

The Windows job runs [production Setup acceptance](../../apps/dsh-desktop/scripts/verify-release-installer.mjs) only on a disposable GitHub Runner. It must verify clean installation, separately checksum-verified public 4.3.0, 5.0.0 and 5.0.1 installers each followed by 5.1.0, same-version overlay reinstall, installed startup/restart, byte-for-byte Profile preservation and uninstall preserving isolated user data. The Windows acceptance artifact upload runs even on failure and retains available receipts and screenshots; inspect each scenario's actual result rather than treating artifact presence as a pass. Do not run this script on a maintainer's daily account. Compiled installer fault fixtures verify transaction rollback separately; they are not evidence of a deliberately interrupted production Setup. Physical-machine upgrade, multiple consecutive historical versions, shortcut/registry uniqueness and interrupted production-Setup recovery remain additional manual acceptance boundaries and must be reported as unverified unless separately exercised.

For each historical-version upgrade, capture provider and session state produced by the old executable before installing 5.1.0, then verify preservation through upgrade and relaunch. State seeded only after the new version installs is not evidence of old-version data preservation. The formal gate must retain these pre-upgrade snapshots with its acceptance receipts; the local beta record does not establish this acceptance.

The committed telemetry resource is inert, while the official release job requires and injects the reviewed first-party HTTPS `/v1/events` endpoint from `DSH_TELEMETRY_ENDPOINT` plus the official-build marker. CI and `NODE_ENV=test` exclude acceptance activity from product events. Product events contain rotating daily and monthly anonymous actors and bounded categorical outcomes, never model prompts, credentials, conversation bodies, tool results, plugin names, or absolute user paths. Diagnostics remain user-initiated, locally exported, and redacted. Endpoint reachability is not proof of accepted event storage.

## Signing and publication

When certificate material is configured, missing credentials, an invalid Authenticode signature, or a missing timestamp fails before publication. Without certificate material, an unsigned community release is allowed, and the manifest records `unsigned`. The installer hash remains the baseline integrity check.

An authorized maintainer must compare the intended channel with updater metadata and inspect the installer, `SHA256SUMS.txt`, `release-manifest.json`, and actual signature state from the same Release. Never overwrite a public tag or asset to hide a failed gate.

The publish job verifies all five installation assets and each platform's checksum receipt, then writes combined checksums and [finalizes the public manifest](../../scripts/finalize-three-platform-receipts.mjs). Record actual installation-file byte sizes and SHA-256, not Actions ZIP sizes or intermediate `.nsis.7z` files. Promote public website metadata/downloads only after public-byte verification, which has completed for 5.1.0; never promote an unverified candidate. Keep same-version local-beta users on the manual download/overlay path rather than promising an automatic same-version update. Deploy [Pages](../../.github/workflows/pages.yml) separately by `workflow_dispatch` only when authorized, then verify the public site, screenshots, privacy policy and all platform downloads. For 5.1.0 use final tag Windows QA originals with their [provenance](../screenshots/desktop-5.1.0/provenance.json), not diagnostic composites or simulated-conversation promotion; these are not macOS/Linux screenshots. Linux 5.1.0 native evidence is Ubuntu 22.04 only; historical Ubuntu 24 evidence is separate.

Formal 5.1.0 gates passed source core 28/28, full packaged regression 44/44 without waivers, Windows Desktop tests 1943/1943 with zero skips; macOS/Linux each passed 1906 with 37 existing platform skips and zero failures out of 1943; scripts passed 213/213 on each platform. All packages are unsigned; macOS is unnotarized Preview on arm64/macOS 13+, and Linux remains Preview. Actual public Setup/ZIP/DEB payloads were inspected for the formal telemetry endpoint and `officialBuild: true`. Configuration presence is not production-event submission or storage acceptance; neither was exercised.

## Handoff template

```text
Scope: Desktop <version>, proposed <stable|beta>; no external publication action taken.
Version evidence: root and Desktop package versions.
Checks: exact commands and pass/fail results, including packaged direct-start matrix.
Artifacts: local paths or none; actual signature status.
Open risks: dirty files, failed gates, or none.
Required next authority: explicit maintainer decision for any external action.
```
