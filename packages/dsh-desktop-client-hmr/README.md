# Desktop Client HMR

English | [中文](README.zh.md)

Private Desktop adapter `@linxin666/dsh-desktop-client-hmr` 0.1.0. Desktop profile composition replaces the existing `client-hmr` row when this bundle is explicitly selected, without modifying official SDK files or adding a second graph owner. The SDK dependencies are the public NPM 0.2.1-rc.2 packages, Cordis 4.0.5 and Schemastery 3.18.5.

## Install

Mount this bundle after `@deepseek-ai/dsh-web-app` with the Desktop profile-composition adapter. Keep the original SDK package dependencies. Its YAML is intentionally empty:

```yaml
[]
```

SDK patch names are guards, not rename operations. Profile selection must explicitly enable the Desktop mapper, which remaps the existing `client-hmr` insert and matching legacy name guards in an in-memory patch copy. It preserves the row id, configuration namespace, saved values and disabled state without rewriting official SDK or user patch files. The empty YAML alone does not replace an official owner outside that Desktop composition.

The integrating launcher must install the public `loader/patch-context` hook before mounting its own Root Include. Only that Include's patches are replaced; its other config fields remain intact. The caller supplies transaction patches until migration commits, then reads the current bundle, profile, home and overlay layers for every recomposition. The hook therefore also covers the official HMR initial refresh and settings-triggered reloads, rather than only a launcher-specific live branch. In the pinned rc.2 SDK, ConfigEditor writes a candidate before reconciling it and restores the previous file before rollback reconciliation. The hook requires synchronous composition and preparation; failures stop continuation rather than applying an unadapted owner.

## Config

The public `Config.pollIntervalMs` schema remains an integer of at least 1 with default 500. The official SDK settings form exposes this live-editable field, and the Loader applies updates through its normal plugin lifecycle. A scan's completion precedes the next polling delay. This is not a fixed-rate interval, and no overlapping scan batches are started.

## What it does

- At most four asynchronous `fs.promises.stat` operations run concurrently. There is no synchronous filesystem scan in this adapter.
- Each watch starts from the official `artifactBaseline`, comparing `mtimeMs`, `ctimeMs` and `size`, so a write between SDK activation and watch setup remains observable.
- Missing files stay dirty until they return. Other observation or publication failures are retried on later scans; diagnostics do not include file paths or exception details.
- Each graph refresh installs a new watch generation. Removed, replaced and re-added rows reject results from older generations. Unchanged rows retain their dirty status.
- Changed bundles publish through the public `rebuilt` method, with an event-loop yield between individual publications. The official registry still owns revisions, graph composition and bundle bytes.
- Disposal cancels the next timer and invalidates all pending work immediately. It never waits for an uncancellable filesystem operation, and late results cannot publish or schedule another batch.

## Known limitations

The SDK's public `rebuilt()` still performs its own synchronous metadata read, bundle read and graph composition when an actual revision changes. This adapter removes the repeated synchronous full scan, not every possible synchronous operation inside the SDK. Filesystem completion time and changed-bundle publication cost remain external limits.

Root Include interception does not change ConfigEditor's raw candidate validation. Integrators must also preserve the original package-name guard for configuration write-back; reload-owner checks alone do not establish that settings saves succeed.

## Event Transport

The sole route is `/plugins/events`. Authenticated GET receives an initial graph, graph changes and rebuilt notices. Authenticated HEAD returns the same event-stream content type and ends without subscribing. Other methods receive 405 with `Allow: GET, HEAD`.

- The Host subscribes only to public `onGraphChanged` and `onRebuilt` notifications and reads the public graph. It creates no Peer, edits no module table and installs no replacement module manager.
- Each connection respects `write()` backpressure. The already-accepted frame is not duplicated; subsequent frames queue until `drain`. A queue exceeding 1 MiB closes only that slow connection. Write failures and connection errors also close only that connection. Unloading unregisters the route, removes subscriptions and destroys all remaining streams.
- The browser uses document-relative `plugins/events` through `__DSH_TRANSPORT__.fetch` when present, otherwise browser fetch. It sends same-origin credentials and a lifetime AbortSignal, so `dsh-runtime://app` does not depend on native EventSource support.
- Closed, refused or interrupted fetch streams reconnect after 1000 ms. Disposal aborts the stream, cancels reconnect and prevents late dispatch. The bounded SSE decoder supports chunk boundaries, LF, CRLF, CR, comments and multiline data. Frames are limited to 1,048,576 UTF-16 code units.
- Unknown string frame types are ignored; malformed JSON and malformed known envelopes are rejected without logging raw content. Graph validation and all synchronization, reload serialization and release checks stay in the official `ctx.modules.entries.sync` and `reload` controller.

## Security Model

Every accepted GET or HEAD first calls the real injected Connection's public `requestRejection` with the original request. All rejection statuses are preserved. An authentication exception returns 503 without exposing details. No synthetic Peer, payload credential, Host override or authentication bypass is used. Existing admitted streams remain subscribed until disconnect or unload, matching the request-admission model; the adapter does not invent a separate revocation protocol.

The browser stream carries the same-origin credential through the existing shell carrier. Authentication and cookie exchange remain the responsibility of that carrier and official Connection. This package does not implement them.

## Development and Verification

```sh
pnpm test
pnpm typecheck
pnpm build
```

Tests cover bounded concurrency, non-overlap, baseline races, dirty recovery, graph generations, late disposal, public schema boundaries, request rejection, SSE backpressure, bounded queues, cleanup, browser reconnection and strict frame admission. The host and browser TypeScript programs are separate; the browser has only type-only SDK imports. Builds use the repository's single `shared/tsdown.client.ts` preset.

Unit checks do not establish real HTTP stop latency, Electron behavior or cross-platform acceptance. Workspace dependency installation, profile integration and real-runtime verification remain the integrating caller's responsibility.

## License

Apache-2.0, following the repository license. This is a private workspace package and is not published by this change.
