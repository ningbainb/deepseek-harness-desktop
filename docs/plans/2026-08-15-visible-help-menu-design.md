# Visible Help Menu Design

## Goal

Make the existing community and feedback actions discoverable without relying on Windows' hidden native menu bar.

## Decision

The main window's custom title bar will always show one compact `帮助 / Help` button. Clicking it opens a renderer-owned dropdown containing `加入社群`, `提建议`, `GitHub 项目`, and `检查更新`. The existing native Help menu remains available as a keyboard fallback.

Only the main window receives the visible Help button. Extension and community child windows keep the same compact title bar without duplicating the menu. Every action crosses the context-isolated preload bridge as a fixed allowlisted command; the renderer cannot provide a URL or arbitrary operation. The main process continues to own the QR window, external-browser navigation, and updater.

The dropdown closes after an action, on outside click, and on Escape. Its controls opt out of the draggable title-bar region, remain keyboard accessible, and stay to the left of the native Windows caption buttons.

## Verification

Unit tests cover the fixed IPC action allowlist and generated title-bar markup. The Electron window-chrome E2E opens the dropdown from the running Web UI and verifies that `加入社群` creates the existing QR child window. A screenshot check confirms the button and dropdown fit the normal window size without obscuring native caption controls.
