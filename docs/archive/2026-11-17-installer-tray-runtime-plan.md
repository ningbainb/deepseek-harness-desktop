# Installer, tray and runtime implementation plan

**Goal:** Resolve issues 102 and 103, prevent historical uninstall aliases from targeting the new installation, default to tray residency, adopt the current official NPM runtime and reduce redundant background work.

**Architecture:** Keep the existing transactional installer and rollback journal. Empty registry tombstones are absent; historical registrations require exact target ownership before entering that same journal. Ship the complete independent Electron runtime in normal Windows installers, retaining reconstruction compatibility for older payloads. Preserve valid saved close preferences and explicit shutdown paths.

**Constraints:** Official NPM SDK only; no upstream checkout writes; preserve all plugins and UI controls; no emoji; Windows execution uses D:/dshshequ and the same-volume .desktop-build directory, following the maintainer's explicit migration instruction; macOS/Linux acceptance requires native GitHub jobs. No NPM publication is part of this task.

**Approaches:** Retrying reconstruction cannot establish why an external child exits without output. Complete runtime distribution removes that installation dependency at the cost of archive size. Registry cleanup by display name alone could affect another installation, so use exact uninstaller and directory matching plus the community ownership marker. Defaults change only missing/invalid preferences; explicit quit and ask remain available.

- [x] Reproduce empty-key and alias ownership failures; implement and verify registry rollback and native installer lifecycle.
- [x] Test complete archive retention and NSIS dispatch before enabling full runtime distribution; keep old reconstruction tests.
- [x] Change default close behavior and verify real close, restore, quit, explicit settings and tray failure.
- [x] Coalesce concurrent tray refreshes and avoid rebuilding unchanged native menus; test disposal and status changes.
- [x] Resolve current official latest runtime, update the SDK cohort and lockfile, build/typecheck and regenerate support manifests only with truthful evidence.
- [ ] Update feature baseline, run repository checks, Windows regression, package and native installation checks; record actual outcomes and limits.

**Review focus:** Empty keys versus unknown nonempty registrations; rollback after partially removed aliases; foreign installations and conflicting paths; tray failure and explicit quitting; complete archive identity and missing runtime files.

**Ledger:** Base is released tag desktop-v5.2.0 (c64c9521), a descendant of the initial local main. User confirmed system tray and desktop performance. Registry tombstone failure and 20 duplicate concurrent tray reads were reproduced before fixes. The original cause of the reported external PowerShell termination is not proven; complete distribution avoids the affected reconstruction step without accepting an incomplete runtime.

**Migration:** The maintainer requested D:/dshshequ after the E: USB HDD slowed dependency linking. Source edits and the required Node/pnpm tool versions were transferred to the existing D: checkout. Current lockfile package identities select reusable content-addressed cache files, checked by SHA-512; historical worktrees, archives and unrelated cache packages are excluded. No E: data is deleted. The generic environment script keeps the store and workspace on one volume and retains the old E: entry point for existing worktrees.

**Intermediate Windows evidence:** Registry discovery and transaction fixture passed; complete runtime, registry rollback, fresh rollback and retained-backup tests passed 18/18 on D:. Tray, close behavior and NSIS options passed 29/29 before migration. Four PowerShell process-boundary fixtures initially could not execute under Windows PowerShell's default execution policy; their explicit fixture launcher now uses ExecutionPolicy Bypass and all four pass with the original assertions. Final dependency, build, native installer and regression gates remain pending.

**Native fixture evidence:** Production NSIS macros compiled and ran successfully in all 17 isolated lifecycle cases, including complete runtime success and missing-file rollback. Payload retention, legacy reconstruction and include-order tests passed 23/23. Full-runtime integrity tests passed 5/5, including a tampered pinned manifest. D: registry/tray/NSIS-options tests passed 30/30.

**Acceptance boundary:** The real overlay preflight found existing .dsh user data and correctly refused disposable-machine acceptance. The maintainer has no clean Windows VM and explicitly requested completion of the locally available checks. This task must not certify real clean-account installation/overlay, macOS or Linux acceptance.
