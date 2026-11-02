# Electron 44 shutdown compatibility followup

Desktop 5.2.0 selects official Electron 44.7.0 for both the Desktop host and
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

The initial 44.1.0 candidate was rejected by the official rc.4 native loader:
module ABI 149 alone is insufficient. Its exact Node/V8 fingerprint is not
in node-addon-require-builtin 0.1.9's supported table. No SDK fingerprint
check is bypassed, patched, or disabled.

Official [Electron 44.7.0](https://github.com/electron/electron/releases/tag/v44.7.0)
is explicitly listed by that loader and embeds Node 24.21.0, V8
15.2.124.28-electron.0, ABI 149. Its
[Node source](https://github.com/nodejs/node/blob/v24.21.0/src/node_platform.cc#L115)
contains the scheduler shutdown guard, and its tag descends from #53201.
The [NPM wrapper](https://registry.npmjs.org/electron/44.7.0) integrity and
official Windows archive checksum were independently checked before running
the actual Electron binary. The unmodified rc.4 Host then became ready,
served settings and acknowledged graceful shutdown with exit code zero.
This prerequisite checks the real Electron SDK host, not ordinary Node.
It does not substitute for complete native Desktop and package acceptance.

Historical 5.1.0 release records continue to describe their original
Electron 44.0.0 artifacts.

This removes a known upstream scheduler shutdown race. It does not establish
that this race caused the previous candidate's IOCP invalid-handle crash:
that requires an exception-thread stack tying PostDelayedTask and
uv_async_send to the closed scheduler loop. The Desktop-owned write and
window-finalization barriers remain necessary independent fixes.

Acceptance requires a new source commit and complete native Windows,
macOS and Linux preflight, including real Windows Setup upgrades, packaged
regression and downloaded-asset verification. Local debugger-attached
restarts do not substitute for those gates. No publication is implied.
