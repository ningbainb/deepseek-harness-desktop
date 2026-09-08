# G07 plugin child-process proxy route evidence

Date: 2026-09-08.

## Question

The earlier controlled Electron checks established proxy routing for
Desktop-owned update and market Sessions, but an environment projection alone
did not prove that the real pnpm child used it. This check selects the already
audited public plugin `dsh-paperclip@0.2.5` and records its registry traffic
through a controlled proxy.

This is package-manager routing evidence only. It does not enable the plugin,
mount it in a Desktop profile, or change the inspect-only compatibility
disposition documented for that exact plugin version.

## Method

`apps/dsh-desktop/scripts/verify-plugin-proxy-routing.mjs`:

1. Creates a one-use project and empty pnpm store beneath a temporary
   directory.
2. Starts an HTTP CONNECT proxy on `127.0.0.1`. The proxy allows only
   `registry.npmjs.org:443`; every other authority is denied.
3. Projects a fixed Desktop market proxy through
   `runtimeProxyEnvironmentFor`.
4. Invokes the production `resolvePnpmCliPath` and `runPnpm` child runner with
   its normal hidden-window and bounded-output behavior.
5. Installs exact `dsh-paperclip@0.2.5` with lifecycle scripts disabled and no
   persistent lockfile, then verifies the installed package name, version, and
   DSH bundle declaration.
6. Requires at least one proxy CONNECT record, rejects any unexpected
   authority or direct HTTP request, and removes the entire temporary project
   and store.

## Result

The check passed. The controlled proxy recorded 50 CONNECT requests and every
one targeted `registry.npmjs.org:443`. The package was therefore fetched by the
actual Desktop pnpm child runner under the market-scope proxy environment, not
by the Electron Session fixture and not from the repository's normal store.

The reusable command is `pnpm --dir apps/dsh-desktop
test:plugin-proxy:e2e`. It intentionally remains an explicit network
acceptance check rather than a default offline/core regression suite.

## Remaining boundary

A model Provider is a separate transport owned by the DSH Runtime and its
provider implementation. No provider credential is available in this test
environment, so this record does not claim provider traffic was routed.
Per-session network denial also still requires enforceable official tool and
sandbox capabilities; conventional proxy environment variables are
cooperative configuration, not a network sandbox.
