# Desktop 5.0.0 candidate 11 settings readiness

This snapshot follows candidate 10, commit `8c2cabebb05898b71de38ebd5e3a9e8f01eda1b4`. Native workflow run `37146738148` passed macOS arm64 and Linux x64; Windows passed source verification and 23 of 24 core regression suites. It failed before Windows packaging, at the settings-readiness fixture's five-second document navigation wait, not at its three-second settings-controller assertion. No formal tag or Release was created.

## Diagnosis and scope

The first Windows-local reproduction also failed in the navigation wait: the HTTP URL was committed, but the document remained `loading`, with no dialog or controller. The subsequent diagnostic run and eight consecutive warm launches passed every original assertion. This establishes a precondition/startup failure, not a demonstrated controller defect; it does not establish HDD latency as the sole cause of the CI failure.

The fixture uses the existing native startup budget for its bootstrap window and document navigation, while retaining its five-second interaction waits and three-second settings-controller wait. Slow-resource pending status, interactive document state, all eight resize handles before and after resource completion, and unchanged controller identity remain mandatory. New fixture-contract coverage protects these distinctions. Main-process navigation stages and renderer evaluation failures are recorded instead of collapsing diagnostic failures to `undefined`.

## Local evidence

Evidence is under `E:\DeepSeekHarnessDesktop-Build\artifacts`: `release-500-readiness-11-before-exec.log`, `release-500-readiness-11-diagnostic.log`, eight `release-500-readiness-11-repeat-*.log` files, `release-500-readiness-11-unit.log` (eight passed, zero failures or skips), and `release-500-readiness-11-fixed.log` (complete slow-resource E2E passed). No production implementation, official Runtime source, SDK dependency, baseline feature, test assertion or skip condition is changed by this fixture correction.

Candidate 11 still requires one exact-source native workflow run to pass Windows source, production Setup installation/overlay/uninstall, packaged regressions, macOS arm64 and Linux x64 gates. These local results alone do not authorize a publication claim or reuse of candidate 10's other-platform assets.
