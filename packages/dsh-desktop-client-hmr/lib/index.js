import { stat } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import z from "@deepseek-ai/schemastery";
//#region src/core/scanner.ts
function sameMetadata(first, second) {
	return first.mtimeMs === second.mtimeMs && first.ctimeMs === second.ctimeMs && first.size === second.size;
}
function missing(error) {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function createBundleWatcher(options) {
	const watched = /* @__PURE__ */ new Map();
	let disposed = false;
	let cancelNext;
	const report = (error) => {
		if (disposed) return;
		try {
			options.report(error);
		} catch {}
	};
	const current = (id, watch) => !disposed && watched.get(id) === watch;
	const refresh = () => {
		if (disposed) return;
		const rows = new Map(options.snapshot());
		for (const id of watched.keys()) if (!rows.has(id)) watched.delete(id);
		for (const [id, baseline] of rows) {
			const previous = watched.get(id);
			const unchanged = previous?.baseline.path === baseline.path && sameMetadata(previous.baseline, baseline);
			watched.set(id, {
				baseline: { ...baseline },
				dirty: unchanged ? previous.dirty : false
			});
		}
	};
	const batch = async () => {
		const rows = [...watched];
		const changed = /* @__PURE__ */ new Map();
		let publicationAdvanced = false;
		let nextIndex = 0;
		const worker = async () => {
			while (!disposed && nextIndex < rows.length) {
				const [id, watch] = rows[nextIndex++];
				if (!current(id, watch)) continue;
				try {
					const metadata = await options.stat(watch.baseline.path);
					if (current(id, watch) && (watch.dirty || !sameMetadata(metadata, watch.baseline))) changed.set(id, watch);
				} catch (error) {
					if (!current(id, watch)) continue;
					watch.dirty = true;
					if (!missing(error)) report(error);
				}
			}
		};
		await Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker));
		for (const [id, watch] of changed) {
			if (!current(id, watch)) continue;
			await options.yieldControl();
			if (!current(id, watch)) continue;
			try {
				const baseline = options.publish(id);
				if (!current(id, watch)) {
					const refreshed = watched.get(id)?.baseline;
					publicationAdvanced ||= baseline !== void 0 && refreshed !== void 0 && baseline.path === watch.baseline.path && baseline.path === refreshed.path && sameMetadata(baseline, refreshed) && !sameMetadata(baseline, watch.baseline);
					continue;
				}
				if (baseline !== void 0 && baseline.path === watch.baseline.path) {
					watch.baseline = { ...baseline };
					watch.dirty = false;
				} else watch.dirty = true;
			} catch (error) {
				if (!current(id, watch)) continue;
				watch.dirty = true;
				if (!missing(error)) report(error);
			}
		}
		return publicationAdvanced && [...changed].some(([id, watch]) => {
			const refreshed = watched.get(id);
			return refreshed !== void 0 && refreshed !== watch && refreshed.baseline.path === watch.baseline.path && sameMetadata(refreshed.baseline, watch.baseline);
		});
	};
	const run = async () => {
		let rescan = false;
		try {
			rescan = await batch();
		} catch (error) {
			report(error);
		}
		if (!disposed) cancelNext = options.schedule(() => {
			cancelNext = void 0;
			run();
		}, rescan ? 0 : options.pollIntervalMs);
	};
	refresh();
	run();
	return {
		refresh,
		dispose() {
			if (disposed) return;
			disposed = true;
			cancelNext?.();
			watched.clear();
		}
	};
}
//#endregion
//#region src/index.ts
const name = "desktop-client-hmr";
const inject = [
	"clientModules",
	"webServer",
	"connection"
];
const Config = z.object({ pollIntervalMs: z.number().step(1).min(1).default(500).volatile() });
const EVENTS_ENDPOINT = "/plugins/events";
function eventChannel(registry, connection, webServer) {
	const connections = /* @__PURE__ */ new Set();
	const closers = /* @__PURE__ */ new Set();
	let disposed = false;
	const frame = (value) => `data: ${JSON.stringify(value)}\n\n`;
	const broadcast = (line) => {
		if (disposed) return;
		for (const send of connections) send(line);
	};
	const connect = (response) => {
		let closed = false;
		let blocked = false;
		let queuedBytes = 0;
		const queue = [];
		const close = () => {
			if (closed) return;
			closed = true;
			connections.delete(send);
			closers.delete(close);
			response.off("drain", drain);
			response.off("error", close);
			response.off("close", close);
			queue.length = 0;
			if (!response.destroyed) response.destroy();
		};
		const write = (line) => {
			try {
				blocked = !response.write(line);
			} catch {
				close();
			}
		};
		const send = (line) => {
			if (closed || disposed) return;
			if (!blocked) {
				write(line);
				return;
			}
			queuedBytes += Buffer.byteLength(line);
			if (queuedBytes > 1048576) {
				close();
				return;
			}
			queue.push(line);
		};
		const drain = () => {
			blocked = false;
			while (!closed && !disposed && !blocked && queue.length > 0) {
				const line = queue.shift();
				queuedBytes -= Buffer.byteLength(line);
				write(line);
			}
		};
		response.on("drain", drain);
		response.on("error", close);
		response.on("close", close);
		connections.add(send);
		closers.add(close);
		try {
			response.writeHead(200, {
				"content-type": "text/event-stream",
				"cache-control": "no-cache",
				connection: "keep-alive"
			});
			send(": connected\n\n");
			send(frame({
				type: "graph",
				graph: registry.graph()
			}));
		} catch {
			close();
		}
	};
	const unregister = webServer.register({
		kind: "exact",
		path: EVENTS_ENDPOINT,
		handler(request, response) {
			if (disposed) {
				response.writeHead(503);
				response.end();
				return;
			}
			if (request.method !== "GET" && request.method !== "HEAD") {
				response.writeHead(405, { allow: "GET, HEAD" });
				response.end();
				return;
			}
			let rejection;
			try {
				rejection = connection.requestRejection(request);
			} catch {
				rejection = 503;
			}
			if (rejection !== void 0) {
				response.writeHead(rejection);
				response.end();
				return;
			}
			if (request.method === "HEAD") {
				response.writeHead(200, {
					"content-type": "text/event-stream",
					"cache-control": "no-cache"
				});
				response.end();
				return;
			}
			connect(response);
		}
	});
	const unsubscribeGraph = registry.onGraphChanged(() => {
		if (!disposed) broadcast(frame({
			type: "graph",
			graph: registry.graph()
		}));
	});
	const unsubscribeRebuilt = registry.onRebuilt((id, rev) => broadcast(frame({
		type: "rebuilt",
		id,
		rev
	})));
	return () => {
		if (disposed) return;
		disposed = true;
		unsubscribeGraph();
		unsubscribeRebuilt();
		unregister();
		for (const close of closers) close();
	};
}
function apply(ctx, config = {}) {
	const interval = config.pollIntervalMs;
	const readInterval = () => typeof interval === "object" ? interval.get() : interval;
	const fallbackInterval = Config({ pollIntervalMs: readInterval() }).pollIntervalMs.get();
	const registry = ctx.get("clientModules");
	const connection = ctx.get("connection");
	const webServer = ctx.get("webServer");
	if (!registry || !connection || !webServer) throw new Error("Desktop client HMR requires the official module registry and authenticated carrier");
	ctx.effect(() => {
		const closeEvents = eventChannel(registry, connection, webServer);
		let watcher;
		try {
			watcher = createBundleWatcher({
				get pollIntervalMs() {
					return readInterval() ?? fallbackInterval;
				},
				snapshot: () => registry.graph().entries.flatMap((row) => {
					const baseline = registry.artifactBaseline(row.id);
					return baseline === void 0 ? [] : [[row.id, baseline]];
				}),
				stat,
				publish: (id) => {
					registry.rebuilt(id);
					return registry.artifactBaseline(id);
				},
				yieldControl: () => setImmediate(),
				schedule(callback, milliseconds) {
					const timer = setTimeout(callback, milliseconds);
					timer.unref();
					return () => clearTimeout(timer);
				},
				report: () => {
					ctx.logger.warn("Desktop client HMR bundle observation failed; retrying on the next scan");
				}
			});
		} catch (error) {
			closeEvents();
			throw error;
		}
		const unsubscribe = registry.onGraphChanged(() => watcher.refresh());
		return () => {
			watcher.dispose();
			unsubscribe();
			closeEvents();
		};
	}, "desktop-client-hmr: asynchronous watches and authenticated events");
}
//#endregion
export { Config, EVENTS_ENDPOINT, apply, inject, name };
