# Desktop brand icon

`apps/dsh-desktop/build/icon-source-v2.png` is the single source of truth for the Desktop application icon.
The generator removes the selected source artwork's transparent outer fringe before rendering platform assets.

Run `pnpm --filter @linxin666/dsh-desktop brand:icons:write` after replacing the source. The generator updates:

- Windows executable, installer, shortcut, taskbar, window, and tray assets through `build/icon.ico` and `build/icon.png`.
- macOS application and DMG assets through `build/icon.icns`.
- Linux application and desktop-entry assets through `build/icon.png`.
- The in-app Extension Dock brand mark, README artwork, website favicon, and documentation previews.

Run `pnpm --filter @linxin666/dsh-desktop brand:icons:check` before committing. Native macOS and Linux packaging remains CI-only; local verification covers the generated containers and Windows surfaces.
