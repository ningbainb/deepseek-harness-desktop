# Desktop Client HMR boundaries

- Keep the existing `client-hmr` Loader row and public configuration namespace. The bundle patch replaces its package name only.
- Use public NPM SDK services. Never mutate registry internals, synthesize Peers, or patch official SDK files.
- Scan metadata asynchronously with concurrency four, one batch at a time. Every graph refresh invalidates outstanding watch generations.
- Disposal must invalidate publications and cancel scheduling synchronously; it must not await pending filesystem work.
- Authenticate the original event-stream request with the real Connection service. Keep connection queues bounded and isolate slow or failed clients.
- Browser code uses only the public module controller and the existing shell fetch carrier. SDK imports in browser code must remain type-only.
- Keep both README languages and their pairing hashes synchronized. Unit evidence is not real-runtime or Electron acceptance.
