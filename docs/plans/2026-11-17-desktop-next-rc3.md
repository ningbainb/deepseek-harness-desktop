# DSH Desktop 5.3.0-rc.1 implementation and acceptance

## Binding design

Implement the maintainer's 2026-11-17 next-version specification in this checkout. One user installer per supported platform/architecture; official DSH 0.2.2-rc.3; fresh defaults differ from preserved upgrades. Office stays bundled. Shared browser keeps its UI and data but obtains its separate Electron on demand. M1/P1 remain; context 0.85.1 is enabled, M2 1.2.0 and P2 2.2.0 require consent. Preserve permissions, disabled state, third-party profiles and rollback data. No formal Release or NPM publication.

Use existing profile transactions, installer journal, mutation coordinator and packaging pipeline. Do not rewrite upstream source or replace the established product line. Keep development in the requested checkout, preserving its uncommitted installer/tray/rc.1 work; initial tracked patch and all untracked files are backed up outside the repository at D:/dshshequ/.desktop-build/artifacts/next-5.3.0-rc.1. Do not stage unrelated pre-existing work.

## Validation budget

| Scope | Cheapest useful development check | Final evidence |
| --- | --- | --- |
| Official packages and profile | published version inventory, composition/SDK identity and migration tests | verify; packaged session continuation |
| Installation and browser | dependency/file tree, transactional failure fixtures | one Windows candidate, actual enable/overlay/rollback |
| UI and plugins | focused navigation, persistence, injection/isolation tests | packaged user journeys, measured startup |
| Other platforms | workflow trigger and inputs | native macOS/Linux preview jobs and uploaded artifacts at candidate SHA |

Final verify already includes feature-baseline:check, typecheck, package and script unit tests. Do not repeat successful subcommands on unchanged inputs. GUI, registry and performance tests run serially. Build a full installer only after inputs stabilize, then reuse its hash for all acceptance.

## Work sequence

1. Inventory released desktop-v5.2.0 versus dirty rc.1 checkout and retained local artifact. Retrieve release asset metadata and official package manifests; retain provenance. Write capability mapping and exact package availability before dependency changes.
2. Upgrade only available official SDK cohort packages to rc.3; handle retired Agent Team profile explicitly. Adapt profile composition to official Web patches without duplicate mounts. Add tests for preserve-disabled, interrupted/repeated migration, legacy team and Value Mode continuation. Update support matrix and lockfile from actual resolved packages.
3. Add persistent, integrity-checked browser component preparation outside cache, sharing the existing controlled transaction. Validate complete platform/architecture/version, cancel/retry/concurrency and retained activation. Use it for manual/update preflight. Remove only second Electron payload from the shipped file tree after this path works; preserve Office.
4. Apply minimal fresh defaults and lazy startup. Consolidate navigation with old-link redirects; keep reachable capabilities and one editing location. Record visible window, usable session and optional readiness separately.
5. Pin context/M2/P2 and licenses. Preserve M1/P1. Test actual model input ordering, multiplicity and user/project scope; leave unsupported optional combinations explicitly pending.
6. Run final source gates once, build one Windows candidate, verify tree/integrity and execute isolated new-user and released-upgrade journeys. Record bytes/files/timings and rollback preservation. No destructive use of daily Home.
7. Review candidate changes against initial patch. Verify origin, main target and exact commits before authorized synchronization; never publish unrelated dirty files. Dispatch each native preview once for the same candidate SHA, follow failures to resolution and inspect artifacts. Formal release remains excluded.

## Capability mapping

| Capability | Existing entry/config | rc.3 implementation / new entry | Migration and acceptance |
| --- | --- | --- | --- |
| Agent Team | model collaboration; experimental team profile | official team tools and conversation UI | retire managed old mount; preserve original fields, team session/members/tasks/history/permissions; repeat launch |
| Value Mode | model collaboration; controller/executor/cost/router IDs | existing community implementation; Models > Advanced | preserve custom model identifiers; continue old/new sessions |
| Windows control | intelligent control; saved grants/driver options | optional compatibility; More tools | retain grants, verify each operation without macOS claims |
| Shared browser | browser entry; user/login/permission data | same entry; persistent downloaded runtime | preflight enabled upgrades; first enable/cancel/offline/crash isolation |
| Office | official document and workbook tools | bundled rc.3 engines | preview, convert, recalculate on each native platform |
| Models/permissions | model and security settings | official settings plus existing compatibility | preserve accounts, IDs and explicit denials; submit-chain verification |
| Background tasks | schedules/bots/tunnels/usage | existing scheduler/recovery adapters | restart exactly-once execution and first usage accounting |
| Memory | M1 stored scopes/confirmed writes | M1 plus opt-in project M2 | preserve/delete/isolate; explain M2 history retention |
| Prompt | P1 global/workspace preferences | P1 plus opt-in Agent P2 advanced editor | preserve prefixes/suffixes; preview/save/restore, inject once |

## Evidence ledger

- Initial HEAD c64c9521f3dc15269a0504a3bfa4fc743b542983, branch codex/fix-installer-tray-runtime-d, origin is approved public repository. Dirty work is extensive and predates this task.
- Prior local installer 5.2.0 uses rc.1, 444995672 bytes, SHA256 3740a83f02bf5a5847f2eca63e9cf96fca87d9eaa6e4d5388211a198bc6e7ccf. It is not the released upgrade baseline. Prior GUI gate was interrupted and actual overlay was not certified.
- Registry confirms rc.3 exists under next, while latest is rc.1. Retired experimental Agent Team profile has no rc.3. M2 peers require Cordis ~4.0.5 and older SDK ranges; compatibility must be proven rather than hidden by peer overrides.
- Current preview triggers: macOS dispatch only; Linux dispatch or a historical branch push. Current branch will not automatically trigger either.
- The maintainer confirmed the dirty local checkout is the latest development baseline. It remains the implementation base; the released installer is only an upgrade/performance comparison.
- Released 5.2.0 installer: 341400504 bytes, SHA256 7dffdfff755b5586aececce6ebeec6c2758c2d12f7a2c96528c42c9d576e8cde, official core 0.2.1-rc.4. Its trusted embedded reconstruction helper restored the isolated extracted baseline: 1544651285 bytes / 26210 files. This is a payload measurement, not a timed installation.
- Local rc.1 baseline: 1546630276 bytes / 27793 files. The complete prior dist directory is preserved under the evidence root as local-5.2.0-rc1-dist. See baseline-inventory.json for exact paths.
- Windows Office SDK conversion, preview and formula recalculation passed against the resolved engine; packaged and native platform evidence remains separate. See office-runtime-windows-final/report.json.
- Actual rc.3 SDK model-input capture verifies context, M1, P1 and P2 ordering, one occurrence, continued sessions and user/project isolation. M2 1.2.0 failed principal isolation and is explicitly blocked from new activation while its prior configuration/files are retained. See context-suite-evidence.json.
- First full verify stopped after 151 seconds on a settings test's outdated source extraction. Second stopped after 759 seconds with 2389 desktop tests passing, five failing and three platform-only skips. The five failures were fixed with focused tests; none were removed or weakened. A separate continuation exposed the stable-only release metadata helper and missing candidate notes; preview metadata now remains nonpublishing and notes are present.
- Final verify completed all workspace unit suites, including Desktop 2395 passed / zero failed / three platform-only skips, and root scripts 239 passed / zero failed. Its raw exit was 1 after 605.575 seconds because the browser HMR fix changed generated coupling-audit positions. Regenerating that report and rerunning every remaining verify subcommand succeeded; no unit assertion was skipped and no whole-suite success exit is claimed for that raw invocation. Evidence: verify-final.log, verify-final-result.json, verify-final-tail.log. Feature baseline separately confirms 24 plugins / 25 builtins / 38 surfaces / 15 skins and 57 builtin adaptations.
- Final review reproduced a managed-browser HMR integrity bypass. The adapter now uses the vendor host's public spawnExecutable seam without mutating global ELECTRON_PATH. A new actual-component corruption/reload test repairs the component and preserves genuine explicit user overrides.
- Three slowest unit cases in the final verify: complete official Desktop host 29.477 seconds, legacy skin boot-graph migration 22.873 seconds, native extraction Cancel/rollback 21.424 seconds. Desktop unit total was 480.260 seconds; root script tests took 6.882 seconds.
- Complete Windows NSIS lifecycle passed all nineteen scenarios after a fixture-only UTF-8 correction. The first attempt correctly aborted before changing the old program when the test contract's Chinese path was decoded with Windows PowerShell's ANSI default. The fixture now reads explicit UTF-8 and carries a script BOM; a Unicode temporary/install path regression passes. Existing exactly-once preflight, old-file timestamps, registry, rollback and session assertions remain intact. Evidence: installer-lifecycle-final-fixed.log (final passed:19). This is a production-macro lifecycle fixture, not installation of the complete released installer.
- Linux preview builds one deb on Ubuntu 22.04. Ubuntu 24.04 downloads the same artifact and verifies its commit, version, bytes and SHA256 before native package, Office, Landlock and Xvfb acceptance. It uploads QA evidence rather than another user installer. Eighty-one focused platform/workflow cases passed, including executed negative controls for wrong commit, hash and version.
- First Windows directory build passed all source/SDK identity gates and removed 455644290 bytes across 5035 files. Installer assembly then rejected schema 2 because its archive wrapper still unconditionally required nested Electron. The corrected archive gate verifies the exact four external-core targets, rejects nested Electron and retains the schema 1 requirement; twenty-one focused archive/options/payload cases passed. Reuse the verified directory through the existing installer-only path, rather than rebuilding the application. First attempt: 719.135 seconds; no completed candidate installer was delivered from it.
- Installer-only provenance verification exposed electron-builder removing the official rc.3 manifest's empty scripts field. A strict three-platform afterPack helper restores the exact original NPM bytes only when source manifest/bin hashes match reviewed evidence, target bin matches, and the only manifest difference is that normalization. It refuses staging links, hardlinks and other changes. Twenty-five focused restoration/pruning tests passed. Applying the same helper to the existing directory let the original package verifier pass: 215 runtime files, eight shared SDK consumers, one packed ASAR file and 151 runtime packages. Official NPM source bytes were not edited.
- Packaged Windows Office passed PDF/image preview, text conversion and workbook recalculation (13/42/55), using only the staged rc.3 Office service and native 0.2.3 engine. See office-runtime-packaged-windows/report.json.

## Remaining acceptance boundaries

The maintainer's daily installed application was already running before this task. Product-wide installer cleanup fixtures intentionally refuse to run in this state. Those processes subsequently exited independently; none were stopped by this task. The nineteen-case lifecycle was then attempted with its process-isolation guard active. Do not use the daily Home. Independent native NSIS rollback cases passed without global product cleanup; a genuine released-installer overlay still requires an isolated Windows account or VM. These fixture results do not certify an actual overlay.

M2 is blocked by a reproduced upstream isolation issue, rather than certified by its declared SDK peers. Context global insights retains its functional navigation because the public SDK cannot relocate only its entry without removing its view. Legacy team history and real upgrade-generated data rollback, P2 desktop GUI, first browser download/isolation, and packaged timings require their actual acceptance evidence. Home directories inside an installation tree or accessed through a junction need explicit manual upgrade compatibility evidence; failing preflight must leave the old program intact.

## Review focus

Retired profile being resurrected on restart; fresh defaults overwriting explicit disabled values; browser activation falsely marked ready after failed download; installer preflight changing old program/data before resources pass; data generated after upgrade surviving rollback; duplicate prompt injection or cross-user project leakage; current running installation versus stale registry targeting.
