# Windows installer and current SDK verification

Date: 2026-11-17. Base: desktop-v5.2.0 (c64c9521). Current branch: codex/fix-installer-tray-runtime-d. This record tracks local worktree inputs and executed Windows checks; it is not a published release certificate.

## Scope and limits

Issues 102/103 concern empty uninstall registry tombstones, historical uninstall aliases and an unexplained reconstruction subprocess exit. Normal Windows installers ship the complete independent Electron payload and validate pinned hashes before commit. Compact payload reconstruction remains supported. Default close behavior is tray residency; explicit saved quit/ask choices remain. Concurrent tray status reads are coalesced and unchanged native menus reused.

The official NPM latest runtime selected for this task is DSH 0.2.2-rc.1, with Cordis 4.1.0 and its matching official loader family plus Schemastery 3.19.0. Source APIs are adapted for asynchronous projection handles, batched tool execution, current client contracts and Agent-owned model selection. Reasoning effort is retained in background and repair Agent options. The mode menu uses an anchored native top-layer popover to escape the current SDK header mask, with a capability guard for older browsers. Official DSH checkouts are not modified.

Windows build inputs, store, caches, temporary data and artifacts use D:/dshshequ with scripts/use-build-env.ps1. Node is 24.19.0 and pnpm is 11.22.0. Current lockfile content was selected from cache and checked by SHA-512; historical worktrees and installers were excluded and no E: data was deleted. pnpm confirms same-volume hardlinks. The installed-input and plugin-patch gates are checked independently of the installer fixtures.

## Executed checks

| Check | Result |
| --- | --- |
| Registry ownership, tray, close behavior and NSIS options | 30 passed |
| Full runtime integrity, including manifest tampering | 5 passed |
| Registry, fresh and retained-backup transactions | 18 passed |
| Production NSIS macros compiled and executed in isolated lifecycle fixtures | 17 passed |
| Payload, retained reconstruction and include order | 23 passed |
| Installed sidebar and official profile-loader compatibility | 6 passed |
| Feature baseline and installed built-in adaptation | 24 plugins, 20 builtins, 36 desktop surfaces, 15 skins and 54 package decisions passed |
| Whole-workspace typecheck and build | Passed |
| SDK permissions, approvals, profile composition, market opt-in, session recovery and sidebar integration | 45 passed |
| Native fixture storage and empty-directory pruning under D:/dshshequ | 21 passed |
| Packaged SDK identity and integrity, including hidden build-directory fixtures | 13 passed |
| Repository script tests | 237 passed |
| Final full pnpm verify | Passed: desktop 2273 passed, 0 failed, 2 existing platform skips; script tests 237 passed; remaining workspace and source gates passed |
| Custom preset SDK compatibility and sidebar focused checks | 15 passed |
| Actual native Windows tray residency, default close, restoration, restart, unavailable tray fallback and owned-process quit | 7 checks passed |
| Authenticated pipe frontend, adapter, cookie and wire checks | 33 passed, including actual root/plugin/API requests |
| Current and legacy native settings window adaptation | 21 focused checks passed; actual drag, resize, persistence, scrollbar, responsive topology and DPI-2 checks passed |
| Source-only release plugins and all-skin footer geometry | Passed; release plugins recorded 15 checks and 13 screenshots |
| Context tooltip visibility and position under both skins | 25 samples per skin passed with click and Escape assertions retained |
| Native mode-switch lifecycle | Passed: failed create, retry, original workspace/history/default, native tabs and unsent drafts preserved |
| Final Windows installer build and package verification | Passed: 147 runtime packages, 206 physical unpacked files, 8 canonical SDK consumers and 1 packed ASAR file |
| Final packaged desktop regression and smoke | Paused at the maintainer's request for manual testing; the final full GUI gate and smoke are incomplete |

Detailed logs are retained in D:/dshshequ/.desktop-build/artifacts. Initial failures and reruns are retained, including an interrupted dependency import repaired by a complete reinstall and subsequent patch verification. Dependency installation reported unavailable optional cpu-features compilation on this machine; SSH functionality still requires its executed package tests rather than an assumed pass.

SDK tests distinguish native descriptor-2 support from explicit historical refusal and keep the original byte-preservation, backup, retry and cancellation assertions. ASAR fixture patterns are anchored to the fixture source because globstar otherwise excludes the hidden .desktop-build ancestor. Local fixture storage is confined to D:/dshshequ; hosted Windows retains its dedicated RUNNER_TEMP child and physical-path checks.

The precise retired subagent-control/list-agents module fallback preserves existing exports and unrelated resolution errors. Legacy preset rows await their sibling provider and verify scoped discovery without duplicate registration; actual Liangshen and Value Mode sessions pass while retaining user files. Direct-import boundary changes enumerate actual-SDK test fixtures and the one dedicated compatibility adapter; production application imports remain bounded. Final complete repository verification log: repository-verify-run8.log.

Native GUI regression exposed additional SDK integration gaps: the pipe adapter accessed a late Connection through an undeclared injected property, index injection dropped its required Peer, the native settings title moved outside navigation, and the masked header clipped the mode menu. These are adapted without relaxing authentication or physical pointer checks. Root/plugin/API and actual current-SDK business stream probes pass. The initial 32-suite source run passed 28 suites and found four failures; targeted reruns passed after correcting PID-instance ancestry, current tooltip/content topology and the real mode-menu clipping. The failed source receipt remains source-regression.json; final acceptance is being recorded separately in packaged-regression-final.json. Tray evidence includes background-residency-source/result.json and the packaged gate's native tray checks.

One initial packaged account fixture stopped during Host composition, before any account or skin action, accompanied by a Chromium NetworkService crash. Both unchanged isolated reruns passed with fresh Homes, renderer readiness of 16.848 and 16.575 seconds, and OAuth/callback/sign-in/16-skin checks. The original incident is not reproduced and its cause is not established; no attribution to concurrent tests is made. The failed initial packaged receipt and both rerun logs are retained. The final packaged gate runs alone.

## Current local artifact

The local unsigned Windows validation installer is apps/dsh-desktop/dist/DeepSeek-Harness-Desktop-Setup-5.2.0-x64.exe, 444,995,672 bytes. SHA-256: 3740a83f02bf5a5847f2eca63e9cf96fca87d9eaa6e4d5388211a198bc6e7ccf. This is a local build and has not been published. The maintainer requested pausing automated tests and receiving this build for manual testing before the forthcoming major upgrade requirements. The active regression process and its creation-time-qualified test children were stopped; the partial receipt is retained without a completed-pass claim. The packaged mode-menu bundle matches the final workspace bundle by SHA-256.

## Acceptance boundary

The real installer overlay preflight found existing .dsh user data and refused disposable-machine acceptance. The maintainer has no clean Windows VM and requested completion of available local validation. Real clean-account installation/overlay remains unverified. macOS and Linux native GitHub jobs were not run. No NPM publication or formal three-platform release is certified.
