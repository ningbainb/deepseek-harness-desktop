# Desktop 5.2.0 GitHub bug follow-up

Status: Windows source acceptance passed on 2026-10-28, with the explicit legacy approval-policy boundary below. No new installer or release is claimed. Final receipt: `final-source-validation.json`.

Evidence root: `E:/DeepSeekHarnessDesktop-Build/artifacts/desktop-5.2.0-github-bugs-20261028`.

## Results

| Report | Finding and behavior | Evidence |
| --- | --- | --- |
| 96 | Full-user sandbox permission was combined with approval policy `never`. Official SDK rejects forced browser approval before dispatching the answerer. The Desktop overlay now uses `ask`, retaining the full-user sandbox and each browser/computer action's one-shot decision. Explicit session-level `never`, rejection and cancellation remain effective. | `approval-red-valid.log`, `approval-green.log` (10/10); `control-approval-native.log` |
| 95 | Value Mode spread the source effort into a different destination route. A destination adapter retains only its supported inherited effort; unsupported/unknown inherited effort is omitted, explicit destination effort remains subject to SDK validation, unrelated controls and the original request remain unchanged. Metadata cancellation propagates. | `routing-red.log` (4 behavioral failures), `routing-cancel-red.log`, `routing-final-suite.log` (77/77), `value-mode-build.log` |
| 91 | The current official rc.4 native opener passes a visible Explorer handoff and correctly selects an isolated file containing Chinese, spaces, commas and equals signs. No product change is required for that reproduced native path operation. This is a native opener check, not a claim that every historical deliverable UI/profile has been reproduced. | `native-reveal-result.json` |

Native browser approval ran the current source Desktop and the official Playwright MCP provider with a synthetic loopback model. Reject produced zero target navigations; allow-once produced exactly one target navigation; both decisions were durably recorded. Screenshots and clean shutdown receipt: `E:/DeepSeekHarnessDesktop-Build/temp/dsh-control-approval-idhnMS/result.json`.

The default-overlay correction does not override a session's durable `approval/policy: never`. Read-only inspection of the retained 5.1.0 isolated upgrade fixture found that old session initialization had recorded this policy. Those records remain untouched, and the real SDK test verifies that an explicit session `never` still rejects. Such legacy sessions need a deliberate permission change or a new session; automatic migration of recorded policies is not included. Evidence: `legacy-approval-policy-observation.json`. Do not describe issue 96 as universally repaired for every existing session.

## Broad verification

Initial `pnpm test` completed all other workspace packages, while Desktop reported 2117 passed, 2 failed and 2 pre-existing skipped tests. The Agent Team fixture hit its old 120-second startup budget while profile composition alone consumed 57 seconds. Its wait now uses the production 600-second startup budget, retaining all session/preset assertions. The Host profile fixture expected the retained original pet even though new-user defaults select the full-body companion. It now explicitly selects the original-pet test scenario before the unchanged DOM/settings assertions. No test was removed or newly skipped.

The complete Desktop serial rerun passed: 2119 passed, zero failed and the same two pre-existing skipped tests, 2121 total. Both original failures passed within this fresh complete run. Source regression passed all 32 suites, zero failures and zero accepted-issue waivers, including the new real browser approval suite. State: `remaining-pipeline.json`; logs: `desktop-tests-serial.log`, `source-desktop-regression.log`; source receipt: `source-regression.json`.

The final source audit rechecked 11 captured source/build/fixture hashes and verified that they predate this regression run and remained unchanged. Desktop resolves Value Mode to the rebuilt workspace `lib/index.js`. The native browser receipt from the complete source run is `E:/DeepSeekHarnessDesktop-Build/temp/dsh-control-approval-ScQ6z2/result.json`. Value Mode's complete suite passed 77/77 again after the type import boundary refactor. Evidence: `source-inputs.json`, `value-mode-desktop-resolution.json`, `routing-after-type-boundary-suite.log`, `final-source-validation.json`.

Feature baseline passed: 24 plugins, 20 builtins, 36 Desktop surfaces and 15 skins; builtin adaptation checked 54 packages. SDK boundary and documentation gates passed. One existing SDK type import allowance was moved from the Value Mode entry point to the isolated request adapter; the total allowance is unchanged and no official checkout is referenced.

## Independent review

Reviewer Erdos found no product P1/P2 in the reviewed scope. One fixture P2 identified an undefined log path: `waitForSessionLog` waited for a matching header without returning its path. Two real plain/Zstandard fixture tests first failed, then passed after the helper returned the matching durable path. All earlier content and persistence assertions are retained. Evidence: `approval-log-path-red.log`, `approval-log-path-green.log`.

## Boundaries

Work remains uncommitted in the existing modified E-drive worktree. No official DSH/SDK source was modified, no user profile was migrated in place, and no production Setup was installed. The previously accepted 338903061-byte installer remains unchanged and does not contain these source fixes. Native macOS/Linux acceptance, packaging, upload, GitHub comments and publication are outside this task.
