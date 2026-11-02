# Electron 44 shutdown compatibility followup

Desktop 5.2.0 selects official Electron 44.1.0 for both the Desktop host and
the retained builtin-browser dependency override. Official DSH NPM Runtime/SDK
stays at 0.2.1-rc.4; no upstream source or SDK is modified.

Electron [#53201](https://github.com/electron/electron/pull/53201), merged into
44-x-y at 2026-08-26 21:04:30 UTC, backports
[Node #61999](https://github.com/nodejs/node/pull/61999). The
[44.1.0 release](https://github.com/electron/electron/releases/tag/v44.1.0)
explicitly lists this fix. Its
[Node patch](https://github.com/electron/electron/blob/v44.1.0/patches/node/src_fix_libuv_assertion_on_windows.patch)
guards DelayedTaskScheduler::PostDelayedTask after shutdown under the task
queue lock. The [DEPS](https://github.com/electron/electron/blob/v44.1.0/DEPS)
pins Node 24.19.0. The previous official Electron 44.0.0 lacks that guard.

The official [NPM version](https://registry.npmjs.org/electron/44.1.0) and
tarball were available at review time, with package identity and registry
integrity independently checked. Historical 5.1.0 release records continue
to describe their original Electron 44.0.0 artifacts.

This removes a known upstream scheduler shutdown race. It does not establish
that this race caused the previous candidate's IOCP invalid-handle crash:
that requires an exception-thread stack tying PostDelayedTask and
uv_async_send to the closed scheduler loop. The Desktop-owned write and
window-finalization barriers remain necessary independent fixes.

Acceptance requires a new source commit and complete native Windows,
macOS and Linux preflight, including real Windows Setup upgrades, packaged
regression and downloaded-asset verification. Local debugger-attached
restarts do not substitute for those gates. No publication is implied.
