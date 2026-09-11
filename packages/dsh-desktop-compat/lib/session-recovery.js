import { constants, createReadStream, createWriteStream } from "node:fs";
import { copyFile, open, readFile, rename, rm, stat } from "node:fs/promises";
import { sessionFormatCatalog } from "@deepseek-ai/dsh-session-format-catalog";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { constants as constants$1, createZstdCompress, zstdCompress, zstdDecompressSync } from "node:zlib";
//#region src/byte-batches.ts
/** Coalesce small stream writes without changing bytes or buffering the input. */
async function* coalesceByteChunks(input, targetBytes = 64 * 1024) {
	if (!Number.isSafeInteger(targetBytes) || targetBytes <= 0) throw new RangeError("byte batch size must be a positive safe integer");
	let parts = [];
	let size = 0;
	for await (const chunk of input) {
		let offset = 0;
		while (offset < chunk.length) {
			const take = Math.min(targetBytes - size, chunk.length - offset);
			parts.push(chunk.subarray(offset, offset + take));
			size += take;
			offset += take;
			if (size === targetBytes) {
				const batch = Buffer.concat(parts, size);
				parts = [];
				size = 0;
				yield batch;
			}
		}
	}
	if (size > 0) yield Buffer.concat(parts, size);
}
//#endregion
//#region src/session-recovery.ts
const SESSION_RECOVERY_KIND = "corrupt-zstd-header";
const SESSION_RECOVERED_KIND = "plaintext-zstd-mismatch";
const LEGACY_PERMISSION_PRESET_RECOVERY_KIND = "legacy-v0-permission-preset-origin";
const LEGACY_PERMISSION_PRESET_RECOVERED_KIND = "legacy-v0-permission-preset-origin-normalized";
const LEGACY_SUBAGENT_RECOVERY_KIND = "legacy-v0-subagent-descriptor-v2";
const LEGACY_SUBAGENT_RECOVERED_KIND = "legacy-v0-subagent-descriptor-v2-normalized";
const CONFIRMED_SESSION_RECOVERY_ERROR = "corrupt Zstandard session log: invalid frame magic at byte 0";
const CONFIRMED_LEGACY_PERMISSION_PRESET_ERROR = /@deepseek-ai\/dsh-session-format-v0-to-v1 refuses this format v0 Session: permission\/preset (?:0|[1-9]\d*) data has unexpected member "origin"(?:$| \(raw log:|; source v0 artifact remains unchanged \(raw log:)/u;
const MAX_SESSION_HEADER_BYTES = 64 * 1024;
const RECOVERY_BACKUP_SUFFIX = ".desktop-plaintext-backup-v3.4.0";
const LEGACY_PERMISSION_PRESET_BACKUP_SUFFIX = ".desktop-v0-permission-preset-backup-v3.4.0";
const LEGACY_SUBAGENT_BACKUP_SUFFIX = ".desktop-v0-subagent-descriptor-backup-v3.4.0";
const CONFIRMED_LEGACY_SUBAGENT_ERROR = /^subagent\/descriptor (?:0|[1-9]\d*) uses unsupported descriptor version 2(?:$| \(raw log:|; source v0 artifact remains unchanged \(raw log:)/u;
const MAX_LEGACY_PERMISSION_PRESET_REWRITES = 64;
const ZSTD_MAGIC = 4247762216;
const NEWLINE_BUFFER = Buffer.from("\n");
const zstdCompressAsync = promisify(zstdCompress);
const ZSTD_OPTIONS = Object.freeze({ params: { [constants$1.ZSTD_c_checksumFlag]: 1 } });
const installedTargets = /* @__PURE__ */ new WeakMap();
/** Match only the storage error proven to be safe to isolate at the list seam. */
function isConfirmedSessionRecoveryError(error) {
	return error instanceof Error && error.message === "corrupt Zstandard session log: invalid frame magic at byte 0";
}
/** Match the one released-v0 schema refusal reproduced from an affected 3.3 user artifact. */
function isConfirmedLegacyPermissionPresetError(error) {
	return errorChainMatches(error, CONFIRMED_LEGACY_PERMISSION_PRESET_ERROR);
}
function errorChainMatches(error, pattern) {
	const visited = /* @__PURE__ */ new Set();
	let current = error;
	for (let depth = 0; depth < 8 && current instanceof Error && !visited.has(current); depth += 1) {
		if (pattern.test(current.message)) return true;
		visited.add(current);
		current = current.cause;
	}
	return false;
}
function noOpInstall() {
	return Object.freeze({
		installed: false,
		getSkippedCount: () => 0,
		getRecoveredCount: () => 0,
		restore: () => {}
	});
}
async function readSessionHeaderRecord(path, signal) {
	signal?.throwIfAborted();
	const handle = await open(path, "r");
	try {
		const buffer = Buffer.alloc(MAX_SESSION_HEADER_BYTES);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		signal?.throwIfAborted();
		const newline = buffer.subarray(0, bytesRead).indexOf(10);
		if (newline < 1) return void 0;
		return Buffer.from(buffer.subarray(0, newline + 1));
	} finally {
		await handle.close();
	}
}
function isPlausiblePlaintextSessionHeader(record) {
	if (record === void 0 || record[0] !== 123) return false;
	try {
		const value = JSON.parse(record.subarray(0, -1).toString("utf8"));
		return Number.isSafeInteger(value?.version) && Number(value.version) >= 0 && typeof value?.id === "string" && value.id.length > 0 && value.id.length <= 1024;
	} catch {
		return false;
	}
}
async function filesMatch(leftPath, rightPath, signal) {
	const [leftStat, rightStat] = await Promise.all([stat(leftPath), stat(rightPath)]);
	if (!leftStat.isFile() || !rightStat.isFile() || leftStat.size !== rightStat.size) return false;
	const [left, right] = await Promise.all([open(leftPath, "r"), open(rightPath, "r")]);
	const leftBuffer = Buffer.allocUnsafe(64 * 1024);
	const rightBuffer = Buffer.allocUnsafe(64 * 1024);
	try {
		let position = 0;
		while (position < leftStat.size) {
			signal?.throwIfAborted();
			const length = Math.min(leftBuffer.length, leftStat.size - position);
			const [leftRead, rightRead] = await Promise.all([left.read(leftBuffer, 0, length, position), right.read(rightBuffer, 0, length, position)]);
			if (leftRead.bytesRead !== length || rightRead.bytesRead !== length) return false;
			if (!leftBuffer.subarray(0, length).equals(rightBuffer.subarray(0, length))) return false;
			position += length;
		}
		return true;
	} finally {
		await Promise.all([left.close(), right.close()]);
	}
}
function isJsonRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** Scan the same standard concatenated-frame subset emitted by the official JSONL backend. */
function scanCompleteZstdFrames(buffer) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 5 || buffer.readUInt32LE(offset) !== ZSTD_MAGIC) return void 0;
		offset += 4;
		const descriptor = buffer.readUInt8(offset);
		offset += 1;
		if ((descriptor & 24) !== 0) return void 0;
		const contentSizeFlag = descriptor >>> 6;
		const singleSegment = (descriptor & 32) !== 0;
		const checksum = (descriptor & 4) !== 0;
		const dictionaryFlag = descriptor & 3;
		const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
		const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
		const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
		if (buffer.length - offset < remainingHeaderBytes) return void 0;
		offset += remainingHeaderBytes;
		for (;;) {
			if (buffer.length - offset < 3) return void 0;
			const blockHeader = buffer.readUIntLE(offset, 3);
			offset += 3;
			const lastBlock = (blockHeader & 1) !== 0;
			const blockType = blockHeader >>> 1 & 3;
			const blockSize = blockHeader >>> 3;
			if (blockType === 3) return void 0;
			const payloadBytes = blockType === 1 ? 1 : blockSize;
			if (buffer.length - offset < payloadBytes) return void 0;
			offset += payloadBytes;
			if (lastBlock) break;
		}
		if (checksum) {
			if (buffer.length - offset < 4) return void 0;
			offset += 4;
		}
		frames.push({
			start,
			end: offset
		});
	}
	return frames;
}
function parseSingleHeaderFrame(plaintext, expectedId) {
	const newline = plaintext.indexOf(10);
	if (newline < 1 || newline !== plaintext.length - 1) return void 0;
	try {
		const header = JSON.parse(plaintext.subarray(0, newline).toString("utf8"));
		if (!isJsonRecord(header) || header.version !== 0 || header.id !== expectedId) return void 0;
		return header;
	} catch {
		return;
	}
}
function normalizeLegacyPermissionPresetRow(value) {
	if (!isJsonRecord(value) || value.type !== "permission/preset") return void 0;
	if (Object.keys(value).sort().join(",") !== "data,seq,time,type") return void 0;
	if (!isJsonRecord(value.data) || Object.keys(value.data).sort().join(",") !== "origin,preset") return void 0;
	if (value.data.origin !== "default" || typeof value.data.preset !== "string" || value.data.preset.length === 0) return void 0;
	return {
		...value,
		data: { preset: value.data.preset }
	};
}
/** Generation 2 is the published pre-reasoning-effort descriptor. Keep every
* field; the official strict catalog validates its entire generation-3 shape. */
function normalizeLegacySubagentRow(value) {
	if (!isJsonRecord(value) || value.type !== "subagent/descriptor") return void 0;
	if (Object.keys(value).sort().join(",") !== "data,seq,time,type") return void 0;
	if (!isJsonRecord(value.data) || value.data.version !== 2 || Object.hasOwn(value.data, "agentReasoningEffort")) return void 0;
	return {
		...value,
		data: {
			...value.data,
			version: 3
		}
	};
}
function sameFileIdentity(left, right) {
	return left.isFile() && right.isFile() && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}
async function syncFile(path) {
	const handle = await open(path, "r+");
	try {
		await handle.sync();
	} finally {
		await handle.close();
	}
}
async function restorePermissionPresetBackup(path, signal, suffix, repairedIdentity) {
	const backup = `${path}${suffix}`;
	const temporary = `${path}.desktop-permission-preset-rollback-${process.pid}-${Date.now()}.tmp`;
	try {
		signal?.throwIfAborted();
		await copyFile(backup, temporary, constants.COPYFILE_EXCL);
		await syncFile(temporary);
		signal?.throwIfAborted();
		if (!sameFileIdentity(repairedIdentity, await stat(path))) throw new Error("legacy session changed after repair; original backup retained without overwriting newer data");
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true }).catch(() => {});
		throw error;
	}
}
/**
* Normalize only the released-v0 permission preset row observed in the field.
* The original is preserved, all other compressed rows remain byte-equivalent
* after decoding, and the candidate must pass the official migration catalog.
*/
async function recoverLegacyPermissionPresetArtifact(path, expectedId, signal) {
	return recoverReleasedV0Artifact(path, expectedId, signal, false);
}
async function recoverReleasedV0Artifact(path, expectedId, signal, allowSubagent) {
	if (typeof path !== "string" || !path.endsWith(".jsonl.zstd") || typeof expectedId !== "string" || expectedId.length === 0) return false;
	const backup = `${path}${allowSubagent ? LEGACY_SUBAGENT_BACKUP_SUFFIX : LEGACY_PERMISSION_PRESET_BACKUP_SUFFIX}`;
	const temporary = `${path}.desktop-permission-preset-${process.pid}-${Date.now()}.tmp`;
	let backupCreated = false;
	try {
		signal?.throwIfAborted();
		const before = await stat(path);
		if (!before.isFile()) return false;
		const source = await readFile(path);
		signal?.throwIfAborted();
		const after = await stat(path);
		if (!sameFileIdentity(before, after) || source.length !== after.size) return false;
		const frames = scanCompleteZstdFrames(source);
		if (frames === void 0 || frames.length < 2) return false;
		const completeFrames = frames;
		const headerRange = completeFrames[0];
		if (headerRange === void 0) return false;
		const header = parseSingleHeaderFrame(zstdDecompressSync(source.subarray(headerRange.start, headerRange.end)), expectedId);
		if (header === void 0) return false;
		const restore = sessionFormatCatalog.createRestore(header, {
			recovery: "strict",
			validation: "transformed"
		});
		let pending = Buffer.alloc(0);
		let rewritten = 0;
		let subagentsRewritten = 0;
		async function* normalizedBody() {
			for (const frame of completeFrames.slice(1)) {
				signal?.throwIfAborted();
				const decoded = zstdDecompressSync(source.subarray(frame.start, frame.end));
				const plaintext = pending.length === 0 ? decoded : Buffer.concat([pending, decoded]);
				let start = 0;
				for (;;) {
					const newline = plaintext.indexOf(10, start);
					if (newline < 0) break;
					const physicalRow = plaintext.subarray(start, newline);
					if (physicalRow.length === 0) throw new Error("legacy session contains an empty JSONL row");
					const value = JSON.parse(physicalRow.toString("utf8"));
					const subagent = allowSubagent ? normalizeLegacySubagentRow(value) : void 0;
					const normalized = normalizeLegacyPermissionPresetRow(value) ?? subagent;
					if (subagent !== void 0) subagentsRewritten += 1;
					const row = normalized ?? value;
					if (normalized !== void 0) {
						rewritten += 1;
						if (rewritten > MAX_LEGACY_PERMISSION_PRESET_REWRITES) throw new Error("legacy session contains too many permission preset rewrites");
					}
					restore.decodeRow(row);
					yield normalized === void 0 ? physicalRow : Buffer.from(JSON.stringify(normalized));
					yield NEWLINE_BUFFER;
					start = newline + 1;
				}
				pending = Buffer.from(plaintext.subarray(start));
			}
			if (pending.length !== 0) throw new Error("legacy session ends with an incomplete JSONL row");
		}
		const temporaryHandle = await open(temporary, "wx");
		try {
			await temporaryHandle.writeFile(source.subarray(headerRange.start, headerRange.end));
			await temporaryHandle.sync();
		} finally {
			await temporaryHandle.close();
		}
		await pipeline(coalesceByteChunks(normalizedBody()), createZstdCompress(ZSTD_OPTIONS), createWriteStream(temporary, { flags: "a" }), { signal });
		restore.finish();
		if (rewritten === 0 || allowSubagent && subagentsRewritten === 0) {
			await rm(temporary, { force: true });
			return false;
		}
		await syncFile(temporary);
		try {
			await copyFile(path, backup, constants.COPYFILE_EXCL);
			backupCreated = true;
			await syncFile(backup);
		} catch (error) {
			if (error?.code !== "EEXIST") throw error;
			if (!await filesMatch(path, backup, signal)) {
				await rm(temporary, { force: true });
				return false;
			}
		}
		signal?.throwIfAborted();
		if (!(await readFile(backup)).equals(source) || !await filesMatch(path, backup, signal) || !sameFileIdentity(after, await stat(path))) {
			await rm(temporary, { force: true });
			if (backupCreated) await rm(backup, { force: true });
			return false;
		}
		await rename(temporary, path);
		return true;
	} catch (error) {
		await rm(temporary, { force: true }).catch(() => {});
		if (backupCreated) await rm(backup, { force: true }).catch(() => {});
		signal?.throwIfAborted();
		return false;
	}
}
/**
* Repair only a valid plaintext JSONL artifact carrying the zstd suffix.
* Original bytes are copied beside it before the canonical path is atomically
* replaced with a checksummed header frame and a streamed body frame.
*/
async function recoverPlaintextZstdArtifact(path, signal) {
	if (typeof path !== "string" || !path.endsWith(".jsonl.zstd")) return false;
	const header = await readSessionHeaderRecord(path, signal);
	if (!isPlausiblePlaintextSessionHeader(header)) return false;
	const identity = await stat(path);
	if (!identity.isFile() || identity.size < header.length) return false;
	const backup = `${path}${RECOVERY_BACKUP_SUFFIX}`;
	const temporary = `${path}.desktop-recovery-${process.pid}-${Date.now()}.tmp`;
	let backupCreated = false;
	try {
		try {
			await copyFile(path, backup, constants.COPYFILE_EXCL);
			backupCreated = true;
			const backupHandle = await open(backup, "r+");
			try {
				await backupHandle.sync();
			} finally {
				await backupHandle.close();
			}
		} catch (error) {
			if (error?.code !== "EEXIST") throw error;
			if (!await filesMatch(path, backup, signal)) return false;
		}
		signal?.throwIfAborted();
		const compressedHeader = await zstdCompressAsync(header, ZSTD_OPTIONS);
		const temporaryHandle = await open(temporary, "wx");
		try {
			await temporaryHandle.writeFile(compressedHeader);
			await temporaryHandle.sync();
		} finally {
			await temporaryHandle.close();
		}
		if (identity.size > header.length) {
			await pipeline(createReadStream(path, { start: header.length }), createZstdCompress(ZSTD_OPTIONS), createWriteStream(temporary, { flags: "a" }), { signal });
			const completed = await open(temporary, "r+");
			try {
				await completed.sync();
			} finally {
				await completed.close();
			}
		}
		signal?.throwIfAborted();
		await rename(temporary, path);
		return true;
	} catch (error) {
		await rm(temporary, { force: true }).catch(() => {});
		if (backupCreated) await rm(backup, { force: true }).catch(() => {});
		throw error;
	}
}
/** Wrap the fixed Runtime readers and repair only validated historical variants. */
function installSessionPersistenceRecovery(target, { onSkipped = () => {}, onRecovered = () => {} } = {}) {
	if (target === null || typeof target !== "object" && typeof target !== "function") return noOpInstall();
	const existing = installedTargets.get(target);
	if (existing !== void 0) return existing;
	const backend = target;
	const originalHeaderReader = backend.readFirstZstdLine;
	const originalStoredLogReader = backend.readStoredLog;
	const originalMigrationReader = backend.prepareStoredMigration;
	if (typeof originalHeaderReader !== "function" && typeof originalStoredLogReader !== "function" && typeof originalMigrationReader !== "function") return noOpInstall();
	const skippedPaths = /* @__PURE__ */ new Set();
	const recoveredPaths = /* @__PURE__ */ new Set();
	const pendingRecoveries = /* @__PURE__ */ new Map();
	const hadOwnHeaderReader = Object.prototype.hasOwnProperty.call(backend, "readFirstZstdLine");
	const hadOwnStoredLogReader = Object.prototype.hasOwnProperty.call(backend, "readStoredLog");
	const hadOwnMigrationReader = Object.prototype.hasOwnProperty.call(backend, "prepareStoredMigration");
	const noteSkipped = (path, kind) => {
		if (skippedPaths.has(path)) return;
		skippedPaths.add(path);
		try {
			onSkipped({
				count: skippedPaths.size,
				kind
			});
		} catch {}
	};
	const noteRecovered = (path, kind) => {
		if (recoveredPaths.has(path)) return;
		recoveredPaths.add(path);
		try {
			onRecovered({
				count: recoveredPaths.size,
				kind
			});
		} catch {}
	};
	const wrappedHeaderReader = typeof originalHeaderReader === "function" ? async function(path, signal) {
		try {
			return await originalHeaderReader.call(this, path, signal);
		} catch (error) {
			if (!isConfirmedSessionRecoveryError(error)) throw error;
			if (await recoverPlaintextZstdArtifact(path, signal).catch(() => false)) {
				noteRecovered(path, SESSION_RECOVERED_KIND);
				return originalHeaderReader.call(this, path, signal);
			}
			noteSkipped(typeof path === "string" ? path : "<unknown-session-path>", SESSION_RECOVERY_KIND);
			return;
		}
	} : void 0;
	async function recoverRead(error, path, expectedId, signal, retry) {
		const permissionError = isConfirmedLegacyPermissionPresetError(error);
		const subagentError = errorChainMatches(error, CONFIRMED_LEGACY_SUBAGENT_ERROR);
		if (!permissionError && !subagentError) throw error;
		const key = JSON.stringify([path, expectedId]);
		const active = pendingRecoveries.get(key);
		if (active !== void 0) {
			const result = await active;
			signal?.throwIfAborted();
			return result;
		}
		const pending = (async () => {
			let recovered = permissionError && await recoverLegacyPermissionPresetArtifact(path, expectedId, signal);
			let subagentRecovery = false;
			if (!recovered) {
				recovered = await recoverReleasedV0Artifact(path, expectedId, signal, true);
				subagentRecovery = recovered;
			}
			if (!recovered) {
				noteSkipped(path, subagentError ? LEGACY_SUBAGENT_RECOVERY_KIND : LEGACY_PERMISSION_PRESET_RECOVERY_KIND);
				throw error;
			}
			const repairedIdentity = await stat(path);
			try {
				const result = await retry();
				noteRecovered(path, subagentRecovery ? LEGACY_SUBAGENT_RECOVERED_KIND : LEGACY_PERMISSION_PRESET_RECOVERED_KIND);
				return result;
			} catch (retryError) {
				try {
					await restorePermissionPresetBackup(path, void 0, subagentRecovery ? LEGACY_SUBAGENT_BACKUP_SUFFIX : LEGACY_PERMISSION_PRESET_BACKUP_SUFFIX, repairedIdentity);
				} catch (rollbackError) {
					throw new AggregateError([retryError, rollbackError], "legacy session recovery validation failed and rollback failed");
				}
				throw retryError;
			}
		})();
		pendingRecoveries.set(key, pending);
		try {
			return await pending;
		} finally {
			if (pendingRecoveries.get(key) === pending) pendingRecoveries.delete(key);
		}
	}
	const wrappedStoredLogReader = typeof originalStoredLogReader === "function" ? async function(path, expectedId, signal) {
		const retry = () => originalStoredLogReader.call(this, path, expectedId, signal);
		try {
			return await retry();
		} catch (error) {
			return recoverRead(error, path, expectedId, signal, retry);
		}
	} : void 0;
	const wrappedMigrationReader = typeof originalMigrationReader === "function" ? async function(id, selected, signal) {
		const retry = () => originalMigrationReader.call(this, id, selected, signal);
		try {
			return await retry();
		} catch (error) {
			if (selected?.sourceVersion !== 0 || typeof selected.sourcePath !== "string") throw error;
			return recoverRead(error, selected.sourcePath, id, signal, retry);
		}
	} : void 0;
	if (wrappedHeaderReader !== void 0) backend.readFirstZstdLine = wrappedHeaderReader;
	if (wrappedStoredLogReader !== void 0) backend.readStoredLog = wrappedStoredLogReader;
	if (wrappedMigrationReader !== void 0) backend.prepareStoredMigration = wrappedMigrationReader;
	const frozenInstall = Object.freeze({
		installed: true,
		getSkippedCount: () => skippedPaths.size,
		getRecoveredCount: () => recoveredPaths.size,
		restore: () => {
			if (wrappedHeaderReader !== void 0 && backend.readFirstZstdLine === wrappedHeaderReader) if (hadOwnHeaderReader) backend.readFirstZstdLine = originalHeaderReader;
			else Reflect.deleteProperty(backend, "readFirstZstdLine");
			if (wrappedStoredLogReader !== void 0 && backend.readStoredLog === wrappedStoredLogReader) if (hadOwnStoredLogReader) backend.readStoredLog = originalStoredLogReader;
			else Reflect.deleteProperty(backend, "readStoredLog");
			if (wrappedMigrationReader !== void 0 && backend.prepareStoredMigration === wrappedMigrationReader) if (hadOwnMigrationReader) backend.prepareStoredMigration = originalMigrationReader;
			else Reflect.deleteProperty(backend, "prepareStoredMigration");
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
	const install = installSessionPersistenceRecovery(ctx.sessionPersistence, {
		onSkipped: ({ count, kind }) => {
			console.warn("[dsh-session-recovery] skipped=" + count + " kind=" + kind);
		},
		onRecovered: ({ count, kind }) => {
			console.warn("[dsh-session-recovery] recovered=" + count + " kind=" + kind);
		}
	});
	if (!install.installed) {
		ctx.logger.warn("[dsh-session-recovery] unavailable=readFirstZstdLine,readStoredLog,prepareStoredMigration");
		return;
	}
	ctx.effect(() => install.restore, "dsh-desktop-compat: session list recovery");
}
//#endregion
export { CONFIRMED_LEGACY_PERMISSION_PRESET_ERROR, CONFIRMED_SESSION_RECOVERY_ERROR, LEGACY_PERMISSION_PRESET_RECOVERED_KIND, LEGACY_PERMISSION_PRESET_RECOVERY_KIND, LEGACY_SUBAGENT_RECOVERED_KIND, LEGACY_SUBAGENT_RECOVERY_KIND, SESSION_RECOVERED_KIND, SESSION_RECOVERY_KIND, apply, inject, installSessionPersistenceRecovery, isConfirmedLegacyPermissionPresetError, isConfirmedSessionRecoveryError, name, recoverLegacyPermissionPresetArtifact, recoverPlaintextZstdArtifact };
