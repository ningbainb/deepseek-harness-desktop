# GitHub issue follow-up implementation plan

**Goal:** reproduce and resolve reports 96, 95 and 91 against Desktop 5.2.0 with official NPM Runtime 0.2.1-rc.4, retaining existing functions and user data.

**Architecture:** make minimal changes in the Desktop overlay and self-owned plugin hooks. Read official NPM SDK behavior without modifying its source. Preserve the previously accepted installer and its receipts; this task does not publish or reuse old package acceptance for changed source.

**Constraints:** keep the dirty E-drive worktree, official SDK/profile mounting, existing tests, per-action control approval and explicit session policy. Put all isolated data and evidence on E. Run native checks serially. No production account installation, GitHub comments, commits, pushes or publication.

## Task 1: browser approval under full filesystem permission

- [x] Reproduce the generated full-user overlay against the real SDK approval service: a browser action must reach a one-shot answerer rather than an automatic rejection.
- [x] Correct the Desktop default approval policy while preserving full filesystem permission, denial/cancellation and explicit session-level never policy.
- [x] Run overlay and control-approval tests plus native approval UI integration.

## Task 2: model-route reasoning controls

- [x] Add failing host request-routing tests for controller and subagent requests carrying a source model effort.
- [x] Keep a target-supported inherited effort; clear inherited effort when target capabilities are undeclared; preserve explicit route effort and let the SDK reject unsupported explicit requests. Preserve unrelated request settings and the original object.
- [x] Run the entire value-mode suite and build/type checks against official SDK types.

## Task 3: Windows deliverable reveal

- [x] Characterize current official reveal command and reproduce the real Explorer result with isolated Unicode/space/comma/equals paths.
- [x] If still broken, fix via an owned SDK/profile adapter and verify actual selected target; if already working, retain the evidence and avoid unnecessary product changes.
- [x] Preserve registered-session file authority, cancellation, other open actions and macOS/Linux behavior.

## Acceptance

- [x] Append machine-readable feature contracts, retaining all previous entries.
- [x] Run affected suites, workspace tests, feature/import/docs gates and the desktop regression gate. Report every failure and the source/package/native-platform boundary.
- [x] Obtain an independent final review, record exact outcomes and retain the previous accepted installer unchanged.
