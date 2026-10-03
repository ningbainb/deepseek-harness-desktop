# Desktop 5.0.0 candidate 10 local acceptance

This snapshot records Windows-local verification on 2026-10-03, before candidate 10 is submitted to the native three-platform workflow. It is not a publication receipt. The parent commit is `6f6b6a8291917d4bfb7b6352fb1669b0ce1b6434`; the pending delta preserves official NPM Runtime/SDK `0.2.0-rc.2`, all plugins and user-data contracts.

## Production fix

The skin active endpoint accepts both explicit `active` selections and background-only saves. A background-only response includes the committed selection, which can be `null` during a live preview. The Desktop observer must not interpret that response as an explicit Restore. It captures only a valid explicit selection from a bounded 16 KiB cloned request before the Runtime consumes the original body, then mirrors only a matching successful response. Background-only, malformed, oversized and mismatched writes do not change the main-window preview. The original request and response remain available to the official transport.

## Fixture corrections without weaker assertions

The model-preferences fixture uses the actual visible bai heading, retaining provider/card visual ordering, pinning, configuration, selection and restart assertions. Native settings adds three complete document-reload/open/close cycles before the existing ordinary-pointer assertions. No forced clicks replace those interaction assertions.

An unskinned Electron probe also reproduces the fractional-DPI difference between VisualViewport division and DOMRect inverse-scale multiplication: at scale 1.5, `547.3333129882812` and `547.3333740234375` describe the same viewport extent in different float32 calculation paths. The skin fixture converts only its expected extent into DOMRect coordinates, retaining exact equality with no pixel tolerance. Adjacent float32 values still fail strict comparison in new negative tests. All five scale/restart iterations and window-state preservation assertions remain present.

Local cold startup exceeded the original 120-second fixture wait. The affected fixtures honor `DSH_DESKTOP_E2E_TIMEOUT_MS=600000` for the maintainer's HDD while preserving their previous default startup waits and all functional assertions. No test is removed or newly skipped.

## Local results

Logs and screenshots are under `E:\DeepSeekHarnessDesktop-Build\artifacts`.

| Scope | Result | Evidence |
| --- | --- | --- |
| Directory build | Exit 0; diagnostic only, no Setup installer | `release-500-local-dir-10-pack.log` |
| Directory integrity | 190 physical Runtime files, eight shared SDK consumers, ASAR integrity and 141 runtime packages pass; Desktop executable is `NotSigned` | `release-500-local-dir-10-verify.log` |
| Packaged native settings | Ordinary link choices and persistence, shortcuts, sidebar cards, left Dock entry, usage entry and three reloads pass | `release-500-native-settings-10-reloads.log` |
| Packaged model preferences | Ordering, pinned models, configuration and restart pass; zero renderer errors | `release-500-model-preferences-10.log` |
| Source skin E2E | Preview, background controls, Apply/Restore and all five restart scales pass; logical window state preserved | `release-500-skin-background-10-e2e-final.log` |
| Focused units | 53 passed, zero failures and skips | `release-500-candidate-10-unit-final.log` |
| Feature preservation | 20 plugins, 14 builtins, 32 desktop surfaces, 15 skins | `release-500-candidate-10-baseline.log` |
| Builtin adaptation | 48 packages pass | `release-500-candidate-10-baseline.log` |
| Coupling audit | 538 imports and 1592 seams; current | `release-500-candidate-10-audit-check.log` |
| Documentation and notes | Documentation gates, architecture inventory and bilingual 5.0.0 notes pass | `release-500-candidate-10-docs.log` |

The independent directory is named `release-500-candidate-10-dir`, but its production source is the unchanged parent snapshot copied before this production fix. The packaged native/model results diagnose that snapshot; the skin result exercises the new source. They are not combined into a candidate-10 packaged acceptance verdict. The native workflow must rebuild and verify the exact submitted commit on all three platforms.

## Publication boundary

No `desktop-v5.0.0` tag, formal Release or website deployment is established by these local results. Real Setup installation/overlay/uninstall runs only on the disposable GitHub Windows Runner; this maintainer account does not run Setup. Candidate 10 must pass complete Windows source and packaged gates, macOS arm64 and Linux x64 native gates in one run before an authorized tag is created. Official metrics remain excluded from local test activity. Failed workflow candidates retain diagnostic assets separately from the formal publication artifact set.
