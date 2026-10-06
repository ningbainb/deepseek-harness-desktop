# Desktop 5.0.1-beta.1 usability acceptance

## Scope

Candidate source is based on stable 5.0.0, commit `47b131c57d6467aa438b5103a44bd63da20ff39b`, plus the uncommitted worktree in `E:\DeepSeekHarnessDesktop-Build\worktrees\desktop-5.0.0`. This record covers local Windows source, an unsigned Windows x64 beta installer and isolated extracted-payload checks. Existing worktree changes, the old path junction, user installations and user data remain intact. No release tag, push, publication or execution of Setup against the user's installation is recorded here.

## Implemented behavior

- Fresh profiles initialize the official skin without a particle overlay. Existing skin, wallpaper and explicit particle preferences survive; retired legacy selections retain their compatible fallback rather than being mistaken for fresh profiles.
- Streamed text and internal Markdown mutations avoid repeated sidebar compatibility sweeps. Complete Chinese text, code and native navigation remain available.
- Optional sidebar tools support collapse, expansion, keyboard access and saved state. The workspace region can shrink within a reserved minimum so small-window footer controls remain inside the viewport. The layout frame uses `overflow: clip` without replacing conversation or list scrolling.
- The Desktop footer Dock is the sole shortcut when mounted. The upper shortcut remains only as an older-shell fallback; late footer buttons and sidebar replacement are covered. The footer's original action is preserved.
- The sidebar retains Today spending as its sole usage entry while its main button is mounted. The compatible model-usage entry returns only without that button; statistics navigation, card collapse, native balances, the standalone balance center and query APIs remain intact.
- Dark Dock colors retain readable skin palettes or select an opaque contrasting surface. Dedicated settings documents follow the theme. The context accessory excludes backdrop blur so its fixed native tooltip does not change the containing block and jump the conversation viewport.
- Dock sidebar, search, toolbar and management panels use opaque inherited colors, thin borders and stable hover geometry. Decorative gradients, layered shadows and 39 backdrop-blur declarations are removed. Existing skin palette inheritance, all fifteen destinations, feature search and visible keyboard focus remain available; compact navigation labels use 13 px text.
- Windows in-app updates pass the running executable's directory. Manual Setup honors explicit destinations and recognized registration locations. Data retention, duplicate-copy limits and rollback boundaries are described in [upgrade and rollback](../upgrade-and-rollback.md#windows-installation-location).
- Native App menus offer one-time tray residency without rewriting close preferences or restarting the Runtime. Persistent tray opt-in also handles titlebar minimization. Click/double-click restoration, unavailable-tray taskbar fallback, and explicit Runtime shutdown remain available; disabling residency restores a hidden main window before disposing its tray.

## Executed checks

Artifacts are under `E:\DeepSeekHarnessDesktop-Build\artifacts`.

| Check | Evidence | Result |
| --- | --- | --- |
| Aggregate plugin tests | `beta-501-dock-dedup-tests-final.log` | 30/30 passed; three test files |
| Aggregate plugin build | `beta-501-dock-dedup-build-final.log` | Passed |
| Profile, updater, conversation polish and sidebar unit tests | `beta-501-focused-accepted.log` | 93/93 passed; no skips |
| Feature and adaptation gates | `beta-501-baseline-accepted.log` | 20 plugins, 14 builtins, 33 surfaces, 15 skins; 48 packages passed |
| Documentation gates | `beta-501-docs-accepted2.log` | Passed, including paired hashes and architecture inventories |
| Isolated usability E2E | `beta-501-usability-final-accepted/result.json` | Passed through restart without external intervention |
| Source CORE regression before usage-entry deduplication | `beta-501-core-accepted-receipt.json` | Completed: 21/25 passed, four failed; not a passed release gate |
| Usage-entry deduplication unit tests | `beta-501-usage-dedup-unit.log` | 14/14 passed; original balance and standalone-sidebar assertions retained |
| Retained footer navigation unit tests | `beta-501-usage-dedup-navigation.log` | 7/7 passed; statistics navigation, collapse, failure and retry controls preserved |
| Live statistics typecheck and build | `beta-501-usage-dedup-build.log` | Passed |
| Usage-entry feature and documentation gates | `beta-501-usage-dedup-baseline.log`, `beta-501-usage-dedup-docs.log` | Passed; 48-package adaptation gate also passed |
| Final documentation gate | `beta-501-usage-dedup-docs-final.log` | Passed after updating the acceptance record and bilingual release notes |
| Dock clarity and retained management actions | `beta-501-dock-clarity-unit.log` | 27/27 passed with zero skips |
| Dock clarity feature gate | `beta-501-dock-clarity-baseline.log` | Passed; 20 plugins, 14 builtins, 33 surfaces, 15 skins and 48-package adaptation retained |
| Final Dock clarity, management, compatibility and regression-lifecycle unit tests | `beta-501-dock-clarity-unit-final.log` | 37/37 passed with zero skips |
| Final Dock clarity feature and documentation gates | `beta-501-dock-clarity-baseline-final.log`, `beta-501-dock-clarity-docs-final.log` | Passed; 48-package adaptation and architecture inventories retained |
| Final isolated Dock clarity E2E | `beta-501-dock-clarity-accepted2/result.json`, `beta-501-dock-clarity-accepted2.log` | Passed; real light/dark settings, all fifteen destinations inside every sampled viewport, opaque panels, stable hover, search, keyboard focus and real navigation; no page errors |
| Today spending and compatible selected-model balance E2E | `beta-501-usage-dedup-e2e2.log` | Passed in isolated source Electron: sole footer entry, real usage navigation, disable/fallback, official-relay-official balances, real overview opening and re-enable/deduplication; zero paid requests |
| Background residency and retained lifecycle unit tests | `beta-501-residency-unit-final2.log` | 72/72 passed with zero skips; close policy, native menu/shortcut, tray initialization, ingress, shutdown and regression registration |
| Background residency feature and documentation gates | `beta-501-residency-baseline-accepted.log`, `beta-501-residency-docs-accepted.log` | Passed; 20 plugins, 14 builtins, 34 surfaces, 15 skins and 48-package adaptation |
| Background residency isolated Windows E2E | `beta-501-residency-e2e7/result.json`, `beta-501-residency-e2e7.log` | Passed; one-time and persistent residency, native keyboard input, Runtime API while hidden, click/double-click restore, saved choice across restart, disabling restores window, unavailable-tray taskbar fallback, and two explicit quits each reaping eight owned processes |

The isolated usability E2E verifies 120 progressive Chinese chunks, exact full text and code, a real local provider request to the selected session, A-to-B-to-A history recovery, default appearance, one footer Dock, ordinary Dock clicks, keyboard expansion, and restart restoration. At requested 1280 x 800, 1024 x 720 and 880 x 600 content sizes, the actual Windows widths were one pixel smaller. Workspace heights were 353.5, 273.5 and 153.5 CSS pixels; the selected session and essential controls remained visible in every size.

Performance sampling recorded 13 sidebar queries and an 8.5 ms frame p95, with a 141.7 ms maximum frame. Exact text and progressive-output assertions passed; a good p95 is not a claim of zero stalls. The prior stable-default scenario recorded 81 queries and a 16.6 ms p95, but also used different appearance defaults, so this is not an isolated same-theme animation-algorithm benchmark.

Each official and retained `blue-fantasy` context hover stayed visible and stationary for 25 samples at 100 ms intervals. Dark mode was selected through the real official settings UI. The Dock used `rgb(10, 20, 27)` background and `rgb(219, 226, 242)` text, with a measured contrast of 14.33:1. Screenshots include `collapsed-880.png`, `expanded.png`, `dock-dark.png` and `restarted.png` in the accepted E2E directory.

## Earlier failures and boundaries

Earlier failures are retained, not counted as passes. They exposed horizontal scrolling of a hidden layout frame and an undersized sidebar footer budget; both were fixed in implementation. Earlier fixture failures included premature default-workspace activity, an incorrect accessible-role lookup, a stale pre-restart page locator and an automatically collapsed native sidebar on restart. The final fixture waits for readiness, validates the prompt's exact session, uses the real native expand button and reconstructs post-restart locators. The `accepted5` run received an external diagnostic click and is explicitly not the accepted result.

The first usage-entry E2E (`beta-501-usage-dedup-e2e.log`) failed because Playwright's immediate checkbox-state check ran before the controlled official form accepted its asynchronous write. The accepted second run uses ordinary clicks and separately waits for the actual accepted-form state, retaining all original official-relay-official balance, credential-isolation and no-paid-request assertions. This targeted pass is not a new full CORE regression pass; the four failures in the completed CORE receipt remain unresolved acceptance boundaries.

The initial Dock clarity baseline fixture incorrectly expected a non-empty community-plugin list in a fresh isolated Home. Its captured `beta-501-dock-clarity-before/failure.png` is an unedited real-window visual reference, not a passing baseline acceptance. A later fixture incorrectly expected a light-theme body attribute; the official light mode uses absence of the dark attribute. These failed runs remain on disk. Theme readability checks wait for the existing color transition before sampling and resolve modern CSS colors through canvas pixels, rather than treating color-space coordinates as 8-bit RGB values.

The earlier `beta-501-dock-clarity-final2` pass did not require every destination to remain inside the small-window viewport. The strengthened `beta-501-dock-clarity-accepted` run exposed small-window sidebar crowding and failed. Implementation now uses a 180 px sidebar at narrow widths, shrinkable sidebar layout, and compact header/search/group spacing at short heights. Assertions were retained. The final `accepted2` run passed at actual 959 x 680 light/dark and 799 x 600 dark viewports: all fifteen 28 px navigation rows remained inside each viewport, with no horizontal page/sidebar overflow or translucent panels. Minimum navigation contrast was 4.55:1 in light mode and 6.86:1 in dark mode. Real clicks reached recovery, search filtered skin destinations, skills/plugins navigation and keyboard focus remained available, and page errors were empty. The three screenshots were visually reviewed. The clarity suite increases CORE from 25 to 26 suites without removing existing suites; no new complete CORE receipt is recorded here.

Background-residency failed runs remain recorded. The first run hit the fixture's 30-second first-window deadline and its bounded cleanup deadline; later runs allow the slow disk's startup to complete. The second used an unavailable workspace-list RPC; the accepted probe uses the official NPM SDK's read-only `settings/describe` endpoint without changing the requirement for a successful Runtime response while hidden. The third read the preference before its asynchronous atomic write had created it; the accepted fixture waits for the saved value while retaining its exact assertion. The fourth and fifth CDP keyboard-input runs did not trigger the native shortcut. The implementation includes a scoped main-process input adapter, and the accepted verifier sends native `WebContents.sendInputEvent` key events through that installed adapter. The sixth raced a setting-triggered Runtime navigation; the accepted fixture checks the tray status after the real page becomes ready. These failures are not counted as passes.

The accepted residency run uses actual Electron windows, menus, tray objects and the full isolated Runtime. Tray restoration events and menu callbacks are driven by the verifier, not by physically clicking the Windows notification area. No renderer tray/close-preference mutation IPC is added. Default taskbar minimization and the default Quit preference remain intact. The new residency suite increases CORE to 27 suites; the earlier 21/25 receipt is still not a passed current full regression gate.

The streaming fixture visibly drags the movable pet away from the composer before sampling. It does not force the send click or hide the pet. This is a fixture precondition, not evidence that default pet placement never obscures the composer.

The earlier complete Desktop run had 1597 passes, two failures and two existing skips out of 1601 tests. The legacy-skin regression passes in the focused rerun; the complete-profile Host fixture has been repaired but its rerun and the final full-suite result must be recorded separately. The earlier CORE run passed 18/25; it must not be substituted for the current completed receipt. The earlier multiworker settings run was interrupted and is not a passing full-package result.

Six isolated installer-directory scenarios passed in `beta-501-installer-directory4.log`. NSIS fixtures are not a production Setup install, a real existing-installation overlay or arbitrary-drive shortcut repair. No clean Windows installation environment is available. Formal Setup fresh-install, overlay and rollback acceptance, macOS/Linux native validation and candidate publication remain outside this record.

## Local Windows test package

The successful second build is recorded in `beta-501-pack-win-2.log`, exit 0. The first build stopped at a stale generated support-matrix Desktop range and is not passing evidence. The repository generator refreshed only that range to `=5.0.1-beta.1`, without promoting Runtime support status. The former dist is preserved in `E:\DeepSeekHarnessDesktop-Build\artifacts\desktop-5.0.0-dist-before-beta501-20261004`.

- Installer: `E:\DeepSeekHarnessDesktop-Build\worktrees\desktop-5.0.0\apps\dsh-desktop\dist\DeepSeek-Harness-Desktop-Setup-5.0.1-beta.1-x64.exe`.
- Size: 324130275 bytes, 309.11 MiB.
- SHA-256: `1c15082642c6342475512c62b46193f62d94b54847acabebbbe783954e912ce3`.
- Authenticode: `NotSigned`; version `5.0.1-beta.1`, channel `beta`, official Runtime `0.2.0-rc.2`. `SHA256SUMS.txt`, `beta.yml` and `release-manifest.json` are generated and verified beside the installer.
- Machine-readable local receipt: `E:\DeepSeekHarnessDesktop-Build\artifacts\beta-501-package-acceptance.json`.

| Packaged check | Evidence | Result |
| --- | --- | --- |
| Package verification | `beta-501-pack-verify.log` | Exit 0; 141 Runtime packages, 191 physical critical files, one packed ASAR file and eight shared SDK consumers |
| Installer extraction without running Setup | `beta-501-installer-extraction.log` | Exit 0; 22784 files extracted; embedded 7z wrapper reports trailing data, with no extraction errors |
| Extracted package verification | `beta-501-extracted-pack-verify.log` | Exit 0; same integrity gates; nine selected executable, ASAR, configuration, adapter and plugin hashes match win-unpacked |
| Extracted startup, preset ingress and Task Board Worktree smoke | `beta-501-extracted-pack-smoke.log` | Exit 0; cold startup 175946.2 ms on this local mechanical-disk run; real Runtime, preview-only preset ingress and session cwd/review/discard checks passed |
| Extracted default appearance, streaming and sidebar usability | `beta-501-packaged-usability/result.json`, `beta-501-packaged-usability.log` | Exit 0; official fresh default, 120 progressive chunks, exact Chinese text/code, one local agent request, A-to-B-to-A history, keyboard expand/collapse, restart persistence, stable context hover and dark Dock |
| Extracted Dock clarity | `beta-501-packaged-dock-clarity/result.json`, `beta-501-packaged-dock-clarity.log` | Exit 0; fifteen destinations visible at 959 x 680 light/dark and 799 x 600 dark; no translucent panels, page errors or horizontal overflow; minimum contrast 4.55:1 light and 6.86:1 dark |
| Extracted background residency | `beta-501-packaged-residency/result.json`, `beta-501-packaged-residency.log` | Exit 0; native keyboard, one-time and saved residency, Runtime API while hidden, restoration, disabling and unavailable-tray fallback; two explicit quits stop ten and eight owned processes |

The installer payload is extracted to `E:\DeepSeekHarnessDesktop-Build\artifacts\beta-501-installer-extracted`; all packaged feature tests launch that executable with separate test data and protocol registration disabled. Streaming samples record ten compatibility queries, 138 text updates and 8.5 ms frame p95, but a 167 ms maximum frame; this does not establish stall-free output on every machine. Collapsed workspace heights are 385.5, 305.5 and 185.5 CSS pixels at the three sampled sizes, with the selected session and essential controls visible. The packaged collapsed-sidebar and dark-Dock screenshots were visually reviewed. Residency callbacks/native input remain automated, not physical notification-area clicks.

These targeted passes do not replace the earlier failed 21/25 CORE receipt or establish a passed current 27-suite/full release gate. This is a local test package, not a published stable release or complete installer-upgrade acceptance.
