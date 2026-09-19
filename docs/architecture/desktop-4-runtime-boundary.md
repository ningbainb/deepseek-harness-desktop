# Desktop 4 Runtime Boundary

## Product boundary

DeepSeek Harness Desktop 4 uses the official public `@deepseek-ai/*` npm packages as its Runtime and client implementation. The Desktop shell owns process supervision, local transport, migration, plugin transactions, update coordination, recovery, and operating-system capabilities. Runtime business services do not receive authority to install packages, migrate credentials, replace an application, or repair the managed profile.

Desktop 4.2.1 Stable pins DSH `0.1.6-alpha.2` and the reviewed `dsh-web` alpha 0.3.23 source cohort. Official Session and `uiWorkspace` services continue to own session creation, selection and Workspace navigation. Desktop keeps only its native transport, lifecycle, migration and capability gates. The remote Web plugin rewrites calls made from the non-loopback `dsh-runtime://app` origin; the authenticated private pipe maps only its known `/remote/{api,sidebar,git,pet}` mirrors back to local routes. The public LAN gateway does not inherit that mapping.

Task Board, Git Graph and Pet remain explicit Desktop client/Host exceptions because their Worktree, Evidence or saved-state contracts do not match the current upstream client implementations. The 4.2 profile disables those three upstream aggregate rows and mounts the existing complete Desktop pairs under their original IDs. This keeps the current user-facing behavior and disable overrides while leaving the other reviewed upstream components on the pinned cohort. The exact exceptions and exit criteria are listed in [the sync ledger](../upstream-web-sync.md).

The default local topology has no TCP listener. Electron Main starts the official Host in a child process and connects through an authenticated operating-system pipe. The renderer uses the `dsh-runtime://app/` scheme and bounded Electron IPC; it never receives the pipe token. Remote Gateway remains a separate, explicit opt-in network surface with pairing and device-scoped authorization.

Desktop can optionally create a local LAN gateway without changing the official Runtime listener. The user must approve a native warning before first enable. Electron Main binds one currently active private IPv4 address and a high port, never `0.0.0.0`, then forwards only `/m`, its bundle, pair accept/heartbeat, and paired `/m/api` traffic through `RuntimeProvider.fetch()` into the authenticated pipe. Full `/api`, local pairing administration, filesystem, Desktop IPC, and foreign-Origin requests are rejected. The selected address and enabled state persist locally; disabling or quitting closes active sockets and the listener.

## RuntimeProvider v2

`DshRuntimeProvider` is the lifecycle and transport boundary. Its public operations cover probe, start, stop, recover, Fetch-compatible requests, observation streams, duplex streams, cancellation, and support evidence. `ActiveRuntimeProvider` fences operations by provider generation so a late response from a stopped or replaced Runtime cannot mutate the current UI.

The local pipe protocol authenticates both the random token and generation before accepting an operation. It bounds control frames, request bodies, response bodies, and renderer IPC items. Abort propagation closes abandoned fetch, stream, and duplex work. Application shutdown first quiesces renderer streams and destroys renderer windows, then drains and stops the Runtime.

## Route migration

The authoritative route inventory is [transport-inventory.json](./transport-inventory.json). Official Connection, client module, and Typert services are carrier-neutral. Existing community `WebRoute` and `WebUpgradeRoute` registrations run through `@linxin666/dsh-desktop-pipe-webserver`, a no-listener compatibility adapter. The adapter accepts only registered exact or prefix routes and one registered duplex upgrade surface; it does not bind HTTP or emulate an externally reachable server.

The adapter is temporary. Each inventory record states its current adapter scope and exit condition. It can be removed only after every built-in registration has a carrier-neutral service replacement and the same behavior tests continue to pass.

## Home and migration

The community-owned default Home is `~/.dsh-community`. A user-specified Home remains explicit and is not silently rewritten. The migration implementation treats the source as read-only, records a phase journal, obtains a quiescent inventory, copies persistent data to staging, rebuilds executable dependencies, validates the destination, and activates it only after validation. The source Home is retained.

The authoritative ownership rules are [data-ownership.json](./data-ownership.json). Identifiers for sessions, workspaces, memories, prompts, task ledgers, and other owned records are preserved. Credentials are represented by protected operating-system references or require reauthorization; plaintext fallback is not permitted. Migrated schedules are disabled and their old lease is removed until an explicit takeover is recorded.

Application rollback, plugin-environment rollback, data-format rollback, and restoration of project or external side effects are distinct operations. Retaining the old Home does not imply that data created by 4.0 can be read by an older application, and application rollback does not undo files changed by an Agent.

## Native and packaging contract

The Windows x64 native dependency contract is [native-dependency-inventory.json](./native-dependency-inventory.json). Production packaging verifies the actual unpacked dependency graph, native modules, bundled Git identity, exact Runtime graph, ASAR contents, updater metadata, checksums, and executable signature state.

The historical 4.0.0-rc.2 candidate used the official 0.1.5-rc.2 family. For 4.2.x, an unsigned local installer remains a test artifact until the exact package passes the release gates; it must be labeled unsigned and is not evidence of publisher identity. The maintainer has explicitly chosen unsigned distribution, so signing is reported as a limitation rather than silently treated as a passing authenticity check.

## Acceptance evidence

The release sequence is build once, write and verify the release manifest, test the same unpacked application and installer, and retain a machine-readable regression receipt. `run-regression-e2e.mjs --full --evidence=<path>` records the source commit, mode, executable, per-suite result, accepted issues, and the installer name, size, SHA-256, and signature state from the verified release manifest. A failed suite also writes a failed receipt before returning a non-zero exit code.

Tests may not be carried forward from another commit or another installer. Any source change after packaging invalidates the source-to-artifact claim and requires a new package and complete artifact acceptance run.
