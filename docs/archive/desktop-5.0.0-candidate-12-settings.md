# Desktop 5.0.0 candidate 12 settings lifecycle

Candidate 11 native run `37148823902` passed macOS arm64 and Linux x64, but Windows source regression passed 22 of 24 suites and stopped before packaging. Its new diagnostics separated two failures: the slow-resource document and controller were already ready, but the image request had not reached the fixture's HTTP server; separately, the real settings dialog remained visible after reload with an available preload bridge but no Desktop controller for the entire 30-second wait. These are not both navigation-timeout failures.

## Production and fixture corrections

Every top-level DOM-ready document starts a new settings-adaptation lifecycle. Navigation still invalidates pending work, while resource load completion remains a fallback and does not reinstall an already-active controller. New unit tests verify repeated documents without navigation details and cancellation of the previous document's pending CSS. This avoids carrying an applied flag across a renderer document replacement.

The slow-resource fixture explicitly signals that its HTTP image request has started before settings interaction. The pending-response, interactive-state, three-second controller mount, eight resize handles and same-controller-after-load assertions remain unchanged. A five-second bounded precondition wait fails if the request never starts; it neither releases the resource early nor ignores an absent pending resource.

## Local results and boundaries

The focused Desktop suite passed 35 of 35, with zero failures or skips. The Worker suite independently passed 47 of 47. The complete slow-resource E2E passed, and the source native-settings E2E passed all three document reloads, ordinary link-choice clicks and saved settings, shortcut editor, reversible sidebar card changes, ten seconds without reconnecting, left-sidebar Dock and usage-footer opening of the actual isolated Runtime settings document. Its HDD startup used the existing `DSH_DESKTOP_E2E_TIMEOUT_MS=600000` fixture option; no interaction assertion or default was removed.

Logs under `E:\DeepSeekHarnessDesktop-Build\artifacts` are `release-500-candidate-12-unit-final.log`, `release-500-readiness-12-fixed.log`, `release-500-native-settings-12-source.log`, `release-500-candidate-12-baseline.log`, `release-500-candidate-12-docs.log` and `release-500-candidate-12-audit-final.log`. Screenshots are in `release-500-native-settings-12-source`. The baseline preserves 20 plugins, 14 builtins, 32 desktop surfaces and 15 skins; 48 builtin adaptation packages pass.

The initial local `pnpm verify` failed on two unmodified Aionui filesystem tests at their original five-second limit. An isolated rerun of the complete Aionui suite under its unchanged defaults passed 223 tests with one pre-existing skip. This is recorded in `release-500-candidate-12-verify.log` and `release-500-candidate-12-aionui-retest.log`; it is not relabeled as a full local verification pass. Exact-source native workflow verification, Setup acceptance and packaged regression remain required before tagging or publication. No prior-candidate installer or other-platform artifact may substitute for that build.
