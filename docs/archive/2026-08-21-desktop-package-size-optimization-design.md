# Desktop package size optimization design

## Objective

Reduce the Windows x64 installation and unpacked-directory sizes without removing DSH rc.8 capabilities, built-in plugins, bundled Git, Free Mode, migration recovery, offline startup, or user-owned plugin data.

## Chosen boundary

The Windows artifact retains only Electron locales used by the product (`en-US`, `zh-CN`, and `zh-TW`) and only optional native packages whose published `os` and `cpu` constraints admit `win32/x64`. Pure JavaScript packages and packages without platform constraints remain untouched. The NSIS build uses maximum compression. Package demo files are omitted because no runtime entry imports them.

The package pruner reads manifests instead of maintaining a hand-written dependency-name denylist. This keeps the rule effective when rc.8 dependencies add or rename platform-specific optional packages. Negative npm constraints such as `!win32` are honored.

## Preserved functionality

The optimization does not remove Skin Center previews, pet assets, Mermaid, terminal support, image processing, ripgrep, pnpm, MiniGit, Runtime packages, compatibility patches, or user plugin archives. Windows x64 implementations of Sharp, Lightning CSS, ripgrep, Koffi, Node PTY, and other native dependencies remain available. Skin Center card previews are bounded to 1440x900 during packaging while skin stylesheets, scripts, backgrounds, and other live assets remain byte-identical.

## Verification

Unit tests cover portable, supported, foreign operating-system, foreign architecture, negative platform constraints, demo removal, and preview bounding. Package verification rejects any top-level dependency that declares itself incompatible with Windows x64, rejects unexpected Electron locales or oversized previews, and requires the demo tree to be absent. Final acceptance compares directory and installer bytes against the pre-optimization baseline, verifies all packaged Runtime packages and bundled Git, launches the packaged application, and runs the automatic migration matrix.
