//#region src/session-recovery.ts
const SESSION_RECOVERY_KIND = "corrupt-zstd-header";
const CONFIRMED_SESSION_RECOVERY_ERROR = "corrupt Zstandard session log: invalid frame magic at byte 0";
const installedTargets = /* @__PURE__ */ new WeakMap();
/** Match only the storage error proven to be safe to skip at the list seam. */
function isConfirmedSessionRecoveryError(error) {
	return error instanceof Error && error.message === "corrupt Zstandard session log: invalid frame magic at byte 0";
}
function noOpInstall() {
	return Object.freeze({
		installed: false,
		getSkippedCount: () => 0,
		restore: () => {}
	});
}
/** Wrap the fixed Runtime JSONL header reader without changing any stored bytes. */
function installSessionPersistenceRecovery(target, { onSkipped = () => {} } = {}) {
	if (target === null || typeof target !== "object" && typeof target !== "function") return noOpInstall();
	const existing = installedTargets.get(target);
	if (existing !== void 0) return existing;
	const backend = target;
	const original = backend.readFirstZstdLine;
	if (typeof original !== "function") return noOpInstall();
	const skippedPaths = /* @__PURE__ */ new Set();
	const hadOwnMethod = Object.prototype.hasOwnProperty.call(backend, "readFirstZstdLine");
	const wrapped = async function(path, signal) {
		try {
			return await original.call(this, path, signal);
		} catch (error) {
			if (!isConfirmedSessionRecoveryError(error)) throw error;
			const key = typeof path === "string" ? path : "<unknown-session-path>";
			if (!skippedPaths.has(key)) {
				skippedPaths.add(key);
				try {
					onSkipped({
						count: skippedPaths.size,
						kind: SESSION_RECOVERY_KIND
					});
				} catch {}
			}
			return;
		}
	};
	backend.readFirstZstdLine = wrapped;
	const frozenInstall = Object.freeze({
		installed: true,
		getSkippedCount: () => skippedPaths.size,
		restore: () => {
			if (backend.readFirstZstdLine !== wrapped) {
				installedTargets.delete(target);
				return;
			}
			if (hadOwnMethod) backend.readFirstZstdLine = original;
			else Reflect.deleteProperty(backend, "readFirstZstdLine");
			installedTargets.delete(target);
		}
	});
	installedTargets.set(target, frozenInstall);
	return frozenInstall;
}
const name = "desktop-session-recovery";
const inject = ["sessionPersistence"];
/** Install the narrow recovery seam before dsh-workspace enumerates sessions. */
function apply(ctx) {
	const install = installSessionPersistenceRecovery(ctx.sessionPersistence, { onSkipped: ({ count, kind }) => {
		console.warn("[dsh-session-recovery] skipped=" + count + " kind=" + kind);
	} });
	if (!install.installed) {
		ctx.logger.warn("[dsh-session-recovery] unavailable=readFirstZstdLine");
		return;
	}
	ctx.effect(() => install.restore, "dsh-desktop-compat: session list recovery");
}
//#endregion
export { CONFIRMED_SESSION_RECOVERY_ERROR, SESSION_RECOVERY_KIND, apply, inject, installSessionPersistenceRecovery, isConfirmedSessionRecoveryError, name };
