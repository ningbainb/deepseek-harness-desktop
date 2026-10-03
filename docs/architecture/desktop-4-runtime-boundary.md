# Desktop 4 Runtime Boundary

## Product boundary

DeepSeek Harness Desktop 4 uses the official public `@deepseek-ai/*` npm packages as its Runtime and client implementation. The Desktop shell owns process supervision, local transport, migration, plugin transactions, update coordination, recovery, and operating-system capabilities. Runtime business services do not receive authority to install packages, migrate credentials, replace an application, or repair the managed profile.

The default local topology has no TCP listener. Electron Main starts the official Host in a child process and connects through an authenticated operating-system pipe. The renderer uses the `dsh-runtime://app/` scheme and bounded Electron IPC; it never receives the pipe token. Remote Gateway remains a separate, explicit opt-in network surface with pairing and device-scoped authorization.

Desktop can optionally create a local LAN gateway without changing the official Runtime listener. The user must approve a native warning before first enable. Electron Main binds one currently active private IPv4 address and a high port, never `0.0.0.0`, then forwards only `/m`, its bundle, pair accept/heartbeat, and paired `/m/api` traffic through `RuntimeProvider.fetch()` into the authenticated pipe. Full `/api`, local pairing administration, filesystem, Desktop IPC, and foreign-Origin requests are rejected. The selected address and enabled state persist locally; disabling or quitting closes active sockets and the listener.

## RuntimeProvider v2

`DshRuntimeProvider` is the lifecycle and transport boundary. Its public operations cover probe, start, stop, recover, Fetch-compatible requests, observation streams, duplex streams, cancellation, and support evidence. `ActiveRuntimeProvider` fences operations by provider generation so a late response from a stopped or replaced Runtime cannot mutate the current UI.

The local pipe protocol authenticates both the random token and generation before accepting an operation. It bounds control frames, request bodies, response bodies, and renderer IPC items. Abort propagation closes abandoned fetch, stream, and duplex work. Application shutdown first quiesces renderer streams and destroys renderer windows, then drains and stops the Runtime.

## Route migration

The authoritative route inventory is [transport-inventory.json](./transport-inventory.json). Official Connection, client module, and Typert services are carrier-neutral. Existing community `WebRoute` and `WebUpgradeRoute` registrations run through `@linxin666/dsh-desktop-pipe-webserver`, a no-listener compatibility adapter. The adapter accepts only registered exact or prefix routes and one registered duplex upgrade surface; it does not bind HTTP or emulate an externally reachable server.

The adapter is temporary. Each inventory record states its current adapter scope and exit condition. It can be removed only after every built-in registration has a carrier-neutral service replacement and the same behavior tests continue to pass.

## Home and migration

Before SDK boot, Desktop composes legacy model and provider settings into the selected profile through a journaled transaction. Existing profile overrides take precedence. Both the live `settings.yaml` compatibility view and an existing `.imported` archive are retained; unknown sections remain available for deferred recovery. Commit requires settled Loader entries, an active root Include, the Desktop-owned SettingsForms adapter, and matching active configuration. Failed startup disposes the Runtime before restoring the original settings and patch bytes. Live patch reload retains the adapter so the SDK cannot perform an unjournaled second import.

Unknown, disabled and non-migratable sections are deferred regardless of their YAML value type; their original bytes, including scalar preferences, arrays, booleans, nulls, comments and credentials, remain in the selected Home. Registered migratable sections require objects and reject malformed values before any configuration mutation. Deferred section names are recorded in the migration receipt without guessing a replacement SDK namespace.

The community-owned default Home is `~/.dsh-community`. A user-specified Home remains explicit and is not silently rewritten. The migration implementation treats the source as read-only, records a phase journal, obtains a quiescent inventory, copies persistent data to staging, rebuilds executable dependencies, validates the destination, and activates it only after validation. The source Home is retained.

The authoritative ownership rules are [data-ownership.json](./data-ownership.json). Identifiers for sessions, workspaces, memories, prompts, task ledgers, and other owned records are preserved. Credentials are represented by protected operating-system references or require reauthorization; plaintext fallback is not permitted. Migrated schedules are disabled and their old lease is removed until an explicit takeover is recorded.

Application rollback, plugin-environment rollback, data-format rollback, and restoration of project or external side effects are distinct operations. Retaining the old Home does not imply that data created by 4.0 can be read by an older application, and application rollback does not undo files changed by an Agent.

## Native and packaging contract

The Runtime launcher and its complete local source graph execute from the physical `app.asar.unpacked` directory. Packaging checks both ASAR SHA-256 integrity and the canonical SDK module objects used by launcher, profile, HMR, config-editor, and plugin-manager; a split app-boot identity is rejected because profile reload relies on its root Include registration. Typed streams use the SDK endpoint, payload, uplink, operator peer, and abort-signal arguments. Uplink EOF does not close the response stream.

The Windows x64 native dependency contract is [native-dependency-inventory.json](./native-dependency-inventory.json). Production packaging verifies the actual unpacked dependency graph, native modules, bundled Git identity, exact Runtime graph, ASAR contents, updater metadata, checksums, and executable signature state.

Desktop 4.4.1 targets the official 0.2.0-rc.2 Runtime family. An unsigned local installer is a test artifact and must be labeled unsigned; it is not evidence of publisher identity. Stable promotion remains blocked until the distribution package has a trusted signing and update-authenticity path and every Stable release gate has been rerun against that exact artifact.

## Acceptance evidence

The rc.2 import inventory records exact public SDK imports for the journaled SettingsForms adapter, isolated legacy-session verification, SDK-identity fixtures, and the community settings form. Existing import allowances remain unchanged; no additional source directory or upstream checkout is permitted. Chat recovery source and declarations are checked against installed official npm types by `apps/dsh-desktop/scripts/verify-chat-recovery-sdk.mjs`; behavioral tests also verify retained-reference release and same-id generation observer cleanup. These checks do not replace real-window or installer acceptance.

The release sequence is build once, write and verify the release manifest, test the same unpacked application and installer, and retain a machine-readable regression receipt. `run-regression-e2e.mjs --full --evidence=<path>` records the source commit, mode, executable, per-suite result, accepted issues, and the installer name, size, SHA-256, and signature state from the verified release manifest. A failed suite also writes a failed receipt before returning a non-zero exit code.

Tests may not be carried forward from another commit or another installer. Any source change after packaging invalidates the source-to-artifact claim and requires a new package and complete artifact acceptance run.
