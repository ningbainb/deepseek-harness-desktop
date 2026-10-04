# Desktop 5.0.0 formal release acceptance

## Identity and immutable artifacts

- Release: https://github.com/ningbainb/deepseek-harness-desktop/releases/tag/desktop-v5.0.0
- Published: 2026-10-04T03:09:38Z; neither draft nor prerelease.
- Annotated tag object: `db109ff850070c6bac1f431b4e4129848267fabc`.
- Source commit: `b78af2ef9e310ae9996908ba6a9ccb27add80621`.
- Runtime: official NPM `@deepseek-ai/dsh@0.2.0-rc.2`; adapters use SDKs, profiles and `cordis.patch.yml`, with zero writes to official source checkouts.
- Platform asset sizes, actual SHA-256 values and signatures are recorded in [the all-platform manifest](../launch/release-manifest-all-platforms.json). Public assets and the tag must not be replaced to revise documentation.

## Native gate evidence

- Candidate 18: https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/37164515488. All three native jobs succeeded, including Windows source 24/24 and packaged 40/40, Setup lifecycle, package verification, smoke and integrity.
- Independent Desktop CI: https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/37164512820/attempts/2. Desktop 1585/1585, root scripts 212/212 and core 24/24; zero failures and skips.
- Formal tag: https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/37168324503/attempts/2. Windows, macOS, Linux, metadata and publish succeeded on the same SHA. Windows job `111342249889` passed source 24/24 and packaged 40/40. macOS/Linux reuse already successful same-SHA jobs from the initial attempt.
- Linux matrix: https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/37173422100. Native Ubuntu 22.04 and 24.04 jobs both succeeded, including source contracts, package verification, Landlock enforcement, sandbox permissions, Xvfb smoke and archive checksums. This matrix does not replace the published tag assets.
- Formal macOS runner: macOS 15.7.9 arm64. Formal Linux runner: Ubuntu 22.04.5 x64; the additional matrix establishes separate Ubuntu 24.04 coverage.
- Production Windows Setup ran only on disposable runners: fresh installation, public 4.3.0 overlay upgrade, repeated overlay, installed relaunch and Profile/user-data retention. This is not proof of every installed 4.4.x build or every physical user machine.

## Preserved failures and boundaries

- Independent CI attempt 1 timed out after a normal settings-entry click without a settings dialog. The unchanged gate passed on retry; no confirmed root cause is claimed.
- Formal tag attempt 1 failed a terminal assertion because descendant `OpenConsole.exe` PID 7332, parent 512, was visible. Local isolated retest and same-SHA CI retry passed the original assertion. The observer was not weakened; the root cause remains unconfirmed.
- The earlier local HDD complete verification recorded a Host pet-Dock ten-second timeout. Independent Host retest and CI passed; the earlier local full run is not represented as entirely green.
- Skin acceptance retains navigation, switching, persistence and five DPI restarts, including the 724 by 541 responsive view. No failures were hidden by deleting assertions or introducing skips.
- Windows is unsigned; macOS is unsigned and unnotarized; macOS and Linux remain Preview. Physical macOS/Linux devices and this user's real Setup installation are outside the verified scope.
- Official anonymous opt-out metrics exclude conversations, prompts, code, paths and credentials. Isolated acceptance does not send synthetic production events or alter analytics databases.
- Unrecognized legacy sessions may use a manually reviewed context summary; raw history is not automatically uploaded and paid inference is never automatically invoked.

## Local delivery and website

All five actual installation files matched public asset sizes, GitHub SHA-256 digests and the combined receipt. The public Windows manifest also matched the installer, blockmap, update metadata and combined receipt. Repository and generated all-platform manifests were compared for exact structural equality. The final Windows installer is `325650740` bytes, SHA-256 `4d9a4c79c9c87950f35beb7123498ec6266d943e0059835b9302d3d4a613da5b`, ProductVersion `5.0.0`, and Authenticode status `NotSigned`; intermediate files were never treated as installers.

The public Setup payload was extracted into `E:\DeepSeekHarnessDesktop-Build\artifacts\release-500-formal-extracted`. `pack:verify` passed 141 runtime packages, 190 physical unpacked Runtime files, eight shared SDK consumers and packed ASAR SHA-256 integrity. The extracted icon SHA-256 is `49b2d24c794e5da2b4f94f355e1492a2ee62092fa7194589a55e502a5c565f15`, matching the retained 4.4.0 icon; this is not the Setup checksum. Production telemetry configuration is `officialBuild=true` with endpoint `https://guanli.1521003.xyz/v1/events`; source defaults remain disabled.

Isolated `pack:smoke` passed on the final extracted executable: Desktop startup took 63117.3 ms, `.dshpreset` preview-only ingress and queued community-extension dispatch succeeded, and Task Board Worktree verified session CWD, a clean stable checkout before review and commit/merge/keep/discard audit actions. Each run used E-drive temporary homes and user data, `NODE_ENV=test`, disabled updates and disabled protocol registration. No production telemetry events were sent and no Setup was executed on the maintainer's account. This smoke result does not erase the earlier local complete Host timeout.

Final local root script tests passed 212/212 with zero failures or skips. Feature baseline passed 20 plugins, 14 builtins, 32 Desktop surfaces and 15 skins; builtin source/version/patch/mount adaptation passed 48 packages. Coupling audit, documentation, architecture inventory, bilingual release notes and website static gates passed.

Website deployment https://github.com/ningbainb/deepseek-harness-desktop/actions/runs/37174336983 succeeded from documentation commit `85efa05382b71cf96debc195b519c3fff84e44c4`. Public https://1521003.xyz/ returned HTTP 200 with the 5.0.0 content. Executed-browser verification passed at 1440 by 960 and 390 by 844: actual GitHub hydration reported `releaseSource=live`, all three platform links pointed to the exact 5.0.0 assets, no horizontal overflow, no same-origin resource errors and no uncaught page errors. Both real public hero captures were visually inspected. The initial 120-second navigation timeout remains recorded; retry used a 600-second budget without removing resource, layout or release assertions.

Evidence directory: `E:\DeepSeekHarnessDesktop-Build\artifacts`. Linux matrix logs: `release-500-linux-ubuntu22-final.log` and `release-500-linux-ubuntu24-final.log`; tag Windows logs: `release-500-tag-ci-windows-attempt1.log` and `release-500-tag-ci-windows-attempt2.log`; final local package: `release-500-formal-local-acceptance.log`; root tests: `release-500-final-docs-scripts.log`; public website: `release-500-site-public-final-retry.log`, `release-500-site-public-report.json` and `release-500-site-public-desktop-hero.png` / `release-500-site-public-mobile-hero.png`. All final assets and receipts reside in `desktop-5.0.0-release-37168324503` under that directory. Download attempts and partials remain preserved; complete final bytes, not connection success alone, established installer identity.
