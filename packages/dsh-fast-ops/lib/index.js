import { createRequire } from "node:module";
import { access, chmod, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, delimiter, dirname, extname, isAbsolute, join, matchesGlob, normalize, relative, resolve, sep } from "node:path";
import { execFile } from "node:child_process";
import { constants, existsSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ignore from "ignore";
import { createHash, randomUUID } from "node:crypto";
import { promisify, stripVTControlCharacters } from "node:util";
//#region src/core/get-host-service.ts
/** Read the current scoped service or its directly exposed context property. */
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
		maxCachedRefs: 128,
		denoise: {
			enabled: true,
			git: true,
			test: true,
			build: true
		}
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
	if (raw.denoise !== void 0) if (raw.denoise === null || typeof raw.denoise !== "object" || Array.isArray(raw.denoise)) problems.push("denoise");
	else {
		const values = raw.denoise;
		for (const key of [
			"enabled",
			"git",
			"test",
			"build"
		]) if (typeof values[key] === "boolean") settings.denoise[key] = values[key];
		else if (values[key] !== void 0) problems.push(`denoise.${key}`);
	}
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
//#region src/host/code-files.ts
const OMIT_DIRECTORIES = /* @__PURE__ */ new Set([
	".git",
	".hg",
	".svn",
	".pnpm-store",
	"node_modules",
	".venv",
	"dist",
	"lib",
	".next",
	"target",
	"coverage"
]);
const MAX_CODE_BYTES = 1024 * 1024;
const MAX_SCAN_ENTRIES = 2e4;
const MAX_SCAN_DEPTH = 32;
function protectedPath(path) {
	return path.split("/").some((segment) => {
		const name = segment.toLowerCase();
		return OMIT_DIRECTORIES.has(name) || process.platform === "win32" && name.includes(":") || /^(?:\.env(?:\.|$)|\.npmrc$|\.netrc$|\.pypirc$|\.git-credentials$|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$))/u.test(name) || /\.(?:pem|key|pfx|p12|jks|kdbx)$/u.test(name) || /^(?:credentials|secrets|service[-_]account)(?:[._-]|$)/u.test(name);
	});
}
async function ignoreScope(root, path) {
	const name = path === "." ? ".gitignore" : `${path}/.gitignore`;
	const prefix = path === "." ? "" : `${path}/`;
	const matcher = ignore({ ignorecase: process.platform === "win32" });
	try {
		if (!(await lstat(join(root, name))).isFile()) return void 0;
		const file = await readWorkspaceCodeFile(root, name, 65536);
		if (file) return {
			prefix,
			matcher: matcher.add(file.text)
		};
	} catch (error) {
		if (error.code === "ENOENT") return void 0;
	}
	return {
		prefix,
		matcher: matcher.add("*")
	};
}
function isIgnored(path, scopes) {
	let ignored = false;
	for (const { prefix, matcher } of scopes) {
		if (!path.startsWith(prefix)) continue;
		const status = matcher.test(path.slice(prefix.length));
		if (status.ignored || status.unignored) ignored = status.ignored;
	}
	return ignored;
}
async function selectCodeFiles(root, selection, maxFiles, signal) {
	const input = selection.path ?? ".";
	const globs = selection.include ?? [];
	const isGlob = /[*?[\]{}]/u.test(input);
	const base = resolveSafeWorkspacePath(root, isGlob ? "." : input);
	if (!base.ok) return {
		paths: [],
		bounded: false,
		error: base.error
	};
	if (protectedPath(base.relativePath)) return {
		paths: [],
		bounded: false,
		error: "protected-path"
	};
	if (globs.some((glob) => typeof glob !== "string" || glob.length > 200) || input.length > 512 || globs.length > 32) return {
		paths: [],
		bounded: false,
		error: "invalid-glob"
	};
	const patterns = globs.map((glob) => glob.replaceAll("\\", "/").replace(/^\.\//u, ""));
	const positives = patterns.filter((glob) => !glob.startsWith("!"));
	const negatives = patterns.filter((glob) => glob.startsWith("!")).map((glob) => glob.slice(1));
	const includes = (path) => (!isGlob || matchesGlob(path, input)) && (positives.length === 0 || positives.some((glob) => matchesGlob(path, glob))) && !negatives.some((glob) => matchesGlob(path, glob));
	const paths = [];
	const scopes = [];
	let visited = 0;
	let bounded = false;
	async function walk(path, parents, depth) {
		signal?.throwIfAborted();
		if (depth > MAX_SCAN_DEPTH) {
			bounded = true;
			return;
		}
		const local = await ignoreScope(root, path);
		const rules = local ? [...parents, local] : parents;
		const children = await readdir(join(root, path), { withFileTypes: true }).catch(() => []);
		children.sort((a, b) => a.name.localeCompare(b.name));
		for (const child of children) {
			if (++visited > MAX_SCAN_ENTRIES || paths.length >= maxFiles) {
				bounded = true;
				return;
			}
			const relative = path === "." ? child.name : `${path}/${child.name}`;
			if (child.isSymbolicLink() || protectedPath(relative) || child.name === ".gitignore") continue;
			const directory = child.isDirectory();
			if (isIgnored(directory ? `${relative}/` : relative, rules)) continue;
			if (directory) await walk(relative, rules, depth + 1);
			else if (child.isFile() && includes(relative)) paths.push(relative);
		}
	}
	const entry = await lstat(base.absolutePath).catch(() => void 0);
	if (!entry || entry.isSymbolicLink()) return {
		paths,
		bounded,
		error: "not-found"
	};
	const pieces = base.relativePath === "." ? [] : base.relativePath.split("/");
	for (let i = 0; i < pieces.length; i++) {
		const local = await ignoreScope(root, pieces.slice(0, i).join("/") || ".");
		if (local) scopes.push(local);
		const path = pieces.slice(0, i + 1).join("/");
		if (isIgnored(i < pieces.length - 1 || entry.isDirectory() ? `${path}/` : path, scopes)) return {
			paths,
			bounded,
			error: "ignored-path"
		};
	}
	if (entry.isFile() && includes(base.relativePath)) paths.push(base.relativePath);
	if (entry.isDirectory()) await walk(base.relativePath, scopes, pieces.length);
	return {
		paths,
		bounded
	};
}
async function readWorkspaceCodeFile(root, path, maxBytes = MAX_CODE_BYTES) {
	const resolved = resolveSafeWorkspacePath(root, path);
	if (!resolved.ok) return void 0;
	const file = await lstat(resolved.absolutePath).catch(() => void 0);
	if (!file?.isFile() || file.size > maxBytes) return void 0;
	const handle = await open(resolved.absolutePath, constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW)).catch(() => void 0);
	if (!handle) return void 0;
	try {
		const current = await handle.stat();
		if (!current.isFile() || current.dev !== file.dev || current.ino !== file.ino || current.size > maxBytes) return void 0;
		const buf = Buffer.allocUnsafe(current.size + 1);
		let length = 0;
		while (length < buf.length) {
			const { bytesRead } = await handle.read(buf, length, buf.length - length, length);
			if (!bytesRead) break;
			length += bytesRead;
		}
		if (length !== current.size) return void 0;
		const bytes = buf.subarray(0, length);
		if (isLikelyBinary(bytes)) return void 0;
		return {
			path: resolved.relativePath,
			absolutePath: resolved.absolutePath,
			revision: sha256Hex(bytes),
			mode: current.mode & 511,
			text: new TextDecoder("utf-8", {
				fatal: true,
				ignoreBOM: true
			}).decode(bytes)
		};
	} catch {
		return;
	} finally {
		await handle.close();
	}
}
//#endregion
//#region src/host/ast-outline.ts
const LANGUAGES = {
	".ts": "TypeScript",
	".mts": "TypeScript",
	".cts": "TypeScript",
	".tsx": "Tsx",
	".js": "JavaScript",
	".mjs": "JavaScript",
	".cjs": "JavaScript",
	".jsx": "Tsx",
	".html": "Html",
	".htm": "Html",
	".css": "Css",
	".c": "c",
	".h": "c",
	".cc": "cpp",
	".cxx": "cpp",
	".cpp": "cpp",
	".hpp": "cpp",
	".hh": "cpp",
	".cs": "csharp",
	".go": "go",
	".java": "java",
	".json": "json",
	".py": "python",
	".rs": "rust"
};
function languageFor(path) {
	return LANGUAGES[extname(path).toLowerCase()];
}
const BUILTIN_LANGUAGES = /* @__PURE__ */ new Set([
	"TypeScript",
	"Tsx",
	"JavaScript",
	"Html",
	"Css"
]);
const GRAMMARS = {
	c: "@ast-grep/lang-c",
	cpp: "@ast-grep/lang-cpp",
	csharp: "@ast-grep/lang-csharp",
	go: "@ast-grep/lang-go",
	java: "@ast-grep/lang-java",
	json: "@ast-grep/lang-json",
	python: "@ast-grep/lang-python",
	rust: "@ast-grep/lang-rust"
};
let nativeCore;
let nativeApi;
function loadNativeCore() {
	nativeCore ??= import("@ast-grep/napi").catch(() => void 0);
	return nativeCore;
}
async function isNativeAstAvailable() {
	return await loadNativeCore() !== void 0;
}
function preflightDynamicRegistration(registrations) {
	const entry = pathToFileURL(createRequire(import.meta.url).resolve("@ast-grep/napi")).href;
	const script = ["const napi = await import(process.argv[1])", "napi.registerDynamicLanguage(JSON.parse(process.argv[2]))"].join("\n");
	const env = {
		...process.env,
		...process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}
	};
	delete env.NODE_OPTIONS;
	return new Promise((resolve) => {
		execFile(process.execPath, [
			"--input-type=module",
			"-e",
			script,
			entry,
			JSON.stringify(registrations)
		], {
			cwd: tmpdir(),
			env,
			windowsHide: true,
			timeout: 3e3,
			maxBuffer: 32 * 1024
		}, (error) => resolve(error === null));
	});
}
function loadSyntaxApi() {
	nativeApi ??= loadNativeCore().then(async (api) => {
		if (!api) return void 0;
		const results = await Promise.allSettled(Object.entries(GRAMMARS).map(async ([language, pkg]) => {
			const { default: registration } = await import(pkg);
			const libraryPath = registration.libraryPath.replace(/(^|[\\/])([^\\/]+\.asar)(?=[\\/])/u, "$1$2.unpacked");
			if (!existsSync(libraryPath)) return void 0;
			return [language, {
				...registration,
				libraryPath
			}];
		}));
		const registrations = Object.fromEntries(results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []));
		let dynamicEnabled = false;
		if (Object.keys(registrations).length > 0 && await preflightDynamicRegistration(registrations).catch(() => false)) try {
			api.registerDynamicLanguage(registrations);
			dynamicEnabled = true;
		} catch {}
		return {
			parse: api.parse,
			supports: (language) => BUILTIN_LANGUAGES.has(language) || dynamicEnabled && Object.hasOwn(registrations, language)
		};
	});
	return nativeApi;
}
const DECLARATIONS = /* @__PURE__ */ new Map([
	["abstract_class_declaration", "class"],
	["class_declaration", "class"],
	["interface_declaration", "interface"],
	["type_alias_declaration", "type"],
	["function_declaration", "function"],
	["generator_function_declaration", "function"],
	["function_signature", "function"],
	["function_definition", "function"],
	["function_item", "function"],
	["method_declaration", "method"],
	["method_definition", "method"],
	["method_signature", "method"],
	["abstract_method_signature", "method"],
	["enum_declaration", "enum"],
	["internal_module", "namespace"],
	["namespace_definition", "namespace"],
	["namespace_declaration", "namespace"],
	["struct_item", "struct"],
	["struct_specifier", "struct"],
	["type_spec", "type"],
	["record_declaration", "record"],
	["class_specifier", "class"],
	["trait_item", "interface"],
	["variable_declarator", "variable"],
	["const_item", "variable"],
	["property_signature", "property"],
	["public_field_definition", "property"],
	["element", "element"],
	["self_closing_tag", "element"],
	["rule_set", "selector"],
	["pair", "key"]
]);
function compactSignature(text) {
	const concise = text.replace(/\s+/gu, " ").trim();
	return concise.length <= 240 ? concise : concise.slice(0, 237).replace(/[\uD800-\uDBFF]$/u, "") + "...";
}
function getNativeSymbols(root, source, max) {
	const symbols = [];
	function visit(node, level) {
		if (symbols.length >= max || level > 12) return;
		const kind = DECLARATIONS.get(node.kind());
		if (!kind) {
			if ([
				"program",
				"document",
				"module",
				"source_file",
				"translation_unit",
				"compilation_unit",
				"object",
				"stylesheet",
				"export_statement",
				"lexical_declaration",
				"variable_declaration",
				"declaration_list",
				"decorated_definition",
				"type_declaration",
				"const_declaration",
				"impl_item"
			].includes(node.kind())) for (const child of node.children()) visit(child, level);
			return;
		}
		const tag = kind === "element" ? node.kind() === "self_closing_tag" ? node : node.children().find((child) => ["start_tag", "self_closing_tag"].includes(child.kind())) : void 0;
		let name = node.field("name") ?? (kind === "key" ? node.field("key") : void 0) ?? tag?.children().find((child) => child.kind() === "tag_name") ?? (kind === "selector" ? node.children().find((child) => child.kind() === "selectors") : void 0);
		let declarator = node.field("declarator");
		for (let i = 0; !name && declarator && i < 8; i++) if ([
			"identifier",
			"field_identifier",
			"qualified_identifier"
		].includes(declarator.kind())) name = declarator;
		else declarator = declarator.field("declarator");
		if (!name) return;
		const range = node.range();
		const parent = node.parent();
		const declaration = kind === "variable" && parent ? parent : node;
		const exported = declaration.parent()?.kind() === "export_statement";
		const body = node.field("body") ?? (kind === "selector" ? node.children().find((child) => child.kind() === "block") : void 0);
		const value = [
			"variable",
			"property",
			"type",
			"key"
		].includes(kind) ? node.field("value") : null;
		const endIndex = body?.range().start.index ?? value?.range().start.index ?? range.end.index;
		let header = kind === "key" ? name.text() : tag ? `<${name.text()}>` : source.slice(range.start.index, endIndex).replace(/\s*=\s*$/u, "");
		if (value && ["arrow_function", "function_expression"].includes(value.kind())) {
			const start = value.range().start.index;
			const body = value.field("body");
			if (body) header += ` = ${source.slice(start, body.range().start.index).trimEnd()}`;
		}
		if (node.kind() === "variable_declarator") {
			const declarationKind = declaration.children()[0]?.text();
			header = `${declarationKind === "let" || declarationKind === "var" ? declarationKind : "const"} ${header}`;
		}
		const visibility = /^\s*(private|protected|public)\s/u.exec(header)?.[1];
		symbols.push({
			name: name.text().slice(0, 120),
			kind,
			signature: compactSignature(exported ? `export ${header}` : header),
			visibility: exported ? "exported" : name.text().startsWith("#") || visibility === "private" ? "private" : visibility === "protected" ? "protected" : visibility === "public" || level > 0 ? "public" : "local",
			startLine: range.start.line + 1,
			endLine: range.end.line + 1,
			level
		});
		if (body && [
			"class",
			"interface",
			"namespace",
			"struct",
			"record"
		].includes(kind)) for (const child of body.children()) visit(child, level + 1);
		if (kind === "element" && tag?.kind() === "start_tag") for (const child of node.children()) visit(child, level + 1);
		if (kind === "key" && value?.kind() === "object") for (const child of value.children()) visit(child, level + 1);
	}
	visit(root, 0);
	return symbols;
}
function getTextSymbols(text, max) {
	const symbols = [];
	const lines = text.split(/\r?\n/u);
	const declaration = /^(\s*)(?:(export|public|private|protected)\s+)?(?:default\s+)?(?:abstract\s+|async\s+)?(class|interface|enum|struct|record|namespace|type|trait|impl|function|def|func|fn|const|let|var)\s+([$A-Za-z_][\w$]*)/u;
	for (let line = 0; line < lines.length && symbols.length < max; line++) {
		const match = declaration.exec(lines[line]);
		if (!match) continue;
		const [, indent, modifier, kind, name] = match;
		let signature = lines[line].split("{", 1)[0];
		if ([
			"const",
			"let",
			"var"
		].includes(kind)) signature = signature.split("=", 1)[0];
		symbols.push({
			name,
			kind,
			signature: compactSignature(signature),
			visibility: modifier === "export" ? "exported" : modifier === "public" || modifier === "private" || modifier === "protected" ? modifier : "local",
			startLine: line + 1,
			endLine: line + 1,
			level: Math.min(12, Math.floor(indent.replaceAll("	", "  ").length / 2))
		});
	}
	return symbols;
}
function outlineSource(path, text, api, max) {
	const language = languageFor(path);
	if (api && language && api.supports(language)) try {
		return {
			parser: "ast",
			symbols: getNativeSymbols(api.parse(language, text).root(), text, max)
		};
	} catch {}
	return {
		parser: "fallback",
		symbols: getTextSymbols(text, max)
	};
}
async function outlineWorkspace(root, params, signal) {
	const { paths, bounded, error } = await selectCodeFiles(root, params, 40, signal);
	if (error) return {
		ok: false,
		error
	};
	const api = await loadSyntaxApi();
	let remaining = Math.max(1, Math.min(200, params.maxSymbols ?? 120));
	const files = [];
	for (const path of paths) {
		signal?.throwIfAborted();
		const file = await readWorkspaceCodeFile(root, path);
		if (!file) continue;
		const outline = outlineSource(path, file.text, api, remaining);
		files.push({
			path,
			revision: file.revision,
			...outline
		});
		remaining -= outline.symbols.length;
		if (remaining <= 0) break;
	}
	return {
		ok: true,
		files,
		bounded: bounded || remaining <= 0
	};
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
			principalId: options.principalId,
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
const MAX_CONTEXT_LINES_AROUND_MATCH = 5;
const MAX_CONTEXT_BLOCK_LINES = 16;
const MAX_CONTEXT_LINE_LENGTH = 240;
function collectSearchContext(path, revision, lines, matchLines, radius) {
	const ranges = [];
	for (const line of matchLines) {
		const start = Math.max(1, line - radius);
		const end = Math.min(lines.length, line + radius);
		const previous = ranges.at(-1);
		if (previous && start <= previous.end + 1) {
			previous.end = Math.max(previous.end, end);
			previous.hits.push(line);
		} else ranges.push({
			start,
			end,
			hits: [line]
		});
	}
	const context = [];
	for (const range of ranges) for (let startLine = range.start; startLine <= range.end; startLine += MAX_CONTEXT_BLOCK_LINES) {
		const endLine = Math.min(range.end, startLine + MAX_CONTEXT_BLOCK_LINES - 1);
		const original = lines.slice(startLine - 1, endLine);
		let truncated = false;
		const excerpt = original.map((line) => {
			if (line.length <= MAX_CONTEXT_LINE_LENGTH) return line;
			truncated = true;
			return line.slice(0, MAX_CONTEXT_LINE_LENGTH).replace(/[\uD800-\uDBFF]$/u, "") + "…";
		});
		context.push({
			path,
			revision,
			startLine,
			endLine,
			matchLines: range.hits.filter((line) => line >= startLine && line <= endLine),
			lines: excerpt,
			truncated
		});
	}
	return context;
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
	const context = [];
	const requestedContext = params.contextLines ?? 0;
	const radius = Number.isFinite(requestedContext) ? Math.max(0, Math.min(MAX_CONTEXT_LINES_AROUND_MATCH, Math.floor(requestedContext))) : 0;
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
		const pagedMatchLines = [];
		for (let idx = 0; idx < lines.length; idx++) {
			if (!regex.test(lines[idx])) continue;
			matchedFiles.add(relPath);
			if (radius > 0 && matches.length >= offset && matches.length < offset + limit) pagedMatchLines.push(idx + 1);
			const snippet = lines[idx].length > 240 ? `${lines[idx].slice(0, 240)}...` : lines[idx];
			matches.push({
				path: relPath,
				line: idx + 1,
				text: snippet
			});
			if (matches.length >= maxCollected) break;
		}
		if (pagedMatchLines.length > 0) context.push(...collectSearchContext(relPath, sha256Hex(buf), lines, pagedMatchLines, radius));
	}
	const paged = matches.slice(offset, offset + limit);
	const serializedBytes = Buffer.byteLength(JSON.stringify(paged), "utf8");
	const maxInlineBytes = options.maxInlineBytes ?? 16384;
	const contextRef = context.length > 0 && options.cache && options.sessionId && serializedBytes + Buffer.byteLength(JSON.stringify(context), "utf8") > maxInlineBytes ? options.cache.put({
		sessionId: options.sessionId,
		principalId: options.principalId,
		producerTool: "fast_search",
		items: context,
		ttlMs: options.ttlMs ?? 36e5,
		preview: `fast_search: ${context.length} context excerpts for the requested match page`
	}) : void 0;
	const contextOutput = radius === 0 ? {} : contextRef ? { contextRef } : { context };
	if (serializedBytes > maxInlineBytes && options.cache && options.sessionId) {
		const ref = options.cache.put({
			sessionId: options.sessionId,
			principalId: options.principalId,
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
			...contextOutput,
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
		...contextOutput,
		spilled: contextRef !== void 0
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
			principalId: options.principalId,
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
//#region src/host/ast-tools.ts
async function searchAst(root, params, signal) {
	if (typeof params.pattern !== "string" || !params.pattern.trim() || params.pattern.length > 1e3) return {
		ok: false,
		error: "invalid-pattern"
	};
	const selected = await selectCodeFiles(root, params, 500, signal);
	if (selected.error) return {
		ok: false,
		error: selected.error
	};
	const api = await loadSyntaxApi();
	const nativePaths = selected.paths.filter((path) => {
		const language = languageFor(path);
		return language && api?.supports(language);
	});
	const native = api !== void 0 && nativePaths.length > 0;
	const paths = native ? nativePaths : selected.paths;
	const offset = Math.max(0, params.offset ?? 0);
	const limit = Math.max(1, Math.min(100, params.limit ?? 30));
	const radius = Math.min(5, Math.max(0, params.contextLines ?? 0));
	const items = [];
	const context = [];
	let count = 0;
	let bounded = selected.bounded;
	let parsedFiles = 0;
	let inputBytes = 0;
	for (const path of paths) {
		signal?.throwIfAborted();
		const file = await readWorkspaceCodeFile(root, path);
		if (!file) continue;
		inputBytes += Buffer.byteLength(file.text, "utf8");
		if (inputBytes > 24 * 1024 * 1024) {
			bounded = true;
			break;
		}
		const lines = file.text.split(/\r?\n/u);
		let matches;
		try {
			matches = native ? api.parse(languageFor(path), file.text).root().findAll(params.pattern).map((node) => ({
				...node.range(),
				text: () => node.text()
			})) : literalMatches(lines, params.pattern);
		} catch {
			continue;
		}
		parsedFiles++;
		const indexedLines = /* @__PURE__ */ new Set();
		for (const match of matches) {
			if (++count <= offset || items.length >= limit) continue;
			const { start, end } = match;
			const endLine = Math.max(start.line + 1, end.line + (end.column ? 1 : 0));
			items.push({
				path,
				line: start.line + 1,
				endLine,
				startColumn: start.column + 1,
				endColumn: end.column + 1,
				text: match.text().slice(0, 360).replace(/[\uD800-\uDBFF]$/u, ""),
				revision: file.revision
			});
			indexedLines.add(start.line + 1);
			indexedLines.add(endLine);
		}
		if (radius > 0 && indexedLines.size > 0) context.push(...collectSearchContext(path, file.revision, lines, [...indexedLines].sort((a, b) => a - b), radius));
		if (count > 2e4) {
			bounded = true;
			break;
		}
	}
	if (paths.length && !parsedFiles) return {
		ok: false,
		error: "invalid-pattern-or-unreadable-source"
	};
	return {
		ok: true,
		parser: native ? "ast" : "fallback",
		items,
		context,
		totalMatches: count,
		nextOffset: offset + items.length < count ? offset + items.length : null,
		bounded,
		skippedUnsupportedFiles: native ? selected.paths.length - nativePaths.length : 0
	};
}
function* literalMatches(lines, query) {
	for (let i = 0; i < lines.length; i++) {
		const column = lines[i].indexOf(query);
		if (column >= 0) yield {
			start: {
				line: i,
				column
			},
			end: {
				line: i,
				column: column + query.length
			},
			text: () => query
		};
	}
}
const METAVARIABLE = /([$]{1,3})([A-Z_][A-Z0-9_]*)/gu;
function expandReplacement(template, node, source, variables) {
	return template.replace(METAVARIABLE, (token, dollars, name) => {
		if (!variables.has(token)) throw new Error(`unbound-metavariable:${token}`);
		if (dollars.length === 3) {
			const nodes = node.getMultipleMatches(name);
			if (!nodes.length) return "";
			return source.slice(nodes[0].range().start.index, nodes.at(-1).range().end.index);
		}
		const captured = node.getMatch(name);
		if (!captured) throw new Error(`unbound-metavariable:${token}`);
		return captured.text();
	});
}
const pendingWrites = /* @__PURE__ */ new Map();
async function queueWrite(root, action) {
	const absolute = resolve(root);
	const key = process.platform === "win32" ? absolute.toLowerCase() : absolute;
	const run = (pendingWrites.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
	pendingWrites.set(key, run);
	try {
		return await run;
	} finally {
		if (pendingWrites.get(key) === run) pendingWrites.delete(key);
	}
}
function temporaryPath(file) {
	return join(dirname(file.absolutePath), `.${basename(file.absolutePath)}.dsh-fast-ops-${randomUUID()}.tmp`);
}
async function stillCurrent(root, file, revision) {
	return (await readWorkspaceCodeFile(root, file.path, 2 * 1024 * 1024))?.revision === revision;
}
async function rewriteAst(root, params, options = {}) {
	if (typeof params.pattern !== "string" || !params.pattern.trim() || params.pattern.length > 1e3 || typeof params.replacement !== "string" || params.replacement.length > 8192) return {
		ok: false,
		error: "invalid-rewrite"
	};
	const selected = await selectCodeFiles(root, params, 160, options.signal);
	if (selected.error) return {
		ok: false,
		error: selected.error
	};
	if (selected.bounded) return {
		ok: false,
		error: "rewrite-scan-limit-narrow-selection"
	};
	const api = await loadSyntaxApi();
	if (!api) return {
		ok: false,
		error: "ast-unavailable"
	};
	const candidates = [];
	const variables = new Set(Array.from(params.pattern.matchAll(METAVARIABLE), (match) => match[0]));
	let changes = 0;
	for (const path of selected.paths) {
		options.signal?.throwIfAborted();
		const language = languageFor(path);
		if (!language || !api.supports(language)) continue;
		const file = await readWorkspaceCodeFile(root, path);
		if (!file) return {
			ok: false,
			path,
			error: "unreadable-source"
		};
		if (params.dryRun === false && params.expectedRevisions?.[path] !== void 0 && params.expectedRevisions[path] !== file.revision) return {
			ok: false,
			path,
			error: "revision-mismatch",
			currentRevision: file.revision
		};
		try {
			const syntax = api.parse(language, file.text).root();
			const matches = syntax.findAll(params.pattern);
			if (!matches.length) continue;
			changes += matches.length;
			if (changes > 200 || candidates.length >= 25) return {
				ok: false,
				error: "rewrite-match-limit-narrow-selection"
			};
			if (syntax.findAll({ rule: { kind: "ERROR" } }).length) return {
				ok: false,
				path,
				error: "invalid-source-syntax"
			};
			const edits = matches.map((node) => node.replace(expandReplacement(params.replacement, node, file.text, variables))).sort((a, b) => a.startPos - b.startPos || a.endPos - b.endPos);
			if (edits.some((edit, i) => i > 0 && edit.startPos < edits[i - 1].endPos)) return {
				ok: false,
				path,
				error: "overlapping-ast-matches"
			};
			const output = syntax.commitEdits(edits);
			if (output === file.text) continue;
			if (Buffer.byteLength(output, "utf8") > 2 * 1024 * 1024 || api.parse(language, output).root().findAll({ rule: { kind: "ERROR" } }).length) return {
				ok: false,
				path,
				error: "invalid-rewrite-output"
			};
			candidates.push({
				...file,
				output,
				matches: matches.length
			});
		} catch (error) {
			return {
				ok: false,
				path,
				error: error instanceof Error && error.message.startsWith("unbound-metavariable:") ? error.message : "invalid-rewrite-pattern"
			};
		}
	}
	if (params.dryRun !== false) {
		let available = 6e4;
		const files = candidates.map((file) => {
			const unified = buildCompactDiff(file.text, file.output, file.path).replace(/^([+-]) /gmu, "$1");
			const diff = unified.slice(0, available).replace(/[\uD800-\uDBFF]$/u, "");
			available -= diff.length;
			return {
				path: file.path,
				revision: file.revision,
				matches: file.matches,
				diff,
				truncated: diff.length < unified.length
			};
		});
		return {
			ok: true,
			dryRun: true,
			affectedFiles: candidates.length,
			files
		};
	}
	const expected = params.expectedRevisions ?? {};
	for (const file of candidates) if (!Object.hasOwn(expected, file.path) || expected[file.path] !== file.revision) return {
		ok: false,
		error: "revision-mismatch",
		path: file.path,
		currentRevision: file.revision
	};
	if (Object.keys(expected).some((path) => !candidates.some((file) => file.path === path))) return {
		ok: false,
		error: "preview-file-set-changed"
	};
	if (!candidates.length) return {
		ok: true,
		dryRun: false,
		written: []
	};
	return queueWrite(root, async () => {
		const paths = candidates.map((file) => file.path);
		const temps = /* @__PURE__ */ new Map();
		const written = [];
		let conflict;
		try {
			for (const file of candidates) {
				options.signal?.throwIfAborted();
				if (!await stillCurrent(root, file, file.revision)) return {
					ok: false,
					path: file.path,
					error: "revision-mismatch"
				};
			}
			await options.beforeWrite?.(paths);
			for (const file of candidates) {
				options.signal?.throwIfAborted();
				const temp = temporaryPath(file);
				temps.set(file, temp);
				await writeFile(temp, file.output, {
					mode: file.mode,
					flag: "wx",
					signal: options.signal
				});
				if (process.platform !== "win32") await chmod(temp, file.mode);
			}
			for (const file of candidates) {
				options.signal?.throwIfAborted();
				if (!await stillCurrent(root, file, file.revision)) {
					conflict = file.path;
					throw new Error("revision-mismatch");
				}
				await rename(temps.get(file), file.absolutePath);
				written.push(file);
			}
			return {
				ok: true,
				dryRun: false,
				written: paths
			};
		} catch {
			const rollbackFailed = [];
			for (const file of written.reverse()) {
				const temp = temporaryPath(file);
				try {
					if (!await stillCurrent(root, file, sha256Hex(file.output))) throw new Error("changed-after-write");
					await writeFile(temp, file.text, {
						mode: file.mode,
						flag: "wx"
					});
					if (process.platform !== "win32") await chmod(temp, file.mode);
					if (!await stillCurrent(root, file, sha256Hex(file.output))) throw new Error("changed-after-write");
					await rename(temp, file.absolutePath);
				} catch {
					rollbackFailed.push(file.path);
				} finally {
					await rm(temp, { force: true }).catch(() => {});
				}
			}
			return conflict ? {
				ok: false,
				error: "revision-mismatch",
				path: conflict,
				rollbackFailed
			} : {
				ok: false,
				error: options.signal?.aborted ? "cancelled" : "write-failed",
				rollbackFailed
			};
		} finally {
			await Promise.allSettled([...temps.values()].map((path) => rm(path, { force: true })));
		}
	});
}
//#endregion
//#region src/host/command-output.ts
const MIN_DENOISE_CHARS = 2500;
/** Classify recognizable command invocations, never interpreting the output as a command. */
function ruleFor(command) {
	if (/[;&|\r\n]/u.test(command)) return void 0;
	const text = command.trim().replace(/^(?:(?:pnpm|npm|npx|yarn|bun)(?:\.cmd)?\s+(?:run\s+|exec\s+(?:--\s+)?|dlx\s+)?)/iu, "");
	const gitOperation = /^git(?:\.exe)?\s+(status|diff|log)(?:\s|$)/iu.exec(text)?.[1].toLowerCase();
	if (gitOperation) return {
		rule: "git",
		gitOperation
	};
	if (/^(?:test(?:\s|$)|(?:vitest|jest|pytest)(?:\s|$)|node(?:\.exe)?\s+--test(?:\s|$)|cargo\s+test(?:\s|$))/iu.test(text)) return { rule: "test" };
	if (/^(?:(?:tsc|eslint|build)(?:\s|$)|cargo\s+(?:build|check)(?:\s|$))/iu.test(text)) return { rule: "build" };
}
/** Produce a shorter projection only. The caller must retain original output before using it. */
function denoiseCommandOutput(raw, command, settings) {
	if (!settings.enabled || raw.length <= MIN_DENOISE_CHARS) return void 0;
	const { rule, gitOperation } = ruleFor(command) ?? {};
	if (rule && !settings[rule]) return void 0;
	const lines = stripVTControlCharacters(raw).split(/\r?\n/u).map((line) => line.replace(/\r+$/u, "").split("\r").at(-1) ?? "");
	const out = [];
	let passing = 0;
	let duplicateDiagnostics = 0;
	let hiddenGitChanges = 0;
	let hunkLines = 0;
	let shortCommits = 0;
	let insideHunk = false;
	let stderr = false;
	const seenDiagnostics = /* @__PURE__ */ new Set();
	const statusCounts = /* @__PURE__ */ new Map();
	const omittedStatuses = /* @__PURE__ */ new Map();
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^\[stderr\]\s*$/iu.test(line)) stderr = true;
		if (!stderr && rule === "test" && /^(?:ok \d+ - |(?:PASS|PASSED)\s+\S|\s*[\u2713\u221a]\s+\S|.+::\w+\s+PASSED(?:\s+\[.*\])?$)/u.test(line)) {
			passing++;
			continue;
		}
		if (!stderr && rule === "build" && /^(?:.+\(\d+,\d+\):\s+(?:error|warning)\s+[A-Z]+\d+|.+:\d+:\d+:\s+(?:error|warning)|(?:error|warning)\[[A-Z]\d+\]:)/u.test(line)) {
			if (seenDiagnostics.has(line)) {
				duplicateDiagnostics++;
				continue;
			}
			seenDiagnostics.add(line);
		}
		if (!stderr && rule === "git") {
			if (gitOperation === "status") {
				const kind = /^([ MADRCUT?!]{2})\s+\S/u.exec(line)?.[1].trim() || /^\t(modified|new file|deleted|renamed|copied|typechange):/u.exec(line)?.[1];
				if (kind) {
					const count = (statusCounts.get(kind) ?? 0) + 1;
					statusCounts.set(kind, count);
					if (count > 12) {
						omittedStatuses.set(kind, count - 12);
						continue;
					}
				}
			}
			if (gitOperation === "log" && /^[a-f0-9]{7,40} \S/u.test(line) && ++shortCommits > 30) continue;
			if (/^(?:diff --git|commit )/u.test(line)) insideHunk = false;
			if (/^@@ /u.test(line)) {
				insideHunk = true;
				hunkLines = 0;
			} else if (insideHunk && /^[ +\-]/u.test(line) && ++hunkLines > 4) {
				hiddenGitChanges++;
				continue;
			}
		}
		if (line.trim() === "" && out.at(-1)?.trim() === "") continue;
		if (!stderr && /^(?:warn(?:ing)?\b|npm warn\b)/iu.test(line)) {
			let repetitions = 1;
			while (lines[i + repetitions] === line) repetitions++;
			if (repetitions > 1) {
				out.push(`${line} [repeated ${repetitions} times]`);
				i += repetitions - 1;
				continue;
			}
		}
		out.push(line);
	}
	if (passing) out.push(`[${passing} successful test records omitted]`);
	if (duplicateDiagnostics) out.push(`[${duplicateDiagnostics} duplicate build diagnostics omitted]`);
	if (hiddenGitChanges) out.push(`[${hiddenGitChanges} Git hunk lines omitted]`);
	if (shortCommits > 30) out.push(`[${shortCommits - 30} earlier Git commits omitted]`);
	for (const [kind, omitted] of omittedStatuses) out.push(`[${omitted} more Git status entries of type ${kind}]`);
	const text = out.join("\n").trimEnd();
	return raw.length - text.length >= 220 ? text : void 0;
}
//#endregion
//#region src/host/repo-map.ts
const execFileAsync = promisify(execFile);
async function resolveGitExecutable(workspace) {
	const root = await realpath(workspace).catch(() => void 0);
	if (!root) return void 0;
	const path = Object.entries(process.env).find(([key]) => key.toLowerCase() === "path")?.[1];
	const executable = process.platform === "win32" ? "git.exe" : "git";
	for (const entry of (path ?? "").split(delimiter)) {
		const directory = entry.replace(/^"(.*)"$/u, "$1");
		if (!isAbsolute(directory)) continue;
		const candidate = await realpath(join(directory, executable)).catch(() => void 0);
		if (!candidate) continue;
		const fromWorkspace = relative(root, candidate);
		if (!isAbsolute(fromWorkspace) && fromWorkspace !== ".." && !fromWorkspace.startsWith(".." + sep)) continue;
		try {
			if (!(await stat(candidate)).isFile()) continue;
			await access(candidate, constants.X_OK);
			return candidate;
		} catch {}
	}
}
async function recentChanges(root, signal) {
	const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
	env.GIT_CONFIG_NOSYSTEM = "1";
	env.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
	env.GIT_CEILING_DIRECTORIES = normalize(root);
	env.GIT_TERMINAL_PROMPT = "0";
	env.GIT_NO_LAZY_FETCH = "1";
	env.GIT_OPTIONAL_LOCKS = "0";
	try {
		const git = await resolveGitExecutable(root);
		if (!git) return /* @__PURE__ */ new Map();
		const { stdout } = await execFileAsync(git, [
			"--no-pager",
			"-c",
			"core.fsmonitor=false",
			"-c",
			`core.hooksPath=${env.GIT_CONFIG_GLOBAL}`,
			"log",
			"-80",
			"--name-only",
			"--format=",
			"-z",
			"--no-ext-diff",
			"--no-textconv",
			"--",
			"."
		], {
			cwd: root,
			env,
			timeout: 800,
			maxBuffer: 1024 * 1024,
			windowsHide: true,
			signal
		});
		const counts = /* @__PURE__ */ new Map();
		for (const value of stdout.split("\0")) {
			const path = value.replace(/^\n+/u, "");
			if (path) counts.set(path, (counts.get(path) ?? 0) + 1);
		}
		return counts;
	} catch {
		return /* @__PURE__ */ new Map();
	}
}
const KNOWN_CREDENTIAL = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:gh[pousr]_|github_pat_|glpat-|xox[baprs]-|sk-(?:proj-)?|AIza)[0-9A-Za-z_-]{12,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bBearer\s+[A-Za-z0-9._-]{12,})/gu;
const QUOTED_VALUE = /(["'\x60])(?:\\.|(?!\1).)*\1/gu;
function safeMapText(text) {
	return text.replace(KNOWN_CREDENTIAL, "[redacted]").replace(QUOTED_VALUE, "[…]").replace(/[\u0000-\u0020\u007f]+/gu, " ").trim();
}
function estimateTokens(text) {
	return Math.ceil(Buffer.byteLength(text, "utf8") / 2);
}
const SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([
	".ts",
	".tsx",
	".mts",
	".cts",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".go",
	".rs",
	".java",
	".c",
	".h",
	".cpp",
	".cc",
	".hpp",
	".cs",
	".rb",
	".php",
	".swift",
	".kt",
	".vue",
	".svelte"
]);
async function mapRepository(root, params, signal) {
	const selected = await selectCodeFiles(root, params, 700, signal);
	if (selected.error) return {
		ok: false,
		error: selected.error
	};
	const maxTokens = Math.max(40, Math.min(12e3, params.maxTokens ?? 4e3));
	const [api, churn] = await Promise.all([loadSyntaxApi(), recentChanges(root, signal)]);
	const score = (path) => 3 * Math.log2(1 + (churn.get(path) ?? 0)) + (SOURCE_EXTENSIONS.has(extname(path).toLowerCase()) ? 2 : 0) - Math.min(5, path.split("/").length) * .5;
	const ordered = selected.paths.sort((a, b) => score(b) - score(a) || a.localeCompare(b)).slice(0, 200);
	const names = /* @__PURE__ */ new Map();
	const previews = [];
	for (const path of ordered) {
		signal?.throwIfAborted();
		if (!SOURCE_EXTENSIONS.has(extname(path).toLowerCase())) {
			previews.push({
				path,
				symbols: []
			});
			continue;
		}
		const file = await readWorkspaceCodeFile(root, path, 256 * 1024);
		if (!file) continue;
		const { symbols } = outlineSource(path, file.text, api, 18);
		for (const match of file.text.matchAll(/\b(?:import|from|require)\s*\(?\s*(?:[{*][^'\x22\r\n]{0,256}\bfrom\s*)?['\x22]([^'\x22]{1,168})['\x22]/gu)) {
			const name = match[1].split("/").at(-1)?.replace(/\.(?:[cm]?[jt]sx?)$/u, "");
			if (name) names.set(name, (names.get(name) ?? 0) + 1);
		}
		previews.push({
			path,
			symbols: symbols.filter((symbol) => symbol.level === 0).sort((a, b) => Number(b.visibility === "exported") - Number(a.visibility === "exported"))
		});
	}
	const ranked = previews.sort((a, b) => {
		const rank = (path) => score(path) + Math.log2(1 + (names.get(path.split("/").at(-1)?.replace(/\.[^.]+$/u, "") ?? "") ?? 0));
		return rank(b.path) - rank(a.path) || a.path.localeCompare(b.path);
	});
	const lines = [];
	let charBudget = maxTokens * 2;
	let files = 0;
	let bounded = selected.bounded || previews.length < selected.paths.length;
	const append = (line) => {
		const bytes = Buffer.byteLength(line, "utf8") + (lines.length ? 1 : 0);
		if (bytes > charBudget) return false;
		charBudget -= bytes;
		lines.push(line);
		return true;
	};
	for (const { path, symbols } of ranked) {
		if (!append(safeMapText(path))) {
			bounded = true;
			break;
		}
		files++;
		for (const symbol of symbols.slice(0, 8)) {
			if (append(`  ${safeMapText(symbol.signature)}`)) continue;
			bounded = true;
			break;
		}
	}
	const map = lines.join("\n");
	return {
		ok: true,
		map,
		files,
		estimatedTokens: estimateTokens(map),
		bounded
	};
}
//#endregion
//#region src/host/result-cache.ts
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_ROW_BYTES = 480;
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
		const id = randomUUID();
		const refId = `ref://${encodeURIComponent(params.sessionId)}/${encodeURIComponent(params.producerTool)}/${id}`;
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
			principalId: params.principalId,
			items: params.items,
			lastAccessedAt: now
		});
		this.totalBytes += totalBytes;
		this.prune(now);
		return ref;
	}
	/** Preserve exact content while keeping every row within the smallest supported page. */
	putText(params) {
		if (Buffer.byteLength(params.text, "utf8") > MAX_TOTAL_BYTES) return void 0;
		const items = [];
		const rowOverhead = Buffer.byteLength("{\"text\":\"\"}", "utf8");
		let accounted = 2;
		let rowStart = 0;
		let rowBytes = rowOverhead;
		const append = (end) => {
			accounted += rowBytes + (items.length ? 1 : 0);
			if (accounted > MAX_TOTAL_BYTES) return false;
			items.push({ text: params.text.slice(rowStart, end) });
			rowStart = end;
			rowBytes = rowOverhead;
			return true;
		};
		for (let i = 0; i < params.text.length;) {
			const codePoint = params.text.codePointAt(i);
			const width = codePoint > 65535 ? 2 : 1;
			const bytes = jsonCodePointBytes(codePoint);
			if (rowBytes + bytes > MAX_TEXT_ROW_BYTES && !append(i)) return void 0;
			rowBytes += bytes;
			i += width;
		}
		if (!append(params.text.length)) return void 0;
		const ref = this.put({
			...params,
			items
		});
		return this.entries.has(ref.refId) ? ref : void 0;
	}
	page(params) {
		const now = this.now();
		this.prune(now);
		const entry = this.entries.get(params.refId);
		if (!entry || entry.sessionId !== params.sessionId || entry.principalId !== params.principalId) return {
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
	release(sessionId, refId, principalId) {
		const entry = this.entries.get(refId);
		if (!entry || entry.sessionId !== sessionId || entry.principalId !== principalId) return false;
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
function jsonCodePointBytes(value) {
	if (value === 34 || value === 92 || value === 8 || value === 9 || value === 10 || value === 12 || value === 13) return 2;
	if (value < 32 || value >= 55296 && value <= 57343) return 6;
	if (value < 128) return 1;
	if (value < 2048) return 2;
	return value <= 65535 ? 3 : 4;
}
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
	"fast_result",
	"fast_outline",
	"fast_ast_search",
	"fast_ast_rewrite",
	"fast_repo_map"
];
const ALL_FAST_OPS_TOOLS = [...RESIDENT_TOOLS, ...SPECIALIZED_TOOLS];
const SPECIALIZED_CATALOG = {
	fast_stat: "Inspect file/directory metadata, size, line count, binary status, and SHA-256 revision.",
	fast_diff: "Preview unified line diff between current file and proposed content without writing.",
	fast_replace: "Batch literal replacement across glob-matched files (dryRun defaults to true).",
	fast_read_table: "Parse RFC-4180 CSV/TSV files with quoted fields, column projection, and row paging.",
	fast_result: "Page, filter (equals), project (fields), or release cached ref:// overflow results.",
	fast_outline: "Read declaration names, signatures and exact line ranges without loading function bodies.",
	fast_ast_search: "Find syntax patterns with ast-grep metavariables. Returns exact revisions and optional line context.",
	fast_ast_rewrite: "Preview a syntax-pattern rewrite, or apply it using the exact file revisions from that preview.",
	fast_repo_map: "Return a credential-filtered repository map of paths and signatures within a token budget."
};
const FAST_OPS_RESULTS_SERVICE = "fastOpsResults";
var FastOpsController = class {
	cache;
	counters = {
		batchCalls: 0,
		filesReadInBatches: 0,
		cacheSpills: 0,
		toolsActivated: 0,
		astCalls: 0,
		denoiseTokensSaved: 0
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
	cacheScope(agent, requireSession = false) {
		const sessionId = agent?.session?.id || (requireSession ? void 0 : agent?.id || "default");
		if (!sessionId) return void 0;
		const userScope = getHostService(this.ctx, "userScope");
		const scope = userScope?.currentScope?.() ?? userScope?.desktopScope?.();
		if (userScope && !scope?.principalId) return void 0;
		if (scope && userScope?.canAccess && (requireSession || scope.source === "remote")) {
			if (!userScope.canAccess(scope, {
				kind: "session",
				sessionId
			}).allowed) return void 0;
		}
		return {
			sessionId,
			principalId: scope?.principalId
		};
	}
	async isAstAvailable() {
		return isNativeAstAvailable();
	}
	putText(input) {
		const settings = this.getSettings();
		if (!settings.enabled || !input.agent) return void 0;
		const scope = this.cacheScope(input.agent, true);
		if (!scope) return void 0;
		const ref = this.cache.putText({
			...scope,
			producerTool: input.producerTool,
			text: input.text,
			preview: input.preview,
			ttlMs: settings.resultCacheTtlMs
		});
		if (!ref) return void 0;
		this.counters.cacheSpills++;
		const activated = this.activatedSetFor(input.agent);
		if (!activated.has("fast_result")) {
			activated.add("fast_result");
			this.counters.toolsActivated++;
			try {
				this.reapply(input.agent);
			} catch {}
		}
		return ref;
	}
	projectCommandResult(exec, result, decision) {
		if (!["bash", "pwsh"].includes(exec.name) || result.isError || decision.kind !== "accept" || decision.content !== void 0 || decision.value !== void 0) return decision;
		const args = exec.arguments;
		const original = result.content[0];
		if (typeof args?.command !== "string" || result.content.length !== 1 || original?.type !== "text") return decision;
		const shell = result.value;
		if (shell?.kind !== void 0 && shell.kind !== "foreground" || shell?.stdout?.truncated || shell?.stderr?.truncated || /(?:^|\n)\[output truncated; full output:/u.test(original.text)) return decision;
		const compact = denoiseCommandOutput(original.text, args.command, this.getSettings().denoise);
		if (compact === void 0) return decision;
		const ref = this.putText({
			agent: exec.agent,
			producerTool: exec.name,
			text: original.text
		});
		if (!ref) return decision;
		const rawBytes = Buffer.byteLength(original.text, "utf8");
		const projectedBytes = Buffer.byteLength(compact, "utf8");
		const text = `${compact}\n[compressed ${rawBytes} B -> ${projectedBytes} B, saved ~${Math.round((1 - projectedBytes / rawBytes) * 100)}%; full raw output: ${ref.refId} via fast_result]`;
		this.counters.denoiseTokensSaved += Math.max(0, Math.floor((original.text.length - text.length) / 4));
		return {
			...decision,
			content: [{
				...original,
				text
			}]
		};
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
	async resolveCodeWorkspace(agent, signal) {
		if (!agent) return void 0;
		const directory = getHostService(this.ctx, "workingDirectory");
		try {
			signal?.throwIfAborted();
			const root = directory ? await directory.ensure(agent, signal) : agent.workspace?.path || agent.cwd || agent.session?.header?.cwd;
			return typeof root === "string" && isAbsolute(root) ? root : void 0;
		} catch {
			signal?.throwIfAborted();
			return;
		}
	}
	canRewriteWorkspace(agent) {
		const permissions = getHostService(this.ctx, "permissionPresets");
		const shell = getHostService(this.ctx, "shell");
		try {
			return ((agent.session ? permissions?.permissionState?.(agent.session)?.sandbox : void 0) ?? shell?.sandboxMode) !== "read-only";
		} catch {
			return false;
		}
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
			disposers.push(ctxAny.on("tools/post-execute", async (exec, result, next) => {
				const decision = await next();
				try {
					return this.projectCommandResult(exec, result, decision);
				} catch {
					return decision;
				}
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
						"## nbfast Token-Efficiency Tips",
						"- Prefer `fast_read_files` to inspect multiple files/ranges in a single turn and obtain SHA-256 `revision` tokens.",
						"- Use `fast_search` for workspace glob/grep. For an unfamiliar symbol or call site, request `contextLines: 2` to get merged excerpts and their file revisions in one call. Reuse the revision for `fast_edit_batch` when the excerpt is sufficient. Read larger excerpts from `contextRef` via `fast_result`; call `fast_discover` when a specialized tool is needed.",
						"- Use `fast_outline` for declaration signatures and `fast_ast_search` for source patterns. Run `fast_ast_rewrite` in preview mode before supplying its file revisions to apply a rewrite."
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
			const codeSelection = {
				path: {
					type: "string",
					description: "Workspace path or glob, default \".\"."
				},
				include: {
					type: "array",
					items: { type: "string" },
					maxItems: 32
				}
			};
			const pattern = {
				type: "string",
				minLength: 1,
				maxLength: 1e3,
				description: "ast-grep pattern such as ctx.on($EVENT, $HANDLER)."
			};
			const noWorkspace = {
				ok: false,
				error: "workspace-unavailable"
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
						...this.cacheScope(exec?.agent),
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
				description: "Search workspace files by glob or grep. Opt into merged line context and exact file revisions when needed for explanation or a follow-up edit.",
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
						limit: { type: "integer" },
						contextLines: {
							type: "integer",
							minimum: 0,
							maximum: 5,
							description: "Optional lines before and after each grep match. Returns merged excerpts for this match page, or contextRef for fast_result. Defaults to 0."
						}
					}
				},
				execute: async (args, exec) => {
					this.counters.batchCalls++;
					const settings = this.getSettings();
					const res = await searchWorkspace(this.resolveWorkspaceRoot(exec?.agent), args, {
						...this.cacheScope(exec?.agent),
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
				description: "Activate specialized nbfast file, AST, repository map, and result tools on demand by keyword or select:<tool>.",
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
						...this.cacheScope(exec?.agent),
						maxInlineBytes: settings.maxInlineBytes,
						ttlMs: settings.resultCacheTtlMs,
						cache: this.cache
					});
					if ("spilled" in res && res.spilled) this.counters.cacheSpills++;
					return res;
				}
			});
			reg({
				name: "fast_outline",
				description: SPECIALIZED_CATALOG.fast_outline,
				parameters: {
					type: "object",
					additionalProperties: false,
					properties: {
						...codeSelection,
						maxSymbols: {
							type: "integer",
							minimum: 1,
							maximum: 200
						}
					}
				},
				execute: async (args, exec) => {
					const root = await this.resolveCodeWorkspace(exec?.agent, exec?.signal);
					if (!root) return noWorkspace;
					this.counters.astCalls++;
					return outlineWorkspace(root, args ?? {}, exec?.signal);
				}
			});
			reg({
				name: "fast_ast_search",
				description: SPECIALIZED_CATALOG.fast_ast_search,
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["pattern"],
					properties: {
						...codeSelection,
						pattern,
						offset: {
							type: "integer",
							minimum: 0
						},
						limit: {
							type: "integer",
							minimum: 1,
							maximum: 100
						},
						contextLines: {
							type: "integer",
							minimum: 0,
							maximum: 5
						}
					}
				},
				execute: async (args, exec) => {
					const root = await this.resolveCodeWorkspace(exec?.agent, exec?.signal);
					if (!root) return noWorkspace;
					this.counters.astCalls++;
					const result = await searchAst(root, args ?? {}, exec?.signal);
					if (!result.context?.length) return result;
					const text = JSON.stringify(result.context);
					if (Buffer.byteLength(text, "utf8") <= this.getSettings().maxInlineBytes) return result;
					const contextRef = this.putText({
						agent: exec?.agent,
						producerTool: "fast_ast_search",
						text
					});
					return contextRef ? {
						...result,
						context: [],
						contextRef,
						contextEncoding: "json-text"
					} : result;
				}
			});
			reg({
				name: "fast_ast_rewrite",
				description: SPECIALIZED_CATALOG.fast_ast_rewrite,
				parameters: {
					type: "object",
					additionalProperties: false,
					required: ["pattern", "replacement"],
					properties: {
						...codeSelection,
						pattern,
						replacement: {
							type: "string",
							maxLength: 8192
						},
						dryRun: {
							type: "boolean",
							description: "Preview changes by default."
						},
						expectedRevisions: {
							type: "object",
							description: "Required to apply changes. Use the exact path-to-revision pairs returned by the preview.",
							additionalProperties: {
								type: "string",
								pattern: "^[a-f0-9]{64}$"
							}
						}
					}
				},
				execute: async (args, exec) => {
					const agent = exec?.agent;
					const root = await this.resolveCodeWorkspace(agent, exec?.signal);
					if (!root || !agent) return noWorkspace;
					if (args?.dryRun === false && !this.canRewriteWorkspace(agent)) return {
						ok: false,
						error: "workspace-read-only"
					};
					this.counters.astCalls++;
					return rewriteAst(root, args ?? {}, {
						signal: exec?.signal,
						beforeWrite: async (paths) => {
							if (!this.canRewriteWorkspace(agent)) throw new Error("workspace-read-only");
							await getHostService(this.ctx, "workspaceCheckpoints")?.beforeWorkspaceWrite({
								agent,
								workspacePath: root,
								paths,
								tool: "fast_ast_rewrite"
							});
						}
					});
				}
			});
			reg({
				name: "fast_repo_map",
				description: SPECIALIZED_CATALOG.fast_repo_map,
				parameters: {
					type: "object",
					additionalProperties: false,
					properties: {
						...codeSelection,
						maxTokens: {
							type: "integer",
							minimum: 40,
							maximum: 12e3
						}
					}
				},
				execute: async (args, exec) => {
					const root = await this.resolveCodeWorkspace(exec?.agent, exec?.signal);
					if (!root) return noWorkspace;
					this.counters.astCalls++;
					return mapRepository(root, args ?? {}, exec?.signal);
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
					const scope = this.cacheScope(exec?.agent);
					const refId = String(args?.refId ?? "");
					if (!scope) return {
						ok: false,
						refId,
						error: "reference-not-found"
					};
					if (args?.action === "release") return {
						ok: true,
						released: this.cache.release(scope.sessionId, refId, scope.principalId)
					};
					return this.cache.page({
						...scope,
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
	ctx.provide(FAST_OPS_RESULTS_SERVICE, { putText: (input) => controller.putText(input) });
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
					astAvailable: await controller.isAstAvailable(),
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
export { ALL_FAST_OPS_TOOLS, FAST_OPS_RESULTS_SERVICE, FastOpsController, INLINE_BYTE_OPTIONS, PACKAGE_ID, RESIDENT_TOOLS, ROUTE_PREFIX, ResultCache, SETTINGS_FILE, SPECIALIZED_TOOLS, TTL_MS_OPTIONS, apply, buildCompactDiff, defaultSettings, diffPreview, editFilesBatch, normalizeSettings, parseDelimitedTable, readFilesBatch, readSettings, readTableFile, replaceAcrossFiles, resolveDshHome, resolveSafeWorkspacePath, searchWorkspace, sha256Hex, statFile, writeSettingsAtomic };
