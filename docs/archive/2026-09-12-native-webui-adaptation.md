# WebUI desktop adaptation, first batch

Date: 2026-09-12. Desktop package: 3.5.0. This record describes source changes and local verification; it is not a published release.

## Package boundary

The Desktop continues to use `@linxin666/dsh-web-ui-all@0.2.5` and `@linxin666/dsh-client-ui-skin-center@0.2.5`, including its 15 bundled skin directories. Three independent Apache-2.0 packages are now pinned to 0.3.20:

- `@linxin666/dsh-client-ui-model-capabilities`
- `@linxin666/dsh-usage`
- `@linxin666/dsh-session-archive`

The parallel package upgrade audit confirmed that skin-center 0.3.20 ships only Blue Fantasy and restricts bundled asset discovery through its manifest. Retaining 0.2.5 with the Desktop patches avoids losing 14 existing offline skins; a separate asset distribution mechanism is not introduced in this batch.

Each is a protected Desktop builtin mounted through the existing profile bundle mechanism. No official DSH source checkout was edited. The existing aggregate, AionUI integration, plugin manager, updater and repair services keep their ownership.

## Desktop entry points

| Dock entry | Rendering and behavior |
| --- | --- |
| 模型与能力 | Official `models` settings section, including provider-card capability editors; image input and reasoning declarations use the official settings service. |
| 用量与余额 | `dsh-usage` section with usage statistics and provider balance controls. |
| 会话管理 | `dsh-session-archive` section with search, archive and restore controls. Automatic archive and deletion remain disabled by default. |
| 皮肤与壁纸 | Existing `skin-center` section, all 15 bundled skins, live previews and wallpaper settings. |

All four sections render in the existing unprivileged Dock WebContentsView. They reuse the official settings slots, remain mounted after navigation to preserve drafts, and expose no Desktop preload or extension-management IPC. Model capability drafts participate in Save and close even when their panel is collapsed; the community package patch adds the shared draft/save markers.

The skin-center package patch broadcasts only successfully persisted selections across same-origin documents. Try-on previews remain local. Receiving documents apply the committed selection without rewriting it or reloading the main page. This preserves the live conversation document.

The Desktop client resolves the active skin's background, text, accent and border colors, blending translucent tokens into opaque native colors. Only these four validated colors cross the existing title-bar IPC boundary. Main title-bar controls and auxiliary windows, including the Dock sidebar, follow the palette. Returning to the official appearance removes the overrides. Terminal palettes and native operating-system dialogs continue to use their existing theme mechanisms.

## Verification

`apps/dsh-desktop/scripts/verify-native-plugin-pages.mjs` launches an isolated Electron instance with synthetic credentials and verifies:

- All four pages have live controls, fit the viewport and have no Desktop IPC bridge.
- A model image-input declaration persists through the official settings API; Save and close persists a collapsed draft.
- All 15 expected skin IDs are present.
- Try-on remains local, applying a skin synchronizes the main page and Dock, and restoring the default clears the palette without navigation.
- No renderer exceptions occur during these interactions.

The fixture is included in the core Desktop regression gate. Unit coverage also checks color validation, native-title-bar palette retention/reset and fixed-property palette serialization. Feature-baseline and runtime-identity checks cover the new builtins.

Final validation on the frozen shared working tree: all 18 source core suites passed in 636.1 seconds, exit code 0, with no skipped suites or known-issue exemptions. The final startup/repair integration suite passed all 163 tests. The dedicated client suite passed 7 tests, TypeScript checking passed, and startup/full palette IPC passed its focused tests. The feature baseline verified 19 workspace plugins, 11 builtins, 29 desktop surfaces and 15 skins. The full run is recorded in `.artifacts/native-webui-adaptation-2026-09-12/core-regression.log` and `core-regression.exit`.

The aggregate has not been replaced by the newer renamed `dsh-web-all` bundle. Full aggregate migration, OS desktop wallpaper control and production provider billing verification are outside this first batch. These changes have not been packaged or published by this task.
