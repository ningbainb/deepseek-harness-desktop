import { FRIENDLY_CANCELLED_MESSAGE, createQueueRecoveryScheduler, normalizeCancellationDecision, recoverQueuedTurns } from "./recovery.js";
import { DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_ENV, isDesktopWorkspaceFileOpenToken, isSafeDesktopWorkspaceFileOpenPath } from "./workspace-file-open-policy.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { validateJsonSchemaValue } from "@deepseek-ai/dsh-tools";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { Service } from "@deepseek-ai/cordis";
import { realpath, stat } from "node:fs/promises";
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
function failure$1(input, error) {
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
async function canDesktopRunnerOwnTask(input, options) {
	const project = input.project;
	if (project === void 0 || input.task.prompt.trim() === "") return false;
	if ((input.task.isolationMode === "inherit" || input.task.isolationMode === void 0 ? project.defaultIsolation : input.task.isolationMode) !== "shared-workspace") return false;
	const workspace = options.workspaceRegistry.get(project.workspaceId);
	if (workspace === void 0 || await workspace.status() !== "ok") return false;
	const selection = options.defaultModel.currentSelection();
	return selection.provider.trim() !== "" && selection.model.trim() !== "";
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
			if (project === void 0) return failure$1(input, "scheduled task has no registered Desktop project");
			if ((input.task.isolationMode === "inherit" || input.task.isolationMode === void 0 ? project.defaultIsolation : input.task.isolationMode) === "git-worktree") return failure$1(input, "background scheduling requires a Runtime Provider Worktree adapter; this task requests git-worktree isolation");
			const prompt = input.task.prompt.trim();
			if (prompt === "") return failure$1(input, "scheduled task prompt is empty");
			const workspace = options.workspaceRegistry.get(project.workspaceId);
			if (workspace === void 0) return failure$1(input, "scheduled task workspace is no longer registered");
			if (await workspace.status() !== "ok") return failure$1(input, "scheduled task workspace directory is unavailable");
			const selection = options.defaultModel.currentSelection();
			if (selection.provider.trim() === "" || selection.model.trim() === "") return failure$1(input, "no default DSH model is configured for background automation");
			let handle;
			try {
				const sessionId = sessionIdForExecutionKey(input.executionKey, createSessionId);
				const agentOptions = {
					provider: selection.provider,
					model: selection.model
				};
				const setup = (agentCtx) => {
					installModelSelection(agentCtx, {
						current: selection,
						assembled: void 0
					});
				};
				const persisted = options.sessionPersistence === void 0 ? false : (await options.sessionPersistence.list()).some((header) => String(header.id) === String(sessionId));
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
				const promptAlreadyAccepted = persisted && hasScheduledPrompt(agent.session.events, prompt);
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
				const reason = terminalReason(agent.session.events, promptAlreadyAccepted ? 0 : firstSequence);
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
					...failure$1(input, message),
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
function normalizeToolCall(raw, name, id, source, options, lookup, diagnostic) {
	const normalization = normalizeWrappedToolCallArgumentsWithLookup(raw, lookup.get(name) ?? { kind: "missing" });
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
function* flushBufferedToolCall(index, buffered, options, lookup, diagnostic) {
	const pending = buffered.get(index);
	if (pending === void 0) return;
	buffered.delete(index);
	if (pending.name === void 0) {
		yield* pending.chunks;
		return;
	}
	const normalized = normalizeToolCall(pending.arguments, pending.name, pending.id, "stream-delta", options, lookup, diagnostic);
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
async function* normalizeToolCallArgumentStream(options, source, diagnostic) {
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
					const arguments_ = normalizeToolCall(chunk.block.arguments, chunk.block.name, String(chunk.block.id), "block-end", options, lookup, diagnostic);
					yield {
						...chunk,
						block: {
							...chunk.block,
							arguments: arguments_
						}
					};
					continue;
				}
				yield* flushBufferedToolCall(chunk.index, buffered, options, lookup, diagnostic);
				yield chunk;
				continue;
			}
			if (chunk.type === "finish") {
				for (const index of [...buffered.keys()]) yield* flushBufferedToolCall(index, buffered, options, lookup, diagnostic);
				yield chunk;
				continue;
			}
			yield chunk;
		}
	} catch (error) {
		for (const index of [...buffered.keys()]) yield* flushBufferedToolCall(index, buffered, options, lookup, diagnostic);
		throw error;
	}
	for (const index of [...buffered.keys()]) yield* flushBufferedToolCall(index, buffered, options, lookup, diagnostic);
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
//#region src/workspace-file-open-route.ts
/** Desktop-owned, loopback-only authority for native workspace-file opening. */
const DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH = "/desktop/workspace-file-open-target";
const MAX_ROOT_LENGTH = 32767;
const MAX_RELATIVE_PATH_LENGTH = 4096;
const MAX_BODY_BYTES = 1 << 20;
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
async function readJsonBody(request) {
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > MAX_BODY_BYTES) return void 0;
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
			const requestValue = normalizeRequest(await readJsonBody(request));
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
		id: "queued-turn-continuation",
		appliesTo: ["0.1.1-rc.1"],
		upstreamReference: "@deepseek-ai/dsh-agent 0.1.1-rc.1 agent/status public hook behavior",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/recovery.spec.ts"],
		reason: "Resume a queued user turn after the active turn reaches a terminal status.",
		removeWhen: "The upstream agent loop natively and deterministically resumes queued turns.",
		lastVerified: "2026-08-21"
	},
	{
		id: "cancellation-presentation",
		appliesTo: ["0.1.1-rc.1"],
		upstreamReference: "@deepseek-ai/dsh-tools 0.1.1-rc.1 tools/post-execute public hook behavior",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/recovery.spec.ts"],
		reason: "Translate the known object-shaped cancellation result into a stable user-facing message.",
		removeWhen: "The upstream tool runtime returns a stable cancellation presentation contract.",
		lastVerified: "2026-08-21"
	},
	{
		id: "tool-call-arguments-envelope",
		appliesTo: ["0.1.1-rc.1"],
		upstreamReference: "@deepseek-ai/dsh-llm 0.1.1-rc.1 llm/stream waterfall plus dsh-tools schema validation",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/tool-call-normalization.spec.ts"],
		reason: "Recover only a schema-proven single-key arguments envelope before the agent loop parses tool JSON.",
		removeWhen: "The upstream adapter or agent loop normalizes this malformed transport envelope with the same ambiguity guard.",
		lastVerified: "2026-08-21"
	},
	{
		id: "desktop-skin-profile-isolation",
		appliesTo: ["0.1.1-rc.1"],
		upstreamReference: "@deepseek-ai/dsh 0.1.1-rc.1 profile-scoped runtime behavior and Skin Center v2 state isolation",
		owner: "desktop-platform",
		tests: ["packages/dsh-desktop-compat/tests/skin-state.spec.ts"],
		reason: "Keep Desktop skin selection inside the isolated desktop profile patch.",
		removeWhen: "The upstream skin service exposes a profile-scoped public persistence contract.",
		lastVerified: "2026-08-21"
	},
	{
		id: "tools-capability-request-side",
		appliesTo: ["0.1.1-rc.1"],
		upstreamReference: "@deepseek-ai/dsh-llm-pi-ai 0.1.1-rc.1 GenerateOptions tools request path",
		owner: "desktop-platform",
		tests: ["apps/dsh-desktop/test/tools-capability.test.mjs"],
		reason: "Add a route-level auto/native/none request-side tools capability while preserving ordinary chat and stable tool-history failure semantics.",
		removeWhen: "The upstream adapter exposes a request-side tools capability contract with the same route-level behavior.",
		lastVerified: "2026-08-24"
	}
], { enforceFreshness: false });
//#endregion
//#region src/index.ts
const name = "desktop-compat";
const inject = [
	"llm",
	"tools",
	"webServer",
	"workspaceRegistry"
];
/** Install Desktop-only compatibility behavior through public DSH hooks. */
function apply(ctx) {
	new DesktopSkinStateService(ctx);
	installToolCallArgumentNormalization(ctx);
	ctx.effect(() => registerDesktopWorkspaceFileOpenRoute(ctx), "dsh-desktop-compat: workspace native-open authority");
	if (process.env.DSH_DESKTOP_BACKGROUND_AUTOMATION === "1") ctx.inject([
		"agents",
		"agentDefaultModel",
		"sessions",
		"sessionPersistence",
		"workspaceRegistry"
	], (schedulerCtx) => {
		const runner = createDesktopTaskBoardHostScheduleRunner({
			agents: schedulerCtx.agents,
			defaultModel: schedulerCtx.agentDefaultModel,
			sessions: schedulerCtx.sessions,
			sessionPersistence: schedulerCtx.sessionPersistence,
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
export { DESKTOP_COMPAT_PATCHES, DESKTOP_TASK_BOARD_SCHEDULER_OWNERSHIP, DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH, DesktopSkinStateService, DesktopSkinStateStore, FRIENDLY_CANCELLED_MESSAGE, SKIN_STATE_END, SKIN_STATE_START, apply, createDesktopTaskBoardHostScheduleRunner, createDesktopWorkspaceFileOpenRoute, createQueueRecoveryScheduler, inject, installToolCallArgumentNormalization, name, normalizeCancellationDecision, normalizeToolCallArgumentStream, normalizeWrappedToolCallArguments, recoverQueuedTurns, registerDesktopWorkspaceFileOpenRoute, resolveDesktopWorkspaceFileOpenTarget, validateCompatPatchRegistry };
