import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
//#region src/core/host-types.ts
function getHostService(ctx, name) {
	const candidate = ctx;
	try {
		return candidate.get?.(name) ?? candidate[name];
	} catch {
		return;
	}
}
//#endregion
//#region src/core/settings.ts
const PACKAGE_ID = "@ningbainb/dsh-fast-ops";
const ROUTE_PREFIX = "/api/dsh-fast-ops";
const SETTINGS_FILE = "dsh-fast-ops.settings.json";
const INLINE_BYTE_OPTIONS = [
	8192,
	16384,
	32768,
	65536
];
const TTL_MS_OPTIONS = [
	9e5,
	36e5,
	216e5
];
function defaultSettings() {
	return {
		version: 1,
		enabled: true,
		lazySpecializedTools: true,
		batchingGuidance: true,
		maxInlineBytes: 16384,
		resultCacheTtlMs: 36e5,
		maxCachedRefs: 128
	};
}
function clampInt(value, min, max) {
	const num = Number(value);
	if (!Number.isFinite(num)) return null;
	return Math.max(min, Math.min(max, Math.round(num)));
}
/** Coerce arbitrary settings input into valid clamped FastOpsSettings. */
function normalizeSettings(input) {
	const settings = defaultSettings();
	const problems = [];
	if (input === null || typeof input !== "object") return {
		settings,
		problems
	};
	const raw = input;
	if (typeof raw.enabled === "boolean") settings.enabled = raw.enabled;
	else if (raw.enabled !== void 0) problems.push("enabled");
	if (typeof raw.lazySpecializedTools === "boolean") settings.lazySpecializedTools = raw.lazySpecializedTools;
	else if (raw.lazySpecializedTools !== void 0) problems.push("lazySpecializedTools");
	if (typeof raw.batchingGuidance === "boolean") settings.batchingGuidance = raw.batchingGuidance;
	else if (raw.batchingGuidance !== void 0) problems.push("batchingGuidance");
	const maxBytes = clampInt(raw.maxInlineBytes, 4096, 65536);
	if (raw.maxInlineBytes !== void 0) if (maxBytes !== null && maxBytes === Number(raw.maxInlineBytes)) settings.maxInlineBytes = maxBytes;
	else if (maxBytes !== null) {
		settings.maxInlineBytes = maxBytes;
		problems.push("maxInlineBytes");
	} else problems.push("maxInlineBytes");
	const ttl = clampInt(raw.resultCacheTtlMs, 6e4, 864e5);
	if (raw.resultCacheTtlMs !== void 0) if (ttl !== null && ttl === Number(raw.resultCacheTtlMs)) settings.resultCacheTtlMs = ttl;
	else if (ttl !== null) {
		settings.resultCacheTtlMs = ttl;
		problems.push("resultCacheTtlMs");
	} else problems.push("resultCacheTtlMs");
	const maxRefs = clampInt(raw.maxCachedRefs, 16, 512);
	if (raw.maxCachedRefs !== void 0) if (maxRefs !== null && maxRefs === Number(raw.maxCachedRefs)) settings.maxCachedRefs = maxRefs;
	else if (maxRefs !== null) {
		settings.maxCachedRefs = maxRefs;
		problems.push("maxCachedRefs");
	} else problems.push("maxCachedRefs");
	return {
		settings,
		problems
	};
}
//#endregion
//#region src/host/settings-store.ts
function resolveDshHome(env = process.env) {
	const fromEnv = String(env.DSH_HOME ?? "").trim();
	return fromEnv === "" ? join(homedir(), ".dsh") : fromEnv;
}
function settingsFilePath(home = resolveDshHome()) {
	return join(home, SETTINGS_FILE);
}
async function readSettings(home = resolveDshHome()) {
	try {
		const raw = await readFile(settingsFilePath(home), "utf8");
		return normalizeSettings(JSON.parse(raw)).settings;
	} catch {
		return defaultSettings();
	}
}
async function writeSettingsAtomic(input, home = resolveDshHome(), platform = process.platform) {
	const normalized = normalizeSettings(input);
	const target = settingsFilePath(home);
	await mkdir(dirname(target), { recursive: true });
	const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const tmpPath = `${target}.tmp-${suffix}`;
	const backupPath = `${target}.backup-${suffix}`;
	await writeFile(tmpPath, `${JSON.stringify(normalized.settings, null, 2)}\n`, {
		encoding: "utf8",
		mode: 384,
		flag: "wx"
	});
	let backedUp = false;
	try {
		try {
			await rename(target, backupPath);
			backedUp = true;
		} catch (error) {
			if (error?.code !== "ENOENT" && platform !== "win32") throw error;
		}
		await rename(tmpPath, target).catch(async (error) => {
			if (platform !== "win32" || error?.code !== "EEXIST") throw error;
			if (!backedUp) {
				await rename(target, backupPath);
				backedUp = true;
			}
			await rename(tmpPath, target);
		});
		if (backedUp) await rm(backupPath, { force: true });
	} catch (error) {
		await rm(tmpPath, { force: true }).catch(() => {});
		if (backedUp) await rename(backupPath, target).catch(() => {});
		throw error;
	}
	return normalized;
}
//#endregion
//#region src/host/workspace-path.ts
function isInside(baseDir, candidate) {
	const rel = relative(baseDir, candidate);
	return rel === "" || !isAbsolute(rel) && rel !== ".." && !rel.startsWith("..\\") && !rel.startsWith("../");
}
function nearestExistingRealpath(path) {
	let cursor = path;
	while (!existsSync(cursor)) {
		const parent = dirname(cursor);
		if (parent === cursor) break;
		cursor = parent;
	}
	return existsSync(cursor) ? realpathSync(cursor) : cursor;
}
/** Resolve a user-supplied path strictly within `rootDir`, blocking traversals and symlink escapes. */
function resolveSafeWorkspacePath(rootDir, relPath = ".") {
	if (typeof relPath !== "string" || relPath.includes("\0")) return {
		ok: false,
		error: "invalid-path"
	};
	const rootResolved = resolve(rootDir);
	let rootReal = rootResolved;
	try {
		rootReal = realpathSync(rootResolved);
	} catch {}
	const target = resolve(rootResolved, relPath.trim() === "" ? "." : relPath);
	if (!isInside(rootResolved, target)) return {
		ok: false,
		error: "path-outside-workspace"
	};
	const targetAncestorReal = nearestExistingRealpath(target);
	if (!isInside(rootReal, targetAncestorReal)) return {
		ok: false,
		error: "symlink-outside-workspace"
	};
	return {
		ok: true,
		absolutePath: target,
		relativePath: relative(rootResolved, target).replaceAll("\\", "/") || "."
	};
}
function sha256Hex(content) {
	return createHash("sha256").update(content).digest("hex");
}
function isLikelyBinary(buf) {
	const sampleLen = Math.min(buf.byteLength, 4096);
	for (let i = 0; i < sampleLen; i++) if (buf[i] === 0) return true;
	return false;
}
//#endregion
//#region src/host/file-ops.ts
const DEFAULT_IGNORED_DIRS = /* @__PURE__ */ new Set([
	".git",
	"node_modules",
	"dist",
	"lib",
	".next",
	"target"
]);
async function readFilesBatch(rootDir, files, options = {}) {
	const capped = files.slice(0, 32);
	const results = await Promise.all(capped.map(async (item) => {
		const resolved = resolveSafeWorkspacePath(rootDir, item.path);
		if (!resolved.ok) return {
			path: item.path,
			error: resolved.error
		};
		try {
			const buf = await readFile(resolved.absolutePath);
			if (isLikelyBinary(buf)) return {
				path: resolved.relativePath,
				error: "binary-file"
			};
			const lines = buf.toString("utf8").split(/\r?\n/u);
			const offset = Math.max(1, Math.floor(item.offset ?? 1));
			const limit = Math.max(1, Math.min(2e3, Math.floor(item.limit ?? 200)));
			const startIdx = Math.min(lines.length, offset - 1);
			const endIdx = Math.min(lines.length, startIdx + limit);
			const slice = lines.slice(startIdx, endIdx).join("\n");
			return {
				path: resolved.relativePath,
				revision: sha256Hex(buf),
				totalLines: lines.length,
				startLine: lines.length === 0 ? 0 : startIdx + 1,
				endLine: endIdx,
				truncated: endIdx < lines.length,
				content: slice
			};
		} catch (error) {
			return {
				path: resolved.relativePath,
				error: error?.code === "ENOENT" ? "not-found" : "read-failed"
			};
		}
	}));
	const maxInlineBytes = options.maxInlineBytes ?? 16384;
	const serializedBytes = Buffer.byteLength(JSON.stringify(results), "utf8");
	if (serializedBytes > maxInlineBytes && options.cache && options.sessionId) {
		const ref = options.cache.put({
			sessionId: options.sessionId,
			producerTool: "fast_read_files",
			items: results,
			ttlMs: options.ttlMs ?? 36e5,
			preview: `fast_read_files: ${results.length} files (${serializedBytes} bytes) spilled to cache`
		});
		return {
			items: results.map(({ content: _omit, ...summary }) => ({
				...summary,
				truncated: true
			})),
			ref,
			spilled: true
		};
	}
	return {
		items: results,
		spilled: false
	};
}
function globToRegExp(glob) {
	let out = "^";
	let i = 0;
	const normalized = glob.replaceAll("\\", "/").replace(/^\.\//u, "");
	while (i < normalized.length) {
		const ch = normalized[i];
		if (ch === "*") {
			if (normalized[i + 1] === "*") {
				if (normalized[i + 2] === "/") {
					out += "(?:.*/)?";
					i += 3;
					continue;
				}
				out += ".*";
				i += 2;
				continue;
			}
			out += "[^/]*";
			i += 1;
			continue;
		}
		if (ch === "?") {
			out += "[^/]";
			i += 1;
			continue;
		}
		out += ch.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
		i += 1;
	}
	out += "$";
	return new RegExp(out, "u");
}
function compileGlobMatcher(patterns) {
	if (!patterns || patterns.length === 0) return () => true;
	const positives = [];
	const negatives = [];
	for (const raw of patterns) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("!")) negatives.push(globToRegExp(trimmed.slice(1)));
		else positives.push(globToRegExp(trimmed));
	}
	return (relPath) => {
		if (negatives.some((re) => re.test(relPath))) return false;
		return positives.length === 0 || positives.some((re) => re.test(relPath));
	};
}
async function walkFiles(rootDir, baseRel, includeHidden, maxScanFiles, out) {
	if (out.length >= maxScanFiles) return;
	const absDir = baseRel === "." ? rootDir : join(rootDir, baseRel);
	let entries;
	try {
		entries = await readdir(absDir, { withFileTypes: true });
	} catch {
		return;
	}
	entries.sort((a, b) => a.name.localeCompare(b.name));
	for (const entry of entries) {
		if (out.length >= maxScanFiles) break;
		if (!includeHidden && entry.name.startsWith(".")) continue;
		if (entry.isSymbolicLink()) continue;
		const rel = baseRel === "." ? entry.name : `${baseRel}/${entry.name}`;
		if (entry.isDirectory()) {
			if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
			await walkFiles(rootDir, rel, includeHidden, maxScanFiles, out);
		} else if (entry.isFile()) out.push(rel);
	}
}
async function searchWorkspace(rootDir, params, options = {}) {
	const base = resolveSafeWorkspacePath(rootDir, params.path ?? ".");
	if (!base.ok) return {
		ok: false,
		error: base.error,
		items: []
	};
	const matcher = compileGlobMatcher(params.include);
	const discovered = [];
	await walkFiles(rootDir, base.relativePath, params.includeHidden === true, 8e3, discovered);
	const eligible = discovered.filter(matcher);
	const offset = Math.max(0, Math.floor(params.offset ?? 0));
	const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? 80)));
	if (params.mode === "glob") {
		const sliced = eligible.slice(offset, offset + limit).map((path) => ({ path }));
		return {
			ok: true,
			mode: "glob",
			totalMatches: eligible.length,
			filesMatched: eligible.length,
			items: sliced,
			nextOffset: offset + sliced.length < eligible.length ? offset + sliced.length : null,
			spilled: false
		};
	}
	const query = params.pattern ?? "";
	if (!query) return {
		ok: false,
		error: "pattern-required",
		items: []
	};
	let regex;
	try {
		const escaped = params.literal ? query.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&") : query;
		regex = new RegExp(escaped, params.caseSensitive ? "u" : "iu");
	} catch {
		return {
			ok: false,
			error: "invalid-regex",
			items: []
		};
	}
	const matches = [];
	const matchedFiles = /* @__PURE__ */ new Set();
	const maxCollected = 2e3;
	for (const relPath of eligible) {
		if (matches.length >= maxCollected) break;
		let buf;
		try {
			buf = await readFile(join(rootDir, relPath));
		} catch {
			continue;
		}
		if (buf.byteLength > 2 * 1024 * 1024 || isLikelyBinary(buf)) continue;
		const lines = Buffer.from(buf).toString("utf8").split(/\r?\n/u);
		for (let idx = 0; idx < lines.length; idx++) {
			if (!regex.test(lines[idx])) continue;
			matchedFiles.add(relPath);
			const snippet = lines[idx].length > 240 ? `${lines[idx].slice(0, 240)}...` : lines[idx];
			matches.push({
				path: relPath,
				line: idx + 1,
				text: snippet
			});
			if (matches.length >= maxCollected) break;
		}
	}
	const paged = matches.slice(offset, offset + limit);
	if (Buffer.byteLength(JSON.stringify(paged), "utf8") > (options.maxInlineBytes ?? 16384) && options.cache && options.sessionId) {
		const ref = options.cache.put({
			sessionId: options.sessionId,
			producerTool: "fast_search",
			items: matches,
			ttlMs: options.ttlMs ?? 36e5,
			preview: `fast_search: ${matches.length} matches across ${matchedFiles.size} files`
		});
		return {
			ok: true,
			mode: "grep",
			totalMatches: matches.length,
			filesMatched: matchedFiles.size,
			items: paged.slice(0, 15),
			nextOffset: null,
			ref,
			spilled: true
		};
	}
	return {
		ok: true,
		mode: "grep",
		totalMatches: matches.length,
		filesMatched: matchedFiles.size,
		items: paged,
		nextOffset: offset + paged.length < matches.length ? offset + paged.length : null,
		spilled: false
	};
}
async function writeFileAtomicBytes(targetPath, content) {
	await mkdir(dirname(targetPath), { recursive: true });
	const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const tmpPath = `${targetPath}.tmp-${suffix}`;
	const backupPath = `${targetPath}.bak-${suffix}`;
	await writeFile(tmpPath, content, {
		encoding: "utf8",
		flag: "wx"
	});
	let backedUp = false;
	try {
		try {
			await rename(targetPath, backupPath);
			backedUp = true;
		} catch (error) {
			if (error?.code !== "ENOENT" && process.platform !== "win32") throw error;
		}
		await rename(tmpPath, targetPath).catch(async (error) => {
			if (process.platform !== "win32" || error?.code !== "EEXIST") throw error;
			if (!backedUp) {
				await rename(targetPath, backupPath);
				backedUp = true;
			}
			await rename(tmpPath, targetPath);
		});
		if (backedUp) await rm(backupPath, { force: true });
	} catch (error) {
		await rm(tmpPath, { force: true }).catch(() => {});
		if (backedUp) await rename(backupPath, targetPath).catch(() => {});
		throw error;
	}
}
function buildCompactDiff(beforeText, afterText, path) {
	const a = beforeText.split(/\r?\n/u);
	const b = afterText.split(/\r?\n/u);
	let prefix = 0;
	while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
	let suffix = 0;
	while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
	if (prefix === a.length && a.length === b.length) return `--- ${path}\n+++ ${path}\n(no changes)`;
	const removed = a.slice(prefix, a.length - suffix).map((line) => `- ${line}`);
	const added = b.slice(prefix, b.length - suffix).map((line) => `+ ${line}`);
	return [
		`--- ${path}`,
		`+++ ${path}`,
		`@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`,
		...removed,
		...added
	].join("\n");
}
async function editFilesBatch(rootDir, params) {
	const resolved = resolveSafeWorkspacePath(rootDir, params.path);
	if (!resolved.ok) return {
		ok: false,
		error: resolved.error
	};
	if (!/^[a-f0-9]{64}$/u.test(params.expectedRevision)) return {
		ok: false,
		error: "invalid-expected-revision"
	};
	if (!Array.isArray(params.edits) || params.edits.length === 0 || params.edits.length > 100) return {
		ok: false,
		error: "invalid-edits-count"
	};
	let buf;
	try {
		buf = await readFile(resolved.absolutePath);
	} catch {
		return {
			ok: false,
			error: "not-found"
		};
	}
	if (isLikelyBinary(buf)) return {
		ok: false,
		error: "binary-file"
	};
	const currentRevision = sha256Hex(buf);
	if (currentRevision !== params.expectedRevision) return {
		ok: false,
		error: "revision-mismatch",
		currentRevision
	};
	const original = Buffer.from(buf).toString("utf8");
	const spans = [];
	for (let i = 0; i < params.edits.length; i++) {
		const edit = params.edits[i];
		if (!edit.oldText) return {
			ok: false,
			error: `edit[${i}]-empty-oldText`
		};
		const first = original.indexOf(edit.oldText);
		if (first < 0) return {
			ok: false,
			error: `edit[${i}]-not-found`
		};
		if (original.indexOf(edit.oldText, first + 1) >= 0) return {
			ok: false,
			error: `edit[${i}]-not-unique`
		};
		spans.push({
			start: first,
			end: first + edit.oldText.length,
			newText: edit.newText
		});
	}
	spans.sort((a, b) => a.start - b.start);
	for (let i = 1; i < spans.length; i++) if (spans[i].start < spans[i - 1].end) return {
		ok: false,
		error: "overlapping-edits"
	};
	let updated = "";
	let cursor = 0;
	for (const span of spans) {
		updated += original.slice(cursor, span.start) + span.newText;
		cursor = span.end;
	}
	updated += original.slice(cursor);
	const newRevision = sha256Hex(Buffer.from(updated, "utf8"));
	if (params.dryRun) return {
		ok: true,
		dryRun: true,
		path: resolved.relativePath,
		previousRevision: currentRevision,
		nextRevision: newRevision,
		appliedEdits: spans.length,
		diff: buildCompactDiff(original, updated, resolved.relativePath)
	};
	await writeFileAtomicBytes(resolved.absolutePath, updated);
	return {
		ok: true,
		dryRun: false,
		path: resolved.relativePath,
		previousRevision: currentRevision,
		revision: newRevision,
		appliedEdits: spans.length
	};
}
async function statFile(rootDir, relPath) {
	const resolved = resolveSafeWorkspacePath(rootDir, relPath);
	if (!resolved.ok) return {
		ok: false,
		error: resolved.error
	};
	try {
		const st = await stat(resolved.absolutePath);
		if (st.isDirectory()) return {
			ok: true,
			exists: true,
			path: resolved.relativePath,
			kind: "directory",
			bytes: 0,
			mtimeMs: st.mtimeMs
		};
		if (!st.isFile()) return {
			ok: true,
			exists: true,
			path: resolved.relativePath,
			kind: "other",
			bytes: st.size,
			mtimeMs: st.mtimeMs
		};
		const buf = await readFile(resolved.absolutePath);
		const binary = isLikelyBinary(buf);
		const lines = binary ? void 0 : Buffer.from(buf).toString("utf8").split(/\r?\n/u).length;
		return {
			ok: true,
			exists: true,
			path: resolved.relativePath,
			kind: "file",
			bytes: st.size,
			mtimeMs: st.mtimeMs,
			binary,
			lines,
			revision: sha256Hex(buf)
		};
	} catch (error) {
		if (error?.code === "ENOENT") return {
			ok: true,
			exists: false,
			path: resolved.relativePath
		};
		return {
			ok: false,
			error: "stat-failed"
		};
	}
}
async function diffPreview(rootDir, relPath, proposedContent) {
	const resolved = resolveSafeWorkspacePath(rootDir, relPath);
	if (!resolved.ok) return {
		ok: false,
		error: resolved.error
	};
	try {
		const buf = await readFile(resolved.absolutePath);
		if (isLikelyBinary(buf)) return {
			ok: false,
			error: "binary-file"
		};
		const before = Buffer.from(buf).toString("utf8");
		return {
			ok: true,
			path: resolved.relativePath,
			currentRevision: sha256Hex(buf),
			diff: buildCompactDiff(before, proposedContent, resolved.relativePath)
		};
	} catch {
		return {
			ok: false,
			error: "not-found"
		};
	}
}
async function replaceAcrossFiles(rootDir, params) {
	if (!params.oldText) return {
		ok: false,
		error: "oldText-required"
	};
	const base = resolveSafeWorkspacePath(rootDir, params.path ?? ".");
	if (!base.ok) return {
		ok: false,
		error: base.error
	};
	const dryRun = params.dryRun !== false;
	const matcher = compileGlobMatcher(params.include);
	const files = [];
	await walkFiles(rootDir, base.relativePath, false, 4e3, files);
	const changed = [];
	let totalReplacements = 0;
	for (const relPath of files.filter(matcher)) {
		const abs = join(rootDir, relPath);
		let buf;
		try {
			buf = await readFile(abs);
		} catch {
			continue;
		}
		if (buf.byteLength > 2 * 1024 * 1024 || isLikelyBinary(buf)) continue;
		const text = Buffer.from(buf).toString("utf8");
		if (!text.includes(params.oldText)) continue;
		const parts = text.split(params.oldText);
		const count = parts.length - 1;
		totalReplacements += count;
		changed.push({
			path: relPath,
			replacements: count
		});
		if (!dryRun) await writeFileAtomicBytes(abs, parts.join(params.newText));
	}
	return {
		ok: true,
		dryRun,
		filesChanged: changed.length,
		totalReplacements,
		files: changed.slice(0, 100)
	};
}
/** RFC-4180 CSV/TSV parser handling quoted commas and embedded newlines. */
function parseDelimitedTable(text, delimiter) {
	const rows = [];
	let row = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === "\"") if (text[i + 1] === "\"") {
				field += "\"";
				i++;
			} else inQuotes = false;
			else field += ch;
			continue;
		}
		if (ch === "\"" && field.length === 0) inQuotes = true;
		else if (ch === delimiter) {
			row.push(field);
			field = "";
		} else if (ch === "\r") {
			if (text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else if (ch === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += ch;
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}
async function readTableFile(rootDir, params, options = {}) {
	const resolved = resolveSafeWorkspacePath(rootDir, params.path);
	if (!resolved.ok) return {
		ok: false,
		error: resolved.error
	};
	let buf;
	try {
		buf = await readFile(resolved.absolutePath);
	} catch {
		return {
			ok: false,
			error: "not-found"
		};
	}
	if (isLikelyBinary(buf)) return {
		ok: false,
		error: "binary-file"
	};
	const delimiter = params.delimiter ?? (resolved.relativePath.toLowerCase().endsWith(".tsv") ? "	" : ",");
	const parsed = parseDelimitedTable(Buffer.from(buf).toString("utf8"), delimiter);
	if (parsed.length === 0) return {
		ok: true,
		path: resolved.relativePath,
		headers: [],
		totalRows: 0,
		rows: []
	};
	const headers = parsed[0];
	const wantedCols = Array.isArray(params.columns) && params.columns.length > 0 ? params.columns.filter((col) => headers.includes(col)) : headers;
	const dataRows = parsed.slice(1).map((cells) => {
		const record = {};
		for (const col of wantedCols) record[col] = cells[headers.indexOf(col)] ?? "";
		return record;
	});
	const offset = Math.max(0, Math.floor(params.offset ?? 0));
	const limit = Math.max(1, Math.min(200, Math.floor(params.limit ?? 50)));
	const sliced = dataRows.slice(offset, offset + limit);
	const maxInlineBytes = options.maxInlineBytes ?? 16384;
	if (Buffer.byteLength(JSON.stringify(sliced), "utf8") > maxInlineBytes && options.cache && options.sessionId) {
		const ref = options.cache.put({
			sessionId: options.sessionId,
			producerTool: "fast_read_table",
			items: dataRows,
			ttlMs: options.ttlMs ?? 36e5,
			preview: `${resolved.relativePath}: ${dataRows.length} rows (${wantedCols.length} cols)`
		});
		return {
			ok: true,
			path: resolved.relativePath,
			headers: wantedCols,
			totalRows: dataRows.length,
			rows: sliced.slice(0, 10),
			ref,
			spilled: true
		};
	}
	return {
		ok: true,
		path: resolved.relativePath,
		headers: wantedCols,
		totalRows: dataRows.length,
		rows: sliced,
		nextOffset: offset + sliced.length < dataRows.length ? offset + sliced.length : null,
		spilled: false
	};
}
//#endregion
//#region src/host/result-cache.ts
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
var ResultCache = class {
	entries = /* @__PURE__ */ new Map();
	totalBytes = 0;
	getMaxRefs;
	now;
	constructor(options = {}) {
		this.getMaxRefs = options.getMaxRefs ?? (() => 128);
		this.now = options.now ?? (() => Date.now());
	}
	isExpired(entry, now) {
		return entry.ref.ttlMs > 0 && now - entry.ref.createdAt > entry.ref.ttlMs;
	}
	deleteEntry(id) {
		const entry = this.entries.get(id);
		if (!entry) return false;
		this.entries.delete(id);
		this.totalBytes = Math.max(0, this.totalBytes - entry.ref.totalBytes);
		return true;
	}
	prune(now) {
		for (const [id, entry] of this.entries) if (this.isExpired(entry, now)) this.deleteEntry(id);
		const maxRefs = Math.max(1, this.getMaxRefs());
		if (this.entries.size <= maxRefs && this.totalBytes <= MAX_TOTAL_BYTES) return;
		const byAccess = Array.from(this.entries.entries()).sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
		for (const [id] of byAccess) {
			if (this.entries.size <= maxRefs && this.totalBytes <= MAX_TOTAL_BYTES) break;
			this.deleteEntry(id);
		}
	}
	put(params) {
		const now = this.now();
		const totalBytes = Buffer.byteLength(JSON.stringify(params.items), "utf8");
		const id = randomUUID().slice(0, 12);
		const refId = `ref://${params.sessionId}/${params.producerTool}/${id}`;
		const ref = {
			refId,
			createdAt: now,
			ttlMs: Math.max(0, params.ttlMs),
			producerTool: params.producerTool,
			totalItems: params.items.length,
			totalBytes,
			preview: params.preview ?? `${params.producerTool}: ${params.items.length} items (${totalBytes} bytes)`
		};
		this.entries.set(refId, {
			ref,
			sessionId: params.sessionId,
			items: params.items,
			lastAccessedAt: now
		});
		this.totalBytes += totalBytes;
		this.prune(now);
		return ref;
	}
	page(params) {
		const now = this.now();
		this.prune(now);
		const entry = this.entries.get(params.refId);
		if (!entry || entry.sessionId !== params.sessionId) return {
			ok: false,
			refId: params.refId,
			error: "reference-not-found"
		};
		entry.lastAccessedAt = now;
		let filtered = entry.items;
		if (params.equals && typeof params.equals === "object") {
			const filters = Object.entries(params.equals).slice(0, 16);
			if (filters.length > 0) filtered = filtered.filter((row) => filters.every(([k, v]) => row[k] === v));
		}
		const offset = Math.max(0, Math.floor(params.offset ?? 0));
		const limit = Math.max(1, Math.min(512, Math.floor(params.limit ?? 64)));
		const maxBytes = Math.max(512, Math.min(65536, Math.floor(params.maxBytes ?? 16384)));
		const fields = Array.isArray(params.fields) && params.fields.length > 0 ? params.fields.slice(0, 32).filter((f) => typeof f === "string" && f.length <= 128) : null;
		const pageItems = [];
		let bytesUsed = 2;
		let index = offset;
		while (index < filtered.length && pageItems.length < limit) {
			const sourceRow = filtered[index];
			const projected = fields ? Object.fromEntries(fields.filter((k) => Object.hasOwn(sourceRow, k)).map((k) => [k, sourceRow[k]])) : sourceRow;
			const itemBytes = Buffer.byteLength(JSON.stringify(projected), "utf8") + (pageItems.length > 0 ? 1 : 0);
			if (bytesUsed + itemBytes > maxBytes) {
				if (pageItems.length === 0) return {
					ok: false,
					refId: params.refId,
					error: "row-exceeds-max-bytes"
				};
				break;
			}
			pageItems.push(projected);
			bytesUsed += itemBytes;
			index++;
		}
		const complete = index >= filtered.length;
		return {
			ok: true,
			refId: params.refId,
			items: pageItems,
			totalFiltered: filtered.length,
			offset,
			nextOffset: complete ? null : index,
			complete
		};
	}
	release(sessionId, refId) {
		const entry = this.entries.get(refId);
		if (!entry || entry.sessionId !== sessionId) return false;
		return this.deleteEntry(refId);
	}
	clearSession(sessionId) {
		let removed = 0;
		for (const [id, entry] of this.entries) if (entry.sessionId === sessionId && this.deleteEntry(id)) removed++;
		return removed;
	}
	reclaimAll() {
		const count = this.entries.size;
		this.entries.clear();
		this.totalBytes = 0;
		return count;
	}
	stats() {
		this.prune(this.now());
		let totalItems = 0;
		for (const entry of this.entries.values()) totalItems += entry.items.length;
		return {
			totalRefs: this.entries.size,
			totalBytes: this.totalBytes,
			totalItems
		};
	}
};
//#endregion
//#region src/host/tool-registry.ts
const RESIDENT_TOOLS = [
	"fast_read_files",
	"fast_search",
	"fast_edit_batch",
	"fast_discover"
];
const SPECIALIZED_TOOLS = [
	"fast_stat",
	"fast_diff",
	"fast_replace",
	"fast_read_table",
	"fast_result"
];
const ALL_FAST_OPS_TOOLS = [...RESIDENT_TOOLS, ...SPECIALIZED_TOOLS];
const SPECIALIZED_CATALOG = {
	fast_stat: "Inspect file/directory metadata, size, line count, binary status, and SHA-256 revision.",
	fast_diff: "Preview unified line diff between current file and proposed content without writing.",
	fast_replace: "Batch literal replacement across glob-matched files (dryRun defaults to true).",
	fast_read_table: "Parse RFC-4180 CSV/TSV files with quoted fields, column projection, and row paging.",
	fast_result: "Page, filter (equals), project (fields), or release cached ref:// overflow results."
};
function sessionIdOf(agent) {
	return agent?.session?.id || agent?.id || "default";
}
var FastOpsController = class {
	cache;
	counters = {
		batchCalls: 0,
		filesReadInBatches: 0,
		cacheSpills: 0,
		toolsActivated: 0
	};
	activated = /* @__PURE__ */ new WeakMap();
	applied = /* @__PURE__ */ new WeakMap();
	liveAgents = /* @__PURE__ */ new Set();
	applying = false;
	ctx;
	getSettings;
	constructor(options) {
		this.ctx = options.ctx;
		this.getSettings = options.getSettings;
		this.cache = new ResultCache({ getMaxRefs: () => this.getSettings().maxCachedRefs });
	}
	resolveWorkspaceRoot(agent) {
		if (agent?.workspace?.path) return agent.workspace.path;
		if (agent?.cwd) return agent.cwd;
		const registry = getHostService(this.ctx, "workspaceRegistry");
		try {
			const first = registry?.list?.()[0];
			if (first?.path) return first.path;
		} catch {}
		return process.cwd();
	}
	activatedSetFor(agent) {
		if (!agent || typeof agent !== "object") return /* @__PURE__ */ new Set();
		let set = this.activated.get(agent);
		if (!set) {
			set = /* @__PURE__ */ new Set();
			this.activated.set(agent, set);
		}
		return set;
	}
	denyListFor(agent) {
		const settings = this.getSettings();
		if (!settings.enabled) return [...ALL_FAST_OPS_TOOLS];
		if (!settings.lazySpecializedTools) return ["fast_discover"];
		const revealed = this.activatedSetFor(agent);
		return SPECIALIZED_TOOLS.filter((name) => !revealed.has(name));
	}
	releaseAgent(agent) {
		if (!agent || typeof agent !== "object") return;
		const prev = this.applied.get(agent);
		if (!prev) return;
		this.applied.delete(agent);
		try {
			prev.dispose();
		} catch {}
	}
	applyToAgent(agent) {
		if (this.applying || !agent || typeof agent !== "object") return;
		this.liveAgents.add(agent);
		this.applying = true;
		try {
			const scoped = agent.ctx?.get?.("tools") ?? agent.ctx?.tools;
			if (typeof scoped?.restrict !== "function") return;
			let deny = this.denyListFor(agent);
			if (typeof scoped.view === "function") {
				const known = scoped.view(agent)?.restrictableNames;
				if (known) deny = deny.filter((name) => known.has(name));
			}
			const key = deny.slice().sort().join(",");
			const prev = this.applied.get(agent);
			if (prev && prev.key === key) return;
			this.releaseAgent(agent);
			if (deny.length === 0) return;
			this.applied.set(agent, {
				key,
				dispose: scoped.restrict({ deny })
			});
		} finally {
			this.applying = false;
		}
	}
	reapply(agent) {
		if (agent !== void 0) {
			this.applyToAgent(agent);
			return;
		}
		for (const live of this.liveAgents) this.applyToAgent(live);
	}
	mount() {
		const disposers = [];
		const ctxAny = this.ctx;
		if (typeof ctxAny.on === "function") {
			disposers.push(ctxAny.on("agent/created", (payload) => {
				this.applyToAgent(payload?.agent);
			}));
			disposers.push(ctxAny.on("agent/disposed", (payload) => {
				this.releaseAgent(payload?.agent);
				if (payload?.agent) this.liveAgents.delete(payload.agent);
			}));
			disposers.push(ctxAny.on("agent/pre-step", async (payload, next) => {
				try {
					this.applyToAgent(payload?.agent);
				} catch {}
				return typeof next === "function" ? next() : void 0;
			}));
			disposers.push(ctxAny.on("tools/change", () => {
				this.reapply();
			}));
		}
		const mountPrompt = (systemPrompt) => {
			if (!systemPrompt.section) return;
			const stopPrompt = systemPrompt.section({
				name: "dsh:fast-ops",
				order: 45,
				text: () => {
					const settings = this.getSettings();
					if (!settings.enabled || !settings.batchingGuidance) return "";
					return [
						"## Fast Ops Token-Efficiency Tips",
						"- Prefer `fast_read_files` to inspect multiple files/ranges in a single turn and obtain SHA-256 `revision` tokens.",
						"- Prefer `fast_search` for workspace glob/grep and `fast_edit_batch` for multi-hunk atomic edits; call `fast_discover` only when specialized tools (`fast_stat`, `fast_diff`, `fast_replace`, `fast_read_table`, `fast_result`) are needed."
					].join("\n");
				}
			});
			if (typeof stopPrompt === "function") disposers.push(stopPrompt);
		};
		const existingPrompt = getHostService(this.ctx, "systemPrompt");
		if (existingPrompt) mountPrompt(existingPrompt);
		else if (typeof this.ctx.inject === "function") try {
			const stopInject = this.ctx.inject(["systemPrompt"], (scoped) => {
				if (scoped?.systemPrompt) mountPrompt(scoped.systemPrompt);
			});
			if (typeof stopInject === "function") disposers.push(stopInject);
			else if (stopInject && typeof stopInject.dispose === "function") disposers.push(() => stopInject.dispose?.());
		} catch {}
		const mountTools = (tools) => {
			if (!tools.register) return;
			const reg = (spec) => {
				const stop = tools.register({
					...spec,
					output: {
						schema: {
							type: "object",
							additionalProperties: true
						},
						render: (_args, value) => [{
							type: "text",
							text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
						}]
					}
				});
				if (typeof stop === "function") disposers.push(stop);
			};
			reg({
				name: "fast_read_files",
				description: "Read 1-32 UTF-8 workspace file line ranges in one call, returning per-file SHA-256 revision and content (or ref:// cache handle when oversized).",
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["files"],
					properties: { files: {
						type: "array",
						items: {
							type: "object",
							additionalProperties: false,
							required: ["path"],
							properties: {
								path: { type: "string" },
								offset: {
									type: "integer",
									description: "1-based start line; default 1."
								},
								limit: {
									type: "integer",
									description: "1-2000 lines; default 200."
								}
							}
						}
					} }
				},
				execute: async (args, exec) => {
					this.counters.batchCalls++;
					const files = Array.isArray(args?.files) ? args.files : [];
					this.counters.filesReadInBatches += files.length;
					const settings = this.getSettings();
					const result = await readFilesBatch(this.resolveWorkspaceRoot(exec?.agent), files, {
						sessionId: sessionIdOf(exec?.agent),
						maxInlineBytes: settings.maxInlineBytes,
						ttlMs: settings.resultCacheTtlMs,
						cache: this.cache
					});
					if (result.spilled) this.counters.cacheSpills++;
					return result;
				}
			});
			reg({
				name: "fast_search",
				description: "Unified workspace file glob and regex/literal grep skipping .git/node_modules/build outputs.",
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["mode"],
					properties: {
						mode: {
							type: "string",
							enum: ["glob", "grep"]
						},
						path: {
							type: "string",
							description: "Relative workspace directory; default \".\"."
						},
						include: {
							type: "array",
							items: { type: "string" }
						},
						pattern: {
							type: "string",
							description: "Required for grep."
						},
						literal: { type: "boolean" },
						caseSensitive: { type: "boolean" },
						includeHidden: { type: "boolean" },
						offset: { type: "integer" },
						limit: { type: "integer" }
					}
				},
				execute: async (args, exec) => {
					this.counters.batchCalls++;
					const settings = this.getSettings();
					const res = await searchWorkspace(this.resolveWorkspaceRoot(exec?.agent), args, {
						sessionId: sessionIdOf(exec?.agent),
						maxInlineBytes: settings.maxInlineBytes,
						ttlMs: settings.resultCacheTtlMs,
						cache: this.cache
					});
					if ("spilled" in res && res.spilled) this.counters.cacheSpills++;
					return res;
				}
			});
			reg({
				name: "fast_edit_batch",
				description: "Apply 1-100 non-overlapping unique text replacements atomically with required SHA-256 expectedRevision CAS check.",
				parameters: {
					type: "object",
					additionalProperties: false,
					required: [
						"path",
						"expectedRevision",
						"edits"
					],
					properties: {
						path: { type: "string" },
						expectedRevision: {
							type: "string",
							description: "64-hex SHA-256 revision from fast_read_files or fast_stat."
						},
						dryRun: {
							type: "boolean",
							description: "Preview diff without writing; default false."
						},
						edits: {
							type: "array",
							items: {
								type: "object",
								additionalProperties: false,
								required: ["oldText", "newText"],
								properties: {
									oldText: { type: "string" },
									newText: { type: "string" }
								}
							}
						}
					}
				},
				execute: (args, exec) => {
					this.counters.batchCalls++;
					return editFilesBatch(this.resolveWorkspaceRoot(exec?.agent), args);
				}
			});
			reg({
				name: "fast_discover",
				description: "Activate specialized Fast Ops tools (fast_stat, fast_diff, fast_replace, fast_read_table, fast_result) on demand by keyword or select:<tool>.",
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["query"],
					properties: { query: {
						type: "string",
						description: "Keyword or select:<tool_name> (or \"all\")."
					} }
				},
				execute: (args, exec) => {
					const query = String(args?.query ?? "").trim().toLowerCase();
					const set = this.activatedSetFor(exec?.agent);
					const matched = [];
					for (const name of SPECIALIZED_TOOLS) {
						const desc = SPECIALIZED_CATALOG[name].toLowerCase();
						if (query === `select:${name}` || query === name || query === "all" || query === "*" || query.length > 0 && (name.includes(query) || desc.includes(query))) {
							if (!set.has(name)) {
								set.add(name);
								this.counters.toolsActivated++;
							}
							matched.push(name);
						}
					}
					this.reapply(exec?.agent);
					return {
						activated: matched,
						catalog: matched.map((name) => ({
							name,
							description: SPECIALIZED_CATALOG[name]
						})),
						note: matched.length > 0 ? "Activated for the next step in this session." : `No match. Available: ${SPECIALIZED_TOOLS.join(", ")}`
					};
				}
			});
			reg({
				name: "fast_stat",
				description: SPECIALIZED_CATALOG.fast_stat,
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["path"],
					properties: { path: { type: "string" } }
				},
				execute: (args, exec) => statFile(this.resolveWorkspaceRoot(exec?.agent), String(args?.path ?? ""))
			});
			reg({
				name: "fast_diff",
				description: SPECIALIZED_CATALOG.fast_diff,
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["path", "content"],
					properties: {
						path: { type: "string" },
						content: { type: "string" }
					}
				},
				execute: (args, exec) => diffPreview(this.resolveWorkspaceRoot(exec?.agent), String(args?.path ?? ""), String(args?.content ?? ""))
			});
			reg({
				name: "fast_replace",
				description: SPECIALIZED_CATALOG.fast_replace,
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["oldText", "newText"],
					properties: {
						oldText: { type: "string" },
						newText: { type: "string" },
						path: { type: "string" },
						include: {
							type: "array",
							items: { type: "string" }
						},
						dryRun: {
							type: "boolean",
							description: "Preview without modifying files; default true."
						}
					}
				},
				execute: (args, exec) => replaceAcrossFiles(this.resolveWorkspaceRoot(exec?.agent), args)
			});
			reg({
				name: "fast_read_table",
				description: SPECIALIZED_CATALOG.fast_read_table,
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["path"],
					properties: {
						path: { type: "string" },
						delimiter: {
							type: "string",
							enum: [",", "	"]
						},
						offset: { type: "integer" },
						limit: { type: "integer" },
						columns: {
							type: "array",
							items: { type: "string" }
						}
					}
				},
				execute: async (args, exec) => {
					const settings = this.getSettings();
					const res = await readTableFile(this.resolveWorkspaceRoot(exec?.agent), args, {
						sessionId: sessionIdOf(exec?.agent),
						maxInlineBytes: settings.maxInlineBytes,
						ttlMs: settings.resultCacheTtlMs,
						cache: this.cache
					});
					if ("spilled" in res && res.spilled) this.counters.cacheSpills++;
					return res;
				}
			});
			reg({
				name: "fast_result",
				description: SPECIALIZED_CATALOG.fast_result,
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["action", "refId"],
					properties: {
						action: {
							type: "string",
							enum: ["page", "release"]
						},
						refId: { type: "string" },
						offset: { type: "integer" },
						limit: { type: "integer" },
						maxBytes: { type: "integer" },
						fields: {
							type: "array",
							items: { type: "string" }
						},
						equals: { type: "object" }
					}
				},
				execute: (args, exec) => {
					const sessionId = sessionIdOf(exec?.agent);
					const refId = String(args?.refId ?? "");
					if (args?.action === "release") return {
						ok: true,
						released: this.cache.release(sessionId, refId)
					};
					return this.cache.page({
						sessionId,
						refId,
						offset: typeof args?.offset === "number" ? args.offset : void 0,
						limit: typeof args?.limit === "number" ? args.limit : void 0,
						maxBytes: typeof args?.maxBytes === "number" ? args.maxBytes : void 0,
						fields: Array.isArray(args?.fields) ? args.fields : void 0,
						equals: args?.equals && typeof args.equals === "object" ? args.equals : void 0
					});
				}
			});
		};
		const existingTools = getHostService(this.ctx, "tools");
		if (existingTools) mountTools(existingTools);
		else if (typeof this.ctx.inject === "function") try {
			const stopInject = this.ctx.inject(["tools"], (scoped) => {
				if (scoped?.tools) mountTools(scoped.tools);
			});
			if (typeof stopInject === "function") disposers.push(stopInject);
			else if (stopInject && typeof stopInject.dispose === "function") disposers.push(() => stopInject.dispose?.());
		} catch {}
		return () => {
			for (const agent of this.liveAgents) this.releaseAgent(agent);
			this.liveAgents.clear();
			this.cache.reclaimAll();
			for (const dispose of disposers) try {
				dispose();
			} catch {}
		};
	}
};
//#endregion
//#region src/index.ts
function sendJson(response, status, body) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(body));
}
async function readJsonBody(request) {
	const chunks = [];
	let total = 0;
	if (Symbol.asyncIterator in request && typeof request[Symbol.asyncIterator] === "function") for await (const chunk of request) {
		const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
		total += buf.byteLength;
		if (total > 64 * 1024) throw new Error("request body too large");
		chunks.push(buf);
	}
	const text = Buffer.concat(chunks).toString("utf8").trim();
	return text === "" ? {} : JSON.parse(text);
}
function isAuthorizedRequest(ctx, request, peer) {
	const addr = request.socket?.remoteAddress;
	if (addr !== void 0 && ![
		"127.0.0.1",
		"::1",
		"::ffff:127.0.0.1"
	].includes(addr)) return false;
	if (request.headers["x-dsh-fast-ops"] !== "1") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	if (peer?.principal?.kind !== void 0 && peer.principal.kind !== "owner") return false;
	const userScope = getHostService(ctx, "userScope");
	if (userScope?.currentScope) {
		const current = userScope.currentScope();
		const scope = userScope.desktopScope?.();
		if (current?.source !== void 0 && current.source !== "desktop") return false;
		if (current !== void 0 && scope !== void 0 && current.principalId !== scope.principalId) return false;
	}
	return true;
}
function apply(ctx) {
	const home = resolveDshHome();
	let cachedSettings = defaultSettings();
	const controller = new FastOpsController({
		ctx,
		getSettings: () => cachedSettings
	});
	readSettings(home).then((loaded) => {
		cachedSettings = loaded;
		controller.reapply();
	}).catch(() => {});
	const handleRequest = async (request, response, peer) => {
		if (!isAuthorizedRequest(ctx, request, peer)) {
			sendJson(response, 403, { error: "forbidden" });
			return;
		}
		const url = new URL(request.url ?? "/", "http://localhost");
		const method = (request.method ?? "GET").toUpperCase();
		try {
			if (method === "GET" && url.pathname === `/api/dsh-fast-ops/state`) {
				sendJson(response, 200, {
					settings: cachedSettings,
					counters: controller.counters,
					cache: controller.cache.stats()
				});
				return;
			}
			if (method === "GET" && url.pathname === `/api/dsh-fast-ops/settings`) {
				cachedSettings = await readSettings(home);
				sendJson(response, 200, { settings: cachedSettings });
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-fast-ops/settings`) {
				const saved = await writeSettingsAtomic(await readJsonBody(request), home);
				cachedSettings = saved.settings;
				controller.reapply();
				sendJson(response, 200, saved);
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-fast-ops/cache/reclaim`) {
				sendJson(response, 200, {
					reclaimed: controller.cache.reclaimAll(),
					cache: controller.cache.stats()
				});
				return;
			}
			sendJson(response, 404, { error: "not-found" });
		} catch (error) {
			sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
		}
	};
	ctx.effect(() => controller.mount());
	const mountWebServer = (webServer) => {
		if (typeof webServer.register === "function") return webServer.register({
			path: "/api/dsh-fast-ops",
			kind: "prefix",
			handler: handleRequest
		}) ?? (() => {});
		const stops = [
			["GET", `${ROUTE_PREFIX}/state`],
			["GET", `${ROUTE_PREFIX}/settings`],
			["POST", `${ROUTE_PREFIX}/settings`],
			["POST", `${ROUTE_PREFIX}/cache/reclaim`]
		].map(([method, path]) => webServer.route?.(method, path, handleRequest)).filter((d) => typeof d === "function");
		return () => {
			for (const stop of stops) stop();
		};
	};
	const existingWebServer = getHostService(ctx, "webServer");
	if (existingWebServer) ctx.effect(() => mountWebServer(existingWebServer));
	else if (typeof ctx.inject === "function") ctx.inject(["webServer"], (scoped) => {
		const ws = scoped?.webServer ?? getHostService(ctx, "webServer");
		if (!ws) return;
		return mountWebServer(ws);
	});
}
//#endregion
export { ALL_FAST_OPS_TOOLS, FastOpsController, INLINE_BYTE_OPTIONS, PACKAGE_ID, RESIDENT_TOOLS, ROUTE_PREFIX, ResultCache, SETTINGS_FILE, SPECIALIZED_TOOLS, TTL_MS_OPTIONS, apply, buildCompactDiff, defaultSettings, diffPreview, editFilesBatch, normalizeSettings, parseDelimitedTable, readFilesBatch, readSettings, readTableFile, replaceAcrossFiles, resolveDshHome, resolveSafeWorkspacePath, searchWorkspace, sha256Hex, statFile, writeSettingsAtomic };
