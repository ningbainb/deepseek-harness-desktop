import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
//#region src/core/settings.ts
const PACKAGE_ID = "@ningbainb/dsh-win-control";
const BRIDGE_ROW_ID = "windows-mcp-bridge";
const PINNED_WINDOWS_MCP_VERSION = "0.8.8";
const ROUTE_PREFIX = "/api/dsh-win-control";
const SETTINGS_FILE = "dsh-win-control.settings.json";
const SCREENSHOT_SCALES = [
	.25,
	.5,
	.75,
	1
];
const SCREENSHOT_BACKENDS = [
	"auto",
	"dxcam",
	"mss",
	"pillow"
];
const EXCLUDABLE_TOOLS = [
	"App",
	"PowerShell",
	"FileSystem"
];
const TIMEOUT_RANGE = Object.freeze({
	min: 5e3,
	max: 6e5
});
const MIRROR_IDS = [
	"auto",
	"ustc",
	"aliyun",
	"tencent",
	"huawei",
	"nju",
	"tuna",
	"pypi"
];
function defaultSettings() {
	return {
		version: 1,
		bridge: {
			toolCallTimeoutMs: 12e4,
			excludeTools: [
				"App",
				"PowerShell",
				"FileSystem"
			],
			screenshotScale: .75,
			screenshotBackend: "auto",
			disableFlash: true
		},
		plugin: {
			preferredMirror: "auto",
			lazyTools: true,
			defaultGrant: false
		}
	};
}
/** Coerce raw input into a valid settings object while reporting replaced keys. */
function normalizeSettings(input) {
	const settings = defaultSettings();
	const problems = [];
	if (input === null || typeof input !== "object") return {
		settings,
		problems
	};
	const raw = input;
	const bridge = raw.bridge !== null && typeof raw.bridge === "object" ? raw.bridge : {};
	const plugin = raw.plugin !== null && typeof raw.plugin === "object" ? raw.plugin : {};
	const timeout = Number(bridge.toolCallTimeoutMs);
	if (Number.isFinite(timeout) && timeout >= TIMEOUT_RANGE.min && timeout <= TIMEOUT_RANGE.max) settings.bridge.toolCallTimeoutMs = Math.round(timeout);
	else if (bridge.toolCallTimeoutMs !== void 0) problems.push("bridge.toolCallTimeoutMs");
	if (Array.isArray(bridge.excludeTools)) {
		const wanted = [];
		for (const item of bridge.excludeTools) {
			const candidate = typeof item === "string" ? item.trim() : "";
			if (EXCLUDABLE_TOOLS.includes(candidate) && !wanted.includes(candidate)) wanted.push(candidate);
		}
		if (wanted.length !== bridge.excludeTools.length) problems.push("bridge.excludeTools");
		settings.bridge.excludeTools = wanted;
	} else if (bridge.excludeTools !== void 0) problems.push("bridge.excludeTools");
	const scale = Number(bridge.screenshotScale);
	if (SCREENSHOT_SCALES.includes(scale)) settings.bridge.screenshotScale = scale;
	else if (bridge.screenshotScale !== void 0) problems.push("bridge.screenshotScale");
	if (SCREENSHOT_BACKENDS.includes(String(bridge.screenshotBackend))) settings.bridge.screenshotBackend = bridge.screenshotBackend;
	else if (bridge.screenshotBackend !== void 0) problems.push("bridge.screenshotBackend");
	if (typeof bridge.disableFlash === "boolean") settings.bridge.disableFlash = bridge.disableFlash;
	else if (bridge.disableFlash !== void 0) problems.push("bridge.disableFlash");
	if (MIRROR_IDS.includes(String(plugin.preferredMirror))) settings.plugin.preferredMirror = plugin.preferredMirror;
	else if (plugin.preferredMirror !== void 0) problems.push("plugin.preferredMirror");
	if (typeof plugin.lazyTools === "boolean") settings.plugin.lazyTools = plugin.lazyTools;
	else if (plugin.lazyTools !== void 0) problems.push("plugin.lazyTools");
	if (typeof plugin.defaultGrant === "boolean") settings.plugin.defaultGrant = plugin.defaultGrant;
	else if (plugin.defaultGrant !== void 0) problems.push("plugin.defaultGrant");
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
			if (error?.code !== "ENOENT") {
				if (platform !== "win32") throw error;
			}
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
//#region src/host/mirrors.ts
const MIRROR_CANDIDATES = Object.freeze([
	{
		id: "ustc",
		label: "USTC 中科大",
		indexUrl: "https://mirrors.ustc.edu.cn/pypi/simple",
		official: false
	},
	{
		id: "aliyun",
		label: "阿里云",
		indexUrl: "https://mirrors.aliyun.com/pypi/simple",
		official: false
	},
	{
		id: "tencent",
		label: "腾讯云",
		indexUrl: "https://mirrors.cloud.tencent.com/pypi/simple",
		official: false
	},
	{
		id: "huawei",
		label: "华为云",
		indexUrl: "https://repo.huaweicloud.com/repository/pypi/simple",
		official: false
	},
	{
		id: "nju",
		label: "南京大学",
		indexUrl: "https://mirrors.nju.edu.cn/pypi/web/simple",
		official: false
	},
	{
		id: "tuna",
		label: "清华 TUNA",
		indexUrl: "https://pypi.tuna.tsinghua.edu.cn/simple",
		official: false
	},
	{
		id: "pypi",
		label: "PyPI 官方",
		indexUrl: "https://pypi.org/simple",
		official: true
	}
]);
function projectIndexUrl(indexUrl, project = "windows-mcp") {
	return `${indexUrl.replace(/\/+$/u, "")}/${encodeURIComponent(project)}/`;
}
function decodeHtmlAttr(value) {
	return value.replaceAll("&amp;", "&").replaceAll("&quot;", "\"").replaceAll("&#39;", "'");
}
/** Parse PEP 503 Simple API links for wheels or source archives. */
function parseSimpleIndex(html, baseUrl) {
	if (typeof html !== "string" || html === "") return [];
	const entries = [];
	for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/giu)) {
		const rawHref = decodeHtmlAttr(match[1]).split("#")[0];
		const filename = match[2].trim();
		const whlMatch = /^(?:windows[_-]mcp)-([0-9]+(?:\.[0-9]+)+(?:[abrc0-9.+_-]*)?)-[^/]+\.whl$/iu.exec(filename);
		const tarMatch = /^(?:windows[_-]mcp)-([0-9]+(?:\.[0-9]+)+(?:[abrc0-9.+_-]*)?)\.(?:tar\.gz|zip)$/iu.exec(filename);
		const version = whlMatch?.[1] ?? tarMatch?.[1];
		if (!version) continue;
		try {
			const resolved = new URL(rawHref, baseUrl).href;
			entries.push({
				filename,
				version,
				url: resolved
			});
		} catch {
			continue;
		}
	}
	return entries;
}
function compareVersionsDesc(left, right) {
	const split = (v) => v.split(/[.+-]/u).map((p) => /^\d+$/u.test(p) ? Number(p) : p);
	const a = split(left);
	const b = split(right);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		if (x === y) continue;
		if (typeof x === "number" && typeof y === "number") return y - x;
		return String(y).localeCompare(String(x));
	}
	return 0;
}
function pickWheelEntry(entries, version) {
	if (entries.length === 0) return null;
	const wheels = entries.filter((e) => e.filename.toLowerCase().endsWith(".whl"));
	const pool = wheels.length > 0 ? wheels : entries;
	if (typeof version === "string" && version.trim() !== "") {
		const wanted = version.trim();
		return pool.find((e) => e.version === wanted) ?? entries.find((e) => e.version === wanted) ?? null;
	}
	const stable = pool.filter((e) => /^\d+(?:\.\d+)+$/u.test(e.version));
	return (stable.length > 0 ? stable : pool).slice().sort((l, r) => compareVersionsDesc(l.version, r.version))[0] ?? null;
}
async function probeOne(mirror, fetchImpl, timeoutMs, sampleBytes, version) {
	const base = {
		id: mirror.id,
		label: mirror.label,
		indexUrl: mirror.indexUrl,
		official: mirror.official
	};
	const startedAt = Date.now();
	try {
		const pageUrl = projectIndexUrl(mirror.indexUrl, "windows-mcp");
		const page = await fetchImpl(pageUrl, {
			headers: {
				accept: "text/html",
				"user-agent": "dsh-win-control-probe"
			},
			signal: AbortSignal.timeout(timeoutMs)
		});
		const indexMs = Math.max(1, Date.now() - startedAt);
		if (!page?.ok) throw new Error(`HTTP ${page?.status ?? "?"}`);
		const entries = parseSimpleIndex(await page.text(), pageUrl);
		if (entries.length === 0) throw new Error("索引为空");
		const target = pickWheelEntry(entries, version);
		if (!target) throw new Error(version ? `缺少版本 ${version}` : "未找到可用包");
		const dlStart = Date.now();
		const sample = await fetchImpl(target.url, {
			headers: {
				range: `bytes=0-${Math.max(0, sampleBytes - 1)}`,
				"user-agent": "dsh-win-control-probe"
			},
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (sample.status !== 200 && sample.status !== 206) throw new Error(`下载探测 HTTP ${sample.status}`);
		const buf = new Uint8Array(await sample.arrayBuffer());
		const downloadMs = Math.max(1, Date.now() - dlStart);
		const speedBps = buf.byteLength === 0 ? 0 : Math.round(buf.byteLength / (downloadMs / 1e3));
		return {
			...base,
			ok: true,
			indexMs,
			downloadMs,
			bytes: buf.byteLength,
			speedBps,
			version: target.version
		};
	} catch (error) {
		return {
			...base,
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
/** Rank mirrors by throughput descending then index latency ascending, keeping official fallback last. */
async function probeMirrors(options = {}) {
	const candidates = options.candidates ?? MIRROR_CANDIDATES;
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0 ? options.timeoutMs : 8e3;
	const sampleBytes = Number.isFinite(options.sampleBytes) && (options.sampleBytes ?? 0) > 0 ? options.sampleBytes : 96 * 1024;
	const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 4));
	const version = options.version ?? null;
	const results = new Array(candidates.length);
	let nextIndex = 0;
	async function worker() {
		while (nextIndex < candidates.length) {
			const idx = nextIndex++;
			results[idx] = await probeOne(candidates[idx], fetchImpl, timeoutMs, sampleBytes, version);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, () => worker()));
	return results.sort((left, right) => {
		if (left.official !== right.official) return left.official ? 1 : -1;
		if (left.ok !== right.ok) return left.ok ? -1 : 1;
		const speedDiff = (right.speedBps ?? 0) - (left.speedBps ?? 0);
		if (speedDiff !== 0) return speedDiff;
		return (left.indexMs ?? Number.MAX_SAFE_INTEGER) - (right.indexMs ?? Number.MAX_SAFE_INTEGER);
	});
}
//#endregion
//#region src/host/toolchain.ts
const UV_PYTHON_REQUIREMENT = ">=3.14,<3.15";
const PROFILE_BLOCK_BEGIN = "# >>> dsh-win-control (machine managed) >>>";
const PROFILE_BLOCK_END = "# <<< dsh-win-control <<<";
const VERSION_PATTERN = /^[0-9]+(?:\.[0-9]+)+(?:[abrc0-9.+_-]*)?$/u;
const PROCESS_SCAN_TIMEOUT_MS = 5e3;
const SCAN_SCRIPT = "$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | ForEach-Object { \"$($_.ProcessId)|$($_.ExecutablePath)\" }";
function managedToolchainRoot(home = resolveDshHome()) {
	return join(home, "win-control", "toolchain");
}
function versionToolRoot(root, version) {
	if (!VERSION_PATTERN.test(version)) throw new TypeError(`invalid Windows-MCP version: ${version}`);
	return join(root, version);
}
function toolDirectoryFor(root, version) {
	return join(versionToolRoot(root, version), "windows-mcp");
}
function executableIn(toolDir) {
	if (!toolDir) return null;
	for (const candidate of [
		join(toolDir, "Scripts", "windows-mcp.exe"),
		join(toolDir, "bin", "windows-mcp.exe"),
		join(toolDir, "bin", "windows-mcp")
	]) if (existsSync(candidate)) return candidate;
	return null;
}
function managedExecutable(root, version = PINNED_WINDOWS_MCP_VERSION) {
	return executableIn(toolDirectoryFor(root, version));
}
function readManifest(root, version) {
	try {
		const parsed = JSON.parse(readFileSync(join(versionToolRoot(root, version), "manifest.json"), "utf8"));
		return parsed !== null && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}
function writeManifest(root, version, payload = {}) {
	const dir = versionToolRoot(root, version);
	mkdirSync(dir, { recursive: true });
	const manifest = {
		version,
		installedAt: (/* @__PURE__ */ new Date()).toISOString(),
		executable: managedExecutable(root, version),
		...payload
	};
	writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	return manifest;
}
function compareVersionDesc(left, right) {
	const parts = (v) => v.split(/[.+-]/u).map((p) => /^\d+$/u.test(p) ? Number(p) : p);
	const a = parts(left);
	const b = parts(right);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		if (x === y) continue;
		if (typeof x === "number" && typeof y === "number") return y - x;
		return String(y).localeCompare(String(x));
	}
	return 0;
}
function listManagedVersions(root = managedToolchainRoot()) {
	let dirs = [];
	try {
		dirs = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && VERSION_PATTERN.test(entry.name)).map((entry) => entry.name);
	} catch {
		return [];
	}
	return dirs.map((version) => {
		const toolDirectory = toolDirectoryFor(root, version);
		const executable = executableIn(toolDirectory);
		if (!executable) return null;
		const manifest = readManifest(root, version);
		return {
			version,
			toolDirectory,
			executable,
			installedAt: typeof manifest?.installedAt === "string" ? manifest.installedAt : null,
			mirror: typeof manifest?.mirror === "string" ? manifest.mirror : null
		};
	}).filter((entry) => entry !== null).sort((a, b) => compareVersionDesc(a.version, b.version));
}
function parseProcessLines(text) {
	if (!text) return [];
	const out = [];
	for (const line of text.split(/\r?\n/u)) {
		const trimmed = line.trim();
		const sep = trimmed.indexOf("|");
		if (sep <= 0) continue;
		const pid = Number(trimmed.slice(0, sep));
		const path = trimmed.slice(sep + 1).trim();
		if (!Number.isInteger(pid) || pid <= 0 || !path) continue;
		out.push({
			pid,
			path
		});
	}
	return out;
}
function comparableWinPath(value, platform = process.platform) {
	const normalized = value.replace(/\//gu, "\\").replace(/\\+$/u, "");
	return platform === "win32" ? normalized.toLowerCase() : normalized;
}
function processesUnder(root, entries, platform = process.platform) {
	if (!root) return [];
	const wanted = comparableWinPath(root, platform);
	if (!wanted) return [];
	const prefix = wanted.endsWith("\\") ? wanted : `${wanted}\\`;
	return entries.filter((entry) => {
		const actual = comparableWinPath(entry.path, platform);
		return actual === wanted || actual.startsWith(prefix);
	});
}
function listProcesses(options = {}) {
	if ((options.platform ?? process.platform) !== "win32") return Promise.resolve([]);
	const timeoutMs = options.timeoutMs ?? PROCESS_SCAN_TIMEOUT_MS;
	const launcher = options.spawnImpl ?? spawn;
	return new Promise((resolve) => {
		let settled = false;
		let stdout = "";
		let child = null;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		const timer = setTimeout(() => {
			try {
				child?.kill();
			} catch {}
			finish([]);
		}, timeoutMs);
		try {
			child = launcher("powershell.exe", [
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-Command",
				SCAN_SCRIPT
			], {
				windowsHide: true,
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
			child.stdout?.setEncoding("utf8");
			child.stdout?.on("data", (chunk) => {
				if (stdout.length < 64 * 1024) stdout += chunk;
			});
			child.on("error", () => finish([]));
			child.on("close", () => finish(parseProcessLines(stdout)));
		} catch {
			finish([]);
		}
	});
}
function yamlScalar(value) {
	return JSON.stringify(String(value));
}
function buildBridgeOverrideBlock(executable, settings, version = PINNED_WINDOWS_MCP_VERSION) {
	const args = ["serve"];
	if (settings.bridge.excludeTools.length > 0) args.push("--exclude-tools", settings.bridge.excludeTools.join(","));
	const envEntries = {
		ANONYMIZED_TELEMETRY: "false",
		WINDOWS_MCP_DISABLE_FLASH: settings.bridge.disableFlash ? "1" : "0",
		WINDOWS_MCP_SCREENSHOT_SCALE: String(settings.bridge.screenshotScale),
		WINDOWS_MCP_VERSION: version
	};
	if (settings.bridge.screenshotBackend !== "auto") envEntries.WINDOWS_MCP_SCREENSHOT_BACKEND = settings.bridge.screenshotBackend;
	const argsYaml = args.map((item) => `      - ${yamlScalar(item)}`).join("\n");
	const envYaml = Object.entries(envEntries).map(([key, val]) => `      ${key}: ${yamlScalar(val)}`).join("\n");
	return [
		PROFILE_BLOCK_BEGIN,
		`- id: ${BRIDGE_ROW_ID}`,
		"  disabled: false",
		"  config:",
		`    command: ${yamlScalar(executable)}`,
		"    args:",
		argsYaml,
		`    toolCallTimeoutMs: ${settings.bridge.toolCallTimeoutMs}`,
		"    failOnStartupError: false",
		"    env:",
		envYaml,
		PROFILE_BLOCK_END
	].join("\n");
}
/** Idempotently insert or replace the machine-managed bridge override block in a profile patch YAML. */
function upsertBridgeOverride(existingYaml, block, eol = "\n") {
	const normalized = existingYaml.replace(/\r\n/gu, "\n");
	const startIdx = normalized.indexOf(PROFILE_BLOCK_BEGIN);
	const endIdx = normalized.indexOf(PROFILE_BLOCK_END);
	let next;
	if (startIdx >= 0 && endIdx > startIdx) {
		const afterEnd = endIdx + 25;
		next = [
			normalized.slice(0, startIdx).replace(/\s+$/u, ""),
			block,
			normalized.slice(afterEnd).replace(/^\s+/u, "")
		].filter(Boolean).join("\n\n") + "\n";
	} else {
		const trimmed = normalized.trim();
		next = `${trimmed === "" || trimmed === "[]" ? "" : `${trimmed}\n\n`}${block}\n`;
	}
	return eol === "\n" ? next : next.replace(/\n/gu, eol);
}
function writeBridgeOverrideFile(profileDir, executable, settings, version = PINNED_WINDOWS_MCP_VERSION) {
	const patchPath = join(profileDir, "cordis.patch.yml");
	const updated = upsertBridgeOverride(existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "[]\n", buildBridgeOverrideBlock(executable, settings, version));
	mkdirSync(dirname(patchPath), { recursive: true });
	const tmpPath = `${patchPath}.tmp-${process.pid}-${Date.now()}`;
	writeFileSync(tmpPath, updated, "utf8");
	try {
		renameSync(tmpPath, patchPath);
	} catch (error) {
		if (existsSync(patchPath)) rmSync(patchPath, { force: true });
		renameSync(tmpPath, patchPath);
		if (!existsSync(patchPath)) throw error;
	}
	return patchPath;
}
function resolveActiveProfileDirectory(home = resolveDshHome()) {
	const desktopProfile = join(home, "profiles", "desktop");
	if (existsSync(join(desktopProfile, "package.json"))) return desktopProfile;
	const profilesDir = join(home, "profiles");
	try {
		const entries = readdirSync(profilesDir, { withFileTypes: true });
		for (const entry of entries) if (entry.isDirectory() && existsSync(join(profilesDir, entry.name, "package.json"))) return join(profilesDir, entry.name);
	} catch {}
	return existsSync(profilesDir) ? desktopProfile : null;
}
function appendLog(logs, line) {
	logs.push(line);
	if (logs.length > 80) logs.splice(0, logs.length - 80);
}
function createToolchainInstaller(options = {}) {
	const home = options.home ?? resolveDshHome();
	const toolchainRoot = managedToolchainRoot(home);
	const spawnImpl = options.spawnImpl ?? spawn;
	const probeMirrorsImpl = options.probeMirrorsImpl ?? probeMirrors;
	const listProcessesImpl = options.listProcessesImpl ?? listProcesses;
	const writeOverrideImpl = options.writeOverrideImpl ?? writeBridgeOverrideFile;
	let activeChild = null;
	let cancelRequested = false;
	let runningPromise = null;
	let snapshot = {
		state: "idle",
		version: PINNED_WINDOWS_MCP_VERSION,
		logs: [],
		mirrors: []
	};
	function update(patch) {
		snapshot = {
			...snapshot,
			...patch,
			logs: [...snapshot.logs]
		};
	}
	function runUvInstall(version, indexUrl, toolDir, logs) {
		return new Promise((resolve) => {
			const env = {
				...process.env,
				UV_TOOL_DIR: toolDir,
				UV_PYTHON_INSTALL_DIR: join(home, "win-control", "python")
			};
			const args = [
				"tool",
				"install",
				"--force",
				"--python",
				UV_PYTHON_REQUIREMENT,
				"--index-url",
				indexUrl,
				`windows-mcp==${version}`
			];
			let child;
			try {
				child = spawnImpl("uv", args, {
					env,
					windowsHide: true,
					stdio: [
						"ignore",
						"pipe",
						"pipe"
					]
				});
			} catch (error) {
				resolve({
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
				return;
			}
			activeChild = child;
			const collect = (chunk) => {
				for (const line of String(chunk).split(/\r?\n/u)) {
					const trimmed = line.trim();
					if (trimmed) appendLog(logs, trimmed);
				}
				update({ logs: [...logs] });
			};
			child.stdout?.on("data", collect);
			child.stderr?.on("data", collect);
			child.on("error", (error) => {
				activeChild = null;
				resolve({
					ok: false,
					error: error.message
				});
			});
			child.on("close", (code) => {
				activeChild = null;
				resolve(code === 0 ? { ok: true } : {
					ok: false,
					error: `uv 退出码 ${String(code ?? "unknown")}`
				});
			});
		});
	}
	async function start(params) {
		if (runningPromise) return snapshot;
		const version = params.version ?? "0.8.8";
		cancelRequested = false;
		const logs = [];
		snapshot = {
			state: "probing",
			version,
			message: "检查运行中进程与镜像测速...",
			logs,
			mirrors: []
		};
		runningPromise = (async () => {
			try {
				const targetToolRoot = versionToolRoot(toolchainRoot, version);
				const running = processesUnder(targetToolRoot, await listProcessesImpl());
				if (running.length > 0) {
					const msg = `检测到 windows-mcp 仍在运行（PID: ${running.map((p) => p.pid).join(", ")}），请先停止后再安装或覆盖。`;
					appendLog(logs, msg);
					update({
						state: "failed",
						error: msg,
						message: msg,
						logs
					});
					return snapshot;
				}
				const mirrors = await probeMirrorsImpl({ version });
				update({ mirrors });
				if (cancelRequested) {
					update({
						state: "cancelled",
						message: "已取消安装",
						logs
					});
					return snapshot;
				}
				const preferredId = params.settings.plugin.preferredMirror;
				const orderedCandidates = (() => {
					const usable = mirrors.filter((m) => m.ok);
					const list = usable.length > 0 ? usable : MIRROR_CANDIDATES.map((c) => ({
						...c,
						ok: false
					}));
					if (preferredId !== "auto") {
						const preferred = list.find((m) => m.id === preferredId);
						if (preferred) return [preferred, ...list.filter((m) => m.id !== preferredId)];
					}
					return list;
				})();
				let installedExe = null;
				let usedMirrorId = null;
				let lastError = "所有 PyPI 镜像均安装失败";
				for (const candidate of orderedCandidates) {
					if (cancelRequested) {
						update({
							state: "cancelled",
							message: "已取消安装",
							logs
						});
						return snapshot;
					}
					update({
						state: "installing",
						currentMirror: candidate.label,
						message: `正在通过 ${candidate.label} 安装 windows-mcp@${version}...`
					});
					appendLog(logs, `[${candidate.id}] uv tool install windows-mcp==${version} (${candidate.indexUrl})`);
					const res = await runUvInstall(version, candidate.indexUrl, targetToolRoot, logs);
					if (res.ok) {
						installedExe = managedExecutable(toolchainRoot, version);
						if (installedExe) {
							usedMirrorId = candidate.id;
							break;
						}
						lastError = "安装命令完成，但未找到 windows-mcp 可执行文件";
					} else lastError = res.error ?? lastError;
				}
				if (cancelRequested) {
					update({
						state: "cancelled",
						message: "已取消安装",
						logs
					});
					return snapshot;
				}
				if (!installedExe) {
					update({
						state: "failed",
						error: lastError,
						message: `安装失败：${lastError}`,
						logs
					});
					return snapshot;
				}
				writeManifest(toolchainRoot, version, { mirror: usedMirrorId });
				const profileDir = params.profileDir === void 0 ? resolveActiveProfileDirectory(home) : params.profileDir;
				if (profileDir) {
					const patchPath = writeOverrideImpl(profileDir, installedExe, params.settings, version);
					appendLog(logs, `已写入 Profile 配置块：${patchPath}`);
				}
				update({
					state: "succeeded",
					executable: installedExe,
					message: `已安装 windows-mcp@${version}，重启 DSH 后 MCP 桌面操控桥将自动激活。`,
					error: void 0,
					logs
				});
				return snapshot;
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				update({
					state: "failed",
					error: msg,
					message: `安装异常：${msg}`,
					logs
				});
				return snapshot;
			} finally {
				runningPromise = null;
			}
		})();
		return runningPromise;
	}
	function cancel() {
		if (!runningPromise) return snapshot;
		cancelRequested = true;
		try {
			activeChild?.kill();
		} catch {}
		update({
			state: "cancelled",
			message: "正在取消安装..."
		});
		return snapshot;
	}
	return {
		getSnapshot: () => ({
			...snapshot,
			logs: [...snapshot.logs],
			mirrors: [...snapshot.mirrors]
		}),
		start,
		cancel,
		toolchainRoot
	};
}
//#endregion
//#region src/host/desktop-probe.ts
const UPSTREAM_UIA_ISSUE = "https://github.com/CursorTouch/Windows-MCP/issues/607";
const PROBE_TIMEOUT_MS = 6e3;
const MAX_PROBE_OUTPUT = 16 * 1024;
const PROBE_SCRIPT = [
	"$ErrorActionPreference = 'SilentlyContinue'",
	"$uia = -1",
	"try { Add-Type -AssemblyName UIAutomationClient | Out-Null; $root = [System.Windows.Automation.AutomationElement]::RootElement; $uia = @($root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)).Count } catch { $uia = -1 }",
	"$win = -1",
	"try { $win = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }).Count } catch { $win = -1 }",
	"$scale = -1",
	"try { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class DshDpiProbe { [DllImport(\"user32.dll\")] public static extern uint GetDpiForSystem(); }' | Out-Null; $scale = [math]::Round([DshDpiProbe]::GetDpiForSystem() / 96.0, 3) } catch { $scale = -1 }",
	"Write-Output ('{\"uia\":' + $uia + ',\"windows\":' + $win + ',\"scale\":' + $scale + '}')"
].join("; ");
/** Read the last valid JSON metrics object from probe stdout. */
function parseProbeOutput(text) {
	if (typeof text !== "string" || text === "") return null;
	const lines = text.split(/\r?\n/u);
	for (let i = lines.length - 1; i >= 0; i--) {
		const trimmed = lines[i].trim();
		if (!trimmed.startsWith("{")) continue;
		let parsed;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (parsed === null || typeof parsed !== "object") continue;
		const record = parsed;
		const uia = Number(record.uia);
		const windows = Number(record.windows);
		const scale = Number(record.scale);
		if (!Number.isInteger(uia) || !Number.isInteger(windows) || !Number.isFinite(scale)) continue;
		return {
			uiaWindows: uia >= 0 ? uia : null,
			windowHandles: windows >= 0 ? windows : null,
			displayScale: scale > 0 ? scale : null
		};
	}
	return null;
}
/** Format a probe outcome and emit actionable UIA/DPI advisories. */
function describeProbe(probe) {
	if (!probe) return {
		line: "未检测",
		notes: []
	};
	if ("error" in probe) return {
		line: `未检测（${probe.error}）`,
		notes: []
	};
	if ("skipped" in probe) return {
		line: `未检测（${probe.skipped}）`,
		notes: []
	};
	const parts = [probe.uiaWindows === null ? "UI Automation 不可用" : `UI Automation 可见 ${probe.uiaWindows} 个顶层窗口`];
	if (probe.windowHandles !== null) parts.push(`${probe.windowHandles} 个 Win32 窗口句柄`);
	if (probe.displayScale !== null) parts.push(`系统缩放 ${Math.round(probe.displayScale * 100)}%`);
	const notes = [];
	if (probe.windowHandles !== null && probe.windowHandles >= 3 && probe.uiaWindows !== null && probe.uiaWindows <= 1) notes.push(`检测到 UI Automation 仅可见 ${probe.uiaWindows} 个窗口，但系统存在 ${probe.windowHandles} 个窗口句柄（上游已知问题 ${UPSTREAM_UIA_ISSUE}）。注销 Windows 会话或重启可恢复 UIA 服务。`);
	if (probe.displayScale !== null && probe.displayScale >= 1.25) notes.push(`主显示器当前缩放为 ${Math.round(probe.displayScale * 100)}%（上游 #607 存在高 DPI 绝对坐标缩放偏差）。建议优先使用 Snapshot 无障碍树节点定位而非纯屏幕坐标点击。`);
	return {
		line: parts.join("，"),
		notes
	};
}
/** Run the read-only desktop UIA & DPI probe once without throwing. */
function probeDesktop(options = {}) {
	const platform = options.platform ?? process.platform;
	if (platform !== "win32") return Promise.resolve({ skipped: `非 Windows 平台 (${platform})` });
	const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0 ? options.timeoutMs : PROBE_TIMEOUT_MS;
	const launcher = options.spawnImpl ?? spawn;
	return new Promise((resolve) => {
		let settled = false;
		let timer = null;
		let child = null;
		const finish = (outcome) => {
			if (settled) return;
			settled = true;
			if (timer !== null) clearTimeout(timer);
			resolve(outcome);
		};
		try {
			timer = setTimeout(() => {
				try {
					child?.kill();
				} catch {}
				finish({ error: `超时 (${timeoutMs}ms)` });
			}, timeoutMs);
			child = launcher("powershell.exe", [
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-Command",
				PROBE_SCRIPT
			], {
				windowsHide: true,
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
		} catch (error) {
			finish({ error: error instanceof Error ? error.message : String(error) });
			return;
		}
		let stdout = "";
		child.stdout?.setEncoding("utf8");
		child.stdout?.on("data", (chunk) => {
			if (stdout.length < MAX_PROBE_OUTPUT) stdout += chunk;
		});
		child.on("error", (error) => finish({ error: error.message }));
		child.on("close", () => {
			const parsed = parseProbeOutput(stdout);
			finish(parsed ?? { error: "未解析到探测结果" });
		});
	});
}
//#endregion
//#region src/host/tool-gate.ts
const BRIDGE_TOOL_PREFIX = "mcp__windows__";
const REVEAL_TOOL_NAME = "win_control_reveal";
const DOCTOR_TOOL_NAME = "windows_mcp_doctor";
const MAX_GRANT_ENTRIES = 1024;
function isBridgedToolName(name) {
	return typeof name === "string" && name.startsWith("mcp__windows__");
}
function getService$1(ctx, name) {
	const candidate = ctx;
	try {
		return candidate.get?.(name) ?? candidate[name];
	} catch {
		return;
	}
}
function extractSchemaInfo(entry) {
	if (Array.isArray(entry)) {
		const [name, schema] = entry;
		if (!name) return null;
		return {
			name,
			description: schema?.description ?? "",
			parameters: schema?.parameters
		};
	}
	if (!entry?.name) return null;
	return {
		name: entry.name,
		description: entry.description ?? "",
		parameters: entry.parameters
	};
}
function collectBridgedCatalog(tools) {
	if (!tools?.schemas) return [];
	try {
		const raw = tools.schemas();
		if (!Array.isArray(raw)) return [];
		return raw.map(extractSchemaInfo).filter((item) => item !== null && isBridgedToolName(item.name)).sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		return [];
	}
}
function sessionIdOf(agent) {
	const session = agent?.session;
	if (session && typeof session.id === "string" && session.id !== "") return session.id;
	return typeof agent?.id === "string" && agent.id !== "" ? agent.id : null;
}
/**
* Ephemeral per-session gate controlling whether `mcp__windows__*` schemas are
* exposed and dispatched, plus lazy schema reveal to minimize token overhead.
*/
var WinControlGate = class {
	grants = /* @__PURE__ */ new Map();
	revealed = /* @__PURE__ */ new WeakMap();
	applied = /* @__PURE__ */ new WeakMap();
	liveAgents = /* @__PURE__ */ new Set();
	applying = false;
	ctx;
	getSettings;
	home;
	probeImpl;
	constructor(options) {
		this.ctx = options.ctx;
		this.getSettings = options.getSettings;
		this.home = options.home;
		this.probeImpl = options.probeImpl ?? probeDesktop;
	}
	lookupSession(sessionId) {
		const sessions = getService$1(this.ctx, "sessions");
		try {
			return sessions?.get?.(sessionId) ?? null;
		} catch {
			return null;
		}
	}
	grantChainOf(session) {
		const chain = [];
		let current = session;
		for (let depth = 0; depth < 8 && current; depth++) {
			chain.push(current);
			const header = current.header;
			if (header?.origin !== "subagent" || typeof header.parentSession !== "string") break;
			current = this.lookupSession(header.parentSession);
		}
		return chain;
	}
	isGrantedForAgent(agent) {
		const fallback = this.getSettings().plugin.defaultGrant;
		const session = agent?.session;
		if (!session) {
			const id = sessionIdOf(agent);
			if (!id) return false;
			const explicit = this.grants.get(id);
			return explicit === void 0 ? fallback : explicit;
		}
		for (const candidate of this.grantChainOf(session)) {
			const explicit = this.grants.get(candidate.id);
			if (explicit !== void 0) return explicit;
		}
		return fallback;
	}
	isGrantedForSessionId(sessionId) {
		if (!sessionId) return false;
		const session = this.lookupSession(sessionId);
		if (!session) {
			const explicit = this.grants.get(sessionId);
			return explicit === void 0 ? this.getSettings().plugin.defaultGrant : explicit;
		}
		return this.isGrantedForAgent({ session });
	}
	setSessionGrant(sessionId, enabled) {
		if (!sessionId) return;
		this.grants.delete(sessionId);
		this.grants.set(sessionId, enabled);
		while (this.grants.size > MAX_GRANT_ENTRIES) {
			const oldest = this.grants.keys().next().value;
			if (typeof oldest !== "string") break;
			this.grants.delete(oldest);
		}
		this.reapply();
	}
	revealStateFor(agent) {
		const key = agent && typeof agent === "object" ? agent : null;
		if (!key) return {
			all: false,
			names: /* @__PURE__ */ new Set()
		};
		let entry = this.revealed.get(key);
		if (!entry) {
			entry = {
				all: false,
				names: /* @__PURE__ */ new Set()
			};
			this.revealed.set(key, entry);
		}
		return entry;
	}
	isToolRevealed(agent, name) {
		if (!this.getSettings().plugin.lazyTools) return true;
		const state = this.revealStateFor(agent);
		return state.all || state.names.has(name);
	}
	denyListFor(agent) {
		const tools = getService$1(this.ctx, "tools");
		if (!tools?.schemas) return null;
		let raw;
		try {
			raw = tools.schemas();
		} catch {
			return null;
		}
		if (!Array.isArray(raw)) return null;
		const granted = this.isGrantedForAgent(agent);
		const lazy = this.getSettings().plugin.lazyTools;
		const deny = [];
		for (const item of raw) {
			const name = Array.isArray(item) ? item[0] : item?.name;
			if (typeof name !== "string") continue;
			if (name === "win_control_reveal") {
				if (!granted || !lazy) deny.push(name);
				continue;
			}
			if (!isBridgedToolName(name)) continue;
			if (granted && this.isToolRevealed(agent, name)) continue;
			deny.push(name);
		}
		return deny;
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
	/** Guard against synchronous `tools/change` re-entry emitted by `scoped.restrict()`. */
	applyToAgent(agent) {
		if (this.applying || !agent || typeof agent !== "object") return;
		this.liveAgents.add(agent);
		this.applying = true;
		try {
			const scoped = agent.ctx?.get?.("tools") ?? agent.ctx?.tools;
			if (typeof scoped?.restrict !== "function") return;
			const deny = this.denyListFor(agent);
			if (!deny) return;
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
		const agents = getService$1(this.ctx, "agents");
		try {
			for (const candidate of agents?.list?.() ?? []) this.applyToAgent(candidate);
		} catch {}
	}
	async buildDoctorReport(agent) {
		const catalog = collectBridgedCatalog(getService$1(this.ctx, "tools"));
		const installed = listManagedVersions(managedToolchainRoot(this.home));
		const probe = await this.probeImpl();
		const described = describeProbe(probe);
		const granted = agent ? this.isGrantedForAgent(agent) : this.getSettings().plugin.defaultGrant;
		const lines = [
			`运行平台: ${process.platform}`,
			`已安装托管 Windows-MCP: ${installed.length > 0 ? installed.map((v) => `${v.version} (${v.executable})`).join(", ") : "未安装"}`,
			`已挂载 MCP 桌面工具数: ${catalog.length}`,
			`当前会话桌面操控授权: ${granted ? "已开启" : "未开启"}`,
			`桌面探测: ${described.line}`
		];
		if (described.notes.length > 0) {
			lines.push("", "诊断提示:");
			for (const note of described.notes) lines.push(`- ${note}`);
		}
		return {
			report: lines.join("\n"),
			probe,
			bridgedCount: catalog.length
		};
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
		const mountTools = (tools) => {
			if (typeof tools.guard === "function") {
				const disposeGuard = tools.guard((exec) => {
					const name = exec?.name;
					if (!isBridgedToolName(name)) return void 0;
					if (!this.isGrantedForAgent(exec?.agent)) return `Windows 桌面操控在本会话尚未授权，因此无法调用 "${name}"。请在输入框左侧点击「桌面操控」胶囊开启后再试。`;
					if (!this.isToolRevealed(exec?.agent, name)) return `为节省上下文 Token，"${name}" 尚未展开。请先调用 ${REVEAL_TOOL_NAME} 展开所需桌面工具后再试。`;
				});
				if (typeof disposeGuard === "function") disposers.push(disposeGuard);
			}
			if (typeof tools.register === "function") {
				const disposeReveal = tools.register({
					name: REVEAL_TOOL_NAME,
					description: "Reveal Windows desktop UI automation tools (mcp__windows__*) for the next step when lazy tool loading is enabled.",
					parameters: {
						type: "object",
						additionalProperties: false,
						properties: {
							names: {
								type: "array",
								items: { type: "string" },
								description: "Optional specific tool names to reveal; omit to reveal all."
							},
							query: {
								type: "string",
								description: "Optional keyword filter."
							}
						}
					},
					execute: (args, exec) => {
						if (!this.isGrantedForAgent(exec?.agent)) return {
							revealed: [],
							tools: [],
							note: "当前会话尚未开启桌面操控授权，无法展开工具。"
						};
						const catalog = collectBridgedCatalog(tools);
						const requestedNames = Array.isArray(args?.names) ? args.names.map(String).filter(Boolean) : [];
						const query = typeof args?.query === "string" ? args.query.trim().toLowerCase() : "";
						let picked = catalog;
						if (requestedNames.length > 0) picked = catalog.filter((entry) => requestedNames.some((w) => w === entry.name || `mcp__windows__${w}` === entry.name));
						else if (query) picked = catalog.filter((entry) => entry.name.toLowerCase().includes(query) || entry.description.toLowerCase().includes(query));
						const state = this.revealStateFor(exec?.agent);
						for (const entry of picked) state.names.add(entry.name);
						if (catalog.length > 0 && picked.length === catalog.length) state.all = true;
						this.reapply(exec?.agent);
						return {
							revealed: picked.map((p) => p.name),
							tools: picked,
							note: picked.length === 0 ? "未匹配到桌面工具，请检查名称或无参数调用以展开全部。" : "工具已在当前会话激活，可在下一步直接调用。"
						};
					}
				});
				if (typeof disposeReveal === "function") disposers.push(disposeReveal);
				const disposeDoctor = tools.register({
					name: DOCTOR_TOOL_NAME,
					description: "Diagnose Windows-MCP installation, session grant status, UI Automation window visibility, and display DPI scaling.",
					parameters: {
						type: "object",
						additionalProperties: false,
						properties: {}
					},
					execute: async (_args, exec) => {
						return (await this.buildDoctorReport(exec?.agent)).report;
					}
				});
				if (typeof disposeDoctor === "function") disposers.push(disposeDoctor);
			}
		};
		const existingTools = getService$1(this.ctx, "tools");
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
			for (const dispose of disposers) try {
				dispose();
			} catch {}
		};
	}
};
//#endregion
//#region src/index.ts
function getService(ctx, name) {
	const candidate = ctx;
	try {
		return candidate.get?.(name) ?? candidate[name];
	} catch {
		return;
	}
}
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
	const maxBytes = 64 * 1024;
	if (Symbol.asyncIterator in request && typeof request[Symbol.asyncIterator] === "function") for await (const chunk of request) {
		const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk);
		total += buf.byteLength;
		if (total > maxBytes) throw new Error("request body too large");
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
	if (request.headers["x-dsh-win-control"] !== "1") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	if (peer?.principal?.kind !== void 0 && peer.principal.kind !== "owner") return false;
	const userScope = getService(ctx, "userScope");
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
	let lastMirrors = [];
	readSettings(home).then((loaded) => {
		cachedSettings = loaded;
		gate.reapply();
	}).catch(() => {});
	const installer = createToolchainInstaller({ home });
	const gate = new WinControlGate({
		ctx,
		getSettings: () => cachedSettings,
		home
	});
	const buildStatePayload = (sessionId) => {
		const catalog = collectBridgedCatalog(getService(ctx, "tools"));
		const installed = listManagedVersions(managedToolchainRoot(home));
		return {
			platform: process.platform,
			pinnedVersion: PINNED_WINDOWS_MCP_VERSION,
			installedVersions: installed,
			bridgedToolCount: catalog.length,
			bridgedTools: catalog.map((item) => item.name),
			sessionGranted: sessionId ? gate.isGrantedForSessionId(sessionId) : cachedSettings.plugin.defaultGrant,
			settings: cachedSettings,
			installer: installer.getSnapshot(),
			mirrors: lastMirrors
		};
	};
	const handleRequest = async (request, response, peer) => {
		if (!isAuthorizedRequest(ctx, request, peer)) {
			sendJson(response, 403, { error: "forbidden" });
			return;
		}
		const url = new URL(request.url ?? "/", "http://localhost");
		const method = (request.method ?? "GET").toUpperCase();
		try {
			if (method === "GET" && url.pathname === `/api/dsh-win-control/state`) {
				sendJson(response, 200, buildStatePayload(url.searchParams.get("sessionId")));
				return;
			}
			if (method === "GET" && url.pathname === `/api/dsh-win-control/settings`) {
				cachedSettings = await readSettings(home);
				sendJson(response, 200, { settings: cachedSettings });
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-win-control/settings`) {
				const saved = await writeSettingsAtomic(await readJsonBody(request), home);
				cachedSettings = saved.settings;
				const installed = listManagedVersions(managedToolchainRoot(home));
				const profileDir = resolveActiveProfileDirectory(home);
				if (installed.length > 0 && profileDir) writeBridgeOverrideFile(profileDir, installed[0].executable, cachedSettings, installed[0].version);
				gate.reapply();
				sendJson(response, 200, saved);
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-win-control/grant`) {
				const body = await readJsonBody(request);
				if (typeof body.sessionId !== "string" || body.sessionId === "" || typeof body.enabled !== "boolean") {
					sendJson(response, 400, { error: "invalid-grant" });
					return;
				}
				gate.setSessionGrant(body.sessionId, body.enabled);
				sendJson(response, 200, {
					sessionId: body.sessionId,
					enabled: body.enabled
				});
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-win-control/mirrors/probe`) {
				lastMirrors = await probeMirrors({ version: PINNED_WINDOWS_MCP_VERSION });
				sendJson(response, 200, { mirrors: lastMirrors });
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-win-control/install`) {
				installer.start({ settings: cachedSettings });
				sendJson(response, 202, { installer: installer.getSnapshot() });
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-win-control/install/cancel`) {
				sendJson(response, 200, { installer: installer.cancel() });
				return;
			}
			if (method === "POST" && url.pathname === `/api/dsh-win-control/doctor`) {
				sendJson(response, 200, await gate.buildDoctorReport());
				return;
			}
			sendJson(response, 404, { error: "not-found" });
		} catch (error) {
			sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
		}
	};
	ctx.effect(() => gate.mount());
	ctx.effect(() => {
		const webServer = getService(ctx, "webServer");
		if (!webServer) return () => {};
		if (typeof webServer.register === "function") return webServer.register({
			path: "/api/dsh-win-control",
			kind: "prefix",
			handler: handleRequest
		}) ?? (() => {});
		const stops = [
			["GET", `${ROUTE_PREFIX}/state`],
			["GET", `${ROUTE_PREFIX}/settings`],
			["POST", `${ROUTE_PREFIX}/settings`],
			["POST", `${ROUTE_PREFIX}/grant`],
			["POST", `${ROUTE_PREFIX}/mirrors/probe`],
			["POST", `${ROUTE_PREFIX}/install`],
			["POST", `${ROUTE_PREFIX}/install/cancel`],
			["POST", `${ROUTE_PREFIX}/doctor`]
		].map(([method, path]) => webServer.route?.(method, path, handleRequest)).filter((d) => typeof d === "function");
		return () => {
			for (const stop of stops) stop();
		};
	});
}
//#endregion
export { BRIDGE_ROW_ID, BRIDGE_TOOL_PREFIX, DOCTOR_TOOL_NAME, EXCLUDABLE_TOOLS, MIRROR_CANDIDATES, MIRROR_IDS, PACKAGE_ID, PINNED_WINDOWS_MCP_VERSION, PROBE_TIMEOUT_MS, PROFILE_BLOCK_BEGIN, PROFILE_BLOCK_END, REVEAL_TOOL_NAME, ROUTE_PREFIX, SCREENSHOT_BACKENDS, SCREENSHOT_SCALES, UPSTREAM_UIA_ISSUE, WinControlGate, apply, buildBridgeOverrideBlock, collectBridgedCatalog, createToolchainInstaller, defaultSettings, describeProbe, executableIn, isBridgedToolName, listManagedVersions, managedExecutable, managedToolchainRoot, normalizeSettings, parseProbeOutput, parseProcessLines, parseSimpleIndex, pickWheelEntry, probeDesktop, probeMirrors, processesUnder, readSettings, resolveDshHome, upsertBridgeOverride, writeSettingsAtomic };
