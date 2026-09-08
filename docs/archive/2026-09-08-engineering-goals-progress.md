# Engineering goals implementation progress, 2026-09-08

This is a current-work evidence record for `docs/engineering-goals.md`. It does
not replace that acceptance contract and does not mark Feishu records complete.
R01-R36 are snapshot numbers only. The actual Feishu record IDs could not be
resolved because the local CLI has no user token; no record ID or completion
state has been invented.

## Locked environment and scope

- Windows development host: 14,702,026,752 bytes RAM and 16 logical processors.
- Runtime used for verification: bundled Node.js 24.19.0; the system Node.js
  22.13 installation is outside the repository's supported engine range.
- Desktop dependencies: Electron 43.4.0 and official DeepSeek Harness NPM SDK
  packages at 0.1.1-rc.1, including `dsh-base`, `dsh-session`,
  `dsh-workspace`, and `dsh-compaction`.
- Dependency installation consumed approximately 871,346,176 bytes on drive D.
- No official DSH source checkout was modified. No new runtime dependency or
  external source tree was added.

## Implemented and verified work

| Goal | Evidence level | Current result |
| --- | --- | --- |
| G01.1-G01.2 | Specialized tests, real Electron regression, and packaged startup matrix | Empty/normal profile, DNS failure, updater-disabled, malformed profile, bad plugin, and readiness timeout have bounded terminal states. Update DNS failure is non-blocking. A missing aggregate dependency, `@ningbainb/dsh-chat-artifacts`, was added to the isolated Desktop profile and baseline. The clean Windows package reached `ready-full` from supported 2.3, 2.4, 2.5, 2.6, 2.7, 3.0.1, and fresh Home fixtures; a zero-state Home also exited cleanly and reached `ready-full` on its second launch. |
| G01.3 | Specialized tests and packaged Electron relaunch regression | Hidden Windows process checks passed 3/3, terminal lifecycle passed 9/9, and dsh-ssh passed 102 tests with one external real-sshd case skipped. The packaged PowerShell terminal verified input/output, no popup BrowserWindow or visible console subprocess, packaged Git and pnpm PATH, persistent Profile cwd, and close cleanup. A second packaged check used a real loopback SSH protocol server: it created a password-auth host through the GUI, passed the connection test, echoed terminal input, fully exited, relaunched with the same isolated OS home, found the persisted host, opened a fresh transport, and echoed a second marker. Opening the SSH panel added no BrowserWindow and neither run emitted a renderer error. A later full-suite hang exposed that terminating only the hidden PowerShell wrapper could leave its GUI-subsystem Electron Runtime alive. The wrapper now starts through `ProcessStartInfo`, waits for the direct child, registers its PID over a nonce-bound private control line, and terminates that PID's tree. The production-faithful scheduler plus controller regression passed 44/44 and exited in 14.7 seconds; a post-run process query found no matching Electron/DSH Runtime. |
| G01.4 | Specialized tests | Tool-capability routing passed 17/17 and Desktop compatibility passed 46/46. Capability is provider data, not a model-name or MoE heuristic; unsupported tool history fails visibly. |
| G01.5 | Specialized transaction tests, real NSIS compilation, and packaged-runtime verification | Installer cleanup, updater, mirror, shutdown, and Runtime support checks passed their prior 61-case set; the focused Windows installer suite passes 9/9, and updater/cache/receipt/metrics/manifest tests pass 51/51. Preflight retains same-volume backups and exported registration until `customInstall` validates the replacement; `.onInstFailed` restores a partial replacement, and a non-committed interruption journal is recovered on the next run. A disposable matrix committed 1.0.0 to 2.0.0 to 3.0.0, rejected an incomplete 4.0.0, then restored 3.0.0 application, Runtime, registration, and external session state. The official updater cache uses the versioned manifest filename and validates both declared and recomputed SHA-512; concurrent install requests share one launch, while install-request and exact target-version completion receipts are counted separately. electron-builder 26.15.3 and makensis compiled the actual unsigned 3.3.0 installer and blockmap. Package verification checks 94 packaged Runtime packages and the packaged receipt-v2 shutdown/PID binding. Executing two different published installer upgrades remains a release-machine scenario. |
| G02.1 | Real Electron regression | The settings scrollbar no longer shares the resize handle hit region. Twenty alternating scrollbar drags preserve bounds while border resize, persistence, clamping, and DPI checks remain active. |
| G02.2 | Package tests, typecheck, and packaged Electron resource regression | Image drop validates headers and dimensions before decode, bounds source size and pixels, processes serially, exposes phases, and aborts and cleans temporary resources on new drop, Escape, session change, and unmount. Chromium now uses an explicitly closed ImageBitmap decoder, with the prior URL-backed Image path retained as a compatibility fallback; intercepted drops also close the native attachment overlay. The package passed 167 tests with one skipped case. In the Windows package, a 10,713,877-byte 2304 x 2304 JPEG compressed to 2,603,636 bytes at 2048 x 2048. Corrupt-image retry, cancellation retry, 20 continuous large drops, and large-then-small all passed without reload; 24 object URLs were created and all 24 were revoked. Electron idle working set after the 5th and 20th operations differed by 68,100,096 bytes, below the 90,898,432-byte repeated-operation budget, and the series fell after operation 15 instead of growing every round. |
| G02.3 | Package tests, development Electron, and packaged Electron regression | Skin Center selection, active-state routes, hot apply, try-on restoration, and profile persistence passed 78 tests with one Windows permission-mode case skipped. Desktop now pins the actually exercised Skin Center v2 package at exact version 0.2.5 instead of relying on its aggregate's transitive dependency. Blue Fantasy changed the live shell without a reload, exited try-on back to the official surface, and then applied persistently; the image remained mounted with occlusion and both blur controls at zero, and the settings overlay had no filtered ancestor. Five complete relaunches retained the selected skin at forced device scale factors 1, 1.25, 1.5, 1.25, and 1 in both development Electron and the clean Windows `win-unpacked` artifact. |
| G02.4 | Specialized tests | Extension Dock follows parent move, resize, maximize, restore, and display changes until the user moves it independently. Detached bounds are clamped after display changes and listeners are removed on close. |
| G02.5 | Package tests, development Electron, and packaged Electron regression | Conversation polish, sidebar rail, navigation policy, and Workspace file authorization passed 15/15. A 20-turn official Session log was restored through the real JSONL backend; wheel input over the composer advanced the official conversation scrollport while the composer bounds stayed fixed. Previous, next, and bottom navigation landed on the intended user turns, the bottom state reported 20/20, dark counter contrast measured 6.53:1, and visible sidebar rows did not overlap. The same scenario passed against the locally built Windows `win-unpacked` executable after package verification. Internal file-tree drops and the context-menu action are explicitly path references; Preview is local-only, external small text enters the draft, and Word/PDF/binary files are not described as parsed or sent content. |
| G03.1-G03.3 | Package tests, typecheck, and packaged Electron regression | The locked official SDK exposes no model-change subscription. Visible/focus/online, selector-open, and confirmed-selection refreshes were added without polling. Same-session desktop windows use BroadcastChannel; stale cross-session responses are rejected. Model preference and remote UI suites passed. In the clean Windows package, pinned models, provider ordering, provider visibility, composer projection, and the untouched official `/model` choices all persisted across restart with no page errors. |
| G04.1-G04.3 | Tests, security documentation, and packaged two-device-principal regression | Workspace, Session, history, search, model, SSE, attachment, memory, Prompt, and import boundaries are documented. User-scope tests passed 16/16 and the complete remote UI suite passed 184/184. A clean Windows package exposed that the released aggregate still supplied the old remote plugin even though the workspace build contained the authorization projection. Desktop now declares the workspace remote plugin directly, the aggregate dependency is overridden to the same reviewed package, and the profile regression rejects a released-package fallback. In the rebuilt package, two distinct paired principals each saw only its own Workspace and Session; cross-Workspace creation and cross-session history were denied; send, rename, model read, and model selection remained available. Revoking A denied its next request, preserved B, and closed A's existing SSE stream in 6 ms with no page errors. Search failed closed because the optional index was unavailable. The current local Runtime still does not provide a complete multi-account switch. |
| G05.1-G05.4 | Package/import tests, official compaction transaction tests, and packaged Electron regression | Memory passed 18/18, Personal Prompt passed 11/11, and conversation import passed 36/36. Limits, corrupt-file preservation, legacy Prompt normalization, precedence, and model-context caveats are documented. In the clean Windows package, an enabled Prompt profile and one memory item persisted across restart; clearing produced an empty store, and a deliberately corrupt memory file left startup and the card available with only the expected unavailable responses and no unexpected page errors. The official base bundle mounts `dsh-compaction-basic` and `dsh-command-compact`. A new 2/2 public-SDK test executes manual compaction over a completed tool-call/result history: an injected summary failure preserves the surface and every original log event, a retry produces an official checkpoint without splitting the pair, and a later turn continues normally. The actual `/compact` contribution reports usage, no-op, success, retryable summary failure, busy, and cancellation outcomes. |
| G06.1-G06.4 | Transaction/IPC tests, fixed-version browser reproduction, and packaged startup regression | Install, mutation, recovery, archive, and rollback suites passed 113 tests with one Windows symlink case skipped. Reset preview reports exact paths, cleanup/preservation scope, sizes, backup, reclaim, and available/required space. Symlink profiles and insufficient disk are rejected before Runtime stops; failed rebuild restores the backup. In the clean Windows package, a cleared Profile rebuilt to the renderer in 9,721 ms, and an orphaned Desktop-managed link was adopted into `ready-full` without entering repair state. The official npm artifact `dsh-paperclip@0.2.5` was locked by SHA-512 and reproduced against Desktop 3.3.0, DSH 0.1.1-rc.1, Electron 43.4.0, and embedded Node 24.18.1: its conversation-surface handler claimed an image drop and prevented the delegated native preview listener from receiving it. Desktop now reports this exact tuple as a known conflict while startup remains inspect-only; installed state is not silently changed and other package or host versions are not classified by this record. R36 remains a duplicate association to R35. |
| G07.1-G07.3 | Controlled Electron and real package-manager route capture, specialized tests, and user diagnostics | API, update, and market plans now resolve independently with CLI, scoped environment, common environment, conventional environment, and system-default precedence. Update and market requests use separately configured Electron Sessions; catalog, NPM manifest, managed Git, and cooperative pnpm traffic share the market policy. A loopback proxy captured fixed routing and `NO_PROXY`, 407 authentication challenge, invalid PAC, and DNS recovery. A second acceptance used the production pnpm child runner with a fresh temporary store to install exact `dsh-paperclip@0.2.5`; its allowlisted proxy recorded 50 CONNECT requests, all to `registry.npmjs.org:443`. Extension Dock exposes live update/catalog/NPM probes while API and installer probes remain explicitly unavailable. |
| G08 | Official contract test plus development and packaged Electron relocation/rollback regression | The locked public contract makes Workspace `path` and Session header `cwd` immutable, so Desktop does not rewrite official persistence or claim to move old Sessions. The supported fallback keeps old history and provenance, creates or reuses a Workspace for the new canonical directory, and starts future Sessions there. A black-box scenario rejected missing and file destinations, kept a selected old completed Session visible and API-readable while its directory was absent, proved new-path registration idempotent, verified the new Session cwd, rejected an incompatible old-Session rebind with `workspace-move-invalid`, and restored old membership after physical rollback. The identical scenario passed in development Electron and the Windows `win-unpacked` application. |
| G09.1 | Tests and documentation | Skill discovery reports unreadable roots, ignored links, missing `SKILL.md`, and shadowed duplicates. `docs/skills.md` contains the current parser behavior and Agent Skills compatibility notes. |
| G09.2-G09.3 | Package tests and documentation | Official balance is shown only for a complete verified `deepseek-official` response. Unknown and unsupported values are no longer fabricated as zero. Estimated price, account balance, and rolling TPS are labeled separately; pet, Task Board, archive, Workspace deletion, and conversation branch semantics are documented. |

## Current capability blocks and onsite acceptance

- G03 needs a real HarmonyOS device and a second connected client. The available
  SDK has no cross-device model-change event, so an invisible background client
  cannot meet a two-second push guarantee without upstream capability.
- G04's packaged loopback matrix now covers two independent paired-device
  principals and measured existing SSE closure at 6 ms after revoke. Two
  physical devices on a real LAN are still required to close the onsite network
  portion of acceptance; the test did not open the official loopback `/api`
  boundary or infer physical reachability from loopback.
- G07's Desktop-owned Electron boundary now has controlled route evidence and
  bounded authentication/PAC/DNS recovery. The selected public plugin package
  also has actual pnpm child-process proxy evidence. Full closure still needs a
  configured model Provider and credential to record that provider's real
  transport. Per-session network denial requires official tool and
  sandbox enforcement and is not represented by an ineffective UI switch.
- G08's compatible fallback and rollback are now verified in development and
  packaged Electron. A one-action in-place relocation remains an explicit
  upstream capability request because Workspace `path` and Session header `cwd`
  are immutable and the public API cannot rebind old Sessions. No official
  database was edited to bypass this rule, and physical Git/worktree movement
  remains a separately owned operation.
- G01's installer directory and registration transaction now has a two-commit plus
  failed-third-upgrade rollback matrix and a successfully compiled 3.3.0 NSIS
  artifact. Executing two different published installers still remains a
  release-machine acceptance scenario; G01.3's SSH mount, input/output, and full-relaunch reuse now pass in
  the Windows package. The local packaged memory baseline now has three five-minute idle
  rounds, but future 10-percent comparisons still require the same machine and
  scenario. G02.5 has a local packaged-Electron
  pass. G02.3 now has five-relaunch and 100/125/150-percent device-scale
  evidence in both development Electron and a clean Windows `win-unpacked`
  artifact. A physical Windows display-setting pass remains release acceptance
  rather than being inferred from forced scale-factor automation.
  G02.2 now has packaged DOM-drag and memory evidence; an OS Explorer hand-drag
  remains a release-machine interaction check rather than being inferred from
  synthetic `DataTransfer` events.

## Verification summary

The final post-merge real Electron core regression passed all eight suites in
122.4 seconds: controlled proxy routing, window chrome, settings interaction,
long-conversation scroll/navigation, directory picker, Runtime Provider, preset
deep link, and the ten-case direct-start/repair matrix. The proxy-related unit
and IPC set passed 117/117. The direct feature-baseline script now covers 18
plugins, 7 built-ins, 14 surfaces, and 15 skins. The equivalent top-level pnpm
command was also attempted,
but pnpm's non-interactive dependency self-check tried to reach the registry and
aborted before the feature script; the underlying checked script itself passed.
The Windows unpacked package verifier passed with 94 Runtime packages and the
packaged long-conversation Electron scenario passed after loading the restored
platform-native modules. A clean electron-builder rerun recorded all five
Windows x64 bindings in `restoredNativeBindings`, so this evidence does not
depend on manual edits to the generated package. Three clean cold launches and
three warm launches then measured median `total-to-renderer` times of 10,175 ms
and 9,803 ms respectively. Three five-minute packaged idle rounds measured a
median-of-round-medians total working set of 739,844,096 bytes, total private
bytes of 917,565,440 bytes, and DSH Host working set of 106,909,696 bytes with
eight processes in every final window. After merging the latest upstream `main`,
the complete Desktop Node test command was rerun serially outside the restricted
sandbox: it reached its own summary and exited in 133.9 seconds with 888 passes,
zero failures, and two expected Windows symlink skips. An earlier restricted run
had denied four HKCU installer cases and one temporary Electron localStorage
helper; those five environment-dependent cases passed in the final unrestricted
run. The background scheduler no longer holds the test worker open, and the
subsequent eight-suite Electron gate left no matching Runtime process behind.

After the remote-plugin dependency correction, another clean electron-builder
run again passed the 94-package verifier. Direct inspection of the packaged
remote entry confirmed that `workspace.list` filters each item through
user-scope. The packaged two-principal authorization matrix then passed with a
6 ms revoke-to-SSE-close measurement and zero page errors. An earlier sandboxed
smoke attempt hit the already-known temporary Electron OS-crypt/GPU restriction;
the isolated matrix passed outside that sandbox and is the product evidence.

For G06.4, the npm tarball integrity was verified as
`sha512-3do+7wwMCzd4fEzxIdC/b52MhWENOJRehgHhGD7VUfgHuNUm8AW2LjZ1I8iLzLG7vjl/7276Xc3RwcPcg9oalA==`.
The actual published client bundle produced
`{"defaultPrevented":true,"nativePreviewDrops":0}` in a nested browser event
reproduction. The exact compatibility tuple and inspect-only disposition are
stored in `runtime-support/community-plugin-known-issues.json`; the focused
Desktop compatibility, inventory, and UI tests passed 45/45. No third-party
package was installed into a user or Desktop profile during this audit.
The clean Windows package verifier then passed with 94 Runtime packages, the
ASAR inventory contained the known-issues artifact and both evaluator modules,
and packaged smoke reached the renderer before completing preset-ingress,
deferred deep-link, and Task Board Worktree checks.

For G02.2, the first 20-operation packaged measurement failed its retained
working-set budget despite balanced object URLs. Replacing the primary decoder
with an explicitly closed ImageBitmap made the same acceptance pass. The final
run measured an Electron working-set peak of 1,181,204,480 bytes, balanced all
24 object URLs, and ended 68,100,096 bytes above the fifth-operation idle median
against a 90,898,432-byte allowance. Full fixture, compression, phase, and
eight-process tree evidence is recorded in
`docs/archive/2026-09-08-g02-image-drop.md`.

For G01.3, the clean packaged application created a loopback SSH host through
the visible panel, completed password authentication, and rendered a PTY echo.
After a full application close and relaunch it loaded the same host from the
isolated OS home, established a new SSH transport, and rendered a second echo.
No popup BrowserWindow or renderer error was observed. The runnable evidence is
`apps/dsh-desktop/scripts/verify-packaged-ssh.mjs`; the detailed boundary and
build record is in `docs/archive/2026-09-08-g01-packaged-ssh.md`.

For G07, an explicit network acceptance created a fresh temporary pnpm store
and installed exact `dsh-paperclip@0.2.5` through the production Desktop child
runner with scripts disabled. The allowlisted loopback proxy recorded 50 HTTPS
CONNECT requests, all to `registry.npmjs.org:443`, and the entire temporary
project was removed. This closes the selected-plugin route question without
enabling the plugin or weakening its G06.4 compatibility warning. Details are
in `docs/archive/2026-09-08-g07-plugin-proxy-route.md`; a credentialed model
Provider remains a separate external acceptance boundary.

For G08, the same isolated black-box scenario passed in development Electron
and the Windows `win-unpacked` package. It retained an old completed Session
through an absent-directory relaunch, created and reused the new-path Workspace,
verified that a new Session used the new cwd, rejected unsupported rebinding of
the old Session, and restored the old Workspace membership after the physical
directory was returned. The runnable evidence is
`apps/dsh-desktop/scripts/verify-workspace-relocation.mjs`; contract and
remaining upstream boundaries are recorded in
`docs/archive/2026-09-08-g08-workspace-relocation.md`.

For G05.4, the official SessionStore, TokenMeter, BasicCompactionEngine, and
`/compact` command now run in a focused recovery matrix. The first summary
attempt fails and records a closed failure without changing the surface or
rewriting source events; retry succeeds with both halves of a tool pair in the
same shadowed range; a later turn then appends and derives normally. Command
feedback for invalid input, no-op, success, summary failure, busy state, and
cancellation is also verified. The implementation and dependency record is in
`docs/archive/2026-09-08-g05-manual-compaction.md`.
