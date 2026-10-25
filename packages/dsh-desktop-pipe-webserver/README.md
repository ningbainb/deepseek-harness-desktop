# Desktop pipe WebRoute adapter

English | [中文](README.zh.md)

This private package preserves the reviewed `WebRoute` registration subset for
the Desktop local carrier without opening a TCP listener. It is not a Web
deployment server and is never selected for Remote Gateway mode.

Supported and tested APIs are exact and longest-prefix route registration,
fallback registration, index injections and taps, streaming response bodies,
request cancellation, and upgrade-route lookup. `host` is fixed to loopback
and `port` is the sentinel `0`; no network socket is created.

The official `webApp.getAdvertisedUrl()` context contract reports the actual Desktop surface, `dsh-runtime://app/`. It does not advertise a nonexistent HTTP listener or enable browser handoff.

## Security model

Private WebSocket upgrades receive the same official browser-session cookie as HTTP routes, acquired through Connection's authenticated index exchange inside the Host. Renderer payload credentials are ignored. Upgrade handlers retain their own Connection authentication checks; the adapter does not manufacture a Peer or disable the request fence.

HTTP streaming responses use Node Writable backpressure with a 64 KiB high-water mark. Producers receive `false` when the response queue fills and `drain` only after downstream consumption, so the client HMR connection's bounded queue also applies to the real private-pipe carrier. Response cancellation closes pending writes without waiting for an absent consumer.

The adapter is temporary. It can be removed after every built-in JSON, asset,
SSE, and duplex route in `docs/architecture/transport-inventory.json` has a
carrier-neutral owner and the corresponding behavior contract passes without
the `webServer` service.
