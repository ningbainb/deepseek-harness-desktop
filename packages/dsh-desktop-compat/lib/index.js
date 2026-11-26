import { FRIENDLY_CANCELLED_MESSAGE, createQueueRecoveryScheduler, normalizeCancellationDecision, recoverQueuedTurns } from "./recovery.js";
import { DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV, isDesktopWorkspaceFileOpenToken, isSafeDesktopWorkspaceFileOpenPath } from "./workspace-file-open-policy.js";
import { createRequire } from "node:module";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { defineTool, validateJsonSchemaValue } from "@deepseek-ai/dsh-tools";
import { accessSync, chmodSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from "node:path";
import { Service } from "@deepseek-ai/cordis";
import { chmod, copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
//#region src/background-scheduler-runner.ts
/**
* Desktop-owned Task Board runner for the durable Host scheduler.
*
* It stays inside the public DSH Agent/Session/Workspace APIs: a scheduled
* task can run only in a workspace already registered by DSH, produces a
* normal durable session, and reports the canonical TaskRun key back to the
* Task Board.  It deliberately does not manufacture an Electron-side shell
* job or accept a renderer-supplied path.
*/
const PROVIDER_EVIDENCE = Object.freeze({
	providerId: "dsh-cli-provider-v1",
	supportStatus: "known-good",
	capabilities: [
		{
			id: "host-schedule",
			status: "available"
		},
		{
			id: "workspace.register",
			status: "available"
		},
		{
			id: "session.create",
			status: "available"
		},
		{
			id: "session.observe",
			status: "available"
		}
	],
	registerWorkspace: "available",
	createSession: "available",
	sessionObserve: "available",
	sessionCwdVerified: true,
	note: "Desktop background scheduler runs through a registered DSH workspace and durable session."
});
/**
* Desktop's runner owns only project-backed shared-workspace tasks. The
* Task Board publishes this shape to browsers and combines it with the live
* preflight below before a Host lease or TaskRun is created.
*/
const DESKTOP_TASK_BOARD_SCHEDULER_OWNERSHIP = Object.freeze({
	requiresProject: true,
	requiresPrompt: true,
	supportedIsolationModes: ["shared-workspace"]
});
function boundedError(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/[\r\n\t]+/gu, " ").trim().slice(0, 500) || "scheduled task failed";
}
function terminalReason(events, firstSequence) {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event === void 0 || event.seq < firstSequence) continue;
		if (event.type === "turn/end") return event.data.reason;
	}
}
function terminalOutcome(reason) {
	if (reason?.kind === "completed") return "succeeded";
	if (reason?.kind === "aborted") return "cancelled";
	return "failed";
}
function hasScheduledPrompt(events, prompt) {
	return events.some((event) => {
		if (event.type !== "user/message") return false;
		const message = event.data;
		if (message === null || typeof message !== "object" || Array.isArray(message)) return false;
		const source = message.source;
		const content = message.content;
		if (source === null || typeof source !== "object" || Array.isArray(source) || source.kind !== "user" || !Array.isArray(content)) return false;
		return content.some((block) => block !== null && typeof block === "object" && !Array.isArray(block) && block.type === "text" && block.text === prompt);
	});
}
function failure$2(input, error) {
	return {
		kind: "settled",
		outcome: "failed",
		error,
		workspaceId: input.project?.workspaceId ?? input.run.workspaceId
	};
}
function completeRun(input, sessionId, workspaceId, outcome, now, error) {
	return {
		...input.run,
		runId: input.executionKey,
		sessionId,
		workspaceId,
		finishedAt: now(),
		resultStatus: outcome === "succeeded" ? "awaiting-review" : outcome,
		runtimeProviderEvidence: PROVIDER_EVIDENCE,
		...error === void 0 ? {} : { fallbackReason: error }
	};
}
function sessionIdForExecutionKey(executionKey, createSessionId) {
	const value = createSessionId(executionKey).trim();
	if (value === "") throw new Error("scheduled task session id is empty");
	return SessionId(value);
}
function defaultSessionId(executionKey) {
	return `task-board-${createHash("sha256").update(executionKey).digest("hex")}`;
}
/**
* Checks every Desktop-only condition before the Host claims a schedule slot.
* A false result is intentionally not an execution failure: the task remains
* for the browser scheduler, which may have a different viable execution
* path. Keep this in lockstep with the early guards in `run` below.
*/
const AUTOMATION_RESTRICTED_PROVIDERS = /* @__PURE__ */ new Set(["antigravity-cli"]);
async function canDesktopRunnerOwnTask(input, options) {
	const project = input.project;
	if (project === void 0 || input.task.prompt.trim() === "") return false;
	if ((input.task.isolationMode === "inherit" || input.task.isolationMode === void 0 ? project.defaultIsolation : input.task.isolationMode) !== "shared-workspace") return false;
	const workspace = options.workspaceRegistry.get(project.workspaceId);
	if (workspace === void 0 || await workspace.status() !== "ok") return false;
	const selection = options.defaultModel.currentSelection();
	const provider = selection.provider.trim();
	return provider !== "" && selection.model.trim() !== "" && !AUTOMATION_RESTRICTED_PROVIDERS.has(provider);
}
/**
* Build a real Host runner. Callers should expose it only after the user has
* explicitly enabled Desktop background automation; the Task Board otherwise
* keeps its browser scheduler active.
*/
function createDesktopTaskBoardHostScheduleRunner(options) {
	const now = options.now ?? Date.now;
	const createSessionId = options.createSessionId ?? defaultSessionId;
	return Object.freeze({
		provider: "runtime-provider-host-job",
		evidence: PROVIDER_EVIDENCE,
		taskOwnership: DESKTOP_TASK_BOARD_SCHEDULER_OWNERSHIP,
		canOwnTask: (input) => canDesktopRunnerOwnTask(input, options),
		async run(input) {
			const project = input.project;
			if (project === void 0) return failure$2(input, "scheduled task has no registered Desktop project");
			if ((input.task.isolationMode === "inherit" || input.task.isolationMode === void 0 ? project.defaultIsolation : input.task.isolationMode) === "git-worktree") return failure$2(input, "background scheduling requires a Runtime Provider Worktree adapter; this task requests git-worktree isolation");
			const prompt = input.task.prompt.trim();
			if (prompt === "") return failure$2(input, "scheduled task prompt is empty");
			const workspace = options.workspaceRegistry.get(project.workspaceId);
			if (workspace === void 0) return failure$2(input, "scheduled task workspace is no longer registered");
			if (await workspace.status() !== "ok") return failure$2(input, "scheduled task workspace directory is unavailable");
			const selection = options.defaultModel.currentSelection();
			const provider = selection.provider.trim();
			if (provider === "" || selection.model.trim() === "") return failure$2(input, "no default DSH model is configured for background automation");
			if (AUTOMATION_RESTRICTED_PROVIDERS.has(provider)) return failure$2(input, `provider "${provider}" is not permitted for unattended background scheduling`);
			let handle;
			try {
				const sessionId = sessionIdForExecutionKey(input.executionKey, createSessionId);
				const agentOptions = {
					provider: selection.provider,
					model: selection.model,
					...selection.reasoningEffort === void 0 ? {} : { reasoningEffort: selection.reasoningEffort }
				};
				const setup = (agentCtx) => {
					installModelSelection(agentCtx);
				};
				const persisted = options.sessionPersistence === void 0 ? false : (await options.sessionPersistence.list()).some((snapshot) => String(snapshot.header.id) === String(sessionId));
				handle = persisted ? await options.agents.resume({
					resumeSessionId: sessionId,
					agentOptions,
					setup
				}) : await options.agents.create({
					sessionId,
					meta: { cwd: workspace.path },
					agentOptions,
					setup
				});
				const { agent } = handle;
				await agent.whenIdle();
				const firstSequence = agent.session.seq;
				const promptAlreadyAccepted = persisted && hasScheduledPrompt((await options.sessionQuery.readSession(agent.session.id)).events, prompt);
				if (!promptAlreadyAccepted) {
					agent.followup(createUserMessage({
						content: [{
							type: "text",
							text: prompt
						}],
						source: { kind: "user" }
					}));
					await agent.whenIdle();
				}
				await options.sessions.flush(agent.session);
				const reason = terminalReason((await options.sessionQuery.readSession(agent.session.id)).events, promptAlreadyAccepted ? 0 : firstSequence);
				const outcome = terminalOutcome(reason);
				const error = outcome === "failed" ? reason?.kind === "error" ? `${reason.error.code}: ${reason.error.message}`.slice(0, 500) : promptAlreadyAccepted ? `scheduled session was already accepted before recovery and ended with ${reason?.kind ?? "no terminal outcome"}` : `scheduled turn ended with ${reason?.kind ?? "no terminal outcome"}` : void 0;
				return {
					kind: "settled",
					outcome,
					...error === void 0 ? {} : { error },
					sessionId: agent.id,
					workspaceId: project.workspaceId,
					run: completeRun(input, agent.id, project.workspaceId, outcome, now, error)
				};
			} catch (error) {
				const message = boundedError(error);
				const sessionId = handle?.agent.id;
				return {
					...failure$2(input, message),
					...sessionId === void 0 ? {} : {
						sessionId,
						run: completeRun(input, sessionId, project.workspaceId, "failed", now, message)
					}
				};
			} finally {
				await handle?.dispose().catch(() => {});
			}
		}
	});
}
//#endregion
//#region src/skin-state.ts
const SKIN_STATE_START = "# --- dsh-desktop skin state (auto-generated; do not edit) ---";
const SKIN_STATE_END = "# --- end dsh-desktop skin state ---";
const LOADER_ID_RE = /^[A-Za-z0-9._/@-]+$/;
const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
function readText(path) {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return "";
	}
}
function sectionBounds(text, startMarker = SKIN_STATE_START, endMarker = SKIN_STATE_END) {
	const start = text.indexOf(startMarker);
	if (start === -1) return null;
	const markerEnd = text.indexOf(endMarker, start);
	if (markerEnd === -1) throw new Error("desktopSkinState: managed skin section is unterminated");
	return {
		start,
		end: markerEnd + endMarker.length
	};
}
function isMarketStateId(id) {
	return LOADER_ID_RE.test(id) && !id.startsWith("ui-skin-");
}
function controlledRows(text) {
	const bounds = sectionBounds(text);
	const rows = /* @__PURE__ */ new Map();
	if (bounds === null) return rows;
	const lines = text.slice(bounds.start, bounds.end).split(/\r?\n/u);
	for (let index = 0; index < lines.length; index += 1) {
		const id = /^- id:\s*([A-Za-z0-9._/@-]+)\s*$/u.exec(lines[index] ?? "")?.[1];
		if (id === void 0 || !isMarketStateId(id)) continue;
		const disabled = /^\s{2}disabled:\s*(true|false)\s*$/u.exec(lines[index + 1] ?? "")?.[1];
		rows.set(id, disabled === "true");
	}
	return rows;
}
function managedIds(text) {
	const bounds = sectionBounds(text);
	if (bounds === null) return /* @__PURE__ */ new Set();
	const ids = /* @__PURE__ */ new Set();
	for (const line of text.slice(bounds.start, bounds.end).split(/\r?\n/u)) {
		const id = /^\s*- id:\s*([A-Za-z0-9._/@-]+)\s*$/u.exec(line)?.[1];
		if (id !== void 0 && isMarketStateId(id)) ids.add(id);
	}
	return ids;
}
function renderRows(rows) {
	const lines = [SKIN_STATE_START];
	for (const [id, disabled] of [...rows].filter(([id]) => isMarketStateId(id)).sort(([left], [right]) => left.localeCompare(right))) lines.push(`- id: ${id}`, `  disabled: ${disabled ? "true" : "false"}`);
	lines.push(SKIN_STATE_END);
	return lines.join("\n");
}
function appendDisabledRows(text, ids) {
	const bounds = sectionBounds(text);
	const existing = controlledRows(text);
	const additions = [...new Set(ids)].filter((id) => isMarketStateId(id) && !existing.has(id)).sort();
	if (additions.length === 0) return text;
	const rows = additions.flatMap((id) => [`- id: ${id}`, "  disabled: true"]).join("\n");
	if (bounds === null) return replaceSection(text, `${SKIN_STATE_START}\n${rows}\n${SKIN_STATE_END}`);
	return `${text.slice(0, bounds.end - 36).replace(/\s*$/u, "")}\n${rows}\n${text.slice(bounds.end - 36)}`;
}
function replaceSection(text, section) {
	const bounds = sectionBounds(text);
	const outside = (bounds === null ? text.trim() : `${text.slice(0, bounds.start)}${text.slice(bounds.end)}`.trim()).split(/\r?\n/u).filter((line) => !/^[ \t]*\[\]$/u.test(line)).join("\n").trim();
	return outside ? `${outside}\n\n${section}\n` : `${section}\n`;
}
function writeAtomic(path, content) {
	const parent = dirname(path);
	mkdirSync(parent, { recursive: true });
	let mode = 384;
	try {
		mode = statSync(path).mode & 511;
	} catch {}
	const temporaryDir = mkdtempSync(join(parent, `${basename(path)}.tmp-`));
	const temporary = join(temporaryDir, basename(path));
	try {
		writeFileSync(temporary, content, {
			encoding: "utf8",
			flag: "wx"
		});
		chmodSync(temporary, mode);
		renameSync(temporary, path);
	} finally {
		rmSync(temporaryDir, {
			recursive: true,
			force: true
		});
	}
	if (readFileSync(path, "utf8") !== content) throw new Error(`desktopSkinState: write verification failed: ${path}`);
}
var DesktopSkinStateStore = class {
	home;
	profile;
	constructor(home = process.env.DSH_HOME ?? join(homedir(), ".dsh"), profile = process.env.DSH_PROFILE ?? "desktop") {
		this.home = home;
		this.profile = profile;
	}
	get profileDir() {
		return join(this.home, "profiles", this.profile);
	}
	get patchPath() {
		return join(this.profileDir, "cordis.patch.yml");
	}
	wiredPackageNames() {
		try {
			const manifest = JSON.parse(readFileSync(join(this.profileDir, "package.json"), "utf8"));
			const names = /* @__PURE__ */ new Set();
			const bundles = manifest.dsh?.profile?.bundles;
			if (Array.isArray(bundles)) {
				for (const value of bundles) if (typeof value === "string") names.add(value);
			}
			if (typeof manifest.dependencies === "object" && manifest.dependencies !== null) for (const name of Object.keys(manifest.dependencies)) names.add(name);
			return names;
		} catch {
			return /* @__PURE__ */ new Set();
		}
	}
	loaderId(name, entries) {
		if (!PACKAGE_NAME_RE.test(name)) return null;
		const packagePatch = readText(join(this.profileDir, "node_modules", ...name.split("/"), "cordis.patch.yml"));
		let pending = null;
		for (const line of packagePatch.split(/\r?\n/u)) {
			const id = /^\s*-\s+id:\s*['"]?([A-Za-z0-9._/@-]+)/u.exec(line);
			if (id !== null) pending = id[1];
			const packageName = /^\s*name:\s*['"]?([^'"\s]+)/u.exec(line);
			if (pending !== null && packageName?.[1] === name) return pending;
		}
		for (const entry of entries) if (entry.options.name === name && typeof entry.options.id === "string" && LOADER_ID_RE.test(entry.options.id)) return entry.options.id;
		return null;
	}
	migrateLegacy(disabledNames, entries) {
		const entryList = [...entries];
		const migrated = /* @__PURE__ */ new Set();
		const text = readText(this.patchPath);
		const ids = [];
		for (const name of disabledNames) {
			const id = this.loaderId(name, entryList);
			if (id === null || !isMarketStateId(id)) continue;
			ids.push(id);
			migrated.add(name);
		}
		const next = appendDisabledRows(text, ids);
		if (next !== text) writeAtomic(this.patchPath, next);
		return migrated;
	}
	disabledNames(themeNames, entries) {
		const entryList = [...entries];
		const rows = controlledRows(readText(this.patchPath));
		const disabled = /* @__PURE__ */ new Set();
		for (const name of themeNames) {
			const id = this.loaderId(name, entryList);
			if (id !== null && isMarketStateId(id) && rows.get(id) === true) disabled.add(name);
		}
		return disabled;
	}
	activateBundleTheme(name, themeNames, entries) {
		const wiredPackages = this.wiredPackageNames();
		if (!wiredPackages.has(name)) throw new Error(`desktopSkinState: ${name} is not wired through the active profile`);
		const entryList = [...entries];
		const targetId = this.loaderId(name, entryList);
		if (targetId === null || !isMarketStateId(targetId)) throw new Error(`desktopSkinState: no market loader id for ${name}`);
		const text = readText(this.patchPath);
		const rows = controlledRows(text);
		for (const id of rows.keys()) rows.set(id, true);
		for (const id of managedIds(text)) if (!rows.has(id)) rows.set(id, true);
		for (const themeName of themeNames) {
			if (!wiredPackages.has(themeName)) continue;
			const id = this.loaderId(themeName, entryList);
			if (id !== null && isMarketStateId(id)) rows.set(id, themeName !== name);
		}
		rows.set(targetId, false);
		writeAtomic(this.patchPath, replaceSection(text, renderRows(rows)));
		rmSync(join(this.home, "skin-center-active.json"), { force: true });
	}
};
var DesktopSkinStateService = class extends Service {
	store;
	constructor(ctx) {
		super(ctx, "desktopSkinState");
		this.store = new DesktopSkinStateStore();
	}
	migrateLegacy(disabledNames, entries) {
		return this.store.migrateLegacy(disabledNames, entries);
	}
	disabledNames(themeNames, entries) {
		return this.store.disabledNames(themeNames, entries);
	}
	activateBundleTheme(name, themeNames, entries) {
		this.store.activateBundleTheme(name, themeNames, entries);
	}
};
//#endregion
//#region src/tool-call-normalization.ts
function isJsonObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function parseObject(raw) {
	try {
		const parsed = JSON.parse(raw);
		return isJsonObject(parsed) ? parsed : void 0;
	} catch {
		return;
	}
}
function onlyArgumentsEnvelope(value) {
	const keys = Object.keys(value);
	return keys.length === 1 && keys[0] === "arguments";
}
function buildToolSchemaLookup(tools) {
	const lookup = /* @__PURE__ */ new Map();
	for (const tool of tools ?? []) {
		if (typeof tool.name !== "string" || tool.name.length === 0) continue;
		const previous = lookup.get(tool.name);
		lookup.set(tool.name, previous === void 0 ? {
			kind: "found",
			schema: tool
		} : { kind: "duplicate" });
	}
	return lookup;
}
/**
* Recover the one transport defect reported by Desktop users without changing
* the tool contract: `{ "arguments": { ...valid tool arguments... } }`.
*
* A field called `arguments` can be legitimate for a third-party tool. We
* therefore unwrap only when all of these hold:
*
* 1. The outer value is a JSON object with exactly one own `arguments` key.
* 2. Its nested value is an object (one level only; no recursive guessing).
* 3. The currently advertised schema accepts the nested value.
* 4. The same schema rejects the original outer value.
*
* Conditions 3 and 4 make a valid-but-ambiguous tool contract fail closed.
* Every other input is handed to the ordinary DSH schema validator unchanged.
*/
function normalizeWrappedToolCallArguments(raw, tool) {
	return normalizeWrappedToolCallArgumentsWithLookup(raw, tool === void 0 ? { kind: "missing" } : {
		kind: "found",
		schema: tool
	});
}
function normalizeWrappedToolCallArgumentsWithLookup(raw, tool) {
	const outer = parseObject(raw);
	if (outer === void 0 || !onlyArgumentsEnvelope(outer)) return { arguments: raw };
	if (tool.kind === "missing") return {
		arguments: raw,
		diagnostic: {
			outcome: "rejected",
			reason: "unknown-tool"
		}
	};
	if (tool.kind === "duplicate") return {
		arguments: raw,
		diagnostic: {
			outcome: "rejected",
			reason: "duplicate-tool-schema"
		}
	};
	let outerViolations;
	try {
		outerViolations = validateJsonSchemaValue(tool.schema.parameters, outer);
	} catch {
		return {
			arguments: raw,
			diagnostic: {
				outcome: "rejected",
				reason: "unsupported-tool-schema"
			}
		};
	}
	const nested = outer.arguments;
	if (!isJsonObject(nested)) return outerViolations.length === 0 ? { arguments: raw } : {
		arguments: raw,
		diagnostic: {
			outcome: "rejected",
			reason: "nested-arguments-not-object"
		}
	};
	let nestedViolations;
	try {
		nestedViolations = validateJsonSchemaValue(tool.schema.parameters, nested);
	} catch {
		return {
			arguments: raw,
			diagnostic: {
				outcome: "rejected",
				reason: "unsupported-tool-schema"
			}
		};
	}
	if (outerViolations.length === 0) return nestedViolations.length === 0 ? {
		arguments: raw,
		diagnostic: {
			outcome: "rejected",
			reason: "ambiguous-outer-and-inner-valid"
		}
	} : { arguments: raw };
	if (nestedViolations.length > 0) return {
		arguments: raw,
		diagnostic: {
			outcome: "rejected",
			reason: "nested-arguments-invalid"
		}
	};
	return {
		arguments: JSON.stringify(nested),
		diagnostic: {
			outcome: "normalized",
			reason: "schema-validated-envelope"
		}
	};
}
const SANDBOX_PERMISSION_LEVELS = /* @__PURE__ */ new Set([
	"read-only",
	"workspace-write",
	"danger-full-access"
]);
/**
* Desktop's trusted Runtime already runs with the permission selected by the
* host. Some models still copy an escalation field into shell calls. When the
* current mode is `danger-full-access`, every declared sandbox target is equal
* or narrower and therefore cannot be an escalation. Remove only that one
* optional field, and only when the advertised tool schema still accepts the
* resulting arguments. All commands, paths, and other options remain exact.
*/
function normalizeRedundantSandboxEscalation(raw, tool, currentMode) {
	if (currentMode !== "danger-full-access" || tool === void 0) return { arguments: raw };
	const value = parseObject(raw);
	if (value === void 0 || !Object.hasOwn(value, "sandbox_permissions")) return { arguments: raw };
	if (typeof value.sandbox_permissions !== "string" || !SANDBOX_PERMISSION_LEVELS.has(value.sandbox_permissions)) return { arguments: raw };
	const normalized = { ...value };
	delete normalized.sandbox_permissions;
	try {
		if (validateJsonSchemaValue(tool.parameters, normalized).length > 0) return { arguments: raw };
	} catch {
		return { arguments: raw };
	}
	return {
		arguments: JSON.stringify(normalized),
		diagnostic: {
			outcome: "normalized",
			reason: "redundant-full-access-escalation"
		}
	};
}
function addDiagnostic(callback, options, name, id, source, normalization) {
	if (normalization.diagnostic === void 0 || callback === void 0) return;
	callback({
		...normalization.diagnostic,
		provider: options.provider,
		model: options.model,
		tool: name,
		callId: id,
		source
	});
}
function normalizeToolCall(raw, name, id, source, options, lookup, diagnostic, permissionMode) {
	const tool = lookup.get(name) ?? { kind: "missing" };
	const envelope = normalizeWrappedToolCallArgumentsWithLookup(raw, tool);
	const sandbox = tool.kind === "found" ? normalizeRedundantSandboxEscalation(envelope.arguments, tool.schema, permissionMode) : envelope;
	const normalization = sandbox.diagnostic === void 0 && envelope.diagnostic !== void 0 ? {
		...sandbox,
		diagnostic: envelope.diagnostic
	} : sandbox;
	addDiagnostic(diagnostic, options, name, id, source, normalization);
	return normalization.arguments;
}
function bufferToolCallChunk(buffered, chunk) {
	const existing = buffered.get(chunk.index);
	if (existing === void 0) {
		buffered.set(chunk.index, {
			chunks: [chunk],
			id: chunk.id,
			...chunk.name === void 0 || chunk.name.length === 0 ? {} : { name: chunk.name },
			arguments: chunk.argumentsDelta
		});
		return;
	}
	existing.chunks.push(chunk);
	existing.id = chunk.id;
	if (chunk.name !== void 0 && chunk.name.length > 0) existing.name = chunk.name;
	existing.arguments += chunk.argumentsDelta;
}
function* flushBufferedToolCall(index, buffered, options, lookup, diagnostic, permissionMode) {
	const pending = buffered.get(index);
	if (pending === void 0) return;
	buffered.delete(index);
	if (pending.name === void 0) {
		yield* pending.chunks;
		return;
	}
	const normalized = normalizeToolCall(pending.arguments, pending.name, pending.id, "stream-delta", options, lookup, diagnostic, permissionMode);
	if (normalized === pending.arguments) {
		yield* pending.chunks;
		return;
	}
	yield {
		type: "tool-call-delta",
		index,
		id: pending.id,
		name: pending.name,
		argumentsDelta: normalized
	};
}
function* flushRawBufferedToolCall(index, buffered) {
	const pending = buffered.get(index);
	if (pending === void 0) return;
	buffered.delete(index);
	yield* pending.chunks;
}
/**
* Normalize model tool-call payloads before dsh-agent-loop parses raw JSON.
* Complete `block-end` calls are transformed in place. Delta-only calls are
* held until they close so the raw JSON can be assessed as a complete value;
* non-recovered deltas are replayed byte-for-byte.
*/
async function* normalizeToolCallArgumentStream(options, source, diagnostic, permissionMode = process.env.DSH_PERMISSION_MODE) {
	const lookup = buildToolSchemaLookup(options.tools);
	const buffered = /* @__PURE__ */ new Map();
	try {
		for await (const chunk of source) {
			if (chunk.type === "tool-call-delta") {
				bufferToolCallChunk(buffered, chunk);
				continue;
			}
			if (chunk.type === "block-end") {
				if (chunk.block.type === "tool-call") {
					yield* flushRawBufferedToolCall(chunk.index, buffered);
					const arguments_ = normalizeToolCall(chunk.block.arguments, chunk.block.name, String(chunk.block.id), "block-end", options, lookup, diagnostic, permissionMode);
					yield {
						...chunk,
						block: {
							...chunk.block,
							arguments: arguments_
						}
					};
					continue;
				}
				yield* flushBufferedToolCall(chunk.index, buffered, options, lookup, diagnostic, permissionMode);
				yield chunk;
				continue;
			}
			if (chunk.type === "finish") {
				for (const index of [...buffered.keys()]) yield* flushBufferedToolCall(index, buffered, options, lookup, diagnostic, permissionMode);
				yield chunk;
				continue;
			}
			yield chunk;
		}
	} catch (error) {
		for (const index of [...buffered.keys()]) yield* flushBufferedToolCall(index, buffered, options, lookup, diagnostic, permissionMode);
		throw error;
	}
	for (const index of [...buffered.keys()]) yield* flushBufferedToolCall(index, buffered, options, lookup, diagnostic, permissionMode);
}
function diagnosticValue(value) {
	const truncated = value.length <= 160 ? value : `${value.slice(0, 157)}...`;
	return JSON.stringify(truncated);
}
/** Install the Desktop-only stream compatibility hook through the public SDK. */
function installToolCallArgumentNormalization(ctx) {
	ctx.on("llm/stream", (options, next) => normalizeToolCallArgumentStream(options, next(), (event) => {
		const message = [
			"dsh-desktop-compat: tool-call argument envelope",
			`outcome=${event.outcome}`,
			`reason=${event.reason}`,
			`provider=${diagnosticValue(event.provider)}`,
			`model=${diagnosticValue(event.model)}`,
			`tool=${diagnosticValue(event.tool)}`,
			`callId=${diagnosticValue(event.callId)}`,
			`source=${event.source}`
		].join(" ");
		ctx.logger?.warn?.(message);
	}), { global: true });
}
//#endregion
//#region src/transcript-balance.ts
function extractToolCallsFromAssistantMessage(message) {
	const results = [];
	if (message.role !== "assistant") return results;
	const candidateToolCalls = message.tool_calls;
	if (Array.isArray(candidateToolCalls)) {
		for (const call of candidateToolCalls) if (typeof call?.id === "string" && call.id.length > 0) results.push({
			id: call.id,
			name: call.name ?? call.function?.name
		});
	}
	if (Array.isArray(message.content)) {
		for (const block of message.content) if (block && typeof block === "object" && block.type === "tool-call") {
			const toolCallBlock = block;
			if (typeof toolCallBlock.id === "string" && toolCallBlock.id.length > 0) results.push({
				id: toolCallBlock.id,
				name: toolCallBlock.name
			});
		}
	}
	return results;
}
function balanceTranscriptMessages(messages) {
	if (!Array.isArray(messages) || messages.length === 0) return { messages: messages ?? [] };
	const lastMessage = messages.at(-1);
	if (lastMessage?.role === "assistant") {
		const trailingCalls = extractToolCallsFromAssistantMessage(lastMessage);
		if (trailingCalls.length > 0) return {
			messages: messages.slice(0, -1),
			diagnostic: {
				outcome: "stripped-trailing-assistant",
				droppedCallIds: trailingCalls.map((c) => c.id),
				droppedMessagesCount: 1
			}
		};
	}
	return { messages };
}
function installTranscriptBalanceGuard(ctx) {
	ctx.on("llm/stream", (options, next) => {
		if (options && Array.isArray(options.messages)) {
			const balanced = balanceTranscriptMessages(options.messages);
			if (balanced.diagnostic) {
				ctx.logger?.warn?.(`[dsh-desktop-compat] transcript balance: dropped trailing assistant message with ${balanced.diagnostic.droppedCallIds.length} incomplete tool call(s)`);
				options.messages = balanced.messages;
			}
		}
		return next();
	}, { global: true });
}
//#endregion
//#region src/conversation-import-route.ts
/** Loopback-only Host route for importing an external transcript as a DSH session. */
const DESKTOP_CONVERSATION_IMPORT_PATH = "/desktop/conversation-import";
const MAX_BODY_BYTES$3 = 32 * 1024 * 1024;
const MAX_CWD_LENGTH = 32767;
const MAX_TITLE_LENGTH = 512;
const MAX_IMPORT_ID_LENGTH = 256;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_SEED_EVENTS = 2e4;
const SAFE_IMPORT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u;
const SAFE_SESSION_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
/**
* Publish an imported session without tying it to the route's Cordis fiber.
* The route flushes the seed and then detaches this explicit lifecycle, leaving
* a cold durable session that the normal model/agent API can resume. Minimal
* test/Host adapters from older releases only expose create(), so keep the
* compatibility fallback.
*/
function createPreparedSession(sessions, id, options) {
	if (typeof sessions.prepare === "function" && typeof sessions.enter === "function" && typeof sessions.announce === "function") {
		const session = sessions.prepare(id, options);
		let detach;
		try {
			detach = sessions.enter(session);
			sessions.announce(session);
		} catch (error) {
			try {
				detach?.();
			} catch {}
			throw error;
		}
		return {
			session,
			detach
		};
	}
	return {
		session: sessions.create(id, options),
		detach: void 0
	};
}
function failure$1(code, message) {
	return {
		ok: false,
		error: {
			code,
			message
		}
	};
}
function writeJson$1(response, status, value) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	response.end(JSON.stringify(value));
}
function isLoopbackRequest$1(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (![
		"127.0.0.1",
		"localhost",
		"[::1]"
	].includes(hostUrl.hostname)) return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
function capabilityTokenMatches$1(expected, supplied) {
	if (!isDesktopWorkspaceFileOpenToken(expected)) return false;
	const expectedBytes = Buffer.from(expected, "utf8");
	const suppliedBytes = typeof supplied === "string" ? Buffer.from(supplied, "utf8") : Buffer.alloc(0);
	const padded = Buffer.alloc(expectedBytes.length);
	suppliedBytes.copy(padded, 0, 0, expectedBytes.length);
	return suppliedBytes.length === expectedBytes.length && timingSafeEqual(expectedBytes, padded);
}
async function readJsonBody$3(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_BODY_BYTES$3) return void 0;
		chunks.push(buffer);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return;
	}
}
function isPlainObject$1(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
function persistSessionTitle(ctx, session, title) {
	let titleService;
	if (typeof ctx.get === "function") try {
		const provided = ctx.get("sessionTitle", false);
		if (provided !== void 0) titleService = provided;
	} catch {}
	if (titleService === void 0) try {
		titleService = ctx.sessionTitle;
	} catch {
		titleService = void 0;
	}
	if (titleService !== void 0 && typeof titleService.get === "function" && typeof titleService.rename === "function") {
		const existing = titleService.get(session);
		if (existing !== void 0) return existing.title || title;
		const accepted = titleService.rename(session, title);
		return typeof accepted?.title === "string" && accepted.title.length > 0 ? accepted.title : title;
	}
	return title;
}
function normalizeRequest$1(value) {
	if (!isPlainObject$1(value)) return void 0;
	const allowed = /* @__PURE__ */ new Set([
		"projectCwd",
		"title",
		"importId",
		"sessionId",
		"createdAt",
		"seed"
	]);
	if (Object.keys(value).some((key) => !allowed.has(key))) return void 0;
	const projectCwd = typeof value.projectCwd === "string" ? value.projectCwd.trim() : "";
	if (projectCwd.length === 0 || projectCwd.length > MAX_CWD_LENGTH || !isAbsolute(projectCwd)) return void 0;
	let title;
	if (value.title !== void 0) {
		if (typeof value.title !== "string" || value.title.length > MAX_TITLE_LENGTH) return void 0;
		title = value.title.trim() || void 0;
	}
	let importId;
	if (value.importId !== void 0) {
		if (typeof value.importId !== "string" || value.importId.length > MAX_IMPORT_ID_LENGTH || !SAFE_IMPORT_ID.test(value.importId)) return void 0;
		importId = value.importId;
	}
	let sessionId;
	if (value.sessionId !== void 0) {
		if (typeof value.sessionId !== "string" || value.sessionId.length > MAX_SESSION_ID_LENGTH || !SAFE_SESSION_ID.test(value.sessionId)) return void 0;
		sessionId = value.sessionId;
	}
	let createdAt;
	if (value.createdAt !== void 0) {
		if (typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0) return void 0;
		createdAt = value.createdAt;
	}
	if (!Array.isArray(value.seed) || value.seed.length > MAX_SEED_EVENTS) return void 0;
	if (value.seed.some((event) => !isPlainObject$1(event))) return void 0;
	return {
		projectCwd,
		title,
		importId,
		sessionId,
		createdAt,
		seed: value.seed
	};
}
async function importConversationIntoHost(ctx, request) {
	if (request === void 0) return failure$1("bad-request", "conversation import request is invalid");
	let canonicalCwd;
	try {
		if (!(await stat(request.projectCwd)).isDirectory()) return failure$1("invalid-project", "projectCwd is not a directory");
		canonicalCwd = await realpath(request.projectCwd);
	} catch {
		return failure$1("invalid-project", "projectCwd does not exist or is unavailable");
	}
	let workspace;
	try {
		workspace = await ctx.workspaceRegistry.create(canonicalCwd, basename(canonicalCwd) || "Workspace");
	} catch (error) {
		return failure$1("workspace-create-failed", error instanceof Error ? error.message : String(error));
	}
	const effectiveTitle = request.title || workspace.title || basename(canonicalCwd);
	let persistedTitle = effectiveTitle;
	let detachSession;
	let session;
	try {
		const requestedSessionId = request.sessionId === void 0 ? void 0 : SessionId(request.sessionId);
		session = requestedSessionId === void 0 ? void 0 : ctx.sessions.get(requestedSessionId);
		if (session !== void 0 && session.header.cwd !== canonicalCwd) return failure$1("session-conflict", "requested session belongs to a different project directory");
		if (session === void 0) {
			const created = createPreparedSession(ctx.sessions, requestedSessionId, {
				seed: [...request.seed],
				meta: {
					cwd: canonicalCwd,
					...request.createdAt === void 0 ? {} : { createdAt: request.createdAt }
				}
			});
			session = created.session;
			detachSession = created.detach;
		}
		persistedTitle = persistSessionTitle(ctx, session, effectiveTitle);
		await workspace.attachSession(session.id);
		await ctx.sessions.flush(session);
		if (detachSession) {
			await Promise.resolve(detachSession());
			detachSession = void 0;
		}
	} catch (error) {
		if (detachSession) try {
			await Promise.resolve(detachSession());
		} catch {}
		return failure$1("session-import-failed", error instanceof Error ? error.message : String(error));
	}
	return {
		ok: true,
		workspaceId: String(workspace.id),
		sessionId: String(session.id),
		projectCwd: canonicalCwd,
		title: persistedTitle,
		seedEventCount: request.seed.length,
		eventCount: session.seq
	};
}
function createDesktopConversationImportRoute(ctx, { capabilityToken = process.env[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV] } = {}) {
	const expectedCapabilityToken = capabilityToken;
	return {
		kind: "exact",
		path: DESKTOP_CONVERSATION_IMPORT_PATH,
		handler: async (request, response) => {
			if (!isLoopbackRequest$1(request)) {
				writeJson$1(response, 403, failure$1("forbidden", "loopback-only"));
				return;
			}
			if (!capabilityTokenMatches$1(expectedCapabilityToken, request.headers["x-dsh-desktop-workspace-file-open-token"])) {
				writeJson$1(response, 403, failure$1("forbidden", "desktop capability required"));
				return;
			}
			if (request.method !== "POST") {
				writeJson$1(response, 405, failure$1("method-not-allowed", "POST is required"));
				return;
			}
			if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
				writeJson$1(response, 415, failure$1("invalid-content-type", "application/json is required"));
				return;
			}
			const requestValue = normalizeRequest$1(await readJsonBody$3(request));
			if (requestValue === void 0) {
				writeJson$1(response, 400, failure$1("bad-request", "malformed conversation import request"));
				return;
			}
			try {
				const result = await importConversationIntoHost(ctx, requestValue);
				writeJson$1(response, result.ok ? 200 : 422, result);
			} catch (error) {
				writeJson$1(response, 500, failure$1("internal-error", error instanceof Error ? error.message : String(error)));
			}
		}
	};
}
function registerDesktopConversationImportRoute(ctx) {
	return ctx.webServer.register(createDesktopConversationImportRoute(ctx, { capabilityToken: process.env[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV] }));
}
//#endregion
//#region src/workspace-file-open-route.ts
/** Desktop-owned, loopback-only authority for native workspace-file opening. */
const DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH = "/desktop/workspace-file-open-target";
const MAX_ROOT_LENGTH = 32767;
const MAX_RELATIVE_PATH_LENGTH = 4096;
const MAX_BODY_BYTES$2 = 1 << 20;
function failure(code, message) {
	return {
		ok: false,
		error: {
			code,
			message
		}
	};
}
function normalizeForPrefix(value) {
	const normalized = value.replaceAll("\\", "/").replace(/\/+$/u, "");
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
function isPathInside(root, child) {
	if (root === "" || child === "") return false;
	const normalizedRoot = normalizeForPrefix(root);
	const normalizedChild = normalizeForPrefix(child);
	return normalizedChild === normalizedRoot || normalizedChild.startsWith(`${normalizedRoot}/`);
}
function isSameCanonicalPath(left, right) {
	return normalizeForPrefix(left) === normalizeForPrefix(right);
}
function isGitPath(path) {
	return path.replaceAll("\\", "/").split("/").some((part) => part.toLowerCase() === ".git");
}
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (![
		"127.0.0.1",
		"localhost",
		"[::1]"
	].includes(hostUrl.hostname)) return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
function writeJson(response, status, value) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	response.end(JSON.stringify(value));
}
/**
* Compare an opaque launch capability without leaking a matching prefix. A
* missing, malformed, or wrong-length header is padded before comparison too,
* so every request with a configured secret reaches `timingSafeEqual`.
*/
function capabilityTokenMatches(expected, supplied) {
	if (!isDesktopWorkspaceFileOpenToken(expected)) return false;
	const expectedBytes = Buffer.from(expected, "utf8");
	const suppliedBytes = typeof supplied === "string" ? Buffer.from(supplied, "utf8") : Buffer.alloc(0);
	const paddedSupplied = Buffer.alloc(expectedBytes.length);
	suppliedBytes.copy(paddedSupplied, 0, 0, expectedBytes.length);
	const equal = timingSafeEqual(expectedBytes, paddedSupplied);
	return suppliedBytes.length === expectedBytes.length && equal;
}
async function readJsonBody$2(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_BODY_BYTES$2) return void 0;
		chunks.push(buffer);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return;
	}
}
function normalizeRequest(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const record = value;
	const root = typeof record.root === "string" ? record.root.trim() : "";
	const path = typeof record.path === "string" ? record.path.trim().replaceAll("\\", "/") : "";
	if (root.length === 0 || root.length > MAX_ROOT_LENGTH || !isAbsolute(root)) return void 0;
	if (path.length === 0 || path.length > MAX_RELATIVE_PATH_LENGTH || path.startsWith("/") || /^[a-z]:/iu.test(path) || path.split("/").some((segment) => segment.length === 0 || segment === ".." || segment.includes(":")) || !isSafeDesktopWorkspaceFileOpenPath(path)) return void 0;
	return {
		root,
		path
	};
}
/**
* Resolve only an exact registered workspace root. The launch capability
* authenticates Electron main to this Host route; it intentionally is not a
* browser-session identifier. The public DSH route protocol has no
* renderer-session credential to verify here, so a supplied session field
* would merely be forgeable browser input.
*/
async function resolveDesktopWorkspaceFileOpenTarget(workspaceRegistry, request) {
	const normalizedRequest = normalizeRequest(request);
	if (normalizedRequest === void 0) return failure("invalid-request", "workspace file request is invalid");
	let workspace;
	try {
		workspace = await workspaceRegistry.resolveByPath(normalizedRequest.root);
	} catch {
		return failure("workspace-unknown", "workspace root is not registered");
	}
	if (workspace === void 0) return failure("workspace-unknown", "workspace root is not registered");
	let requestedRoot;
	let root;
	try {
		requestedRoot = await realpath(normalizedRequest.root);
		root = await realpath(workspace.path);
	} catch {
		return failure("workspace-unknown", "workspace root is unavailable");
	}
	if (!isSameCanonicalPath(requestedRoot, root)) return failure("workspace-unknown", "workspace root is not registered");
	const candidate = join(root, normalizedRequest.path);
	if (!isPathInside(root, candidate) || isGitPath(normalizedRequest.path)) return failure("path-outside-root", "workspace file path is not allowed");
	let target;
	try {
		target = await realpath(candidate);
	} catch {
		return failure("not-found", "workspace file was not found");
	}
	if (!isPathInside(root, target) || isGitPath(relative(root, target))) return failure("path-outside-root", "workspace file path is not allowed");
	let info;
	try {
		info = await stat(target);
	} catch {
		return failure("not-found", "workspace file was not found");
	}
	if (info.isDirectory()) return failure("is-directory", "workspace target is a directory");
	if (!info.isFile()) return failure("external-open-denied", "only regular files may be opened");
	if (!isSafeDesktopWorkspaceFileOpenPath(target)) return failure("external-open-denied", "workspace file type is not allowed for native opening");
	return {
		ok: true,
		value: { path: target }
	};
}
/** Create the exact route so unit tests can exercise its transport fence. */
function createDesktopWorkspaceFileOpenRoute(workspaceRegistry, { capabilityToken = process.env[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV] } = {}) {
	const expectedCapabilityToken = capabilityToken;
	return {
		kind: "exact",
		path: DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH,
		handler: async (request, response) => {
			if (!isLoopbackRequest(request)) {
				writeJson(response, 403, failure("forbidden", "loopback-only"));
				return;
			}
			if (!capabilityTokenMatches(expectedCapabilityToken, request.headers["x-dsh-desktop-workspace-file-open-token"])) {
				writeJson(response, 403, failure("forbidden", "desktop capability required"));
				return;
			}
			if (request.method !== "POST") {
				writeJson(response, 405, failure("method-not-allowed", "POST is required"));
				return;
			}
			if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
				writeJson(response, 415, failure("invalid-content-type", "application/json is required"));
				return;
			}
			const requestValue = normalizeRequest(await readJsonBody$2(request));
			if (requestValue === void 0) {
				writeJson(response, 400, failure("bad-request", "malformed workspace file request"));
				return;
			}
			writeJson(response, 200, await resolveDesktopWorkspaceFileOpenTarget(workspaceRegistry, requestValue));
		}
	};
}
/** Register the authority with the always-mounted Desktop compat bundle. */
function registerDesktopWorkspaceFileOpenRoute(ctx) {
	return ctx.webServer.register(createDesktopWorkspaceFileOpenRoute(ctx.workspaceRegistry, { capabilityToken: process.env[DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV] }));
}
//#endregion
//#region src/session-checkpoint-recovery.ts
function installSessionCheckpointRecovery(ctx) {
	ctx.inject([
		"sessionPersistence",
		"sessionProjectionCache",
		"sessionController"
	], async (recoveryCtx) => {
		const controller = new AbortController();
		recoveryCtx.effect(() => () => controller.abort(), "dsh-desktop-compat: session checkpoint recovery");
		try {
			const result = await refreshBlankSessionCheckpoints({
				persistence: recoveryCtx.sessionPersistence,
				cache: recoveryCtx.sessionProjectionCache,
				sessions: recoveryCtx.sessions
			}, controller.signal);
			if (result.refreshed > 0 || result.failed > 0) recoveryCtx.logger.warn(`[dsh-session-checkpoint] scanned=${result.scanned} refreshed=${result.refreshed} failed=${result.failed}`);
		} catch {
			if (!controller.signal.aborted) recoveryCtx.logger.warn("[dsh-session-checkpoint] unavailable=list");
		}
	});
}
function checkpointBlank(snapshot) {
	const metadata = Reflect.get(snapshot?.values ?? {}, "sessionListMetadata");
	return typeof metadata === "object" && metadata !== null && "blank" in metadata && typeof metadata.blank === "boolean" ? metadata.blank : void 0;
}
function checkpointTitle(snapshot) {
	const title = Reflect.get(snapshot?.values ?? {}, "title");
	return typeof title === "string" ? title : void 0;
}
async function refreshBlankSessionCheckpoints(services, signal) {
	const snapshots = await services.persistence.list({ signal });
	const result = {
		scanned: snapshots.length,
		refreshed: 0,
		failed: 0
	};
	let nextIndex = 0;
	const worker = async () => {
		while (nextIndex < snapshots.length) {
			signal.throwIfAborted();
			const { header } = snapshots[nextIndex++];
			if (header.cwd === void 0 || header.origin === "subagent" || services.sessions.get(header.id) !== void 0) continue;
			const readSignal = AbortSignal.any([signal, AbortSignal.timeout(1e4)]);
			try {
				const cached = services.cache.cachedSnapshot(header);
				const predecessor = cached === void 0 ? services.cache.cachedPredecessorTitle?.(header) : void 0;
				if (checkpointBlank(cached) !== true && predecessor === void 0) continue;
				const handle = await services.persistence.open(header.id, "read", { signal: readSignal });
				try {
					const { events } = await handle.read(0, void 0, { signal: readSignal });
					readSignal.throwIfAborted();
					if (services.sessions.get(header.id) !== void 0) continue;
					const lastSeq = events.at(-1)?.seq ?? -1;
					if (cached !== void 0 && cached.asOfSeq >= lastSeq) continue;
					const restored = services.cache.coldSnapshot(handle.header, handle.inheritedEventCount, events);
					while (true) {
						readSignal.throwIfAborted();
						const durable = services.cache.cachedSnapshot(handle.header);
						if (durable !== void 0 && durable.asOfSeq >= restored.asOfSeq && checkpointBlank(durable) === checkpointBlank(restored) && checkpointTitle(durable) === checkpointTitle(restored)) break;
						await new Promise((resolveWait) => setTimeout(resolveWait, 25));
					}
					result.refreshed += 1;
				} finally {
					await handle.close();
				}
			} catch {
				signal.throwIfAborted();
				result.failed += 1;
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(4, snapshots.length) }, worker));
	return result;
}
//#endregion
//#region src/session-title-checkpoint.ts
function createSessionTitleCheckpointWriter(services, signal) {
	const pending = /* @__PURE__ */ new WeakMap();
	return (session) => {
		const write = (pending.get(session) ?? Promise.resolve()).catch(() => void 0).then(async () => {
			if (signal.aborted || services.sessions.get(session.id) !== session) return;
			await services.sessions.flush(session);
			if (signal.aborted || services.sessions.get(session.id) !== session) return;
			await services.cache.write(session);
		});
		pending.set(session, write);
		return write;
	};
}
function installSessionTitleCheckpoint(ctx) {
	ctx.inject(["sessions", "sessionProjectionCache"], (checkpointCtx) => {
		const controller = new AbortController();
		checkpointCtx.effect(() => () => controller.abort(), "dsh-desktop-compat: title checkpoint");
		const write = createSessionTitleCheckpointWriter({
			sessions: checkpointCtx.sessions,
			cache: checkpointCtx.sessionProjectionCache
		}, controller.signal);
		checkpointCtx.on("session/event", (session, event) => {
			if (event.type !== "session/title") return;
			write(session).catch(() => {
				if (!controller.signal.aborted) checkpointCtx.logger.warn("[dsh-session-checkpoint] unavailable=title-write");
			});
		});
	});
}
//#endregion
//#region src/agent-wsl-permission.ts
/** Missing settings retain the original per-call approval. Corrupt settings fail closed. */
function parseAgentWslPermission(raw) {
	if (raw === void 0) return "ask";
	try {
		const value = JSON.parse(raw);
		if (value && typeof value === "object" && !Array.isArray(value) && "version" in value && value.version === 1 && "mode" in value && [
			"off",
			"ask",
			"allow"
		].includes(String(value.mode))) return value.mode;
	} catch {}
	return "off";
}
function currentAgentWslPermission(environment = process.env) {
	if (typeof environment.DSH_HOME !== "string" || environment.DSH_HOME.length === 0) return "ask";
	try {
		return parseAgentWslPermission(readFileSync(join(environment.DSH_HOME, "desktop-agent-shell.json"), "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return "ask";
		return "off";
	}
}
//#endregion
//#region src/control-tool-approval.ts
const BROWSER_PREFIXES = [
	"mcp__playwright-mcp__",
	"mcp__chrome-devtools-mcp__",
	"stagehand_"
];
const COMPUTER_PREFIXES = ["cua_driver_native__", "mcp__cua-driver-mcp__"];
const BROWSER_OBSERVATION_NAMES = /* @__PURE__ */ new Set([
	"browser_console_messages",
	"browser_network_requests",
	"browser_snapshot",
	"browser_take_screenshot",
	"get_console_message",
	"get_network_request",
	"list_console_messages",
	"list_network_requests",
	"list_pages",
	"performance_analyze_insight",
	"performance_stop_trace",
	"take_screenshot",
	"take_snapshot",
	"stagehand_extract",
	"stagehand_observe",
	"stagehand_screenshot"
]);
const COMPUTER_OBSERVATION_PATTERN = /(?:^|_)(?:check_permissions|find_element|get_(?:active_window|app|cursor|desktop|display|element|monitors?|permissions?|screen|snapshot|window)|list_(?:apps?|displays?|monitors?|windows?)|screenshot|snapshot|window_snapshot)$/u;
function stripPrefix(name, prefixes) {
	const prefix = prefixes.find((candidate) => name.startsWith(candidate));
	return prefix === void 0 ? void 0 : name.slice(prefix.length);
}
function getDynamicService(ctx, key) {
	const ctxLike = ctx;
	return ctxLike.get?.(key) ?? ctxLike[key];
}
/**
* Return true only when the active session runs under `danger-full-access` with
* `approval` set to `'never'` (i.e. full unattended control without prompts).
* Keeps `desktop-full-access-ask` (`approval: 'ask'`) and non-full-access
* sandboxes gated by one-shot prompts.
*/
function isFullAccessUnattendedSession(ctx, exec) {
	const session = exec.agent?.session;
	if (!session) return false;
	const approval = getDynamicService(ctx, "approval");
	let policy;
	try {
		policy = approval?.effectivePolicy?.(session);
	} catch {
		return false;
	}
	if (policy !== "never") return false;
	const presets = getDynamicService(ctx, "permissionPresets");
	let currentPreset;
	let sessionSandbox;
	try {
		currentPreset = presets?.current?.(session);
		sessionSandbox = presets?.permissionState?.(session)?.sandbox;
	} catch {
		currentPreset = void 0;
		sessionSandbox = void 0;
	}
	const shellSandbox = getDynamicService(ctx, "shell")?.sandboxMode;
	return currentPreset === "danger-full-access" || sessionSandbox === "danger-full-access" || currentPreset === void 0 && sessionSandbox === void 0 && shellSandbox === "danger-full-access";
}
/** Classify Desktop control tools without inspecting arguments or page/window data. */
function controlToolApprovalDecision(name, wslPermission = "ask", options = {}) {
	if (name === "desktop_wsl") {
		if (wslPermission === "off") return {
			kind: "deny",
			reason: "Agent WSL 命令已由用户关闭，可在拓展坞的智能操控中调整。"
		};
		if (wslPermission === "allow") return { kind: "allow" };
		return {
			kind: "ask",
			reason: "WSL 命令在 Windows 沙箱之外运行，可能修改本机和 Linux 文件；本次命令需要单独确认。"
		};
	}
	const browserName = stripPrefix(name, BROWSER_PREFIXES);
	if (browserName !== void 0) {
		const normalized = name.startsWith("stagehand_") ? name : browserName;
		if (BROWSER_OBSERVATION_NAMES.has(normalized)) return void 0;
		return options.fullAccessUnattended === true ? void 0 : {
			kind: "ask",
			reason: "浏览器操作可能改变页面或外部状态，需要本次授权。"
		};
	}
	const computerName = stripPrefix(name, COMPUTER_PREFIXES);
	if (computerName !== void 0) {
		if (COMPUTER_OBSERVATION_PATTERN.test(computerName)) return void 0;
		return options.fullAccessUnattended === true ? void 0 : {
			kind: "ask",
			reason: "鼠标、键盘或电脑输入操作需要本次授权。"
		};
	}
}
/** Classify office connector MCP calls into L0-L3 approval gates. */
function connectorToolApprovalDecision(name, lookupRisk) {
	if (!lookupRisk) return void 0;
	const risk = lookupRisk(name);
	if (!risk || risk.level === "L0") return void 0;
	const detail = risk.label?.zh ? `（${risk.label.zh}）` : "";
	if (risk.level === "L3") return {
		kind: "ask",
		reason: `高风险外部操作${detail}：涉及发送消息、邮件、外部分享或付费操作，必须经人工确认后执行。`
	};
	if (risk.level === "L2") return {
		kind: "ask",
		reason: `受控办公变更操作${detail}：涉及删除、批量写入或修改日程会议，请确认操作对象。`
	};
	return {
		kind: "ask",
		reason: `办公写操作${detail}：将创建或更新目标内容，需要本次确认。`
	};
}
/** Require one-shot approval for mutating Browser Use, Computer Use, WSL, and office connector actions. */
function installControlToolApproval(ctx, options = {}) {
	ctx.on("tools/pre-execute", async (exec, next) => {
		return controlToolApprovalDecision(exec.name, exec.name === "desktop_wsl" ? currentAgentWslPermission() : "ask", { fullAccessUnattended: isFullAccessUnattendedSession(ctx, exec) }) ?? connectorToolApprovalDecision(exec.name, options.lookupConnectorRisk) ?? next();
	});
}
//#endregion
//#region src/agent-wsl-tool.ts
const OUTPUT_LIMIT = 64 * 1024;
const COMMAND_TIMEOUT_MS = 6e4;
const LIST_TIMEOUT_MS = 1e4;
const RESERVED_DISTRIBUTIONS = /^(?:docker-desktop(?:-data)?|rancher-desktop(?:-data)?|podman-machine(?:-default)?)$/iu;
function wslExecutable(environment = process.env) {
	const root = environment.SystemRoot ?? environment.WINDIR ?? "C:\\Windows";
	if (!win32.isAbsolute(root)) throw new Error("Windows 系统目录无效，无法定位 WSL。");
	const executable = win32.join(root, "System32", "wsl.exe");
	if (!existsSync(executable)) throw new Error("未找到 wsl.exe，请先安装 Windows Subsystem for Linux。");
	return executable;
}
function decodeWslList(output) {
	const zeroBytes = output.subarray(1).filter((byte) => byte === 0).length;
	return output.includes(Buffer.from([
		13,
		0,
		10,
		0
	])) || zeroBytes > output.length / 8 ? output.toString("utf16le") : output.toString("utf8");
}
function parseWslDistributions(output) {
	return [...new Set(output.replace(/\u0000/gu, "").split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== "" && !RESERVED_DISTRIBUTIONS.test(line)))];
}
function selectWslDistribution(installed, requested) {
	if (installed.length === 0) throw new Error("没有可供 Agent 使用的 WSL Linux 发行版。Docker Desktop 内部发行版不会被当作工作终端。");
	if (requested !== void 0) {
		const match = installed.find((name) => name.toLowerCase() === requested.trim().toLowerCase());
		if (match === void 0) throw new Error("指定的 WSL 发行版未安装或不可用。请先检查 wsl.exe --list --quiet。");
		return match;
	}
	if (installed.length !== 1) throw new Error("安装了多个 WSL 发行版，请在本次调用中明确指定 distribution。");
	return installed[0];
}
function createWslCommandArgs(distribution, command, workdir) {
	return [
		"--distribution",
		distribution,
		...workdir ? ["--cd", workdir] : [],
		"--exec",
		"/bin/sh",
		"-lc",
		command
	];
}
function runProcess(executable, args, options) {
	return new Promise((resolve, reject) => {
		if (options.signal.aborted) {
			reject(/* @__PURE__ */ new Error("WSL 命令已取消。"));
			return;
		}
		const child = spawn(executable, [...args], {
			cwd: options.cwd,
			windowsHide: true,
			shell: false,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		const stdout = [];
		const stderr = [];
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let timedOut = false;
		let aborted = false;
		let truncated = false;
		let settled = false;
		const stop = () => child.kill();
		const onAbort = () => {
			if (aborted) return;
			aborted = true;
			stop();
		};
		const timer = setTimeout(() => {
			timedOut = true;
			stop();
		}, options.timeoutMs);
		const cleanup = () => {
			clearTimeout(timer);
			options.signal.removeEventListener("abort", onAbort);
		};
		options.signal.addEventListener("abort", onAbort, { once: true });
		if (options.signal.aborted) onAbort();
		child.stdout?.on("data", (chunk) => {
			const remaining = OUTPUT_LIMIT - stdoutBytes;
			if (chunk.length > remaining) truncated = true;
			if (remaining > 0) {
				const part = chunk.subarray(0, remaining);
				stdout.push(part);
				stdoutBytes += part.length;
			}
		});
		child.stderr?.on("data", (chunk) => {
			const remaining = OUTPUT_LIMIT - stderrBytes;
			if (chunk.length > remaining) truncated = true;
			if (remaining > 0) {
				const part = chunk.subarray(0, remaining);
				stderr.push(part);
				stderrBytes += part.length;
			}
		});
		child.once("error", (error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		});
		child.once("close", (code) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve({
				code,
				stdout: Buffer.concat(stdout),
				stderr: Buffer.concat(stderr),
				timedOut,
				aborted,
				truncated
			});
		});
	});
}
async function listWslDistributions(signal) {
	const listed = await runProcess(wslExecutable(), ["--list", "--quiet"], {
		signal,
		timeoutMs: LIST_TIMEOUT_MS
	});
	if (listed.aborted) throw new Error("WSL 检查已取消。");
	if (listed.timedOut || listed.truncated || listed.code !== 0) throw new Error("无法完整读取 WSL 发行版列表，请检查 WSL 是否可用。");
	return parseWslDistributions(decodeWslList(listed.stdout));
}
/** Register a separate, explicitly approved WSL tool; never replace the official sandboxed pwsh executor. */
function installAgentWslTool(ctx) {
	if (process.platform !== "win32") return;
	ctx.tools.register(defineTool({
		name: "desktop_wsl_list",
		description: "List installed user WSL Linux distributions before choosing desktop_wsl. This read-only check excludes Docker Desktop and other application-owned distributions.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: { distributions: {
					type: "array",
					items: { type: "string" },
					required: true
				} }
			},
			render: (_args, value) => [{
				type: "text",
				text: value.distributions.length ? value.distributions.join("\n") : "No user WSL Linux distribution is installed."
			}]
		},
		timeoutMs: 15e3,
		async execute(_args, exec) {
			return { distributions: await listWslDistributions(exec.signal) };
		}
	}));
	ctx.tools.register(defineTool({
		name: "desktop_wsl",
		description: "Run one Linux shell command in an installed WSL distribution. First call desktop_wsl_list to check available distributions. Use this only when Linux tools are needed; use the normal pwsh tool for Windows commands. WSL runs outside the Windows DSH sandbox; the user controls approval in Smart Control settings (off, ask every time, or always allow). Commands are foreground-only, have a 60-second limit, and cannot request sandbox escalation. The session workspace is used as the starting directory when available.",
		parameters: {
			command: {
				type: "string",
				required: true,
				description: "Linux /bin/sh command to run. Never pass PowerShell syntax here."
			},
			distribution: {
				type: "string",
				description: "Exact installed WSL distribution name. Required when more than one user distribution is installed."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					distribution: {
						type: "string",
						required: true
					},
					stdout: {
						type: "string",
						required: true
					},
					stderr: {
						type: "string",
						required: true
					},
					exitCode: {
						oneOf: [{ type: "integer" }, { type: "null" }],
						required: true
					},
					timedOut: {
						type: "boolean",
						required: true
					},
					truncated: {
						type: "boolean",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: [
					value.stdout || "(no output)",
					value.stderr ? `[stderr]\n${value.stderr}` : "",
					value.timedOut ? "[timed out after 60000 ms]" : "",
					value.truncated ? "[output truncated at 65536 bytes per stream]" : "",
					value.exitCode !== 0 ? `[exit code: ${value.exitCode}]` : ""
				].filter(Boolean).join("\n")
			}]
		},
		timeoutMs: 75e3,
		async execute(args, exec) {
			if (currentAgentWslPermission() === "off") throw new Error("Agent WSL 命令已由用户关闭。");
			const executable = wslExecutable();
			const distribution = selectWslDistribution(await listWslDistributions(exec.signal), args.distribution);
			const cwd = exec.agent?.session.header.cwd;
			const workdir = cwd && isAbsolute(cwd) ? cwd : void 0;
			const result = await runProcess(executable, createWslCommandArgs(distribution, args.command, workdir), {
				cwd: workdir,
				signal: exec.signal,
				timeoutMs: COMMAND_TIMEOUT_MS
			});
			if (result.aborted) throw new Error("WSL 命令已取消。");
			return {
				distribution,
				stdout: result.stdout.toString("utf8"),
				stderr: result.stderr.toString("utf8"),
				exitCode: result.code,
				timedOut: result.timedOut,
				truncated: result.truncated
			};
		}
	}));
}
//#endregion
//#region src/connectors/builtin-catalog.ts
const EMBEDDED_FALLBACK_CATALOG = {
	schemaVersion: 1,
	catalogVersion: "2026.11.25-1",
	updatedAt: "2026-11-25T12:00:00.000Z",
	connectors: [
		{
			id: "feishu",
			name: {
				zh: "飞书",
				en: "Feishu / Lark"
			},
			summary: {
				zh: "读写飞书文档、多维表格、日历、任务、邮件与会话消息，附带官方 Agent Skills。",
				en: "Read and write Feishu docs, Bitable, calendar, tasks, mail, and messages with official Agent Skills."
			},
			category: "office-suite",
			icon: "feishu",
			color: "#3370ff",
			maintainer: "official",
			platforms: [
				"win32",
				"darwin",
				"linux"
			],
			minDesktopVersion: "5.4.0",
			officialUrls: {
				repo: "https://github.com/larksuite/cli",
				docs: "https://github.com/larksuite/cli#readme",
				openPlatform: "https://open.feishu.cn/"
			},
			drivers: [{
				kind: "cli",
				id: "feishu-cli",
				binary: "lark-cli",
				installSource: {
					kind: "npm",
					package: "@larksuite/cli"
				},
				versionArgs: ["--version"]
			}, {
				kind: "mcp-stdio",
				id: "feishu-openapi-mcp",
				command: "npx",
				args: ["-y", "@larksuiteoapi/lark-mcp"],
				toolLoading: "on-demand"
			}],
			auth: {
				mode: "cli-native",
				cliLoginCommand: [
					"lark-cli",
					"auth",
					"login"
				],
				guideSteps: {
					zh: ["安装飞书官方 CLI（lark-cli）并同步官方办公 Skills。", "通过官方登录命令完成授权。"],
					en: ["Install the official Feishu CLI (lark-cli).", "Complete the native login command."]
				}
			},
			healthCheck: {
				kind: "cli-command",
				args: ["--version"],
				timeoutMs: 1e4
			},
			riskRules: [
				{
					actionPattern: "docs.read|search|calendar.list",
					level: "L0"
				},
				{
					actionPattern: "docs.create|task.create",
					level: "L1"
				},
				{
					actionPattern: "calendar.update|docs.delete|base.batch",
					level: "L2"
				},
				{
					actionPattern: "im.send|mail.send|drive.share",
					level: "L3"
				}
			],
			examples: [{
				title: {
					zh: "整理今日会议纪要",
					en: "Summarize today meeting notes"
				},
				prompt: {
					zh: "查找今天飞书里的会议纪要并整理待办。",
					en: "Find today Feishu meeting notes and extract action items."
				}
			}],
			troubleshooting: []
		},
		{
			id: "tencent-docs",
			name: {
				zh: "腾讯文档",
				en: "Tencent Docs"
			},
			summary: {
				zh: "通过官方远程 MCP 检索、阅读、编辑腾讯文档与智能表格，零本地程序安装。",
				en: "Search, read, and edit Tencent Docs via official remote MCP with zero local install."
			},
			category: "meeting-docs",
			icon: "tencent-docs",
			color: "#0052d9",
			maintainer: "official",
			platforms: [
				"win32",
				"darwin",
				"linux"
			],
			minDesktopVersion: "5.4.0",
			officialUrls: {
				docs: "https://docs.qq.com/open/document/mcp/",
				openPlatform: "https://docs.qq.com/open/auth/mcp.html"
			},
			drivers: [{
				kind: "mcp-remote",
				id: "tencent-docs-mcp",
				url: "https://mcp.docs.qq.com/mcp",
				remoteTransport: "streamable-http",
				toolLoading: "on-demand",
				headersTemplate: { Authorization: "Bearer ${credential:connector/tencent-docs/default/token}" },
				allowedTools: [
					"smartcanvas.read",
					"smartcanvas.edit",
					"smartcanvas.find",
					"manage.create_file",
					"manage.export_file",
					"manage.search_file",
					"manage.folder_list",
					"manage.set_privilege"
				]
			}],
			auth: {
				mode: "personal-token",
				quickAuthUrl: "https://docs.qq.com/open/auth/mcp.html",
				guideSteps: {
					zh: ["打开腾讯文档官方 MCP 授权页登录。", "复制个人访问 Token 粘贴保存并验证连接。"],
					en: ["Open the Tencent Docs MCP auth page and sign in.", "Paste your personal token below and verify."]
				},
				fields: [{
					key: "token",
					label: {
						zh: "MCP 访问令牌",
						en: "MCP Access Token"
					},
					fieldType: "password",
					required: true,
					secret: true
				}]
			},
			healthCheck: {
				kind: "mcp-probe",
				timeoutMs: 1e4
			},
			riskRules: [
				{
					actionPattern: "read|find|search|folder_list",
					level: "L0"
				},
				{
					actionPattern: "create_file|edit",
					level: "L1"
				},
				{
					actionPattern: "set_privilege",
					level: "L3"
				}
			],
			examples: [{
				title: {
					zh: "保存工作周报",
					en: "Save weekly report"
				},
				prompt: {
					zh: "在腾讯文档中创建本周工作周报。",
					en: "Create a weekly status report in Tencent Docs."
				}
			}],
			troubleshooting: []
		},
		{
			id: "yuque",
			name: {
				zh: "语雀",
				en: "Yuque"
			},
			summary: {
				zh: "通过官方本地 MCP Server 检索与读写语雀知识库和文档。",
				en: "Search, read, and write Yuque books and docs via the official stdio MCP server."
			},
			category: "knowledge-notes",
			icon: "yuque",
			color: "#22ab28",
			maintainer: "official",
			platforms: [
				"win32",
				"darwin",
				"linux"
			],
			minDesktopVersion: "5.4.0",
			officialUrls: {
				repo: "https://github.com/yuque/yuque-mcp-server",
				docs: "https://github.com/yuque/yuque-mcp-server#readme",
				openPlatform: "https://www.yuque.com/settings/tokens"
			},
			drivers: [{
				kind: "mcp-stdio",
				id: "yuque-mcp-stdio",
				command: "yuque-mcp",
				args: [],
				installSource: {
					kind: "npm",
					package: "yuque-mcp"
				},
				envTemplate: {
					YUQUE_TOKEN: "${credential:connector/yuque/default/token}",
					YUQUE_BASE_URL: "${credential:connector/yuque/default/host}"
				},
				toolLoading: "on-demand"
			}],
			auth: {
				mode: "personal-token",
				quickAuthUrl: "https://www.yuque.com/settings/tokens",
				guideSteps: {
					zh: ["在语雀开发者设置创建个人令牌。", "保存并测试连接，DSH 将按需启动官方语雀 MCP。"],
					en: ["Create a personal token in Yuque settings.", "Save and verify to connect via official stdio MCP."]
				},
				fields: [{
					key: "token",
					label: {
						zh: "语雀个人令牌",
						en: "Yuque Personal Token"
					},
					fieldType: "password",
					required: true,
					secret: true
				}, {
					key: "host",
					label: {
						zh: "团队空间域名（可选）",
						en: "Team Space Host (optional)"
					},
					fieldType: "url",
					required: false,
					secret: false
				}]
			},
			healthCheck: {
				kind: "mcp-probe",
				timeoutMs: 12e3
			},
			riskRules: [
				{
					actionPattern: "search|get|list",
					level: "L0"
				},
				{
					actionPattern: "create|update",
					level: "L1"
				},
				{
					actionPattern: "delete",
					level: "L2"
				}
			],
			examples: [{
				title: {
					zh: "汇总调研文档",
					en: "Summarize research"
				},
				prompt: {
					zh: "检索我的语雀知识库并整理调研摘要。",
					en: "Search Yuque for research docs and summarize them."
				}
			}],
			troubleshooting: []
		},
		{
			id: "kdocs",
			name: {
				zh: "金山文档",
				en: "Kingsoft Docs (KDocs)"
			},
			summary: {
				zh: "通过金山文档官方 Skill 新建、编辑、搜索与整理云文档。",
				en: "Create, edit, and search cloud docs via official KDocs Skill."
			},
			category: "meeting-docs",
			icon: "kdocs",
			color: "#e53935",
			maintainer: "official",
			platforms: [
				"win32",
				"darwin",
				"linux"
			],
			minDesktopVersion: "5.4.0",
			officialUrls: {
				repo: "https://github.com/kdocs-app/kdocs-skill",
				docs: "https://github.com/kdocs-app/kdocs-skill#readme"
			},
			drivers: [{
				kind: "skill",
				id: "kdocs-official-skill",
				skillName: "kdocs-skill",
				source: {
					kind: "github-repo",
					ref: "kdocs-app/kdocs-skill"
				}
			}],
			auth: {
				mode: "personal-token",
				guideSteps: {
					zh: ["启用金山文档官方 Skill 并完成账号授权配置。"],
					en: ["Enable the official KDocs Skill and complete account authorization."]
				}
			},
			healthCheck: {
				kind: "skill-present",
				timeoutMs: 5e3
			},
			riskRules: [
				{
					actionPattern: "search|read",
					level: "L0"
				},
				{
					actionPattern: "create|edit",
					level: "L1"
				},
				{
					actionPattern: "share",
					level: "L3"
				}
			],
			examples: [{
				title: {
					zh: "检索云文档",
					en: "Search cloud docs"
				},
				prompt: {
					zh: "查找我金山文档里最近的月度总结并提取关键指标。",
					en: "Find my recent monthly summary in KDocs."
				}
			}],
			troubleshooting: []
		},
		{
			id: "wecom",
			name: {
				zh: "企业微信",
				en: "WeCom"
			},
			summary: {
				zh: "通过官方 wecom-cli 操作企业微信文档、日程、待办、会议、邮件与微盘。",
				en: "Manage WeCom docs, calendar, tasks, meetings, and drive via wecom-cli."
			},
			category: "office-suite",
			icon: "wecom",
			color: "#2f7bf6",
			maintainer: "official",
			platforms: [
				"win32",
				"darwin",
				"linux"
			],
			minDesktopVersion: "5.4.0",
			officialUrls: {
				repo: "https://github.com/WecomTeam/wecom-cli",
				docs: "https://work.weixin.qq.com/nl/index/aicli"
			},
			drivers: [{
				kind: "cli",
				id: "wecom-cli",
				binary: "wecom-cli",
				installSource: {
					kind: "npm",
					package: "@wecom/cli"
				},
				versionArgs: ["--version"]
			}],
			auth: {
				mode: "cli-native",
				cliLoginCommand: [
					"wecom-cli",
					"auth",
					"init"
				],
				requiresEnterpriseAdmin: true,
				guideSteps: {
					zh: ["安装 @wecom/cli 并完成企业微信账号登录。"],
					en: ["Install @wecom/cli and complete WeCom sign-in."]
				}
			},
			healthCheck: {
				kind: "cli-command",
				args: ["--version"],
				timeoutMs: 1e4
			},
			riskRules: [
				{
					actionPattern: "read|list|search",
					level: "L0"
				},
				{
					actionPattern: "create",
					level: "L1"
				},
				{
					actionPattern: "delete|cancel|update",
					level: "L2"
				},
				{
					actionPattern: "send|share",
					level: "L3"
				}
			],
			examples: [{
				title: {
					zh: "创建企业微信待办",
					en: "Create WeCom task"
				},
				prompt: {
					zh: "在企业微信中创建明天的版本评审待办。",
					en: "Create a WeCom task for tomorrow release review."
				}
			}],
			troubleshooting: []
		},
		{
			id: "dingtalk",
			name: {
				zh: "钉钉",
				en: "DingTalk Workspace"
			},
			summary: {
				zh: "通过官方钉钉 dws CLI 操作通讯录、聊天、日程、待办、文档与表格。",
				en: "Operate DingTalk contacts, chat, calendar, tasks, and docs via official dws CLI."
			},
			category: "office-suite",
			icon: "dingtalk",
			color: "#3296fa",
			maintainer: "official",
			platforms: [
				"win32",
				"darwin",
				"linux"
			],
			minDesktopVersion: "5.4.0",
			officialUrls: {
				repo: "https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli",
				docs: "https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli#getting-started"
			},
			drivers: [{
				kind: "cli",
				id: "dingtalk-dws-cli",
				binary: "dws",
				installSource: {
					kind: "github-release",
					repo: "DingTalk-Real-AI/dingtalk-workspace-cli"
				},
				versionArgs: ["--version"]
			}],
			auth: {
				mode: "cli-native",
				cliLoginCommand: [
					"dws",
					"auth",
					"login",
					"--device",
					"--no-browser"
				],
				requiresEnterpriseAdmin: true,
				guideSteps: {
					zh: ["安装钉钉 dws CLI，联系企业管理员批准权限后完成登录授权。"],
					en: ["Install DingTalk dws CLI and request admin approval before signing in."]
				}
			},
			healthCheck: {
				kind: "cli-command",
				args: ["--version"],
				timeoutMs: 1e4
			},
			riskRules: [
				{
					actionPattern: "read|search|list",
					level: "L0"
				},
				{
					actionPattern: "create",
					level: "L1"
				},
				{
					actionPattern: "update|delete",
					level: "L2"
				},
				{
					actionPattern: "send",
					level: "L3"
				}
			],
			examples: [{
				title: {
					zh: "检索钉钉资料",
					en: "Search DingTalk"
				},
				prompt: {
					zh: "查询钉钉中与项目有关的最新文档。",
					en: "Search DingTalk for recent project documents."
				}
			}],
			troubleshooting: []
		},
		{
			id: "tencent-meeting",
			name: {
				zh: "腾讯会议",
				en: "Tencent Meeting"
			},
			summary: {
				zh: "基于开放平台 OAuth2 授权管理腾讯会议、录制与智能纪要。",
				en: "Manage Tencent Meeting schedules, recordings, and AI summaries via OAuth2 CLI."
			},
			category: "meeting-docs",
			icon: "tencent-meeting",
			color: "#006eff",
			maintainer: "official",
			platforms: [
				"win32",
				"darwin",
				"linux"
			],
			minDesktopVersion: "5.4.0",
			officialUrls: {
				repo: "https://github.com/TencentCloud/tencentmeeting-cli",
				docs: "https://meeting.tencent.com/meeting-cli/index.html"
			},
			drivers: [{
				kind: "cli",
				id: "tencentmeeting-tmeet",
				binary: "tmeet",
				installSource: {
					kind: "npm",
					package: "@tencentcloud/tmeet"
				},
				versionArgs: ["--version"]
			}],
			auth: {
				mode: "cli-native",
				cliLoginCommand: [
					"tmeet",
					"auth",
					"login",
					"--no-browser"
				],
				guideSteps: {
					zh: ["安装 @tencentcloud/tmeet 并通过 OAuth2 设备码扫码授权。"],
					en: ["Install @tencentcloud/tmeet and authorize via OAuth2 device code."]
				}
			},
			healthCheck: {
				kind: "cli-command",
				args: ["--version"],
				timeoutMs: 1e4
			},
			riskRules: [
				{
					actionPattern: "list|summary|transcript",
					level: "L0"
				},
				{
					actionPattern: "create|update|cancel",
					level: "L2"
				},
				{
					actionPattern: "share",
					level: "L3"
				}
			],
			examples: [{
				title: {
					zh: "汇总本周会议纪要",
					en: "Summarize weekly meetings"
				},
				prompt: {
					zh: "汇总本周腾讯会议的相关记录与待办。",
					en: "Summarize this week Tencent Meeting transcripts and action items."
				}
			}],
			troubleshooting: []
		},
		{
			id: "wps365",
			name: {
				zh: "WPS 365",
				en: "WPS 365"
			},
			summary: {
				zh: "WPS 365 官方 CLI，覆盖云文档、智能表格、多维表、日历与会议。",
				en: "Official WPS 365 CLI covering cloud docs, sheets, calendar, and meetings."
			},
			category: "office-suite",
			icon: "wps365",
			color: "#e5484d",
			maintainer: "official",
			platforms: [
				"win32",
				"darwin",
				"linux"
			],
			minDesktopVersion: "5.4.0",
			officialUrls: {
				repo: "https://github.com/wps365-open/cli",
				docs: "https://open.wps.cn/documents/app-integration-dev/mcp-server/introduction"
			},
			drivers: [{
				kind: "cli",
				id: "wps365-cli",
				binary: "wps365-cli",
				installSource: {
					kind: "github-release",
					repo: "wps365-open/cli"
				},
				versionArgs: ["--version"]
			}],
			auth: {
				mode: "cli-native",
				cliLoginCommand: [
					"wps365-cli",
					"auth",
					"login",
					"--device"
				],
				guideSteps: {
					zh: ["安装 wps365-cli 并完成官方账号授权。"],
					en: ["Install wps365-cli and complete official login."]
				}
			},
			healthCheck: {
				kind: "cli-command",
				args: ["--version"],
				timeoutMs: 1e4
			},
			riskRules: [
				{
					actionPattern: "list|search|read|get",
					level: "L0"
				},
				{
					actionPattern: "create|draft|append",
					level: "L1"
				},
				{
					actionPattern: "delete|update|end",
					level: "L2"
				},
				{
					actionPattern: "send|share",
					level: "L3"
				}
			],
			examples: [{
				title: {
					zh: "整理 WPS 云文档",
					en: "Summarize WPS docs"
				},
				prompt: {
					zh: "查看最近更新的 WPS 云文档并生成汇报提纲。",
					en: "Summarize my recently updated WPS 365 docs."
				}
			}],
			troubleshooting: []
		}
	]
};
function loadBuiltinCatalog() {
	const here = dirname(fileURLToPath(import.meta.url));
	const candidates = [resolve(here, "../../../../apps/dsh-desktop/src/connectors/builtin-catalog.v1.json"), resolve(here, "../../../apps/dsh-desktop/src/connectors/builtin-catalog.v1.json")];
	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		try {
			const parsed = JSON.parse(readFileSync(candidate, "utf8"));
			if (parsed.schemaVersion === 1 && Array.isArray(parsed.connectors) && parsed.connectors.length > 0) return parsed;
		} catch {}
	}
	return EMBEDDED_FALLBACK_CATALOG;
}
//#endregion
//#region src/connectors/secret-vault.ts
async function atomicWriteSecure(filePath, content) {
	await mkdir(dirname(filePath), { recursive: true });
	const temp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const backup = `${filePath}.bak-${process.pid}-${Date.now()}`;
	await writeFile(temp, content, {
		encoding: "utf8",
		mode: 384,
		flag: "wx"
	});
	let moved = false;
	try {
		try {
			await rename(filePath, backup);
			moved = true;
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		await rename(temp, filePath);
		if (moved) await rm(backup, { force: true });
	} catch (error) {
		await rm(temp, { force: true });
		if (moved) {
			await rm(filePath, { force: true });
			await rename(backup, filePath);
		}
		throw error;
	}
}
function makeRecordKey(connectorId, profileId, fieldKey) {
	return `${connectorId}/${profileId || "default"}/${fieldKey}`;
}
var ConnectorSecretVault = class {
	customCipher;
	vaultPath;
	keyPath;
	key;
	entries = {};
	loaded = false;
	constructor(homeDir, customCipher) {
		this.customCipher = customCipher;
		this.vaultPath = join(homeDir, "connectors", "secrets.enc.json");
		this.keyPath = join(homeDir, "connectors", ".vault.key");
	}
	async ensureKey() {
		if (this.key) return this.key;
		const raw = await readFile(this.keyPath, "utf8").catch(() => void 0);
		if (raw) {
			const parsed = Buffer.from(raw.trim(), "hex");
			if (parsed.length === 32) {
				this.key = parsed;
				return parsed;
			}
		}
		const generated = randomBytes(32);
		await atomicWriteSecure(this.keyPath, `${generated.toString("hex")}\n`);
		this.key = generated;
		return generated;
	}
	async encryptValue(plaintext) {
		if (this.customCipher) return this.customCipher.encrypt(plaintext);
		const key = await this.ensureKey();
		const iv = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", key, iv);
		const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
		return {
			iv: iv.toString("base64"),
			tag: cipher.getAuthTag().toString("base64"),
			data: encrypted.toString("base64")
		};
	}
	async decryptValue(blob) {
		if (this.customCipher) return this.customCipher.decrypt(blob);
		const key = await this.ensureKey();
		try {
			const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
			decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
			return Buffer.concat([decipher.update(Buffer.from(blob.data, "base64")), decipher.final()]).toString("utf8");
		} catch {
			return;
		}
	}
	async ensureLoaded() {
		if (this.loaded) return;
		const raw = await readFile(this.vaultPath, "utf8").catch(() => void 0);
		if (raw) try {
			const parsed = JSON.parse(raw);
			if (parsed.version === 1 && parsed.entries && typeof parsed.entries === "object") this.entries = { ...parsed.entries };
		} catch {
			this.entries = {};
		}
		this.loaded = true;
	}
	async save() {
		await atomicWriteSecure(this.vaultPath, `${JSON.stringify({
			version: 1,
			entries: this.entries
		}, null, 2)}\n`);
	}
	async setSecret(connectorId, profileId, fieldKey, value) {
		await this.ensureLoaded();
		const key = makeRecordKey(connectorId, profileId, fieldKey);
		const trimmed = value.trim();
		if (!trimmed) return;
		this.entries[key] = await this.encryptValue(trimmed);
		await this.save();
	}
	async hasSecret(connectorId, profileId, fieldKey) {
		await this.ensureLoaded();
		return Boolean(this.entries[makeRecordKey(connectorId, profileId, fieldKey)]);
	}
	async getSecret(connectorId, profileId, fieldKey) {
		await this.ensureLoaded();
		const blob = this.entries[makeRecordKey(connectorId, profileId, fieldKey)];
		if (!blob) return void 0;
		return this.decryptValue(blob);
	}
	async listPresentKeys(connectorId, profileId) {
		await this.ensureLoaded();
		const prefix = `${connectorId}/${profileId || "default"}/`;
		const result = {};
		for (const fullKey of Object.keys(this.entries)) if (fullKey.startsWith(prefix)) result[fullKey.slice(prefix.length)] = true;
		return result;
	}
	async deleteConnectorSecrets(connectorId) {
		await this.ensureLoaded();
		const prefix = `${connectorId}/`;
		let changed = false;
		for (const fullKey of Object.keys(this.entries)) if (fullKey.startsWith(prefix)) {
			delete this.entries[fullKey];
			changed = true;
		}
		if (changed) await this.save();
	}
	async resolveTemplates(template, connectorId, profileId, nonSecretFields) {
		await this.ensureLoaded();
		const resolved = {};
		const placeholder = /\$\{credential:connector\/([^/]+)\/([^/]+)\/([^}]+)\}/gu;
		for (const [headerOrEnv, rawPattern] of Object.entries(template)) {
			let missing = false;
			const parts = [];
			let lastIndex = 0;
			placeholder.lastIndex = 0;
			for (const match of rawPattern.matchAll(placeholder)) {
				const index = match.index ?? 0;
				parts.push(rawPattern.slice(lastIndex, index));
				const [, targetConn, targetProfile, fieldKey] = match;
				const secretVal = await this.getSecret(targetConn || connectorId, targetProfile || profileId, fieldKey);
				const fallbackNonSecret = nonSecretFields?.[fieldKey];
				const value = secretVal ?? fallbackNonSecret;
				if (!value) missing = true;
				parts.push(value ?? "");
				lastIndex = index + match[0].length;
			}
			parts.push(rawPattern.slice(lastIndex));
			const finalValue = parts.join("");
			if (!missing && finalValue.trim().length > 0) resolved[headerOrEnv] = finalValue;
		}
		return resolved;
	}
};
//#endregion
//#region src/connectors/types.ts
const CONNECTOR_API_PREFIX = "/api/dsh-connectors";
const WORK_OFFICE_PRESET_ID = "work-office";
//#endregion
//#region src/connectors/connector-registry-service.ts
function resolveConnectorsHome(explicitHome) {
	if (explicitHome && explicitHome.trim().length > 0) return explicitHome;
	const envHome = process.env.DSH_HOME;
	if (envHome && envHome.trim().length > 0) return envHome.trim();
	return join(homedir(), ".dsh");
}
function defaultUserConfig(entry) {
	return {
		enabled: false,
		selectedDriverId: entry.drivers[0]?.id,
		activeProfileId: "default",
		profiles: { default: { id: "default" } },
		consentAccepted: false
	};
}
async function atomicWriteUtf8(filePath, content) {
	await mkdir(dirname(filePath), { recursive: true });
	const temp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const backup = `${filePath}.bak-${process.pid}-${Date.now()}`;
	await writeFile(temp, content, {
		encoding: "utf8",
		mode: 384,
		flag: "wx"
	});
	let moved = false;
	try {
		try {
			await rename(filePath, backup);
			moved = true;
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		await rename(temp, filePath);
		if (moved) await rm(backup, { force: true });
	} catch (error) {
		await rm(temp, { force: true });
		if (moved) {
			await rm(filePath, { force: true });
			await rename(backup, filePath);
		}
		throw error;
	}
}
function isExecutableFile(target, platform) {
	if (!isAbsolute(target) || !existsSync(target)) return false;
	if (platform === "win32") return /\.(?:exe|cmd|bat)$/iu.test(target);
	try {
		accessSync(target, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
function binaryCandidates(binary, platform) {
	if (platform === "win32") return binary.endsWith(".exe") ? [binary] : [
		`${binary}.exe`,
		`${binary}.cmd`,
		binary
	];
	return [binary];
}
const DIRECT_NATIVE_PATHS = {
	"lark-cli": (pkgRoot) => [join(pkgRoot, "node_modules", "@larksuite", "cli", "bin", "lark-cli.exe")],
	tmeet: (pkgRoot, arch) => [join(pkgRoot, "node_modules", "@tencentcloud", "tmeet", "dist", arch === "arm64" ? "tmeet-Windows-ARM64.exe" : "tmeet-Windows-x86_64.exe"), join(pkgRoot, "node_modules", "@tencentcloud", "tmeet", "dist", "tmeet-Windows-x86_64.exe")],
	"wecom-cli": (pkgRoot, arch) => [
		join(pkgRoot, "node_modules", `@wecom/cli-win32-${arch === "arm64" ? "arm64" : "x64"}`, "wecom-cli.exe"),
		join(pkgRoot, "node_modules", `@wecom/cli-win32-${arch === "arm64" ? "arm64" : "x64"}`, "bin", "wecom-cli.exe"),
		join(pkgRoot, "node_modules", "@wecom", "cli", "bin", "wecom-cli.exe")
	]
};
function findManagedBinary(homeDir, connectorId, binary, platform) {
	const pkgRoot = join(homeDir, "connectors", "packages", connectorId);
	if (platform === "win32") {
		const directFn = DIRECT_NATIVE_PATHS[binary];
		if (directFn) {
			for (const candidate of directFn(pkgRoot, process.arch)) if (isExecutableFile(candidate, platform)) return candidate;
		}
	}
	const candidates = binaryCandidates(binary, platform);
	const dirs = [join(pkgRoot, "bin"), join(pkgRoot, "node_modules", ".bin")];
	for (const dir of dirs) for (const file of candidates) {
		const full = join(dir, file);
		if (isExecutableFile(full, platform)) return full;
	}
}
async function unwrapWindowsCmdToNode(cmdPath) {
	if (!/\.(?:cmd|bat)$/iu.test(cmdPath) || !existsSync(cmdPath)) return void 0;
	try {
		const content = await readFile(cmdPath, "utf8");
		const binDir = dirname(cmdPath);
		const match = /"(?:%dp0%|%~dp0)[\\/]([^"]+\.(?:cjs|mjs|js))"/iu.exec(content);
		if (!match) return void 0;
		const candidate = join(binDir, match[1].replace(/\\/gu, "/"));
		return existsSync(candidate) ? candidate : void 0;
	} catch {
		return;
	}
}
async function resolveDirectCommand(command, args, env, platform = process.platform) {
	if (platform === "win32" && /\.(?:cmd|bat)$/iu.test(command)) {
		const unwrapped = await unwrapWindowsCmdToNode(command);
		if (unwrapped) return {
			command: process.execPath,
			args: [unwrapped, ...args],
			env: {
				...env,
				...process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}
			},
			shell: false
		};
		return {
			command,
			args,
			env,
			shell: true
		};
	}
	return {
		command,
		args,
		env,
		shell: false
	};
}
function findBinaryOnPath(binary, platform) {
	const candidates = binaryCandidates(binary, platform);
	const dirs = (process.env.PATH ?? "").split(platform === "win32" ? ";" : ":").filter(Boolean);
	for (const dir of dirs) for (const file of candidates) {
		const full = join(dir, file);
		if (isExecutableFile(full, platform)) return full;
	}
}
async function ensureManagedNodeShim(homeDir, platform = process.platform, execPath = process.execPath, isElectronRuntime = Boolean(process.versions.electron)) {
	const binDir = join(homeDir, "connectors", "bin");
	await mkdir(binDir, { recursive: true });
	if (platform === "win32") {
		const shimPath = join(binDir, "node.cmd");
		let commandLine = `"${execPath}" %*`;
		if (/[\u0080-\uFFFF%]/u.test(execPath)) {
			await writeFile(join(binDir, "dsh-node-unicode.ps1"), `\uFEFF${[
				isElectronRuntime ? "$env:ELECTRON_RUN_AS_NODE = '1'" : "",
				`& '${execPath.replace(/'/gu, "''")}' @args`,
				"exit $LASTEXITCODE"
			].filter(Boolean).join("\r\n")}\r\n`, "utf8");
			commandLine = "\"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe\" -NoProfile -ExecutionPolicy Bypass -File \"%~dp0dsh-node-unicode.ps1\" %*";
		}
		await writeFile(shimPath, `${[
			"@echo off",
			"setlocal",
			isElectronRuntime ? "set ELECTRON_RUN_AS_NODE=1" : "",
			commandLine
		].filter(Boolean).join("\r\n")}\r\n`, "utf8");
		return binDir;
	}
	const shimPath = join(binDir, "node");
	const quoted = `'${execPath.replace(/'/gu, "'\\''")}'`;
	await writeFile(shimPath, `${[
		"#!/bin/sh",
		isElectronRuntime ? "export ELECTRON_RUN_AS_NODE=1" : "",
		`exec ${quoted} "$@"`
	].filter(Boolean).join("\n")}\n`, "utf8");
	await chmod(shimPath, 493);
	return binDir;
}
function withManagedBinPath(baseEnv, binDir, platform = process.platform) {
	const sep = platform === "win32" ? ";" : ":";
	const nextEnv = { ...baseEnv };
	const pathKey = platform === "win32" ? Object.keys(nextEnv).find((key) => key.toLowerCase() === "path") ?? "PATH" : "PATH";
	nextEnv[pathKey] = [binDir, ...(nextEnv[pathKey] ?? nextEnv.PATH ?? "").split(sep).filter(Boolean).filter((part) => part.toLowerCase() !== binDir.toLowerCase())].join(sep);
	if (pathKey !== "PATH") nextEnv.PATH = nextEnv[pathKey];
	return nextEnv;
}
function resolveBundledPnpmCli(platform = process.platform) {
	const pnpmRelCandidates = [
		"pnpm/bin/pnpm.mjs",
		"pnpm/bin/pnpm.cjs",
		"pnpm/dist/pnpm.mjs",
		"pnpm/dist/pnpm.cjs"
	];
	const req = createRequire(import.meta.url);
	for (const spec of pnpmRelCandidates) try {
		const resolved = req.resolve(spec);
		if (resolved && existsSync(resolved)) return resolved;
	} catch {}
	const probeRoots = [];
	const resourcesPath = process.resourcesPath;
	if (typeof resourcesPath === "string" && resourcesPath.length > 0) probeRoots.push(join(resourcesPath, "app.asar.unpacked"), resourcesPath);
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let i = 0; i < 7; i += 1) {
		probeRoots.push(dir, join(dir, "apps", "dsh-desktop"));
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	for (const root of probeRoots) for (const rel of pnpmRelCandidates) {
		const candidate = join(root, "node_modules", rel);
		if (existsSync(candidate)) return candidate;
	}
	return findBinaryOnPath("pnpm", platform);
}
function classifyInstallError(rawError) {
	const text = rawError.trim();
	if (/\b(?:ENOENT|EINVAL|not recognized as an internal or external command)\b|exited with code 1\b|npm\.cmd/iu.test(text) && !/https?:\/\/|\b(?:ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|404|E404)\b/iu.test(text)) return {
		zh: "本机包管理器或 Node 运行时不可用，未能完成自动安装，请查看下方原始日志或前往官网手动安装。",
		en: "Package manager or Node runtime is unavailable on this machine. Check diagnostic log or install from official docs."
	};
	if (/\b(?:404|E404|ERR_PNPM_FETCH_404|Not Found)\b|HTTP 404/iu.test(text)) return {
		zh: "包仓库暂未找到该官方组件包，请查看下方原始日志或前往官方页面下载安装包。",
		en: "Package was not found in registry. Check diagnostic log or open the official download page."
	};
	if (/\b(?:ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ERR_PNPM_META_FETCH_FAIL)\b|timed\s+out|fetch\s+failed|certificate|ssl/iu.test(text)) return {
		zh: "无法连接包仓库，请检查当前网络或代理设置后重试，也可前往官方页面下载。",
		en: "Could not reach package registry. Check network/proxy settings and retry, or open the official download page."
	};
	return {
		zh: "自动安装官方组件未完成，可展开下方「查看原始日志」查看原因，或前往官方页面手动安装。",
		en: "Automatic installation did not complete. Expand Diagnostic log below or open official install docs."
	};
}
async function runSimpleProcess(command, args, options = {}) {
	return await new Promise((resolvePromise) => {
		let settled = false;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolvePromise(result);
		};
		let child;
		try {
			child = spawn(command, args, {
				...options.cwd ? { cwd: options.cwd } : {},
				...options.env ? { env: options.env } : {},
				shell: options.shell ?? false,
				windowsHide: true,
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
		} catch (error) {
			finish({
				ok: false,
				error: error instanceof Error ? error.message : String(error)
			});
			return;
		}
		let output = "";
		const append = (chunk) => {
			if (output.length < 16384) output += chunk.toString("utf8");
		};
		child.stdout?.on("data", append);
		child.stderr?.on("data", append);
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			finish({
				ok: false,
				error: `${command} timed out`
			});
		}, options.timeoutMs ?? 12e4);
		child.once("error", (error) => {
			finish({
				ok: false,
				error: error.message
			});
		});
		child.once("close", (code) => {
			finish(code === 0 ? { ok: true } : {
				ok: false,
				error: output.trim() || `${command} exited with code ${code}`
			});
		});
	});
}
async function findExtractedFile(rootDir, candidates, depth = 0) {
	if (depth > 4 || !existsSync(rootDir)) return void 0;
	const entries = await readdir(rootDir, { withFileTypes: true });
	const lowerCandidates = new Set(candidates.map((c) => c.toLowerCase()));
	for (const entry of entries) if (entry.isFile() && lowerCandidates.has(entry.name.toLowerCase())) return join(rootDir, entry.name);
	for (const entry of entries) if (entry.isDirectory()) {
		const nested = await findExtractedFile(join(rootDir, entry.name), candidates, depth + 1);
		if (nested) return nested;
	}
}
async function runGithubReleaseInstallAttempt(spec, platform, childEnv) {
	const platformKey = `${platform}-${process.arch}`;
	const assetName = spec.assetTemplates?.[platformKey];
	if (!assetName) return {
		ok: false,
		error: `no release asset template for ${platformKey}`
	};
	const downloadUrl = `https://github.com/${spec.target}/releases/latest/download/${assetName}`;
	const archivePath = join(spec.managedDir, assetName);
	const binDir = join(spec.managedDir, "bin");
	await mkdir(binDir, { recursive: true });
	try {
		const response = await fetch(downloadUrl, {
			headers: { "user-agent": "deepseek-harness-desktop" },
			redirect: "follow",
			signal: AbortSignal.timeout(12e4)
		});
		if (!response.ok) return {
			ok: false,
			error: `HTTP ${response.status} downloading ${downloadUrl}`
		};
		await writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
	} catch (error) {
		return {
			ok: false,
			error: `fetch failed for ${downloadUrl}: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	let extracted;
	if (/\.zip$/iu.test(assetName)) if (platform === "win32") {
		extracted = await runSimpleProcess("tar.exe", [
			"-xf",
			archivePath,
			"-C",
			binDir
		], { env: childEnv });
		if (!extracted.ok) extracted = await runSimpleProcess("powershell.exe", [
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			`Expand-Archive -LiteralPath '${archivePath.replace(/'/gu, "''")}' -DestinationPath '${binDir.replace(/'/gu, "''")}' -Force`
		], { env: childEnv });
	} else extracted = await runSimpleProcess("unzip", [
		"-o",
		archivePath,
		"-d",
		binDir
	], { env: childEnv });
	else extracted = await runSimpleProcess(platform === "win32" ? "tar.exe" : "tar", [
		"-xzf",
		archivePath,
		"-C",
		binDir
	], { env: childEnv });
	await rm(archivePath, { force: true }).catch(() => {});
	if (!extracted.ok) return {
		ok: false,
		error: `extract failed for ${assetName}: ${extracted.error}`
	};
	const binary = spec.binary ?? spec.connectorId;
	const candidates = binaryCandidates(binary, platform);
	let resolvedPath = candidates.map((name) => join(binDir, name)).find((path) => existsSync(path));
	if (!resolvedPath) {
		const nested = await findExtractedFile(binDir, candidates);
		if (nested) {
			const promoted = join(binDir, platform === "win32" ? binary.endsWith(".exe") ? binary : `${binary}.exe` : binary);
			await copyFile(nested, promoted);
			resolvedPath = promoted;
		}
	}
	if (!resolvedPath) return {
		ok: false,
		error: `extracted ${assetName} but executable ${binary} was not found`
	};
	if (platform !== "win32") await chmod(resolvedPath, 493).catch(() => {});
	return {
		ok: true,
		binaryPath: resolvedPath,
		sourceUsed: "github-release"
	};
}
async function runPackageNodePostinstall(managedDir, pkg, childEnv) {
	const pkgDir = join(managedDir, "node_modules", pkg.startsWith("@") ? pkg.replace(/^(?:@[^/]+\/[^@]+)(?:@.*)?$/u, (m) => m.split(/(?<=[^/])@/u)[0]) : pkg.split("@")[0]);
	const manifestPath = join(pkgDir, "package.json");
	if (!existsSync(manifestPath)) return { ok: true };
	try {
		const postinstall = JSON.parse(await readFile(manifestPath, "utf8")).scripts?.postinstall?.trim();
		if (!postinstall) return { ok: true };
		const match = /^node\s+([^\s;|&<>]+)(?:\s+(.*))?$/u.exec(postinstall);
		if (!match) return { ok: true };
		const scriptPath = join(pkgDir, match[1]);
		if (!existsSync(scriptPath)) return { ok: true };
		const extraArgs = match[2] ? match[2].trim().split(/\s+/u).filter(Boolean) : [];
		return await runSimpleProcess(process.execPath, [scriptPath, ...extraArgs], {
			cwd: pkgDir,
			env: childEnv,
			shell: false,
			timeoutMs: 12e4
		});
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
async function runPnpmInstallAttempt(pnpmCli, pkg, managedDir, platform, childEnv, registryUrl) {
	const isScript = /\.(?:mjs|cjs|js)$/iu.test(pnpmCli);
	const pnpmArgs = [
		"add",
		"--dir",
		managedDir,
		"--ignore-workspace",
		`--allow-build=${pkg}`,
		"--config.strict-dep-builds=false",
		"--config.node-linker=hoisted",
		"--config.ignore-scripts=true",
		"--config.package-import-method=copy",
		`--registry=${registryUrl}`,
		pkg
	];
	const installRes = await runSimpleProcess(isScript ? process.execPath : pnpmCli, isScript ? [pnpmCli, ...pnpmArgs] : pnpmArgs, {
		cwd: managedDir,
		env: childEnv,
		shell: !isScript && platform === "win32" && /\.(?:cmd|bat)$/iu.test(pnpmCli),
		timeoutMs: 12e4
	});
	if (!installRes.ok) return installRes;
	return await runPackageNodePostinstall(managedDir, pkg, childEnv);
}
async function runNpmInstallAttempt(pkg, managedDir, platform, childEnv, registryUrl) {
	const npmCmd = platform === "win32" ? "npm.cmd" : "npm";
	const args = [
		"install",
		"--prefix",
		managedDir,
		"--no-audit",
		"--no-fund",
		"--silent",
		pkg
	];
	if (registryUrl) args.push(`--registry=${registryUrl}`);
	return await runSimpleProcess(npmCmd, args, {
		cwd: managedDir,
		env: childEnv,
		shell: platform === "win32",
		timeoutMs: 12e4
	});
}
async function defaultInstallRunner(spec, platform, homeDir) {
	await mkdir(spec.managedDir, { recursive: true });
	const binDir = await ensureManagedNodeShim(homeDir, platform);
	const childEnv = {
		...withManagedBinPath(process.env, binDir, platform),
		...process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}
	};
	if (spec.kind === "github-release") return await runGithubReleaseInstallAttempt(spec, platform, childEnv);
	if (spec.kind !== "npm") return {
		ok: false,
		error: `unsupported automatic installer kind: ${spec.kind}`
	};
	const manifestPath = join(spec.managedDir, "package.json");
	if (!existsSync(manifestPath)) await writeFile(manifestPath, `${JSON.stringify({
		name: `dsh-connector-${spec.connectorId}`,
		private: true
	}, null, 2)}\n`, "utf8");
	const pnpmCli = resolveBundledPnpmCli(platform);
	const registries = [{
		url: "https://registry.npmmirror.com",
		label: "npmmirror"
	}, {
		url: "https://registry.npmjs.org",
		label: "npmjs"
	}];
	const errors = [];
	for (const reg of registries) {
		const attempt = pnpmCli ? await runPnpmInstallAttempt(pnpmCli, spec.target, spec.managedDir, platform, childEnv, reg.url) : await runNpmInstallAttempt(spec.target, spec.managedDir, platform, childEnv, reg.url);
		if (attempt.ok) return {
			ok: true,
			sourceUsed: `${pnpmCli ? "pnpm" : "npm"}:${reg.label}`
		};
		if (attempt.error) errors.push(`[${reg.label}] ${attempt.error}`);
	}
	return {
		ok: false,
		error: errors.join("\n\n")
	};
}
function defaultLoginLauncher(command, args, env) {
	if (process.platform === "win32" && /\.(?:cmd|bat)$/iu.test(command)) return spawn(command, args, {
		env,
		shell: true,
		windowsHide: true,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
	return spawn(command, args, {
		env,
		shell: false,
		windowsHide: true,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
}
async function defaultProbeCli(command, args, timeoutMs, env) {
	const resolved = await resolveDirectCommand(command, args, env ?? process.env);
	return await new Promise((resolvePromise) => {
		let settled = false;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolvePromise(result);
		};
		let child;
		try {
			child = spawn(resolved.command, resolved.args, {
				env: resolved.env,
				shell: resolved.shell,
				windowsHide: true,
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
		} catch (error) {
			finish({
				ok: false,
				stdout: "",
				stderr: error instanceof Error ? error.message : String(error)
			});
			return;
		}
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk) => {
			if (stdout.length < 8192) stdout += chunk.toString("utf8");
		});
		child.stderr?.on("data", (chunk) => {
			if (stderr.length < 8192) stderr += chunk.toString("utf8");
		});
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			finish({
				ok: false,
				stdout,
				stderr: `${stderr}\ncommand timed out`.trim()
			});
		}, timeoutMs);
		child.once("error", (error) => {
			finish({
				ok: false,
				stdout,
				stderr: error.message
			});
		});
		child.once("close", (code) => {
			finish({
				ok: code === 0,
				stdout,
				stderr
			});
		});
	});
}
function safePatternMatch(pattern, input) {
	try {
		return new RegExp(pattern, "iu").test(input);
	} catch {
		return input.toLowerCase().includes(pattern.toLowerCase());
	}
}
function classifyConnectorFailure(entry, rawError) {
	for (const rule of entry.troubleshooting) if (safePatternMatch(rule.matchPattern, rawError)) {
		const lowerCode = rule.code.toLowerCase();
		return {
			status: lowerCode.includes("admin") ? "awaiting_admin_approval" : lowerCode.includes("auth") || lowerCode.includes("token") ? "auth_expired" : "error",
			friendlyCause: rule.cause,
			friendlyFix: rule.fix
		};
	}
	if (/admin|approval|corp\s*deny/iu.test(rawError)) return {
		status: "awaiting_admin_approval",
		friendlyCause: {
			zh: "需要企业管理员审批开通该应用权限。",
			en: "Organization administrator approval is required."
		},
		friendlyFix: {
			zh: "请联系管理员在开放平台工作台批准授权后再次验证。",
			en: "Ask your organization admin to approve the app and verify again."
		}
	};
	if (/401|unauthorized|expired|not\s+logged\s+in|login\s+required/iu.test(rawError)) return {
		status: "auth_expired",
		friendlyCause: {
			zh: "尚未登录或授权令牌已失效。",
			en: "Not signed in or authorization token expired."
		},
		friendlyFix: {
			zh: "按向导重新完成登录授权后再次点击验证连接。",
			en: "Complete sign-in in the guide and click Verify connection again."
		}
	};
	return {
		status: "error",
		friendlyCause: {
			zh: "连接验证未通过，可能是网络不可达或参数有误。",
			en: "Connection check failed due to unreachable endpoint or invalid parameters."
		},
		friendlyFix: {
			zh: "请核对网络环境、配置参数，或展开「高级设置与调试」查看原始日志。",
			en: "Check network connectivity and parameters, or expand Advanced settings to inspect raw logs."
		}
	};
}
var ConnectorRegistryService = class {
	ctx;
	homeDir;
	configPath;
	platform;
	probeCli;
	installRunner;
	loginLauncher;
	secretVault;
	catalog;
	persisted = {
		version: 1,
		connectors: {}
	};
	statuses = /* @__PURE__ */ new Map();
	diagnostics = /* @__PURE__ */ new Map();
	mcpDisposers = /* @__PURE__ */ new Map();
	loginSessions = /* @__PURE__ */ new Map();
	loginChildren = /* @__PURE__ */ new Map();
	skillControl;
	loaded = false;
	constructor(ctx, deps = {}) {
		this.ctx = ctx;
		this.homeDir = resolveConnectorsHome(deps.dshHome);
		this.configPath = join(this.homeDir, "connectors", "config.json");
		this.platform = deps.platform ?? process.platform;
		this.probeCli = deps.probeCli ?? defaultProbeCli;
		this.installRunner = deps.installRunner;
		this.loginLauncher = deps.loginLauncher ?? defaultLoginLauncher;
		this.secretVault = deps.secretVault ?? new ConnectorSecretVault(this.homeDir);
		this.catalog = loadBuiltinCatalog();
	}
	async init() {
		await this.ensureLoaded();
		this.installSkillProvider();
		this.installPromptSection();
		await this.reconcileActiveConnectors();
	}
	dispose() {
		for (const child of this.loginChildren.values()) try {
			child.kill?.("SIGTERM");
		} catch {}
		this.loginChildren.clear();
		for (const dispose of this.mcpDisposers.values()) try {
			dispose();
		} catch {}
		this.mcpDisposers.clear();
	}
	async ensureLoaded() {
		if (this.loaded) return;
		const raw = await readFile(this.configPath, "utf8").catch((error) => {
			if (error?.code === "ENOENT") return void 0;
		});
		if (raw) try {
			const parsed = JSON.parse(raw);
			if (parsed.version === 1 && parsed.connectors && typeof parsed.connectors === "object") this.persisted = {
				version: 1,
				connectors: parsed.connectors
			};
		} catch {
			this.persisted = {
				version: 1,
				connectors: {}
			};
		}
		for (const entry of this.catalog.connectors) {
			const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry);
			this.persisted.connectors[entry.id] = cfg;
			this.statuses.set(entry.id, cfg.enabled ? "installed_unauthenticated" : "not_installed");
		}
		this.loaded = true;
	}
	async saveConfig() {
		const sanitized = {
			version: 1,
			connectors: {}
		};
		for (const [id, cfg] of Object.entries(this.persisted.connectors)) {
			const profiles = {};
			for (const [pid, profile] of Object.entries(cfg.profiles ?? {})) profiles[pid] = {
				id: pid,
				...profile.label ? { label: profile.label } : {},
				...profile.accountLabel ? { accountLabel: profile.accountLabel } : {},
				...profile.nonSecretFields ? { nonSecretFields: { ...profile.nonSecretFields } } : {}
			};
			sanitized.connectors[id] = {
				enabled: Boolean(cfg.enabled),
				selectedDriverId: cfg.selectedDriverId,
				customBinaryPath: cfg.customBinaryPath,
				activeProfileId: cfg.activeProfileId || "default",
				profiles,
				consentAccepted: Boolean(cfg.consentAccepted),
				...cfg.pinnedVersion ? { pinnedVersion: cfg.pinnedVersion } : {}
			};
		}
		await atomicWriteUtf8(this.configPath, `${JSON.stringify(sanitized, null, 2)}\n`);
	}
	activeDriverFor(entry, config) {
		return entry.drivers.find((driver) => driver.id === config.selectedDriverId) ?? entry.drivers[0];
	}
	getEntryOrThrow(connectorId) {
		const entry = this.catalog.connectors.find((item) => item.id === connectorId);
		if (!entry) throw new Error(`unknown connector: ${connectorId}`);
		return entry;
	}
	installSkillProvider() {
		const skills = this.ctx.get?.("skills");
		if (!skills?.registerProvider) return;
		const unregister = skills.registerProvider((control) => {
			this.skillControl = control;
			return {
				name: "desktop-connectors",
				discover: async () => ({
					complete: true,
					candidates: this.connectedEntries().map((item) => ({
						name: `connector-${item.entry.id}`,
						description: `${item.entry.name.zh} (${item.entry.name.en}): ${item.entry.summary.zh}`,
						whenToUse: item.entry.examples.map((ex) => ex.prompt.zh).join(" / "),
						invocation: {
							modelInvocable: true,
							userInvocable: true
						},
						source: "bundled",
						provider: "desktop-connectors",
						rank: 550,
						locator: item.entry.id
					}))
				}),
				get: async (locator) => {
					const item = this.connectedEntries().find((candidate) => candidate.entry.id === locator);
					if (!item) return void 0;
					const guide = item.entry.auth.guideSteps.zh.join("\n");
					const examples = item.entry.examples.map((ex) => `- ${ex.title.zh}: ${ex.prompt.zh}`).join("\n");
					return {
						name: `connector-${item.entry.id}`,
						description: item.entry.summary.zh,
						invocation: {
							modelInvocable: true,
							userInvocable: true
						},
						source: "bundled",
						provider: "desktop-connectors",
						content: `# ${item.entry.name.zh} (${item.entry.name.en})\n\nDriver: ${item.activeDriver.kind} (${item.activeDriver.id})\n\n## Usage\n${guide}\n\n## Examples\n${examples}`
					};
				}
			};
		});
		this.ctx.effect(() => unregister, "dsh-connectors: skill provider");
	}
	installPromptSection() {
		const systemPrompt = this.ctx.get?.("systemPrompt");
		if (!systemPrompt?.section) return;
		const unregister = systemPrompt.section({
			name: "desktop:connectors-index",
			order: 65,
			text: () => {
				const connected = this.connectedEntries();
				if (connected.length === 0) return "";
				return `Connected work-mode services (on-demand only; confirm before mutating/external actions):\n${connected.map((item) => `- ${item.entry.id} (${item.entry.name.zh} / ${item.entry.name.en}, mode=${item.activeDriver.kind}): load skill "connector-${item.entry.id}" or discover its on-demand MCP tools only when the user asks about this service.`).join("\n")}`;
			}
		});
		this.ctx.effect(() => unregister, "dsh-connectors: compact capability index");
	}
	async reconcileActiveConnectors() {
		for (const entry of this.catalog.connectors) {
			const cfg = this.persisted.connectors[entry.id];
			if (!cfg?.enabled) {
				this.unmountMcp(entry.id);
				continue;
			}
			if (this.statuses.get(entry.id) === "connected") await this.mountMcpIfApplicable(entry, cfg);
		}
		this.skillControl?.invalidate();
	}
	async mountMcpIfApplicable(entry, cfg) {
		const driver = this.activeDriverFor(entry, cfg);
		const mcpManager = this.ctx.get?.("mcpManager");
		if (!mcpManager?.register) return;
		this.unmountMcp(entry.id);
		const serverName = `connector_${entry.id}`;
		const profileId = cfg.activeProfileId || "default";
		const nonSecretFields = cfg.profiles?.[profileId]?.nonSecretFields;
		if (driver.kind === "mcp-remote") {
			const headers = await this.secretVault.resolveTemplates(driver.headersTemplate ?? {}, entry.id, profileId, nonSecretFields);
			const dispose = mcpManager.register(serverName, {
				transport: "streamable-http",
				url: driver.url,
				headers,
				toolLoading: driver.toolLoading ?? "on-demand",
				startupTimeoutMs: entry.healthCheck.timeoutMs ?? 15e3
			});
			this.mcpDisposers.set(entry.id, dispose);
		} else if (driver.kind === "mcp-stdio") {
			const resolvedEnv = await this.secretVault.resolveTemplates(driver.envTemplate ?? {}, entry.id, profileId, nonSecretFields);
			const binDir = await ensureManagedNodeShim(this.homeDir, this.platform).catch(() => join(this.homeDir, "connectors", "bin"));
			const env = {
				...withManagedBinPath(process.env, binDir, this.platform),
				...resolvedEnv
			};
			const managedCommand = findManagedBinary(this.homeDir, entry.id, driver.command, this.platform);
			const dispose = mcpManager.register(serverName, {
				transport: "stdio",
				command: managedCommand ?? driver.command,
				args: driver.args,
				env,
				toolLoading: driver.toolLoading ?? "on-demand",
				startupTimeoutMs: entry.healthCheck.timeoutMs ?? 15e3
			});
			this.mcpDisposers.set(entry.id, dispose);
		}
	}
	unmountMcp(connectorId) {
		const existing = this.mcpDisposers.get(connectorId);
		if (!existing) return;
		this.mcpDisposers.delete(connectorId);
		try {
			existing();
		} catch {}
	}
	connectedEntries() {
		return this.catalog.connectors.map((entry) => {
			const config = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry);
			return {
				entry,
				config,
				status: this.statuses.get(entry.id) ?? (config.enabled ? "installed_unauthenticated" : "not_installed"),
				activeDriver: this.activeDriverFor(entry, config),
				diagnostic: this.diagnostics.get(entry.id)
			};
		}).filter((item) => item.config.enabled && item.status === "connected");
	}
	async snapshot() {
		await this.ensureLoaded();
		const items = await Promise.all(this.catalog.connectors.map(async (entry) => {
			const config = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry);
			const status = this.statuses.get(entry.id) ?? "not_installed";
			const hasSecrets = await this.secretVault.listPresentKeys(entry.id, config.activeProfileId || "default");
			return {
				entry,
				config: structuredClone(config),
				status,
				activeDriver: this.activeDriverFor(entry, config),
				diagnostic: this.diagnostics.get(entry.id),
				hasSecrets
			};
		}));
		return {
			catalogVersion: this.catalog.catalogVersion,
			workOfficePresetId: WORK_OFFICE_PRESET_ID,
			connectedCount: items.filter((item) => item.config.enabled && item.status === "connected").length,
			items
		};
	}
	async detectEnvironment(connectorId) {
		await this.ensureLoaded();
		const entry = this.getEntryOrThrow(connectorId);
		const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry);
		const driver = this.activeDriverFor(entry, cfg);
		if (driver.kind === "mcp-remote") return {
			installed: true,
			driverId: driver.id,
			driverKind: driver.kind,
			note: "remote-zero-install"
		};
		if (driver.kind === "skill") {
			const skillPath = join(this.homeDir, "skills", driver.skillName, "SKILL.md");
			return {
				installed: existsSync(skillPath) || cfg.enabled,
				driverId: driver.id,
				driverKind: driver.kind,
				note: existsSync(skillPath) ? skillPath : "catalog-managed-skill"
			};
		}
		if (driver.kind === "cli") {
			const custom = cfg.customBinaryPath?.trim();
			const candidate = custom && isExecutableFile(custom, this.platform) ? custom : findManagedBinary(this.homeDir, entry.id, driver.binary, this.platform) ?? findBinaryOnPath(driver.binary, this.platform);
			if (!candidate) {
				if (!cfg.enabled) this.statuses.set(entry.id, "not_installed");
				return {
					installed: false,
					driverId: driver.id,
					driverKind: driver.kind
				};
			}
			const binDir = await ensureManagedNodeShim(this.homeDir, this.platform).catch(() => join(this.homeDir, "connectors", "bin"));
			const probeEnv = withManagedBinPath(process.env, binDir, this.platform);
			const probe = await this.probeCli(candidate, driver.versionArgs ?? ["--version"], entry.healthCheck.timeoutMs ?? 8e3, probeEnv);
			return {
				installed: probe.ok,
				driverId: driver.id,
				driverKind: driver.kind,
				binaryPath: candidate,
				version: probe.ok ? probe.stdout.trim().split(/\r?\n/u)[0] : void 0
			};
		}
		const candidate = findManagedBinary(this.homeDir, entry.id, driver.command, this.platform) ?? findBinaryOnPath(driver.command, this.platform);
		return {
			installed: Boolean(candidate),
			driverId: driver.id,
			driverKind: driver.kind,
			binaryPath: candidate
		};
	}
	async installConnector(connectorId) {
		await this.ensureLoaded();
		const entry = this.getEntryOrThrow(connectorId);
		const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry);
		const driver = this.activeDriverFor(entry, cfg);
		if (driver.kind === "mcp-remote") return {
			ok: true,
			skipped: true,
			installed: true,
			sourceUsed: "remote-zero-install"
		};
		if (driver.kind === "skill") {
			const skillMdPath = join(join(this.homeDir, "skills", driver.skillName), "SKILL.md");
			if (!existsSync(skillMdPath)) {
				const examples = entry.examples.map((ex) => `- ${ex.title.zh}: ${ex.prompt.zh}`).join("\n");
				await atomicWriteUtf8(skillMdPath, [
					`# ${entry.name.zh} (${entry.name.en})`,
					"",
					entry.summary.zh,
					"",
					`Official docs: ${entry.officialUrls.docs}`,
					"",
					"## Examples",
					examples,
					""
				].join("\n"));
			}
			cfg.enabled = true;
			this.persisted.connectors[entry.id] = cfg;
			if (this.statuses.get(entry.id) === "not_installed" || this.statuses.get(entry.id) === "disabled") this.statuses.set(entry.id, "installed_unauthenticated");
			await this.saveConfig();
			return {
				ok: true,
				installed: true,
				sourceUsed: "managed-skill"
			};
		}
		const existingEnv = await this.detectEnvironment(entry.id);
		if (existingEnv.installed) {
			cfg.enabled = true;
			this.persisted.connectors[entry.id] = cfg;
			if (this.statuses.get(entry.id) === "not_installed" || this.statuses.get(entry.id) === "disabled") this.statuses.set(entry.id, "installed_unauthenticated");
			await this.saveConfig();
			return {
				ok: true,
				installed: true,
				binaryPath: existingEnv.binaryPath,
				version: existingEnv.version,
				sourceUsed: "existing"
			};
		}
		const installSource = driver.installSource;
		const managedDir = join(this.homeDir, "connectors", "packages", entry.id);
		const target = installSource?.package ?? installSource?.repo ?? driver.id;
		if (!installSource || installSource.kind !== "npm" && installSource.kind !== "github-release" && !this.installRunner) return {
			ok: false,
			installed: false,
			fallbackUrl: entry.officialUrls.docs,
			friendlyError: {
				zh: "暂不支持自动安装此驱动，请查看官方安装说明。",
				en: "Automatic installation is not available for this driver; open official docs."
			}
		};
		const runnerSpec = {
			connectorId: entry.id,
			kind: installSource.kind === "github-release" ? "github-release" : "npm",
			target,
			managedDir,
			binary: driver.kind === "cli" ? driver.binary : driver.command,
			...installSource.assetTemplates ? { assetTemplates: installSource.assetTemplates } : {}
		};
		const runResult = this.installRunner ? await this.installRunner(runnerSpec) : await defaultInstallRunner(runnerSpec, this.platform, this.homeDir);
		if (!runResult.ok) {
			const rawError = runResult.error?.slice(0, 1200);
			return {
				ok: false,
				installed: false,
				fallbackUrl: entry.officialUrls.docs,
				friendlyError: classifyInstallError(rawError ?? ""),
				rawError
			};
		}
		const afterEnv = await this.detectEnvironment(entry.id);
		const binaryPath = afterEnv.binaryPath ?? runResult.binaryPath;
		const installed = afterEnv.installed || Boolean(binaryPath);
		if (installed) {
			cfg.enabled = true;
			this.persisted.connectors[entry.id] = cfg;
			if (this.statuses.get(entry.id) !== "connected") this.statuses.set(entry.id, "installed_unauthenticated");
			this.diagnostics.delete(entry.id);
			await this.saveConfig();
		}
		return {
			ok: installed,
			installed,
			binaryPath,
			version: afterEnv.version ?? runResult.version,
			sourceUsed: runResult.sourceUsed ?? "npm",
			...!installed ? {
				fallbackUrl: entry.officialUrls.docs,
				friendlyError: {
					zh: "组件安装已完成，但未检测到可执行入口，请检查系统环境或查看文档。",
					en: "Package installed, but executable entrypoint was not detected."
				}
			} : {}
		};
	}
	async configure(connectorId, patch) {
		await this.ensureLoaded();
		const entry = this.getEntryOrThrow(connectorId);
		const current = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry);
		const nextDriver = patch.selectedDriverId && entry.drivers.some((d) => d.id === patch.selectedDriverId) ? patch.selectedDriverId : current.selectedDriverId ?? entry.drivers[0].id;
		const profileId = patch.activeProfileId?.trim() || current.activeProfileId || "default";
		const existingProfile = current.profiles[profileId] ?? { id: profileId };
		const mergedFields = { ...existingProfile.nonSecretFields };
		if (patch.nonSecretFields) {
			const allowedNonSecret = new Set((entry.auth.fields ?? []).filter((f) => !f.secret).map((f) => f.key));
			for (const [key, val] of Object.entries(patch.nonSecretFields)) if (allowedNonSecret.has(key) && typeof val === "string") mergedFields[key] = val;
		}
		if (patch.secretFields) {
			const allowedSecrets = new Set((entry.auth.fields ?? []).filter((f) => f.secret).map((f) => f.key));
			for (const [key, val] of Object.entries(patch.secretFields)) if (allowedSecrets.has(key) && typeof val === "string" && val.trim().length > 0) await this.secretVault.setSecret(entry.id, profileId, key, val);
		}
		const nextConfig = {
			...current,
			...patch.enabled !== void 0 ? { enabled: Boolean(patch.enabled) } : {},
			selectedDriverId: nextDriver,
			...patch.customBinaryPath !== void 0 ? { customBinaryPath: patch.customBinaryPath.trim() } : {},
			activeProfileId: profileId,
			...patch.consentAccepted !== void 0 ? { consentAccepted: Boolean(patch.consentAccepted) } : {},
			profiles: {
				...current.profiles,
				[profileId]: {
					...existingProfile,
					...patch.accountLabel !== void 0 ? { accountLabel: patch.accountLabel } : {},
					nonSecretFields: mergedFields
				}
			}
		};
		this.persisted.connectors[entry.id] = nextConfig;
		if (!nextConfig.enabled) {
			this.statuses.set(entry.id, "disabled");
			this.unmountMcp(entry.id);
		} else if (this.statuses.get(entry.id) === "disabled" || this.statuses.get(entry.id) === "not_installed") this.statuses.set(entry.id, "installed_unauthenticated");
		await this.saveConfig();
		if (nextConfig.enabled && this.statuses.get(entry.id) === "connected") await this.mountMcpIfApplicable(entry, nextConfig);
		this.skillControl?.invalidate();
		return this.snapshot();
	}
	async startLogin(connectorId) {
		await this.ensureLoaded();
		const entry = this.getEntryOrThrow(connectorId);
		const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry);
		if (this.activeDriverFor(entry, cfg).kind === "mcp-remote" || entry.auth.mode !== "cli-native" || !entry.auth.cliLoginCommand?.length) {
			const session = {
				connectorId: entry.id,
				kind: "web-token",
				state: "awaiting_user",
				authUrl: entry.auth.quickAuthUrl ?? entry.officialUrls.openPlatform ?? entry.officialUrls.docs,
				needsTokenInput: Boolean(entry.auth.fields?.length),
				message: {
					zh: "已为你打开官方授权网页，完成登录后请按提示确认或填入凭证。",
					en: "Official authorization page opened. Complete sign-in and confirm or paste your credential."
				}
			};
			this.loginSessions.set(entry.id, session);
			return { ...session };
		}
		const env = await this.detectEnvironment(entry.id);
		if (!env.installed || !env.binaryPath) {
			const failed = {
				connectorId: entry.id,
				kind: "cli-browser",
				state: "failed",
				fallbackUrl: entry.officialUrls.docs,
				message: {
					zh: "尚未检测到官方组件，请先点击「一键安装官方组件」。",
					en: "Official component is not installed yet. Click One-click install first."
				}
			};
			this.loginSessions.set(entry.id, failed);
			return { ...failed };
		}
		const previousChild = this.loginChildren.get(entry.id);
		if (previousChild) {
			this.loginChildren.delete(entry.id);
			try {
				previousChild.kill?.("SIGTERM");
			} catch {}
		}
		const session = {
			connectorId: entry.id,
			kind: "cli-browser",
			state: "pending",
			message: {
				zh: "正在启动官方网页登录授权，请在浏览器中确认登录。",
				en: "Launching official browser sign-in. Confirm authorization in your browser."
			},
			rawOutput: ""
		};
		this.loginSessions.set(entry.id, session);
		const baseArgs = entry.auth.cliLoginCommand.slice(1);
		const binDir = await ensureManagedNodeShim(this.homeDir, this.platform).catch(() => join(this.homeDir, "connectors", "bin"));
		const loginEnv = withManagedBinPath(process.env, binDir, this.platform);
		const launchResolved = async (cmdArgs) => {
			const resolved = this.platform === "win32" && /\.(?:cmd|bat)$/iu.test(env.binaryPath) ? await resolveDirectCommand(env.binaryPath, cmdArgs, loginEnv, this.platform) : {
				command: env.binaryPath,
				args: cmdArgs,
				env: loginEnv,
				shell: false
			};
			return this.loginLauncher(resolved.command, resolved.args, resolved.env);
		};
		const runLoginAttempt = async (cmdArgs, allowFeishuInitFallback) => {
			let child;
			try {
				child = await launchResolved(cmdArgs);
			} catch (error) {
				session.state = "failed";
				session.rawOutput = error instanceof Error ? error.message : String(error);
				return { ...session };
			}
			this.loginChildren.set(entry.id, child);
			const attemptOutcome = await new Promise((resolvePromise) => {
				let settled = false;
				const settleNow = (retryInit = false) => {
					if (settled) return;
					settled = true;
					clearTimeout(initialTimer);
					resolvePromise({
						retryInit,
						result: { ...session }
					});
				};
				const onChunk = (chunk) => {
					const text = (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)).replace(/\u001b\[[0-9;]*[a-zA-Z]/gu, "");
					session.rawOutput = `${session.rawOutput ?? ""}${text}`.slice(-4096);
					if (!session.deviceCode) {
						const codeMatch = /[?&]user_code=([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/iu.exec(session.rawOutput) ?? /\b([A-Z0-9]{4}-[A-Z0-9]{4,6})\b/u.exec(session.rawOutput);
						if (codeMatch) session.deviceCode = codeMatch[1].toUpperCase();
					}
					if (!session.authUrl) {
						const urlMatch = /https:\/\/[^\s"'<>]+/u.exec(session.rawOutput);
						if (urlMatch) {
							session.authUrl = urlMatch[0];
							settleNow(false);
						}
					}
				};
				child.stdout?.on("data", onChunk);
				child.stderr?.on("data", onChunk);
				child.once("error", (error) => {
					if (this.loginChildren.get(entry.id) === child) this.loginChildren.delete(entry.id);
					session.state = "failed";
					session.rawOutput = `${session.rawOutput ?? ""}\n${error.message}`.trim().slice(-4096);
					settleNow(false);
				});
				child.once("close", (code) => {
					if (this.loginChildren.get(entry.id) === child) this.loginChildren.delete(entry.id);
					if (code === 0) this.verifyConnection(entry.id, { simulateOutcome: "ok" }).then(() => {
						session.state = "succeeded";
						session.message = {
							zh: "网页授权已完成，连接已就绪。",
							en: "Browser authorization succeeded."
						};
						settleNow(false);
					}).catch(() => {
						session.state = "succeeded";
						settleNow(false);
					});
					else {
						if (allowFeishuInitFallback && entry.id === "feishu" && /not_configured|not configured/iu.test(session.rawOutput ?? "")) {
							settleNow(true);
							return;
						}
						session.state = "failed";
						session.message = {
							zh: "登录授权未完成或已取消，可重新发起网页授权。",
							en: "Authorization was cancelled or failed. You can retry."
						};
						settleNow(false);
					}
				});
				const initialTimer = setTimeout(() => settleNow(false), 8e3);
			});
			if (attemptOutcome.retryInit) {
				session.rawOutput = "";
				session.state = "pending";
				return await runLoginAttempt([
					"config",
					"init",
					"--new"
				], false);
			}
			return attemptOutcome.result;
		};
		let initialArgs = baseArgs;
		if (entry.id === "feishu") {
			const cfgProbe = await this.probeCli(env.binaryPath, ["config", "show"], 4e3, loginEnv);
			const cfgText = `${cfgProbe.stdout}\n${cfgProbe.stderr}`;
			if (!cfgProbe.ok || /not_configured|not configured|no config/iu.test(cfgText)) initialArgs = [
				"config",
				"init",
				"--new"
			];
		}
		return await runLoginAttempt(initialArgs, entry.id === "feishu");
	}
	async getLoginStatus(connectorId) {
		await this.ensureLoaded();
		const entry = this.getEntryOrThrow(connectorId);
		const existing = this.loginSessions.get(entry.id);
		if (existing) return { ...existing };
		const currentStatus = this.statuses.get(entry.id) ?? "not_installed";
		return {
			connectorId: entry.id,
			kind: entry.auth.mode === "cli-native" ? "cli-browser" : "web-token",
			state: currentStatus === "connected" ? "succeeded" : "awaiting_user"
		};
	}
	async verifyConnection(connectorId, opts = {}) {
		await this.ensureLoaded();
		const entry = this.getEntryOrThrow(connectorId);
		const cfg = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry);
		cfg.enabled = true;
		this.persisted.connectors[entry.id] = cfg;
		const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
		const env = await this.detectEnvironment(connectorId);
		const profileId = cfg.activeProfileId || "default";
		let ok = true;
		let rawError = "";
		if (opts.simulateOutcome && opts.simulateOutcome !== "ok") {
			ok = false;
			rawError = opts.simulateOutcome;
		} else if (opts.simulateOutcome === "ok") ok = true;
		else {
			const missingSecret = [];
			for (const field of entry.auth.fields ?? []) if (field.required && field.secret) {
				if (!await this.secretVault.hasSecret(entry.id, profileId, field.key)) missingSecret.push(field.label.zh);
			}
			if (missingSecret.length > 0) {
				const result = {
					status: "installed_unauthenticated",
					checkedAt,
					friendlyCause: {
						zh: `尚未填写必需凭证：${missingSecret.join("、")}。`,
						en: `Missing required credential field(s).`
					},
					friendlyFix: {
						zh: "请先点击上方按钮前往官方网页完成登录并粘贴访问凭证。",
						en: "Open the official auth page and paste your credential above."
					},
					environment: env
				};
				this.statuses.set(entry.id, "installed_unauthenticated");
				this.diagnostics.set(entry.id, result);
				await this.saveConfig();
				return result;
			}
			if (entry.healthCheck.kind === "cli-command") if (!env.installed || !env.binaryPath) {
				ok = false;
				rawError = `CLI binary not installed (${env.driverId})`;
			} else {
				const binDir = await ensureManagedNodeShim(this.homeDir, this.platform).catch(() => join(this.homeDir, "connectors", "bin"));
				const probeEnv = withManagedBinPath(process.env, binDir, this.platform);
				const probe = await this.probeCli(env.binaryPath, entry.healthCheck.args ?? ["--version"], entry.healthCheck.timeoutMs ?? 1e4, probeEnv);
				ok = probe.ok;
				if (!probe.ok) rawError = probe.stderr || probe.stdout || "CLI health check failed";
			}
			else if (entry.healthCheck.kind === "mcp-probe") {
				await this.mountMcpIfApplicable(entry, cfg);
				const mcpManager = this.ctx.get?.("mcpManager");
				if (mcpManager?.probe) {
					const res = await mcpManager.probe(`connector_${entry.id}`);
					if (res && res.ok === false) {
						ok = false;
						rawError = res.error ?? "MCP probe failed";
					}
				}
			}
		}
		if (ok) {
			await this.mountMcpIfApplicable(entry, cfg);
			this.statuses.set(entry.id, "connected");
			const result = {
				status: "connected",
				checkedAt,
				environment: env
			};
			this.diagnostics.set(entry.id, result);
			await this.saveConfig();
			this.skillControl?.invalidate();
			return result;
		}
		this.unmountMcp(entry.id);
		const classified = env.installed === false && !opts.simulateOutcome ? {
			status: "not_installed",
			friendlyCause: {
				zh: "本机尚未检测到官方 CLI 程序。",
				en: "Official CLI executable was not found on this machine."
			},
			friendlyFix: {
				zh: "请在向导中安装官方 CLI，或在高级配置中填写绝对路径。",
				en: "Install the official CLI or set its absolute executable path in Advanced settings."
			}
		} : classifyConnectorFailure(entry, rawError);
		this.statuses.set(entry.id, classified.status);
		const result = {
			status: classified.status,
			checkedAt,
			friendlyCause: classified.friendlyCause,
			friendlyFix: classified.friendlyFix,
			rawError: rawError.slice(0, 1e3),
			environment: env
		};
		this.diagnostics.set(entry.id, result);
		await this.saveConfig();
		this.skillControl?.invalidate();
		return result;
	}
	async disconnect(connectorId) {
		await this.ensureLoaded();
		const entry = this.getEntryOrThrow(connectorId);
		const current = this.persisted.connectors[entry.id] ?? defaultUserConfig(entry);
		this.persisted.connectors[entry.id] = {
			...current,
			enabled: false
		};
		this.statuses.set(entry.id, "disabled");
		this.unmountMcp(entry.id);
		this.diagnostics.delete(entry.id);
		await this.saveConfig();
		this.skillControl?.invalidate();
		return this.snapshot();
	}
	matchToolRisk(toolName) {
		const match = /^mcp__connector_([a-z0-9-]+)__(.+)$/u.exec(toolName);
		if (!match) return void 0;
		const [, connectorId, actionName] = match;
		const entry = this.catalog.connectors.find((item) => item.id === connectorId);
		if (!entry) return void 0;
		for (const rule of entry.riskRules) if (safePatternMatch(rule.actionPattern, actionName)) return {
			connectorId,
			level: rule.level,
			label: rule.label
		};
		return {
			connectorId,
			level: "L1"
		};
	}
};
//#endregion
//#region src/connectors/connector-routes.ts
const MAX_BODY_BYTES$1 = 128 * 1024;
const LOOPBACK_HOSTS$1 = /* @__PURE__ */ new Set([
	"127.0.0.1",
	"::1",
	"::ffff:127.0.0.1"
]);
function sendJson$1(response, statusCode, body) {
	response.writeHead(statusCode, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(body));
}
async function readJsonBody$1(request) {
	const chunks = [];
	let total = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES$1) throw new Error("request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks, total).toString("utf8").trim();
	if (!text) return {};
	const parsed = JSON.parse(text);
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("request body must be a JSON object");
	return parsed;
}
function isAuthorizedRequest$1(request, peer) {
	const address = request.socket?.remoteAddress;
	if (address !== void 0 && !LOOPBACK_HOSTS$1.has(address)) return false;
	if (peer?.principal?.kind !== "owner") return false;
	if (request.headers["x-dsh-connectors"] !== "1") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	return true;
}
function registerConnectorRoutes(ctx, service) {
	const webServer = ctx.get?.("webServer");
	if (!webServer?.register) return () => {};
	const handler = async (request, response, peer) => {
		if (!isAuthorizedRequest$1(request, peer)) {
			response.writeHead(403).end();
			return;
		}
		const action = new URL(request.url ?? "/", "http://localhost").pathname.slice(19);
		try {
			if (action === "/state" && request.method === "GET") {
				sendJson$1(response, 200, await service.snapshot());
				return;
			}
			if (action === "/login-status" && request.method === "GET") {
				const connectorId = new URL(request.url ?? "/", "http://localhost").searchParams.get("connectorId")?.trim() ?? "";
				if (!connectorId) {
					sendJson$1(response, 400, { error: "connectorId is required" });
					return;
				}
				sendJson$1(response, 200, {
					login: await service.getLoginStatus(connectorId),
					snapshot: await service.snapshot()
				});
				return;
			}
			if (request.method !== "POST") {
				response.writeHead(405).end();
				return;
			}
			const body = await readJsonBody$1(request);
			const connectorId = typeof body.connectorId === "string" ? body.connectorId.trim() : "";
			if (!connectorId) {
				sendJson$1(response, 400, { error: "connectorId is required" });
				return;
			}
			if (action === "/detect") {
				sendJson$1(response, 200, await service.detectEnvironment(connectorId));
				return;
			}
			if (action === "/install") {
				sendJson$1(response, 200, {
					result: await service.installConnector(connectorId),
					snapshot: await service.snapshot()
				});
				return;
			}
			if (action === "/login") {
				sendJson$1(response, 200, {
					login: await service.startLogin(connectorId),
					snapshot: await service.snapshot()
				});
				return;
			}
			if (action === "/configure") {
				sendJson$1(response, 200, await service.configure(connectorId, {
					enabled: typeof body.enabled === "boolean" ? body.enabled : void 0,
					selectedDriverId: typeof body.selectedDriverId === "string" ? body.selectedDriverId : void 0,
					customBinaryPath: typeof body.customBinaryPath === "string" ? body.customBinaryPath : void 0,
					activeProfileId: typeof body.activeProfileId === "string" ? body.activeProfileId : void 0,
					nonSecretFields: body.nonSecretFields && typeof body.nonSecretFields === "object" && !Array.isArray(body.nonSecretFields) ? body.nonSecretFields : void 0,
					secretFields: body.secretFields && typeof body.secretFields === "object" && !Array.isArray(body.secretFields) ? body.secretFields : void 0,
					accountLabel: typeof body.accountLabel === "string" ? body.accountLabel : void 0,
					consentAccepted: typeof body.consentAccepted === "boolean" ? body.consentAccepted : void 0
				}));
				return;
			}
			if (action === "/verify") {
				sendJson$1(response, 200, {
					diagnostic: await service.verifyConnection(connectorId),
					snapshot: await service.snapshot()
				});
				return;
			}
			if (action === "/disconnect") {
				sendJson$1(response, 200, await service.disconnect(connectorId));
				return;
			}
			response.writeHead(404).end();
		} catch (error) {
			sendJson$1(response, 400, { error: error instanceof Error ? error.message : String(error) });
		}
	};
	return webServer.register({
		kind: "prefix",
		path: CONNECTOR_API_PREFIX,
		handler
	});
}
//#endregion
//#region src/connectors/work-office-preset.ts
const WORK_OFFICE_PLUGINS = [
	{
		id: "persona",
		name: "@deepseek-ai/dsh-persona",
		config: { prefix: "You are an office productivity assistant in DeepSeek Harness Desktop Work Mode. Discover connected office services on demand, protect sensitive enterprise data, and ask for confirmation before sending messages, sharing externally, or deleting records." }
	},
	{
		id: "agent-instructions",
		name: "@deepseek-ai/dsh-agent-instructions",
		config: { maxBytes: 65536 }
	},
	{
		id: "tool-office",
		name: "@deepseek-ai/dsh-tool-office"
	},
	{
		id: "skill-office",
		name: "@deepseek-ai/dsh-skill-office"
	},
	{
		id: "tool-bash",
		name: "@deepseek-ai/dsh-tool-bash",
		config: { timeoutMs: 3e5 }
	},
	{
		id: "tool-str-replace-editor",
		name: "@deepseek-ai/dsh-tool-str-replace-editor",
		config: { maxOutputChars: 16e3 }
	},
	{
		id: "tool-fs",
		name: "@deepseek-ai/dsh-tool-fs"
	},
	{
		id: "tool-fs-search",
		name: "@deepseek-ai/dsh-tool-fs-search",
		config: { sampleOverCapGlobResults: false }
	},
	{
		id: "skill-filesystem",
		name: "@deepseek-ai/dsh-skill-filesystem"
	},
	{
		id: "tool-skill",
		name: "@deepseek-ai/dsh-tool-skill"
	},
	{
		id: "tool-todo",
		name: "@deepseek-ai/dsh-tool-todo",
		config: { allowParallelInProgress: true }
	},
	{
		id: "tool-ask-user",
		name: "@deepseek-ai/dsh-tool-ask-user"
	},
	{
		id: "tool-web",
		name: "@deepseek-ai/dsh-tool-web",
		config: {
			fetch: false,
			searchTimeoutMs: 6e4
		}
	},
	{
		id: "compaction",
		name: "cordis:group",
		group: true,
		isolate: {
			compaction: true,
			toolResultPruner: true
		},
		config: [
			{
				id: "compaction-basic",
				name: "@deepseek-ai/dsh-compaction-basic"
			},
			{
				id: "command-compact",
				name: "@deepseek-ai/dsh-command-compact"
			},
			{
				id: "tool-result-pruner",
				name: "@deepseek-ai/dsh-compaction-tool-result-pruner",
				config: {
					thresholdChars: 8192,
					headChars: 4096,
					tailChars: 1024
				}
			}
		]
	}
];
function registerWorkOfficePreset(ctx) {
	let closed = false;
	let pending;
	let release;
	const start = () => {
		if (closed || pending) return;
		const registry = ctx.get?.("agentPresets");
		if (!registry?.register) return;
		pending = registry.register({
			id: WORK_OFFICE_PRESET_ID,
			name: "工作模式",
			description: "面向日常办公、文档协作与会议整理，按需调用已连接的办公生态服务。",
			order: 5,
			plugins: WORK_OFFICE_PLUGINS
		}).then((dispose) => {
			if (closed) return dispose();
			release = dispose;
		}).catch((error) => {
			ctx.logger?.warn?.(`dsh-desktop-compat: work-office preset declaration failed: ${error instanceof Error ? error.message : String(error)}`);
		});
	};
	ctx.inject(["agentPresets"], start);
	ctx.effect(() => {
		start();
		return async () => {
			closed = true;
			await pending;
			await release?.();
		};
	}, "dsh-desktop-compat: work-office preset");
}
//#endregion
//#region src/acp/acp-client.ts
var AcpClientError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
		this.name = "AcpClientError";
	}
};
async function assertWorkspaceContained(workspaceCwd, targetPath) {
	if (typeof targetPath !== "string" || targetPath.trim().length === 0 || targetPath.includes("\0")) throw new AcpClientError("INVALID_PATH", "target path must be a non-empty string");
	const rootReal = await realpath(resolve(workspaceCwd));
	const candidate = isAbsolute(targetPath) ? resolve(targetPath) : resolve(rootReal, targetPath);
	let resolvedTarget;
	try {
		resolvedTarget = await realpath(candidate);
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
		resolvedTarget = joinSafe(await realpath(dirname(candidate)), candidate.slice(dirname(candidate).length).replace(/^[/\\]+/u, ""));
	}
	const rel = relative(rootReal, resolvedTarget);
	if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) throw new AcpClientError("WORKSPACE_ESCAPE", `path "${targetPath}" escapes session workspace`);
	return resolvedTarget;
}
function joinSafe(parent, leaf) {
	return leaf ? resolve(parent, leaf) : parent;
}
function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function parseLineSlice(content, line, limit) {
	if (line === void 0 && limit === void 0) return content;
	const lines = content.split(/\r?\n/u);
	const start = Math.max(0, (line ?? 1) - 1);
	const end = limit !== void 0 && limit > 0 ? start + limit : lines.length;
	return lines.slice(start, end).join("\n");
}
var AcpClient = class {
	options;
	child;
	nextId = 0;
	pending = /* @__PURE__ */ new Map();
	sessionListeners = /* @__PURE__ */ new Map();
	stderrTail = "";
	closed = false;
	closePromise;
	negotiated;
	constructor(options) {
		this.options = options;
	}
	get capabilities() {
		return this.negotiated;
	}
	ensureStarted() {
		if (this.closed) throw new AcpClientError("CLIENT_CLOSED", "ACP client has closed");
		if (this.child) return this.child;
		const child = (this.options.launch ?? spawn)(this.options.command, this.options.args, {
			cwd: this.options.cwd,
			env: this.options.env ? {
				...process.env,
				...this.options.env
			} : process.env,
			shell: false,
			windowsHide: true,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		});
		this.child = child;
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk) => {
			this.stderrTail = (this.stderrTail + chunk).slice(-16384);
		});
		child.stdin.on("error", () => {});
		const lines = createInterface({
			input: child.stdout,
			crlfDelay: Infinity
		});
		lines.on("line", (line) => {
			if (!line.trim()) return;
			let msg;
			try {
				const parsed = JSON.parse(line);
				if (!isPlainObject(parsed)) return;
				msg = parsed;
			} catch {
				return;
			}
			this.handleMessage(msg);
		});
		this.closePromise = new Promise((resolvePromise) => {
			const rejectAll = (reason) => {
				for (const [id, entry] of this.pending) {
					clearTimeout(entry.timer);
					this.pending.delete(id);
					entry.reject(reason);
				}
			};
			child.once("error", (error) => {
				lines.close();
				rejectAll(new AcpClientError("SPAWN_FAILED", error.message));
				resolvePromise();
			});
			child.once("close", (code) => {
				lines.close();
				this.closed = true;
				const suffix = this.stderrTail.trim() ? `: ${this.stderrTail.trim()}` : "";
				rejectAll(new AcpClientError("PROCESS_EXITED", `ACP server exited with code ${code ?? "null"}${suffix}`));
				resolvePromise();
			});
		});
		return child;
	}
	sendRaw(payload) {
		const child = this.ensureStarted();
		if (!child.stdin.writable) throw new AcpClientError("STDIN_CLOSED", "ACP stdin stream is closed");
		child.stdin.write(`${JSON.stringify(payload)}\n`);
	}
	request(method, params, timeoutMs) {
		this.ensureStarted();
		const id = ++this.nextId;
		const budget = timeoutMs ?? this.options.timeoutMs ?? 6e4;
		return new Promise((resolvePromise, rejectPromise) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				rejectPromise(new AcpClientError("REQUEST_TIMEOUT", `ACP request "${method}" timed out`));
			}, budget);
			this.pending.set(id, {
				resolve: resolvePromise,
				reject: rejectPromise,
				timer
			});
			try {
				this.sendRaw({
					jsonrpc: "2.0",
					id,
					method,
					params
				});
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				rejectPromise(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}
	notify(method, params) {
		this.sendRaw({
			jsonrpc: "2.0",
			method,
			params
		});
	}
	handleMessage(msg) {
		if (typeof msg.method === "string" && msg.id !== void 0) {
			this.handleAgentRequest(msg.id, msg.method, isPlainObject(msg.params) ? msg.params : {});
			return;
		}
		if (msg.method === "session/update" && isPlainObject(msg.params)) {
			const sid = typeof msg.params.sessionId === "string" ? msg.params.sessionId : "";
			const listener = this.sessionListeners.get(sid);
			if (listener && isPlainObject(msg.params.update)) {
				const events = this.normalizeUpdate(msg.params.update);
				for (const event of events) listener(event);
			}
			return;
		}
		if (typeof msg.id === "number" && this.pending.has(msg.id)) {
			const entry = this.pending.get(msg.id);
			clearTimeout(entry.timer);
			this.pending.delete(msg.id);
			if (isPlainObject(msg.error)) {
				const errMsg = typeof msg.error.message === "string" ? msg.error.message : "ACP request failed";
				const errCode = Number(msg.error.code ?? -32e3);
				entry.reject(new AcpClientError(errCode === -32e3 && /auth/iu.test(errMsg) ? "AUTH_REQUIRED" : "RPC_ERROR", errMsg));
			} else entry.resolve(msg.result);
		}
	}
	normalizeUpdate(update) {
		const kind = typeof update.sessionUpdate === "string" ? update.sessionUpdate : "";
		const content = isPlainObject(update.content) ? update.content : void 0;
		if (kind === "agent_message_chunk" && content?.type === "text" && typeof content.text === "string") return [{
			type: "message_delta",
			text: content.text
		}];
		if (kind === "agent_thought_chunk" && content?.type === "text" && typeof content.text === "string") return [{
			type: "thought_delta",
			text: content.text
		}];
		if (kind === "plan" && Array.isArray(update.entries)) return [{
			type: "plan_update",
			entries: update.entries.filter(isPlainObject).map((entry) => ({
				content: String(entry.content ?? ""),
				...typeof entry.status === "string" ? { status: entry.status } : {},
				...typeof entry.priority === "string" ? { priority: entry.priority } : {}
			}))
		}];
		if (kind === "tool_call") return [{
			type: "tool_call",
			toolCallId: String(update.toolCallId ?? ""),
			...typeof update.title === "string" ? { title: update.title } : {},
			...typeof update.kind === "string" ? { kind: update.kind } : {},
			...typeof update.status === "string" ? { status: update.status } : {},
			...update.rawInput !== void 0 ? { rawInput: update.rawInput } : {}
		}];
		if (kind === "tool_call_update") {
			const diffItem = Array.isArray(update.content) ? update.content.find((item) => isPlainObject(item) && item.type === "diff" && typeof item.path === "string") : void 0;
			return [{
				type: "tool_call_update",
				toolCallId: String(update.toolCallId ?? ""),
				...typeof update.status === "string" ? { status: update.status } : {},
				...update.content !== void 0 ? { content: update.content } : {},
				...isPlainObject(diffItem) ? { diff: {
					path: String(diffItem.path),
					...typeof diffItem.oldText === "string" ? { oldText: diffItem.oldText } : {},
					...typeof diffItem.newText === "string" ? { newText: diffItem.newText } : {}
				} } : {}
			}];
		}
		return [];
	}
	async handleAgentRequest(id, method, params) {
		const reply = (payload) => {
			try {
				this.sendRaw({
					jsonrpc: "2.0",
					id,
					...payload
				});
			} catch {}
		};
		if (method === "session/request_permission") {
			const handler = this.options.handlers?.onPermissionRequest;
			if (!handler) {
				reply({ result: { outcome: { outcome: "cancelled" } } });
				return;
			}
			try {
				reply({ result: await handler({
					requestId: id,
					sessionId: String(params.sessionId ?? ""),
					toolCall: isPlainObject(params.toolCall) ? {
						title: typeof params.toolCall.title === "string" ? params.toolCall.title : void 0,
						kind: typeof params.toolCall.kind === "string" ? params.toolCall.kind : void 0,
						rawInput: params.toolCall.rawInput
					} : void 0,
					options: Array.isArray(params.options) ? params.options.filter(isPlainObject).map((opt) => ({
						optionId: String(opt.optionId ?? ""),
						name: typeof opt.name === "string" ? opt.name : void 0,
						kind: typeof opt.kind === "string" ? opt.kind : void 0
					})) : []
				}) });
			} catch {
				reply({ result: { outcome: { outcome: "cancelled" } } });
			}
			return;
		}
		if (method === "fs/read_text_file") {
			try {
				reply({ result: { content: parseLineSlice(await readFile(await assertWorkspaceContained(this.options.cwd, String(params.path ?? "")), "utf8"), typeof params.line === "number" ? params.line : void 0, typeof params.limit === "number" ? params.limit : void 0) } });
			} catch (error) {
				reply({ error: {
					code: error instanceof AcpClientError && error.code === "WORKSPACE_ESCAPE" ? -32602 : -32e3,
					message: error instanceof Error ? error.message : "failed to read file"
				} });
			}
			return;
		}
		if (method === "fs/write_text_file") {
			try {
				const safePath = await assertWorkspaceContained(this.options.cwd, String(params.path ?? ""));
				const content = typeof params.content === "string" ? params.content : "";
				if (!(this.options.handlers?.onFsWriteApprove ? await this.options.handlers.onFsWriteApprove(safePath, content) : false)) {
					reply({ error: {
						code: -32001,
						message: "file write rejected by client policy"
					} });
					return;
				}
				await writeFile(safePath, content, "utf8");
				reply({ result: {} });
			} catch (error) {
				reply({ error: {
					code: -32e3,
					message: error instanceof Error ? error.message : "failed to write file"
				} });
			}
			return;
		}
		reply({ error: {
			code: -32601,
			message: `Unsupported client method: ${method}`
		} });
	}
	async initialize(clientInfo = {
		name: "deepseek-harness-desktop",
		version: "5.4.0"
	}, clientCapabilities = {
		fs: {
			readTextFile: true,
			writeTextFile: true
		},
		terminal: false
	}) {
		const result = await this.request("initialize", {
			protocolVersion: 1,
			clientCapabilities,
			clientInfo
		}, 3e4);
		const protocolVersion = Number(result.protocolVersion ?? 0);
		if (protocolVersion !== 1) throw new AcpClientError("UNSUPPORTED_PROTOCOL", `unsupported ACP protocolVersion: ${String(result.protocolVersion)}`);
		const caps = isPlainObject(result.agentCapabilities) ? result.agentCapabilities : {};
		const mcpCaps = isPlainObject(caps.mcpCapabilities) ? caps.mcpCapabilities : {};
		const authMethods = Array.isArray(result.authMethods) ? result.authMethods.filter(isPlainObject).map((m) => ({
			id: String(m.id ?? ""),
			name: typeof m.name === "string" ? m.name : void 0
		})) : [];
		const agentInfo = isPlainObject(result.agentInfo) ? {
			name: typeof result.agentInfo.name === "string" ? result.agentInfo.name : void 0,
			version: typeof result.agentInfo.version === "string" ? result.agentInfo.version : void 0
		} : void 0;
		this.negotiated = {
			protocolVersion,
			agentInfo,
			loadSession: Boolean(caps.loadSession),
			mcpHttp: Boolean(mcpCaps.http),
			mcpSse: Boolean(mcpCaps.sse),
			authMethods,
			raw: caps
		};
		return this.negotiated;
	}
	async authenticate(methodId) {
		await this.request("authenticate", { methodId }, 6e4);
	}
	parseSessionPayload(result) {
		const acpSessionId = typeof result.sessionId === "string" ? result.sessionId : "";
		if (!acpSessionId) throw new AcpClientError("INVALID_SESSION", "ACP agent did not return a sessionId");
		const modelsObj = isPlainObject(result.models) ? result.models : void 0;
		const availableModels = Array.isArray(modelsObj?.availableModels) ? modelsObj.availableModels.filter(isPlainObject).map((m) => ({
			id: String(m.modelId ?? m.id ?? ""),
			name: typeof m.name === "string" ? m.name : void 0
		})) : [];
		const configOptions = Array.isArray(result.configOptions) ? result.configOptions.filter(isPlainObject).map((opt) => ({
			id: String(opt.id ?? ""),
			name: typeof opt.name === "string" ? opt.name : void 0,
			currentValue: typeof opt.currentValue === "string" ? opt.currentValue : void 0,
			options: Array.isArray(opt.options) ? opt.options.filter(isPlainObject).map((o) => ({
				value: String(o.value ?? ""),
				name: typeof o.name === "string" ? o.name : void 0
			})) : void 0
		})) : [];
		return {
			acpSessionId,
			currentModelId: typeof modelsObj?.currentModelId === "string" ? modelsObj.currentModelId : void 0,
			availableModels,
			configOptions
		};
	}
	async newSession({ cwd, mcpServers = [] }) {
		const res = await this.request("session/new", {
			cwd,
			mcpServers
		}, 3e4);
		return this.parseSessionPayload(res);
	}
	async loadSession({ sessionId, cwd, mcpServers = [] }) {
		if (!this.negotiated?.loadSession) throw new AcpClientError("CAPABILITY_UNSUPPORTED", "ACP agent does not declare loadSession capability");
		const res = await this.request("session/load", {
			sessionId,
			cwd,
			mcpServers
		}, 3e4);
		return this.parseSessionPayload({
			sessionId,
			...res
		});
	}
	async setModel(sessionId, modelId) {
		await this.request("session/set_model", {
			sessionId,
			modelId
		}, 15e3);
	}
	async setConfigOption(sessionId, configId, value) {
		await this.request("session/set_config_option", {
			sessionId,
			configId,
			value
		}, 15e3);
	}
	async prompt({ sessionId, text, signal, onEvent, timeoutMs }) {
		signal?.throwIfAborted();
		if (onEvent) this.sessionListeners.set(sessionId, onEvent);
		const onAbort = () => {
			try {
				this.notify("session/cancel", { sessionId });
			} catch {}
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		try {
			const res = await this.request("session/prompt", {
				sessionId,
				prompt: [{
					type: "text",
					text
				}]
			}, timeoutMs ?? this.options.timeoutMs ?? 18e4);
			const stopReason = typeof res.stopReason === "string" ? res.stopReason : "end_turn";
			onEvent?.({
				type: "turn_finished",
				stopReason
			});
			return { stopReason };
		} finally {
			signal?.removeEventListener("abort", onAbort);
			this.sessionListeners.delete(sessionId);
		}
	}
	cancel(sessionId) {
		try {
			this.notify("session/cancel", { sessionId });
		} catch {}
	}
	async close() {
		this.closed = true;
		const child = this.child;
		if (!child) return;
		try {
			child.stdin.end();
		} catch {}
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGTERM");
			const killTimer = setTimeout(() => {
				if (child.exitCode === null && child.signalCode === null) try {
					child.kill("SIGKILL");
				} catch {}
			}, 500);
			killTimer.unref();
			await this.closePromise;
			clearTimeout(killTimer);
		}
	}
};
//#endregion
//#region src/acp/acp-agent-manager.ts
const SAFE_AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/u;
var AcpComplianceError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "AcpComplianceError";
	}
};
const ANTIGRAVITY_ACP_AGENT = {
	id: "antigravity",
	name: "Google Antigravity",
	command: process.platform === "win32" ? "agy.exe" : "agy",
	args: ["acp"],
	authMode: "oauth-personal",
	custom: false
};
function assertAcpUsageAllowed(agent, invocationSource) {
	if ((agent.id === ANTIGRAVITY_ACP_AGENT.id || /(?:^|[\\/])agy(?:\.exe)?$/iu.test(agent.command) || agent.authMode === "oauth-personal" || agent.authMode === "oauth-business") && invocationSource !== "human-interactive") throw new AcpComplianceError(`ACP agent "${agent.id}" under ${agent.authMode} is restricted to human-interactive sessions only (Google Antigravity Terms Section 6); blocked invocation source "${invocationSource}".`);
}
function resolveAcpHome(explicitHome) {
	if (explicitHome && explicitHome.trim().length > 0) return explicitHome;
	const envHome = process.env.DSH_HOME;
	if (envHome && envHome.trim().length > 0) return envHome.trim();
	return join(homedir(), ".dsh");
}
async function atomicWriteJson(filePath, payload) {
	await mkdir(dirname(filePath), { recursive: true });
	const temp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	await writeFile(temp, `${JSON.stringify(payload, null, 2)}\n`, {
		encoding: "utf8",
		mode: 384,
		flag: "wx"
	});
	try {
		await rename(temp, filePath);
	} catch (error) {
		await rm(temp, { force: true });
		throw error;
	}
}
var AcpAgentManager = class {
	ctx;
	acpDir;
	agentsPath;
	sessionsPath;
	launch;
	customAgents = /* @__PURE__ */ new Map();
	persistedSessions = /* @__PURE__ */ new Map();
	activeSessions = /* @__PURE__ */ new Map();
	loaded = false;
	constructor(ctx, deps = {}) {
		this.ctx = ctx;
		this.acpDir = join(resolveAcpHome(deps.dshHome), "acp");
		this.agentsPath = join(this.acpDir, "agents.json");
		this.sessionsPath = join(this.acpDir, "sessions.json");
		this.launch = deps.launch;
	}
	async ensureLoaded() {
		if (this.loaded) return;
		const rawAgents = await readFile(this.agentsPath, "utf8").catch(() => void 0);
		if (rawAgents) try {
			const parsed = JSON.parse(rawAgents);
			if (parsed.version === 1 && Array.isArray(parsed.agents)) {
				for (const agent of parsed.agents) if (agent && SAFE_AGENT_ID.test(agent.id) && agent.id !== ANTIGRAVITY_ACP_AGENT.id) this.customAgents.set(agent.id, {
					...agent,
					custom: true
				});
			}
		} catch {}
		const rawSessions = await readFile(this.sessionsPath, "utf8").catch(() => void 0);
		if (rawSessions) try {
			const parsed = JSON.parse(rawSessions);
			if (parsed.version === 1 && parsed.sessions) for (const [key, val] of Object.entries(parsed.sessions)) this.persistedSessions.set(key, val);
		} catch {}
		this.loaded = true;
	}
	async saveCustomAgents() {
		await atomicWriteJson(this.agentsPath, {
			version: 1,
			agents: [...this.customAgents.values()]
		});
	}
	async saveSessions() {
		await atomicWriteJson(this.sessionsPath, {
			version: 1,
			sessions: Object.fromEntries(this.persistedSessions.entries())
		});
	}
	async listAgents() {
		await this.ensureLoaded();
		return [ANTIGRAVITY_ACP_AGENT, ...this.customAgents.values()];
	}
	async getAgent(agentId) {
		await this.ensureLoaded();
		if (agentId === ANTIGRAVITY_ACP_AGENT.id) return ANTIGRAVITY_ACP_AGENT;
		const custom = this.customAgents.get(agentId);
		if (!custom) throw new AcpClientError("UNKNOWN_AGENT", `unknown ACP agent: ${agentId}`);
		return custom;
	}
	async upsertCustomAgent(agent) {
		await this.ensureLoaded();
		if (!SAFE_AGENT_ID.test(agent.id) || agent.id === ANTIGRAVITY_ACP_AGENT.id) throw new AcpClientError("INVALID_AGENT_ID", "invalid or reserved ACP agent id");
		if (!agent.command?.trim()) throw new AcpClientError("INVALID_AGENT_COMMAND", "ACP agent command is required");
		const normalized = {
			id: agent.id,
			name: agent.name?.trim() || agent.id,
			command: agent.command.trim(),
			args: Array.isArray(agent.args) ? agent.args.map(String) : [],
			authMode: agent.authMode ?? "custom",
			custom: true,
			...agent.timeoutMs ? { timeoutMs: agent.timeoutMs } : {}
		};
		this.customAgents.set(normalized.id, normalized);
		await this.saveCustomAgents();
		return normalized;
	}
	async removeCustomAgent(agentId) {
		await this.ensureLoaded();
		if (!this.customAgents.delete(agentId)) return false;
		await this.saveCustomAgents();
		return true;
	}
	listActiveSessions() {
		return [...this.activeSessions.values()].map((rec) => rec.info);
	}
	async probeAgent(agentId, opts = {}) {
		const base = await this.getAgent(agentId);
		const client = new AcpClient({
			command: opts.commandOverride?.trim() || base.command,
			args: base.args,
			cwd: opts.cwd || this.acpDir,
			env: base.env,
			timeoutMs: 15e3,
			launch: this.launch
		});
		try {
			await mkdir(opts.cwd || this.acpDir, { recursive: true });
			const capabilities = await client.initialize();
			return {
				agentId: base.id,
				state: "ready",
				capabilities
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			const state = error instanceof AcpClientError && error.code === "SPAWN_FAILED" ? "not-installed" : error instanceof AcpClientError && error.code === "AUTH_REQUIRED" ? "not-authenticated" : "error";
			return {
				agentId: base.id,
				state,
				error: msg
			};
		} finally {
			await client.close();
		}
	}
	async bridgePermission(req, customHandler) {
		if (customHandler) return customHandler(req);
		const approval = this.ctx.get?.("approval");
		if (!approval?.request) return { outcome: { outcome: "cancelled" } };
		const allowOpt = req.options.find((opt) => opt.kind === "allow_once") ?? req.options.find((opt) => opt.kind === "allow_always");
		if (!allowOpt) return { outcome: { outcome: "cancelled" } };
		try {
			const outcome = await approval.request({
				toolName: req.toolCall?.kind ?? "acp_tool",
				title: req.toolCall?.title ?? "External ACP Agent action requires confirmation"
			});
			const value = typeof outcome === "string" ? outcome : outcome?.outcome;
			if (value === "allowed-once" || value === "allowed-always" || value === "allow") return { outcome: {
				outcome: "selected",
				optionId: allowOpt.optionId
			} };
			return { outcome: { outcome: "cancelled" } };
		} catch {
			return { outcome: { outcome: "cancelled" } };
		}
	}
	async startSession({ agentId, cwd, dshSessionId, resume = false, invocationSource, mcpServers = [], commandOverride, authModeOverride, onPermissionRequest, onFsWriteApprove }) {
		await this.ensureLoaded();
		const agent = {
			...await this.getAgent(agentId),
			...commandOverride?.trim() ? { command: commandOverride.trim() } : {},
			...authModeOverride ? { authMode: authModeOverride } : {}
		};
		assertAcpUsageAllowed(agent, invocationSource);
		const sessionId = dshSessionId || randomUUID();
		if (this.activeSessions.has(sessionId)) await this.closeSession(sessionId);
		const client = new AcpClient({
			command: agent.command,
			args: agent.args,
			cwd,
			env: agent.env,
			timeoutMs: agent.timeoutMs,
			launch: this.launch,
			handlers: {
				onPermissionRequest: (req) => this.bridgePermission(req, onPermissionRequest),
				onFsWriteApprove: onFsWriteApprove ?? (async () => false)
			}
		});
		try {
			const caps = await client.initialize();
			const saved = resume ? this.persistedSessions.get(sessionId) : void 0;
			const payload = saved?.agentId === agent.id && saved.cwd === cwd && caps.loadSession ? await client.loadSession({
				sessionId: saved.acpSessionId,
				cwd,
				mcpServers
			}) : await client.newSession({
				cwd,
				mcpServers
			});
			const info = {
				sessionId,
				acpSessionId: payload.acpSessionId,
				agentId: agent.id,
				cwd,
				currentModelId: payload.currentModelId,
				availableModels: payload.availableModels,
				configOptions: payload.configOptions
			};
			const previous = this.persistedSessions.get(sessionId);
			this.persistedSessions.set(sessionId, {
				acpSessionId: payload.acpSessionId,
				agentId: agent.id,
				cwd,
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			});
			try {
				await this.saveSessions();
			} catch (error) {
				if (previous) this.persistedSessions.set(sessionId, previous);
				else this.persistedSessions.delete(sessionId);
				throw error;
			}
			this.activeSessions.set(sessionId, {
				client,
				agent,
				info
			});
			return info;
		} catch (error) {
			await client.close();
			throw error;
		}
	}
	async setModel(sessionId, modelId) {
		const rec = this.activeSessions.get(sessionId);
		if (!rec) throw new AcpClientError("SESSION_NOT_FOUND", `no active ACP session: ${sessionId}`);
		await rec.client.setModel(rec.info.acpSessionId, modelId);
		rec.info = {
			...rec.info,
			currentModelId: modelId
		};
	}
	async setConfigOption(sessionId, configId, value) {
		const rec = this.activeSessions.get(sessionId);
		if (!rec) throw new AcpClientError("SESSION_NOT_FOUND", `no active ACP session: ${sessionId}`);
		await rec.client.setConfigOption(rec.info.acpSessionId, configId, value);
	}
	async sendPrompt({ sessionId, text, invocationSource, signal, onEvent }) {
		const rec = this.activeSessions.get(sessionId);
		if (!rec) throw new AcpClientError("SESSION_NOT_FOUND", `no active ACP session: ${sessionId}`);
		assertAcpUsageAllowed(rec.agent, invocationSource);
		return rec.client.prompt({
			sessionId: rec.info.acpSessionId,
			text,
			signal,
			onEvent
		});
	}
	cancelSession(sessionId) {
		const rec = this.activeSessions.get(sessionId);
		if (!rec) return false;
		rec.client.cancel(rec.info.acpSessionId);
		return true;
	}
	async closeSession(sessionId) {
		const rec = this.activeSessions.get(sessionId);
		if (!rec) return false;
		this.activeSessions.delete(sessionId);
		await rec.client.close();
		return true;
	}
	async dispose() {
		const closing = [...this.activeSessions.keys()].map((id) => this.closeSession(id));
		await Promise.allSettled(closing);
	}
};
//#endregion
//#region src/acp/types.ts
const ACP_API_PREFIX = "/api/dsh-acp";
//#endregion
//#region src/acp/acp-routes.ts
const MAX_BODY_BYTES = 128 * 1024;
const LOOPBACK_HOSTS = /* @__PURE__ */ new Set([
	"127.0.0.1",
	"::1",
	"::ffff:127.0.0.1"
]);
function sendJson(response, statusCode, body) {
	response.writeHead(statusCode, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(body));
}
async function readJsonBody(request) {
	const chunks = [];
	let total = 0;
	for await (const chunk of request) {
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += buf.length;
		if (total > MAX_BODY_BYTES) throw new Error("request body too large");
		chunks.push(buf);
	}
	const text = Buffer.concat(chunks, total).toString("utf8").trim();
	if (!text) return {};
	const parsed = JSON.parse(text);
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("request body must be a JSON object");
	return parsed;
}
function isAuthorizedRequest(request, peer) {
	const address = request.socket?.remoteAddress;
	if (address !== void 0 && !LOOPBACK_HOSTS.has(address)) return false;
	if (peer?.principal?.kind !== "owner") return false;
	if (request.headers["x-dsh-acp"] !== "1") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	return true;
}
function registerAcpRoutes(ctx, manager) {
	const webServer = ctx.get?.("webServer");
	if (!webServer?.register) return () => {};
	const handler = async (request, response, peer) => {
		if (!isAuthorizedRequest(request, peer)) {
			response.writeHead(403).end();
			return;
		}
		const action = new URL(request.url ?? "/", "http://localhost").pathname.slice(12);
		try {
			if (action === "/agents" && request.method === "GET") {
				sendJson(response, 200, {
					agents: await manager.listAgents(),
					activeSessions: manager.listActiveSessions()
				});
				return;
			}
			if (action === "/agents/custom" && request.method === "POST") {
				const body = await readJsonBody(request);
				sendJson(response, 200, { agent: await manager.upsertCustomAgent({
					id: String(body.id ?? ""),
					name: String(body.name ?? ""),
					command: String(body.command ?? ""),
					args: Array.isArray(body.args) ? body.args.map(String) : [],
					authMode: typeof body.authMode === "string" ? body.authMode : "custom"
				}) });
				return;
			}
			if (action === "/agents/custom" && request.method === "DELETE") {
				const body = await readJsonBody(request);
				sendJson(response, 200, { removed: await manager.removeCustomAgent(String(body.id ?? "")) });
				return;
			}
			if (request.method !== "POST") {
				response.writeHead(405).end();
				return;
			}
			const body = await readJsonBody(request);
			if (action === "/probe") {
				const agentId = typeof body.agentId === "string" && body.agentId.trim() ? body.agentId.trim() : "antigravity";
				sendJson(response, 200, await manager.probeAgent(agentId, {
					cwd: typeof body.cwd === "string" ? body.cwd : void 0,
					commandOverride: typeof body.commandOverride === "string" ? body.commandOverride : void 0
				}));
				return;
			}
			if (action === "/session/cancel") {
				sendJson(response, 200, { cancelled: manager.cancelSession(String(body.sessionId ?? "")) });
				return;
			}
			if (action === "/session/close") {
				sendJson(response, 200, { closed: await manager.closeSession(String(body.sessionId ?? "")) });
				return;
			}
			response.writeHead(404).end();
		} catch (error) {
			sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
		}
	};
	return webServer.register({
		kind: "prefix",
		path: ACP_API_PREFIX,
		handler
	});
}
const PATCH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const OWNER = /^[a-z0-9][a-z0-9._/@-]{1,127}$/u;
const TEST_PATH = /^(?:(?:apps|packages)\/[a-z0-9][a-z0-9._-]*\/(?:test|tests)\/|scripts\/)[a-z0-9][a-z0-9._/-]*\.(?:spec|test)\.(?:[cm]?[jt]s|tsx)$/iu;
function nonEmptyString(value, entryId, field, minimumLength = 8) {
	if (typeof value !== "string" || value.trim().length < minimumLength) throw new TypeError(`compat patch ${entryId} has an invalid ${field}`);
	return value;
}
function calendarDate(value, entryId, field) {
	if (typeof value !== "string" || !ISO_DATE.test(value)) throw new TypeError(`compat patch ${entryId} has an invalid ${field} date`);
	const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) throw new TypeError(`compat patch ${entryId} has an invalid ${field} date`);
	return parsed;
}
function normalizedVersions(entry) {
	const appliesTo = entry.appliesTo;
	const legacy = entry.applicableVersions;
	const valid = (versions) => Array.isArray(versions) && versions.length > 0 && versions.every((version) => typeof version === "string" && EXACT_VERSION.test(version));
	if (appliesTo !== void 0 && !valid(appliesTo)) throw new TypeError(`compat patch ${entry.id} must use exact appliesTo versions`);
	if (legacy !== void 0 && !valid(legacy)) throw new TypeError(`compat patch ${entry.id} must use exact applicable versions`);
	if (appliesTo === void 0 && legacy === void 0) throw new TypeError(`compat patch ${entry.id} must declare appliesTo versions`);
	if (appliesTo !== void 0 && legacy !== void 0) {
		const canonical = [...appliesTo].sort();
		const legacyNormalized = [...legacy].sort();
		if (canonical.length !== legacyNormalized.length || canonical.some((version, index) => version !== legacyNormalized[index])) throw new TypeError(`compat patch ${entry.id} has conflicting appliesTo and applicableVersions`);
	}
	return Object.freeze([...appliesTo ?? legacy]);
}
function normalizedTests(entry) {
	const tests = entry.tests;
	const legacy = entry.test;
	const valid = (value) => Array.isArray(value) && value.length > 0 && value.every((testPath) => typeof testPath === "string" && TEST_PATH.test(testPath));
	if (tests !== void 0 && !valid(tests)) throw new TypeError(`compat patch ${entry.id} has invalid tests`);
	if (legacy !== void 0 && (typeof legacy !== "string" || !TEST_PATH.test(legacy))) throw new TypeError(`compat patch ${entry.id} has an invalid test`);
	if (tests === void 0 && legacy === void 0) throw new TypeError(`compat patch ${entry.id} must declare tests`);
	if (tests !== void 0 && legacy !== void 0 && !tests.includes(legacy)) throw new TypeError(`compat patch ${entry.id} must include legacy test in tests`);
	return Object.freeze([...tests ?? [legacy]]);
}
function normalizedOwner(entry) {
	if (typeof entry.owner !== "string" || !OWNER.test(entry.owner)) throw new TypeError(`compat patch ${entry.id} has an invalid owner`);
	return entry.owner;
}
function validationPolicy(options) {
	const maxAgeDays = options.maxAgeDays ?? 90;
	if (!Number.isInteger(maxAgeDays) || maxAgeDays < 0 || maxAgeDays > 366) throw new TypeError("compat patch registry maxAgeDays must be an integer from 0 through 366");
	if (options.enforceFreshness === false) return { maxAgeDays };
	return {
		maxAgeDays,
		today: calendarDate(options.today ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), "registry", "today")
	};
}
/**
* Validates and normalizes canonical 3.0 fields plus legacy 2.x aliases.
* Freshness is enforced against the current UTC date unless a caller supplies
* a fixed date or explicitly bypasses it for static package initialization.
* CI supplies a repository-aware test-file predicate through the public schema
* validator.
*/
function validateCompatPatchRegistry(entries, options = {}) {
	if (!Array.isArray(entries) || entries.length === 0) throw new TypeError("compat patch registry must contain at least one entry");
	const policy = validationPolicy(options);
	const ids = /* @__PURE__ */ new Set();
	const normalizedEntries = [];
	for (const entry of entries) {
		if (entry === null || typeof entry !== "object" || !PATCH_ID.test(entry.id)) throw new TypeError("compat patch registry id is invalid");
		if (ids.has(entry.id)) throw new TypeError(`duplicate compat patch id: ${entry.id}`);
		ids.add(entry.id);
		const appliesTo = normalizedVersions(entry);
		const tests = normalizedTests(entry);
		const owner = normalizedOwner(entry);
		const upstreamReference = nonEmptyString(entry.upstreamReference, entry.id, "upstreamReference");
		const removeWhen = nonEmptyString(entry.removeWhen, entry.id, "removeWhen");
		const reason = entry.reason === void 0 ? void 0 : nonEmptyString(entry.reason, entry.id, "reason");
		const lastVerified = calendarDate(entry.lastVerified, entry.id, "lastVerified");
		if (policy.today !== void 0) {
			const ageDays = Math.floor((policy.today.valueOf() - lastVerified.valueOf()) / 864e5);
			if (ageDays < 0 || ageDays > policy.maxAgeDays) throw new TypeError(`compat patch ${entry.id} is stale: lastVerified ${entry.lastVerified} exceeds ${policy.maxAgeDays} days`);
		}
		if (options.testExists !== void 0) {
			for (const testPath of tests) if (!options.testExists(testPath)) throw new TypeError(`compat patch ${entry.id} references missing test: ${testPath}`);
		}
		const normalized = {
			id: entry.id,
			appliesTo,
			applicableVersions: appliesTo,
			upstreamReference,
			owner,
			tests,
			test: tests[0],
			removeWhen,
			lastVerified: entry.lastVerified,
			...reason === void 0 ? {} : { reason }
		};
		normalizedEntries.push(Object.freeze(normalized));
	}
	return Object.freeze(normalizedEntries);
}
const DESKTOP_COMPAT_PATCHES = validateCompatPatchRegistry([
	{
		id: "live-session-title-checkpoint",
		appliesTo: ["0.2.0-rc.2"],
		upstreamReference: "@deepseek-ai/dsh-session session/event and SessionStore.flush; @deepseek-ai/dsh-session-projection-cache write",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/session-title-checkpoint.spec.ts"],
		reason: "Flush the authoritative log before serializing title checkpoints so a cold sidebar can retain an acknowledged rename.",
		removeWhen: "Upstream title changes reliably refresh durable listing checkpoints without a creation/write-behind race.",
		lastVerified: "2026-10-03"
	},
	{
		id: "cold-blank-session-checkpoint",
		appliesTo: ["0.2.0-rc.2"],
		upstreamReference: "@deepseek-ai/dsh-session-projection-cache 0.2.0-rc.2 cachedSnapshot zero-I/O listing and coldSnapshot durable log replay",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/session-checkpoint-recovery.spec.ts"],
		reason: "Refresh stale blank checkpoints from validated durable logs before the sidebar hides restored history.",
		removeWhen: "The upstream session list refreshes stale blank checkpoints before applying workspace visibility filters.",
		lastVerified: "2026-10-01"
	},
	{
		id: "queued-turn-continuation",
		appliesTo: [
			"0.1.1-rc.1",
			"0.1.5-alpha.1",
			"0.1.5-rc.1"
		],
		upstreamReference: "@deepseek-ai/dsh-agent 0.1.1-rc.1, 0.1.5-alpha.1, and 0.1.5-rc.1 agent/status public hook behavior",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/recovery.spec.ts"],
		reason: "Resume a queued user turn after the active turn reaches a terminal status.",
		removeWhen: "The upstream agent loop natively and deterministically resumes queued turns.",
		lastVerified: "2026-09-10"
	},
	{
		id: "cancellation-presentation",
		appliesTo: [
			"0.1.1-rc.1",
			"0.1.5-alpha.1",
			"0.1.5-rc.1"
		],
		upstreamReference: "@deepseek-ai/dsh-tools 0.1.1-rc.1, 0.1.5-alpha.1, and 0.1.5-rc.1 tools/post-execute public hook behavior",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/recovery.spec.ts"],
		reason: "Translate the known object-shaped cancellation result into a stable user-facing message.",
		removeWhen: "The upstream tool runtime returns a stable cancellation presentation contract.",
		lastVerified: "2026-09-10"
	},
	{
		id: "tool-call-arguments-envelope",
		appliesTo: [
			"0.1.1-rc.1",
			"0.1.5-alpha.1",
			"0.1.5-rc.1"
		],
		upstreamReference: "@deepseek-ai/dsh-llm 0.1.1-rc.1, 0.1.5-alpha.1, and 0.1.5-rc.1 llm/stream waterfall plus dsh-tools schema validation",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/tool-call-normalization.spec.ts"],
		reason: "Recover only schema-proven tool argument defects, including a single-key arguments envelope and redundant escalation under an already full-access Desktop Runtime.",
		removeWhen: "The upstream adapter or agent loop normalizes these malformed tool arguments with the same schema and permission guards.",
		lastVerified: "2026-09-10"
	},
	{
		id: "desktop-skin-profile-isolation",
		appliesTo: [
			"0.1.1-rc.1",
			"0.1.5-alpha.1",
			"0.1.5-rc.1"
		],
		upstreamReference: "@deepseek-ai/dsh 0.1.1-rc.1, 0.1.5-alpha.1, and 0.1.5-rc.1 profile-scoped runtime behavior and Skin Center v2 state isolation",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/skin-state.spec.ts"],
		reason: "Keep Desktop skin selection inside the isolated desktop profile patch.",
		removeWhen: "The upstream skin service exposes a profile-scoped public persistence contract.",
		lastVerified: "2026-09-10"
	},
	{
		id: "tools-capability-request-side",
		appliesTo: [
			"0.1.1-rc.1",
			"0.1.5-alpha.1",
			"0.1.5-rc.1"
		],
		upstreamReference: "@deepseek-ai/dsh-llm-pi-ai 0.1.1-rc.1, 0.1.5-alpha.1, and 0.1.5-rc.1 GenerateOptions tools request path",
		owner: "desktop-platform",
		tests: ["apps/dsh-desktop/test/tools-capability.test.mjs"],
		reason: "Add a route-level auto/native/none request-side tools capability while preserving ordinary chat and stable tool-history failure semantics.",
		removeWhen: "The upstream adapter exposes a request-side tools capability contract with the same route-level behavior.",
		lastVerified: "2026-09-10"
	},
	{
		id: "session-startup-corruption",
		appliesTo: [
			"0.1.1-rc.1",
			"0.1.5-alpha.1",
			"0.1.5-rc.1"
		],
		upstreamReference: "@deepseek-ai/dsh-session-persistence-jsonl 0.1.1-rc.1, 0.1.5-alpha.1, and 0.1.5-rc.1 listArtifacts/readFirstZstdLine invalid frame magic at byte 0",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/session-recovery.spec.ts"],
		reason: "Recover a valid plaintext JSONL artifact mislabeled with the zstd suffix while preserving its original bytes, and isolate only artifacts that remain corrupt.",
		removeWhen: "The upstream JSONL persistence backend isolates an invalid session artifact during metadata enumeration.",
		lastVerified: "2026-09-10"
	},
	{
		id: "transcript-tool-call-balance",
		appliesTo: [
			"0.1.1-rc.1",
			"0.1.5-alpha.1",
			"0.1.5-rc.1"
		],
		upstreamReference: "@deepseek-ai/dsh-agent-loop 0.1.1-rc.1, 0.1.5-alpha.1, and 0.1.5-rc.1 buildRequest interrupted assistant tool_calls transcript projection",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/transcript-balance.spec.ts"],
		reason: "Strip trailing incomplete assistant messages with unresponded tool calls from outbound stream requests without mutating disk session logs.",
		removeWhen: "The upstream agent loop strips or repairs interrupted assistant tool calls before assembling outbound LLM messages.",
		lastVerified: "2026-09-10"
	}
], { enforceFreshness: false });
//#endregion
//#region src/index.ts
const name = "desktop-compat";
const inject = [
	"llm",
	"tools",
	"webServer",
	"workspaceRegistry",
	"sessions"
];
/** Install Desktop-only compatibility behavior through public DSH hooks. */
function apply(ctx) {
	new DesktopSkinStateService(ctx);
	const connectorRegistry = new ConnectorRegistryService(ctx);
	connectorRegistry.init().catch((error) => {
		ctx.logger?.warn?.(`dsh-desktop-compat: connector registry init failed: ${error instanceof Error ? error.message : String(error)}`);
	});
	ctx.effect(() => () => connectorRegistry.dispose(), "dsh-desktop-compat: connector registry cleanup");
	ctx.effect(() => registerConnectorRoutes(ctx, connectorRegistry), "dsh-desktop-compat: connector HTTP routes");
	registerWorkOfficePreset(ctx);
	const acpManager = new AcpAgentManager(ctx);
	ctx.effect(() => () => {
		acpManager.dispose();
	}, "dsh-desktop-compat: ACP agent cleanup");
	ctx.effect(() => registerAcpRoutes(ctx, acpManager), "dsh-desktop-compat: ACP HTTP routes");
	installToolCallArgumentNormalization(ctx);
	installTranscriptBalanceGuard(ctx);
	installSessionCheckpointRecovery(ctx);
	installSessionTitleCheckpoint(ctx);
	installControlToolApproval(ctx, { lookupConnectorRisk: (name) => connectorRegistry.matchToolRisk(name) });
	installAgentWslTool(ctx);
	ctx.effect(() => registerDesktopWorkspaceFileOpenRoute(ctx), "dsh-desktop-compat: workspace native-open authority");
	ctx.effect(() => registerDesktopConversationImportRoute(ctx), "dsh-desktop-compat: conversation import authority");
	if (process.env.DSH_DESKTOP_BACKGROUND_AUTOMATION === "1") ctx.inject([
		"agents",
		"agentDefaultModel",
		"sessions",
		"sessionPersistence",
		"sessionQuery",
		"workspaceRegistry"
	], (schedulerCtx) => {
		const runner = createDesktopTaskBoardHostScheduleRunner({
			agents: schedulerCtx.agents,
			defaultModel: schedulerCtx.agentDefaultModel,
			sessions: schedulerCtx.sessions,
			sessionPersistence: schedulerCtx.sessionPersistence,
			sessionQuery: schedulerCtx.sessionQuery,
			workspaceRegistry: schedulerCtx.workspaceRegistry
		});
		return schedulerCtx.provide("taskBoardHostScheduleRunner", runner);
	});
	const scheduleRecovery = createQueueRecoveryScheduler(queueMicrotask, (error) => {
		const detail = error instanceof Error ? error.message : String(error);
		ctx.logger?.warn?.(`dsh-desktop-compat: queued turn recovery failed: ${detail}`);
	});
	ctx.on("agent/status", ({ agent, status }) => {
		scheduleRecovery(agent, status);
	});
	ctx.on("tools/post-execute", async (exec, result, next) => {
		return normalizeCancellationDecision(exec, result, await next());
	});
}
//#endregion
export { ACP_API_PREFIX, ANTIGRAVITY_ACP_AGENT, AcpAgentManager, AcpClient, AcpClientError, AcpComplianceError, CONNECTOR_API_PREFIX, ConnectorRegistryService, ConnectorSecretVault, DESKTOP_COMPAT_PATCHES, DESKTOP_CONVERSATION_IMPORT_PATH, DESKTOP_TASK_BOARD_SCHEDULER_OWNERSHIP, DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH, DesktopSkinStateService, DesktopSkinStateStore, FRIENDLY_CANCELLED_MESSAGE, SKIN_STATE_END, SKIN_STATE_START, WORK_OFFICE_PRESET_ID, apply, assertAcpUsageAllowed, assertWorkspaceContained, balanceTranscriptMessages, classifyConnectorFailure, connectorToolApprovalDecision, controlToolApprovalDecision, createDesktopConversationImportRoute, createDesktopTaskBoardHostScheduleRunner, createDesktopWorkspaceFileOpenRoute, createQueueRecoveryScheduler, extractToolCallsFromAssistantMessage, importConversationIntoHost, inject, installAgentWslTool, installControlToolApproval, installToolCallArgumentNormalization, installTranscriptBalanceGuard, loadBuiltinCatalog, name, normalizeCancellationDecision, normalizeRedundantSandboxEscalation, normalizeToolCallArgumentStream, normalizeWrappedToolCallArguments, recoverQueuedTurns, registerAcpRoutes, registerConnectorRoutes, registerDesktopConversationImportRoute, registerDesktopWorkspaceFileOpenRoute, registerWorkOfficePreset, resolveConnectorsHome, resolveDesktopWorkspaceFileOpenTarget, validateCompatPatchRegistry };
