# Custom provider credential save design and implementation plan

> For agentic workers: use superpowers:executing-plans to implement and verify the steps below in the current preserved worktree.

Goal: prevent a failed key write from leaving a newly configured custom model provider without its credential.

Architecture: keep the official Models form, schema validation, provider creation, profile reload, and credential store. Add a Desktop client guard in the existing SDK plugin. On the explicit Create provider action, call a narrow Host preflight route on the existing guarded local bridge. The Host serializes the live credential presence check, first SDK write and confirmation per reference before the client replays the original form action. This spans main/Dock browser partitions. A refusal retains the form and key draft and creates no provider. No official source or installed SDK file is modified.

Existing configured references are presence-checked only during preflight, since they may be shared with another provider. Their value replacement remains inside the original form's existing save sequence. This avoids introducing an early overwrite when the profile later refuses a conflicting edit. The new protection fully gates first-time unused references; it is not a multi-document transaction or an automatic recovery for arbitrary lost secrets.

SDK coupling is isolated in the exact controlled adapter file `packages/dsh-web-ui-settings/src/custom-provider-key-sdk-adapter.ts`; only that file is added to the import-boundary controlled list. Its public branded ref type is reused by the tests. No wildcard exception or additional ordinary-file import allowance is added.

Tech stack: TypeScript, official NPM Cordis and credential Remotes, native Electron/Playwright, Vitest/jsdom.

Spec: this document; the user requests independent investigation and repair of third-party keys lost after restart or upgrade, entered through Models / custom provider.

## Evidence and limits

- Ordinary custom creation, native key editing, restart, synthetic streaming chat, and isolated old 5.1.0 upgrade passed in the existing 5.2.0 package.
- Native failure reproduction: `E:/DeepSeekHarnessDesktop-Build/artifacts/desktop-5.2.0-key-persistence-20261029/custom-provider-io-refusal-red/result.json`. A directory temporarily occupying the isolated credential-file path causes a real SDK I/O refusal. The provider is nevertheless persisted, while its key is absent. All original test data is restored afterward.
- This reproduces a relevant failure mode; the exact reporting user's cause remains unknown. Do not claim every invalid-key response is caused by local persistence.

## Constraints and review focus

- Preserve dirty worktree changes, all controls and plugins, official profile / Cordis mounting, and SDK-only development. No publication or commit is requested.
- Use the E-drive PowerShell environment for pnpm. No concurrent native tests.
- Never put keys in logs, storage outside the official credential service, error messages, data attributes, or test reports.
- Blank keys, other settings, disabled controls, and invalid provider IDs retain original behavior.
- Multiple clicks, disposal, a detached editor, or changed input during the pending write must not replay a stale action.
- Switching away from the custom panel leaves it mounted but hidden; a hidden create button must never replay. Cross-window ownership is protected on the Host rather than by a browser lock limited to one storage partition.
- Save rejection and failed presence confirmation must retain the draft and prevent provider creation; retry must remain possible.
- The native original form remains authoritative for validation and profile mutation. Main settings and Dock share the same additive guard.

## Task 1: client save guard

- [x] Add behavioral jsdom tests for ordered save, refusal, retry, concurrency, input changes, disposal, and unaffected controls.
- [x] Add Host tests for live per-reference serialization across separately mounted routes, malformed/oversized requests, bridge authorization, write refusal, and queue recovery.
- [x] Implement `packages/dsh-web-ui-settings/src/client/custom-provider-key-persistence.ts` and mount via the existing client plugin and guarded Host SDK route.
- [x] Add localized status/error copy without exposing service error values.
- [x] Update the machine-readable feature baseline additively.
- [x] Run focused package tests, type checks, and rebuild the plugin using the shared build preset.

## Task 2: native acceptance and regression

- [x] Re-run the same I/O-refusal assertion with the source adapter active; it must pass without provider creation and with the draft retained.
- [x] Re-run native UI custom creation and actual synthetic chat before/after restart; no environment-injected key.
- [x] Run required feature baseline and Desktop core regression gates, plus relevant package checks.
- [x] Review the owned diff, preserve failed receipts, and state build/publication boundaries honestly.

Current source evidence root: `E:/DeepSeekHarnessDesktop-Build/artifacts/desktop-5.2.0-key-persistence-20261029`.
The full settings package suite passed 354 tests; the final controlled SDK adapter build and 38 focused tests passed.
The independent scoped review resolved the cross-window and hidden-form findings; it reported no remaining P1/P2 issues.
Core Desktop regression passed all 32 suites with no accepted issues. Its final integration group passed 460 tests with zero skips, including the real Windows console observer positive control. Fresh installer acceptance is recorded separately and must finish before delivery.

## Task 3: local unsigned test installer

- [x] Preserve and verify the previous installer, then run the full Windows package build and package checks.
- [x] Extract the actual new Setup payload, verify its compressed files and restore the shipped offline runtime files.
- [x] Verify current inputs, packaged smoke, credential write refusal, native custom-provider creation/restart/chat, control approval, Agent work, and stored-key old-5.1 upgrade preservation against the extracted new bytes.
- [x] Record actual installer size, SHA-256, manifest identity, signature state, and verification limits.

Final package evidence: `E:/DeepSeekHarnessDesktop-Build/artifacts/desktop-5.2.0-key-fix-pack-20261029/final-identity.json`.
All nine new-byte acceptance steps passed. See `2026-10-29-custom-provider-credential-save-validation.md` for the report and exact installer identity.

Only isolated automatic acceptance is authorized. Do not install Setup into the current user account or claim formal NSIS overwrite-install, macOS/Linux acceptance, or publication.

Implementation choice: the maintainer explicitly requested proceeding independently rather than further questions. The guard is an additive compatibility change, not a new product flow requiring approval.
