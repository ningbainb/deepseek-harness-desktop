# Desktop Stability and Direct-Start Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Goal

Harden the `desktop-v3.0.7` direct-start path so profile bootstrap failures remain inside `StartupRepairCoordinator`, preserve same-Home repair and builtins fallback semantics, make root patch handling explicit, and add bounded diagnostics and tools-capability gating without restoring the legacy recovery shell.

## Constraints

- Work only in `dsh-web-ui-desktop-direct-repair`.
- Preserve the current tag/branch baseline and unrelated untracked files.
- Do not reset, checkout, clean, commit, push, or create a PR.
- Keep host-only repair boundaries: staged workspace only, bounded model/tool attempts, no secrets or raw prompts in diagnostics.
- Treat upstream `@deepseek-ai/dsh-*` packages as pinned compatibility inputs. Add a Desktop-owned compatibility seam only when the pinned package exposes no formal request-side capability hook.

## Implementation steps

### 1. Establish failure-classification and profile-bootstrap tests

Files: `apps/dsh-desktop/src/profile.mjs`, `apps/dsh-desktop/test/profile.test.mjs`, `apps/dsh-desktop/test/runtime-integration.test.mjs`, and a focused startup-policy test if needed.

- Classify malformed profile/package/patch data as repairable, permission failures as permission failures, installation/runtime integrity failures as installation failures, and unknown failures as fatal.
- Add tests for malformed `package.json`, malformed profile patch YAML, managed-package collision, permission errors, and the fact that profile bootstrap is deferred until the coordinator-owned provider start.
- Keep unmanaged package data fail-closed and preserve existing atomic-write behavior.

### 2. Remove the pre-coordinator full-profile bootstrap

Files: `apps/dsh-desktop/src/electron-app.mjs`, `apps/dsh-desktop/src/startup-repair-coordinator.mjs`, related coordinator tests.

- Use `profiles/desktop` as the early identity/path only.
- Load non-profile startup inputs independently, but call `ensureDesktopProfile` only from the full provider's coordinator-owned `ensureProfile`.
- Ensure permission/installation/unknown failures do not enter model repair; repairable profile failures retain the two full attempts, private staged repair, and same-Home builtins fallback.
- Preserve all existing state names and transition semantics.

### 3. Make `cordis.patch.yml` behavior explicit

Files: `apps/dsh-desktop/src/profile.mjs`, `apps/dsh-desktop/test/profile.test.mjs`, and documentation only if behavior changes.

- Pin tests for missing, empty, comment-only, `{}`, `[]`, and malformed root patch files.
- Use a real pinned-runtime A/B check when the runtime is available; do not create a missing root patch merely by assumption.
- Never overwrite malformed non-empty content.

### 4. Add bounded startup-attempt diagnostics

Files: `apps/dsh-desktop/src/startup-repair-coordinator.mjs`, `apps/dsh-desktop/src/startup-diagnostics.mjs`, `apps/dsh-desktop/src/electron-app.mjs`, and focused diagnostics/metrics tests.

- Add a boot correlation id and separate startup attempt number from runtime controller restart attempt.
- Record only bounded safe fields: profile name, runtime pid, phase, failure category, duration, and attempt-to-ready metrics.
- Preserve existing marker names and parser behavior; never log credentials, prompts, sessions, tool results, or raw absolute paths.

### 5. Add tools capability and repair availability gating

Files: Desktop capability helper, `apps/dsh-desktop/src/repair-model-availability.mjs`, `apps/dsh-desktop/src/automatic-repair-runner.mjs`, repair/compat tests, and patch registry metadata if a patch is required.

- Model `auto`, `native`, and `none` as request-side capability values; do not branch on model names.
- Make `tools:none` repair-incompatible and return stable `UNSUPPORTED_TOOLS` for tool-history requests without issuing an illegal provider request.
- Return safe availability reasons: available, no-model, missing-credentials, unsupported-tools.
- Do not implement generic HTTP 400 retry-by-deleting-tools, and do not mutate response-side `llm/stream` options.
- If the pinned upstream has no formal request-side seam, document that limitation and keep the Desktop-owned boundary precise and version-scoped.

### 6. Verify and hand off

- Run focused profile/coordinator/repair/compat/diagnostics tests first.
- Run the full Desktop, compat, repair, typecheck, script, runtime-support, and docs checks that are available in the current environment.
- Run a real runtime/direct-start or packaged fault matrix only when the pinned runtime/artifacts are present; report unavailable gates as `NOT RUN` with the reason.
- Review the diff and worktree, preserving unrelated user files.

## Success criteria

- No full `ensureDesktopProfile` call occurs before `StartupRepairCoordinator` owns the provider attempt.
- Repair remains bounded and private; builtins fallback remains same-Home.
- Malformed profile data is repairable; permission/install/unknown failures fail closed without model repair.
- Existing diagnostics markers remain parseable and new fields are safe and bounded.
- Tools capability behavior is explicit, tested, and does not claim an upstream seam that does not exist.
