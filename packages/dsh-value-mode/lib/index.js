import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { homedir } from "node:os";
//#region src/core/config.ts
const VALUE_MODE_SETTINGS_NAMESPACE = "value-mode";
const DEFAULT_STRATEGY = "balanced";
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_MAX_CONTEXT_CHARS = 16e3;
const DEFAULT_MAX_DEPTH = 1;
const DEFAULT_MAX_EXPERT_CALLS_PER_TURN = 3;
const DEFAULT_ALLOW_REVIEW = true;
const DEFAULT_SHOW_EXPERT_ACTIVITY = true;
const DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD = 2;
const DEFAULT_AUTO_REVIEW_KEYWORDS = [
	"security",
	"auth",
	"credential",
	"migration",
	"updater",
	"database",
	"schema",
	"permission"
];
function hasAnyRouteValue(route) {
	return Boolean(route && (typeof route.provider === "string" && route.provider.trim().length > 0 || typeof route.model === "string" && route.model.trim().length > 0));
}
function isCompleteModelRoute(route) {
	return typeof route?.provider === "string" && route.provider.trim().length > 0 && typeof route.model === "string" && route.model.trim().length > 0;
}
/** True when both model choices have been explicitly saved in Value Mode. */
function hasExplicitModelRoutes(config) {
	return isCompleteModelRoute(config?.executor) && isCompleteModelRoute(config?.expert);
}
/**
* Resolve the expert route used by the controller. A complete explicit Value
* Mode selection always wins. A partial selection is retained only when there
* is no usable host default, so an available default can heal an incomplete
* legacy config without overwriting a deliberate expert choice.
*/
function resolveExpertRoute(config, defaultExpert) {
	if (isCompleteModelRoute(config?.expert)) return config.expert;
	if (defaultExpert !== void 0) return defaultExpert;
	if (hasAnyRouteValue(config?.expert)) return config?.expert;
	return defaultExpert;
}
/** Apply the host default model as the effective expert/controller route. */
function resolveEffectiveConfig(config = {}, defaultExpert) {
	const expert = resolveExpertRoute(config, defaultExpert);
	return expert === void 0 ? { ...config } : {
		...config,
		expert
	};
}
function isConfigured(config, defaultExpert) {
	if (!config) return false;
	const exec = config.executor;
	const exp = resolveExpertRoute(config, defaultExpert);
	return isCompleteModelRoute(exec) && isCompleteModelRoute(exp);
}
function isEffectivelyActive(config, defaultExpert) {
	return config?.enabled === true && isConfigured(config, defaultExpert);
}
function resolveResolvedConfig(config, defaultExpert) {
	const strategy = config?.strategy ?? "balanced";
	const defaultReviewForStrategy = strategy === "saver" ? false : config?.allowReview ?? true;
	const expert = resolveExpertRoute(config, defaultExpert);
	return {
		enabled: config?.enabled ?? false,
		strategy,
		executor: {
			provider: config?.executor?.provider?.trim() || void 0,
			model: config?.executor?.model?.trim() || void 0,
			reasoningEffort: config?.executor?.reasoningEffort?.trim() || void 0
		},
		expert: {
			provider: expert?.provider?.trim() || void 0,
			model: expert?.model?.trim() || void 0,
			reasoningEffort: expert?.reasoningEffort?.trim() || void 0
		},
		maxOutputTokens: Math.max(256, config?.maxOutputTokens ?? 4096),
		maxContextChars: Math.max(1e3, config?.maxContextChars ?? 16e3),
		maxDepth: Math.max(1, config?.maxDepth ?? 1),
		allowReview: defaultReviewForStrategy,
		showExpertActivity: config?.showExpertActivity ?? true,
		maxExpertCallsPerTurn: Math.max(1, config?.maxExpertCallsPerTurn ?? 3),
		consecutiveFailuresThreshold: Math.max(1, config?.consecutiveFailuresThreshold ?? 2),
		autoReviewKeywords: Array.isArray(config?.autoReviewKeywords) && config.autoReviewKeywords.length > 0 ? config.autoReviewKeywords : [...DEFAULT_AUTO_REVIEW_KEYWORDS]
	};
}
/**
* Merge global config with session-specific overrides.
*/
function resolveSessionConfig(globalConfig = {}, override) {
	if (!override) return globalConfig;
	return {
		...globalConfig,
		...override.enabled !== void 0 ? { enabled: override.enabled } : {},
		...override.strategy !== void 0 ? { strategy: override.strategy } : {},
		...override.expert !== void 0 ? { expert: override.expert } : {}
	};
}
//#endregion
//#region src/core/schema.ts
const ModelRouteSchema = z.object({
	provider: z.string(),
	model: z.string(),
	reasoningEffort: z.string()
});
const Config = z.object({
	enabled: z.boolean().default(false),
	strategy: z.union([
		"saver",
		"balanced",
		"powerful"
	]).default(DEFAULT_STRATEGY),
	executor: ModelRouteSchema,
	expert: ModelRouteSchema,
	maxOutputTokens: z.number().default(DEFAULT_MAX_OUTPUT_TOKENS),
	maxContextChars: z.number().default(DEFAULT_MAX_CONTEXT_CHARS),
	maxDepth: z.number().default(1),
	allowReview: z.boolean().default(true),
	showExpertActivity: z.boolean().default(true),
	maxExpertCallsPerTurn: z.number().default(3),
	consecutiveFailuresThreshold: z.number().default(2),
	autoReviewKeywords: z.array(z.string()).default(DEFAULT_AUTO_REVIEW_KEYWORDS)
});
//#endregion
//#region src/core/policy.ts
const VALUE_MODE_SECTION_NAME = "value-mode:guidance";
const VALUE_MODE_SECTION_ORDER = 145;
function buildSystemPromptGuidance(config, options = {}) {
	const resolved = resolveResolvedConfig(config);
	if (!resolved.enabled) return "";
	if (options.role === "subagent") return "[性价比模式·副模型子代理] 你是专家主控模型派发的执行代理，只完成当前明确的单项任务。不要再次派发子代理，不要调用 subagent、subagent_fork 或 consult_expert；不要越界修改无关内容。优先给出可验证的结果、证据、风险和下一步建议，由专家主控负责最终汇总与交付。";
	const strategy = resolved.strategy;
	return `[性价比模式·${strategy === "saver" ? "更省" : strategy === "powerful" ? "更强" : "智能平衡"}·专家主控] 你是本次会话的专家主控模型，负责理解任务、拆解工作、选择是否派发子代理、审查结果并对最终交付负责。常规编码、工具调用和验证可直接完成。` + (strategy === "saver" ? "优先直接处理；只有任务能明确拆分、需要并行调查或确实耗时较高时才使用 subagent。" : strategy === "powerful" ? "遇到复杂架构、疑难根因、安全关键逻辑或大型重构时，积极使用 subagent 并要求其返回证据。" : "遇到复杂架构、疑难根因、并行调查、安全关键逻辑或大型重构时，按需使用 subagent。") + "派发后要明确任务边界和验收标准，收到子代理结果后自行核对，必要时补充修改与测试；不要为了形式强行创建子代理。";
}
function buildExpertSystemPrompt(purpose) {
	return `You are a senior technical expert consultant in Value Mode (性价比模式). Your goal is to provide concise, authoritative analysis, root causes, architecture recommendations, risk mitigation, and code review findings. Do not output raw code dumps unless necessary for precision. Do not perform tool calls or attempt to execute commands. Structure your response clearly with: Summary, Root Cause / Key Tradeoffs, Concrete Recommendations, and Verification Steps. Current consultation purpose: ${purpose}.`;
}
//#endregion
//#region src/core/state.ts
var ValueModeStateManager = class {
	sessions = /* @__PURE__ */ new Map();
	globalExecutorCalls = 0;
	globalExpertCalls = 0;
	getSessionState(sessionId) {
		let state = this.sessions.get(sessionId);
		if (!state) {
			state = {
				executorCalls: 0,
				expertCalls: 0,
				executorTokens: {
					inputTokens: 0,
					outputTokens: 0
				},
				expertTokens: {
					inputTokens: 0,
					outputTokens: 0
				},
				manualExpertArmed: false,
				currentDepth: 0,
				turnExpertCount: /* @__PURE__ */ new Map(),
				consecutiveFailures: 0,
				consultations: []
			};
			this.sessions.set(sessionId, state);
		}
		return state;
	}
	recordExecutorCall(sessionId, usage) {
		this.globalExecutorCalls++;
		if (sessionId) {
			const state = this.getSessionState(sessionId);
			state.executorCalls++;
			if (usage) {
				state.executorTokens.inputTokens += usage.inputTokens ?? 0;
				state.executorTokens.outputTokens += usage.outputTokens ?? 0;
			}
		}
	}
	/** Record a delegated child-agent call while retaining the legacy field name. */
	recordSubagentCall(sessionId, usage) {
		this.recordExecutorCall(sessionId, usage);
	}
	recordExpertCall(sessionId, turn, usage) {
		this.globalExpertCalls++;
		if (sessionId) {
			const state = this.getSessionState(sessionId);
			state.expertCalls++;
			if (usage) {
				state.expertTokens.inputTokens += usage.inputTokens ?? 0;
				state.expertTokens.outputTokens += usage.outputTokens ?? 0;
			}
			if (turn !== void 0) {
				const count = state.turnExpertCount.get(turn) ?? 0;
				state.turnExpertCount.set(turn, count + 1);
			}
			state.manualExpertArmed = false;
		}
	}
	/** Record a top-level expert-controller call while retaining model metrics compatibility. */
	recordControllerCall(sessionId, usage) {
		this.recordExpertCall(sessionId, void 0, usage);
	}
	recordConsultation(sessionId, record) {
		const state = this.getSessionState(sessionId);
		const entry = {
			...record,
			id: `consult-${Date.now()}-${state.consultations.length + 1}`,
			timestamp: Date.now()
		};
		state.consultations.unshift(entry);
		if (state.consultations.length > 20) state.consultations.length = 20;
	}
	getConsultationHistory(sessionId) {
		return this.getSessionState(sessionId).consultations;
	}
	recordExecutorFailure(sessionId) {
		const state = this.getSessionState(sessionId);
		state.consecutiveFailures++;
	}
	resetExecutorFailure(sessionId) {
		const state = this.getSessionState(sessionId);
		state.consecutiveFailures = 0;
	}
	getConsecutiveFailures(sessionId) {
		return this.getSessionState(sessionId).consecutiveFailures;
	}
	setSessionOverride(sessionId, override) {
		const state = this.getSessionState(sessionId);
		state.override = override ? { ...override } : void 0;
	}
	getSessionOverride(sessionId) {
		return this.getSessionState(sessionId).override;
	}
	clearSessionOverride(sessionId) {
		const state = this.getSessionState(sessionId);
		state.override = void 0;
	}
	getTurnExpertCalls(sessionId, turn) {
		return this.getSessionState(sessionId).turnExpertCount.get(turn) ?? 0;
	}
	getDepth(sessionId) {
		return this.getSessionState(sessionId).currentDepth;
	}
	enterExpertCall(sessionId) {
		const state = this.getSessionState(sessionId);
		state.currentDepth++;
	}
	exitExpertCall(sessionId) {
		const state = this.getSessionState(sessionId);
		state.currentDepth = Math.max(0, state.currentDepth - 1);
	}
	setManualExpertArmed(sessionId, armed) {
		const state = this.getSessionState(sessionId);
		state.manualExpertArmed = armed;
	}
	isManualExpertArmed(sessionId) {
		return this.getSessionState(sessionId).manualExpertArmed;
	}
	getSessionMetrics(sessionId) {
		const state = this.getSessionState(sessionId);
		const totalCalls = state.executorCalls + state.expertCalls;
		const estimatedSavingsPercent = totalCalls > 0 ? Math.min(99, Math.round(state.executorCalls / totalCalls * 100)) : 0;
		return {
			controllerCalls: state.expertCalls,
			subagentCalls: state.executorCalls,
			executorCalls: state.executorCalls,
			expertCalls: state.expertCalls,
			controllerTokens: { ...state.expertTokens },
			subagentTokens: { ...state.executorTokens },
			executorTokens: { ...state.executorTokens },
			expertTokens: { ...state.expertTokens },
			inputTokens: state.expertTokens.inputTokens + state.executorTokens.inputTokens,
			outputTokens: state.expertTokens.outputTokens + state.executorTokens.outputTokens,
			manualExpertArmed: state.manualExpertArmed,
			consecutiveFailures: state.consecutiveFailures,
			consultationsCount: state.consultations.length,
			estimatedSavingsPercent
		};
	}
	getGlobalMetrics() {
		return {
			controllerCalls: this.globalExpertCalls,
			subagentCalls: this.globalExecutorCalls,
			executorCalls: this.globalExecutorCalls,
			expertCalls: this.globalExpertCalls,
			activeSessions: this.sessions.size
		};
	}
	resetAll() {
		this.sessions.clear();
		this.globalExecutorCalls = 0;
		this.globalExpertCalls = 0;
	}
};
const valueModeState = new ValueModeStateManager();
//#endregion
//#region src/core/expert.ts
function readDefaultExpert$1(ctx) {
	const service = ctx.agentDefaultModel;
	try {
		const selection = service?.currentSelection?.();
		return isCompleteModelRoute(selection) ? { ...selection } : void 0;
	} catch {
		return;
	}
}
function consultExpertCallView(args) {
	return {
		card: "generic",
		title: `兼容专家咨询 · ${{
			architecture: "架构分析 (Architecture)",
			plan: "方案规划 (Plan)",
			debug: "疑难排查 (Debug)",
			review: "代码审查 (Review)"
		}[args.purpose] || args.purpose}`,
		kind: "read",
		rawInput: args
	};
}
function parseExpertResponse(rawText, purpose) {
	const clean = rawText.trim();
	if (!clean) return {
		summary: "专家未返回有效文本",
		recommendation: "请由主力模型继续尝试或检查专家模型配置。"
	};
	const rootCauseMatch = clean.match(/(?:###?\s*(?:Root Cause|根因|原因分析|Problem Analysis)[\s\S]*?)(?=###?|$)/i);
	const recommendationMatch = clean.match(/(?:###?\s*(?:Recommendations?|建议|解决方案|Proposed Solution)[\s\S]*?)(?=###?|$)/i);
	const risksMatch = clean.match(/(?:###?\s*(?:Risks?|风险|注意事项|Tradeoffs?)[\s\S]*?)(?=###?|$)/i);
	const verificationMatch = clean.match(/(?:###?\s*(?:Verification|验证|测试建议|Validation)[\s\S]*?)(?=###?|$)/i);
	const reviewMatch = clean.match(/(?:###?\s*(?:Review Findings|审查意见|审查结论|Code Review)[\s\S]*?)(?=###?|$)/i);
	return {
		summary: clean.length > 500 ? clean.slice(0, 500) + "..." : clean,
		recommendation: recommendationMatch ? recommendationMatch[0].trim() : clean,
		...rootCauseMatch ? { rootCause: rootCauseMatch[0].trim() } : {},
		...risksMatch ? { risks: risksMatch[0].trim() } : {},
		...verificationMatch ? { verification: verificationMatch[0].trim() } : {},
		...reviewMatch || purpose === "review" ? { reviewFindings: reviewMatch ? reviewMatch[0].trim() : clean } : {}
	};
}
function createConsultExpertTool(ctx, getConfig) {
	return defineTool({
		name: "consult_expert",
		description: "Legacy compatibility tool for integrations that still request a bounded expert consultation. Normal Value Mode routing already uses the expert model as the top-level controller and the executor model for delegated child agents; do not call this tool for ordinary routing. The consultant does not execute tools. Provide a concise, bounded brief of facts, critical code snippets, and specific questions in `context`.",
		parameters: {
			purpose: {
				type: "string",
				required: true,
				enum: [
					"architecture",
					"plan",
					"debug",
					"review"
				],
				description: "The explicit purpose of the expert consultation: architecture, plan, debug, or review."
			},
			question: {
				type: "string",
				required: true,
				description: "The exact question or analytical problem for the expert to solve."
			},
			context: {
				type: "string",
				required: true,
				description: "A compact Expert Brief containing only relevant facts, key errors, constraints, and necessary code snippets (bounded size)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					success: {
						type: "boolean",
						required: true
					},
					purpose: {
						type: "string",
						required: true
					},
					summary: {
						type: "string",
						required: true
					},
					recommendation: {
						type: "string",
						required: true
					},
					rootCause: { type: "string" },
					risks: { type: "string" },
					verification: { type: "string" },
					reviewFindings: { type: "string" },
					model: {
						type: "string",
						required: true
					},
					fallbackNote: { type: "string" }
				}
			},
			render: (_args, value) => {
				const val = value;
				const lines = [`**兼容专家咨询结论 (${val.model})**`, ""];
				if (val.fallbackNote) lines.push(`> 提示: ${val.fallbackNote}`, "");
				lines.push(val.summary);
				if (val.rootCause) lines.push("", "---", "**根因分析:**", val.rootCause);
				if (val.recommendation && val.recommendation !== val.summary) lines.push("", "---", "**方案建议:**", val.recommendation);
				if (val.risks) lines.push("", "---", "**风险评估:**", val.risks);
				if (val.verification) lines.push("", "---", "**验证建议:**", val.verification);
				return [{
					type: "text",
					text: lines.join("\n")
				}];
			}
		},
		presentCall: consultExpertCallView,
		async execute(rawArgs, exec) {
			const args = rawArgs;
			const globalConfig = getConfig();
			const sessionId = exec?.sessionId || "default";
			const effectiveConfig = resolveEffectiveConfig(resolveSessionConfig(globalConfig, valueModeState.getSessionOverride(sessionId)), readDefaultExpert$1(ctx));
			const resolved = resolveResolvedConfig(effectiveConfig);
			if (!isEffectivelyActive(effectiveConfig)) return {
				success: false,
				purpose: args.purpose,
				summary: "性价比模式未开启或专家模型未配置完整。",
				recommendation: "请由主力模型直接进行分析与实现。",
				model: "none",
				fallbackNote: "Value Mode is not active or missing expert configuration."
			};
			if (valueModeState.getDepth(sessionId) >= resolved.maxDepth) return {
				success: false,
				purpose: args.purpose,
				summary: "已达到专家调用最大递归深度，禁止嵌套调用专家。",
				recommendation: "由当前模型直接执行，避免循环递归调用。",
				model: resolved.expert.model || "expert",
				fallbackNote: `Maximum consultation depth (${resolved.maxDepth}) reached.`
			};
			let boundedContext = args.context ?? "";
			if (boundedContext.length > resolved.maxContextChars) boundedContext = boundedContext.slice(0, resolved.maxContextChars) + `\n\n[Context truncated: exceeded maxContextChars limit of ${resolved.maxContextChars}]`;
			const expertProvider = resolved.expert.provider;
			const expertModel = resolved.expert.model;
			const generateOptions = {
				provider: expertProvider,
				model: expertModel,
				system: buildExpertSystemPrompt(args.purpose),
				messages: [createUserMessage({
					content: [{
						type: "text",
						text: `[Expert Consultation Request]\nPurpose: ${args.purpose}\nQuestion: ${args.question}\n\n[Expert Brief Context]\n${boundedContext}`
					}],
					source: { kind: "user" }
				})],
				maxTokens: resolved.maxOutputTokens,
				signal: exec.signal
			};
			valueModeState.enterExpertCall(sessionId);
			const startTime = Date.now();
			let fullText = "";
			let usage;
			try {
				const stream = ctx.llm.stream(generateOptions);
				for await (const chunk of stream) if (chunk.type === "text-delta") fullText += chunk.text;
				else if (chunk.type === "usage") usage = chunk.usage;
				const durationMs = Date.now() - startTime;
				valueModeState.recordExpertCall(sessionId, void 0, usage);
				const parsed = parseExpertResponse(fullText, args.purpose);
				valueModeState.recordConsultation(sessionId, {
					purpose: args.purpose,
					question: args.question,
					summary: parsed.summary,
					tokens: {
						inputTokens: usage?.inputTokens ?? 0,
						outputTokens: usage?.outputTokens ?? 0
					},
					durationMs
				});
				return {
					success: true,
					purpose: args.purpose,
					...parsed,
					model: `${expertProvider}/${expertModel}`
				};
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				return {
					success: false,
					purpose: args.purpose,
					summary: `专家模型咨询失败: ${errorMessage}`,
					recommendation: "专家服务暂时不可用，本次请由主力模型直接根据现有上下文继续完成任务。",
					model: `${expertProvider}/${expertModel}`,
					fallbackNote: `Expert call failed: ${errorMessage}. Falling back to primary executor.`
				};
			} finally {
				valueModeState.exitExpertCall(sessionId);
			}
		}
	});
}
//#endregion
//#region src/core/model-selection.ts
function isRouteConfigured(route) {
	return typeof route?.provider === "string" && route.provider.trim().length > 0 && typeof route?.model === "string" && route.model.trim().length > 0;
}
async function checkRouteAvailability(llm, route) {
	if (!isRouteConfigured(route)) return "unconfigured";
	if (!llm) return "ready";
	try {
		if (!llm.listProviders().some((p) => p.id === route.provider)) return "unavailable";
		return "ready";
	} catch {
		return "unavailable";
	}
}
async function assessValueModeHealth(config, llm) {
	if (!config || !config.enabled) {
		const configured = isConfigured(config);
		return {
			status: "disabled",
			executorHealth: isRouteConfigured(config?.executor) ? "ready" : "unconfigured",
			expertHealth: isRouteConfigured(config?.expert) ? "ready" : "unconfigured",
			reason: configured ? void 0 : "Models not yet configured"
		};
	}
	const executorHealth = await checkRouteAvailability(llm, config.executor);
	const expertHealth = await checkRouteAvailability(llm, config.expert);
	if (executorHealth === "unconfigured" || expertHealth === "unconfigured") return {
		status: "unconfigured",
		executorHealth,
		expertHealth,
		reason: "Configuration incomplete"
	};
	if (executorHealth === "unavailable" || expertHealth === "unavailable") return {
		status: "degraded",
		executorHealth,
		expertHealth,
		reason: executorHealth === "unavailable" ? "Executor model provider unavailable" : "Expert model provider unavailable"
	};
	return {
		status: "active",
		executorHealth: "ready",
		expertHealth: "ready"
	};
}
//#endregion
//#region src/core/runtime-telemetry.ts
const VALUE_MODE_RUNTIME_TELEMETRY_PREFIX = "DSH_VALUE_MODE_METRIC ";
/**
* Send only a fixed, privacy-safe route marker to the Desktop main process.
* Product transport remains owned by Electron; this plugin never performs a
* network request and never writes model, session, prompt, or error details.
*/
function emitValueModeRuntimeTelemetry(payload) {
	const runtimeProcess = globalThis.process;
	if (runtimeProcess?.env?.DSH_DESKTOP_PRODUCT_METRICS_BRIDGE !== "1" || typeof runtimeProcess.stdout?.write !== "function") return;
	try {
		runtimeProcess.stdout.write(`${VALUE_MODE_RUNTIME_TELEMETRY_PREFIX}${JSON.stringify(payload)}\n`);
	} catch {}
}
//#endregion
//#region src/dsh-home.ts
/**
* DSH_HOME resolution shared by the plugin family's Host halves: the
* environment override wins, the platform home fallback follows. Mirrors
* what dsh-pet and dsh-liangshen each used to implement locally.
*/
/** Expand a leading ~ (or ~user) in a path, platform-style. */
function expandHome(path, home = homedir()) {
	if (path === "~") return home;
	if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2));
	return path;
}
/**
* Resolve the DSH home directory.
* @param env - process environment to read DSH_HOME from.
* @param home - platform home directory fallback (test seam).
* @returns the absolute DSH home path.
*/
function resolveDshHome(env = process.env, home = homedir()) {
	const raw = env.DSH_HOME;
	if (raw !== void 0 && raw.trim() !== "") {
		const expanded = expandHome(raw.trim(), home);
		return isAbsolute(expanded) ? expanded : join(process.cwd(), expanded);
	}
	return join(home, ".dsh");
}
/** Resolve the DSH home directory from the live environment. */
function dshHome() {
	return resolveDshHome();
}
//#endregion
//#region src/preset-schema.ts
/**
* Structural validation for a bundled `agent.cordis.yml`.
*
* Deliberately dependency-free: it parses only the flat row metadata the sync
* and the dsh agent-presets loader rely on. Every top-level row is written as
* `- id: <id>` at column zero, with the `name`/`group`/`disabled` keys at two
* spaces of indentation. Nested `config:` and `isolate:` bodies are opaque to
* this validator — the dsh loader checks their semantics.
*
* Returns the list of problems found; an empty array means the document is
* structurally valid.
*/
/** A top-level row opener: `- id: <id>` (id may be blank for diagnostics). */
const ROW_RE = /^-\s+id:\s*(.*)$/;
/** Any top-level list item, for ids missing from a row opener. */
const ITEM_RE = /^-\s/;
/** A two-space-indented flat metadata key: `  name: <value>`. */
const META_RE = /^ {2}([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/;
/** The only `name` forms the dsh agent-presets loader mounts from a row. */
const NAME_PREFIX_RE = /^(\.\/|@|cordis:)/;
/** Strip one pair of surrounding single or double quotes from a scalar. */
function unquote(value) {
	if (value.length >= 2) {
		const first = value[0];
		if ((first === "'" || first === "\"") && value.endsWith(first)) return value.slice(1, -1);
	}
	return value;
}
/**
* Validate the structural contract of an `agent.cordis.yml` document.
* @param text - the raw YAML document text.
* @returns a list of human-readable problems; empty means valid.
*/
function validateAgentCordis(text) {
	const errors = [];
	const normalized = text.replace(/\r\n/g, "\n");
	if (normalized.trim() === "") return ["document is empty"];
	const seenIds = /* @__PURE__ */ new Set();
	const current = {
		id: null,
		name: null,
		group: null
	};
	const closeRow = () => {
		if (current.id === null) return;
		if (current.name === null) errors.push(`row "${current.id}": missing "name" key`);
		else if (!NAME_PREFIX_RE.test(current.name)) errors.push(`row "${current.id}": name "${current.name}" must start with "./", "@" or "cordis:"`);
		if (current.group === "true" && current.name !== "cordis:group") errors.push(`row "${current.id}": "group: true" requires name "cordis:group"`);
		current.name = null;
		current.group = null;
		current.id = null;
	};
	const lines = normalized.split("\n");
	for (let index = 0; index < lines.length; index += 1) {
		const lineNo = index + 1;
		const line = lines[index];
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const row = ROW_RE.exec(line);
		if (row !== null) {
			closeRow();
			const id = row[1].trim();
			if (id === "") {
				errors.push(`line ${lineNo}: empty row id`);
				current.id = null;
			} else {
				if (seenIds.has(id)) errors.push(`line ${lineNo}: duplicate row id "${id}"`);
				seenIds.add(id);
				current.id = id;
			}
			current.name = null;
			current.group = null;
			continue;
		}
		if (current.id === null) {
			if (ITEM_RE.test(line)) errors.push(`line ${lineNo}: list item does not declare an "id:"`);
			else if (/^\S/.test(line)) errors.push(`line ${lineNo}: content outside a "- id:" row`);
			continue;
		}
		const meta = META_RE.exec(line);
		if (meta !== null) {
			const value = unquote(meta[2].trim());
			if (meta[1] === "name") current.name = value;
			else if (meta[1] === "group") current.group = value;
			continue;
		}
		if (/^ {2}/.test(line)) continue;
		errors.push(`line ${lineNo}: unexpected content in row "${current.id}"`);
	}
	closeRow();
	return errors;
}
//#endregion
//#region src/sync.ts
/**
* Sync every preset directory under `sourceRoot` into `targetRoot` — the
* dsh agent-presets discovery root (harness-home `.agent-presets`).
*
* A preset is a directory holding `agent.cordis.yml`; the directory name is
* the preset id. Copy is per-directory and idempotent: a preset whose target
* tree is byte-identical to the source tree is skipped, otherwise the source
* tree is copied and any target files the source does not contain are removed.
* Directories the plugin does not own (other presets the user authored) are
* never touched.
*
* After a preset is synced its `agent.cordis.yml` is validated against the
* structural preset schema; a validation failure is reported through the
* run's `failed` entries instead of being a warn-only side effect, so callers
* can observe (and surface) a broken preset rather than silently shipping it.
*/
/**
* Clock/coarse-grain tolerance for the mtime fast path. When a source and a
* target file share a size and a near-identical mtime we still fall through to
* a byte comparison; a mtime gap beyond this simply proves the pair cannot be
* byte-identical, so we skip the read.
*/
const MTIME_TOLERANCE_MS = 1e3;
function filesUnder(root) {
	const out = [];
	const walk = (dir) => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry);
			if (statSync(path).isDirectory()) walk(path);
			else out.push(path);
		}
	};
	walk(root);
	return out;
}
/**
* File identity is bytes. Size and mtime are only a fast negative check: a
* size mismatch or a mtime gap beyond the tolerance proves the pair cannot be
* byte-identical without reading both, but an equal size and close mtime still
* fall through to a byte comparison so content differences are never missed.
*/
function sameFile(a, b) {
	const sourceStat = statSync(a);
	const targetStat = statSync(b);
	if (sourceStat.size !== targetStat.size) return false;
	if (Math.abs(sourceStat.mtimeMs - targetStat.mtimeMs) > MTIME_TOLERANCE_MS) return false;
	return readFileSync(a).equals(readFileSync(b));
}
/**
* Remove files not in `keep` (relative paths), then remove only the
* directories those removals left empty — still strictly inside `root`, so
* sibling presets are never touched.
*/
function pruneExtras(root, keep) {
	const parents = /* @__PURE__ */ new Set();
	for (const file of filesUnder(root)) if (!keep.has(relative(root, file))) {
		parents.add(dirname(file));
		rmSync(file, { force: true });
	}
	for (const start of parents) {
		let dir = start;
		while (dir !== void 0 && relative(root, dir) !== "") if (existsSync(dir) && readdirSync(dir).length === 0) {
			rmSync(dir, {
				recursive: true,
				force: true
			});
			dir = dirname(dir);
		} else dir = void 0;
	}
}
/** Validate the synced preset's `agent.cordis.yml` artifact on disk. */
function validatePresetAgentFile(presetDir) {
	const agent = join(presetDir, "agent.cordis.yml");
	if (!existsSync(agent)) return ["agent.cordis.yml is missing from the preset tree"];
	return validateAgentCordis(readFileSync(agent, "utf8"));
}
/** Copy `sourceRoot/<id>` into `targetRoot/<id>`, idempotently. */
function syncOnePreset(sourceDir, targetDir) {
	const sourceFiles = filesUnder(sourceDir);
	const sourceSet = new Set(sourceFiles.map((file) => relative(sourceDir, file)));
	if (existsSync(targetDir) && !statSync(targetDir).isDirectory()) rmSync(targetDir, {
		recursive: true,
		force: true
	});
	if (!existsSync(targetDir)) {
		cpSync(sourceDir, targetDir, {
			recursive: true,
			preserveTimestamps: true
		});
		pruneExtras(targetDir, sourceSet);
		return "synced";
	}
	let dirty = false;
	for (const file of sourceFiles) {
		const dest = join(targetDir, relative(sourceDir, file));
		if (!existsSync(dest) || !sameFile(file, dest)) {
			dirty = true;
			break;
		}
	}
	if (!dirty) {
		for (const file of filesUnder(targetDir)) if (!sourceSet.has(relative(targetDir, file))) {
			dirty = true;
			break;
		}
	}
	if (!dirty) return "current";
	pruneExtras(targetDir, sourceSet);
	cpSync(sourceDir, targetDir, {
		recursive: true,
		preserveTimestamps: true
	});
	pruneExtras(targetDir, sourceSet);
	return "synced";
}
/**
* Sync every preset under `sourceRoot` into `targetRoot`, then remove
* target directories named in `retire` that the bundle no longer ships —
* preset ids the plugin once owned and later dropped. Only those exact ids
* are removed; every other target directory is left untouched.
*
* Each synced (or already-current) preset is validated against the structural
* `agent.cordis.yml` schema; a validation failure lands in `failed` so the
* caller can surface a broken preset as a first-class result instead of a
* warn-only log line.
* @param sourceRoot - plugin-owned preset tree (bundled in the package).
* @param targetRoot - dsh agent-presets discovery root (e.g. <home>/.dsh/.agent-presets).
* @param retire - previously bundled preset ids to remove when absent from the source.
*/
function syncPresetTrees(sourceRoot, targetRoot, retire = []) {
	const result = {
		synced: [],
		current: [],
		failed: [],
		retired: []
	};
	mkdirSync(targetRoot, { recursive: true });
	if (existsSync(sourceRoot)) for (const entry of readdirSync(sourceRoot)) {
		const source = join(sourceRoot, entry);
		if (!statSync(source).isDirectory()) continue;
		const id = basename(source);
		const targetDir = join(targetRoot, id);
		let outcome;
		try {
			outcome = syncOnePreset(source, targetDir);
		} catch (error) {
			result.failed.push({
				id,
				error: error instanceof Error ? error.message : String(error)
			});
			continue;
		}
		try {
			const problems = validatePresetAgentFile(targetDir);
			if (problems.length > 0) result.failed.push({
				id,
				error: `agent.cordis.yml failed validation: ${problems.join("; ")}`
			});
			else if (outcome === "synced") result.synced.push(id);
			else result.current.push(id);
		} catch (error) {
			result.failed.push({
				id,
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	for (const id of retire) {
		if (existsSync(join(sourceRoot, id))) continue;
		const stale = join(targetRoot, id);
		if (existsSync(stale) && statSync(stale).isDirectory()) {
			rmSync(stale, {
				recursive: true,
				force: true
			});
			result.retired.push(id);
		}
	}
	return result;
}
//#endregion
//#region src/index.ts
/**
* @module @linxin666/dsh-value-mode
* Value Mode (性价比模式) DSH Plugin
*
* Balances coding performance and model cost by using the expert model as the
* top-level controller and the configured executor model for delegated child
* agents.
*/
const name = "value-mode";
const inject = [
	"tools",
	"systemPrompt",
	"settings",
	"llm",
	"agentDefaultModel"
];
/** Absolute path of the bundled Value Mode agent-preset tree. */
function bundledPresetsRoot() {
	return fileURLToPath(new URL("../presets/", import.meta.url));
}
function readDefaultExpert(ctx) {
	const service = ctx.agentDefaultModel;
	try {
		const selection = service?.currentSelection?.();
		return isCompleteModelRoute(selection) ? { ...selection } : void 0;
	} catch {
		return;
	}
}
/**
* Copy the bundled preset into the DSH discovery root. The preset must be
* available even when the settings switch is off: users need to be able to
* select Value Mode in the conversation header before configuring its models.
*/
function syncBundledPreset(ctx) {
	const targetRoot = join(dshHome(), ".agent-presets");
	try {
		mkdirSync(targetRoot, { recursive: true });
		const result = syncPresetTrees(bundledPresetsRoot(), targetRoot);
		for (const { id, error } of result.failed) ctx.logger?.warn?.(`dsh-value-mode: preset ${id} sync failed: ${error}`);
		if (result.synced.length > 0) ctx.logger?.info?.(`dsh-value-mode: presets synced into ${targetRoot}: ${result.synced.join(", ")}`);
	} catch (error) {
		ctx.logger?.warn?.(`dsh-value-mode: preset sync failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}
/**
* Apply the Value Mode host plugin to Cordis context.
*/
function apply(ctx, initialConfig = {}) {
	let currentConfig = initialConfig;
	let currentSource = () => currentConfig;
	const routedRequestAttempts = /* @__PURE__ */ new Map();
	const requestKey = (payload) => {
		const value = payload;
		if (typeof value?.agent?.id !== "string" || !Number.isSafeInteger(value.turn) || !Number.isSafeInteger(value.step)) return void 0;
		return `${value.agent.id}:${value.turn}:${value.step}`;
	};
	const pruneRoutedRequestAttempts = (now) => {
		for (const [key, timestamp] of routedRequestAttempts) if (now - timestamp > 10 * 6e4) routedRequestAttempts.delete(key);
		while (routedRequestAttempts.size > 2048) {
			const oldest = routedRequestAttempts.keys().next().value;
			if (typeof oldest !== "string") break;
			routedRequestAttempts.delete(oldest);
		}
	};
	syncBundledPreset(ctx);
	installSettingsSection(ctx, settingsNamespace(VALUE_MODE_SETTINGS_NAMESPACE), Config, initialConfig, {
		setSource: (source) => {
			currentSource = source;
			currentConfig = source();
		},
		onChange: () => {
			currentConfig = currentSource();
		},
		validate: (value) => {
			const effective = resolveEffectiveConfig(value, readDefaultExpert(ctx));
			if (value.enabled && !isCompleteModelRoute(effective.executor)) throw new Error("副模型/子代理执行模型未选择具体模型");
			if (value.enabled && !isCompleteModelRoute(effective.expert)) throw new Error("专家主控模型未选择具体模型");
		}
	});
	ctx.tools.register(createConsultExpertTool(ctx, () => currentSource()));
	ctx.systemPrompt.section({
		name: VALUE_MODE_SECTION_NAME,
		order: 145,
		text: (assembly) => {
			if (assembly.agent?.session.header?.agentPreset !== "value-mode") return "";
			const config = resolveEffectiveConfig(currentSource(), readDefaultExpert(ctx));
			if (!isEffectivelyActive(config)) return "";
			return buildSystemPromptGuidance(config, { role: assembly.agent?.session.header?.origin === "subagent" ? "subagent" : "controller" });
		}
	});
	ctx.on("agent/request", async (payload, next) => {
		const resolved = await next();
		if (payload.agent.session?.header?.agentPreset !== "value-mode") return resolved;
		const globalConfig = currentSource();
		const sessionId = payload.agent?.id || "default";
		const effectiveConfig = resolveEffectiveConfig(resolveSessionConfig(globalConfig, valueModeState.getSessionOverride(sessionId)), readDefaultExpert(ctx));
		if (!isEffectivelyActive(effectiveConfig)) return resolved;
		if ((await assessValueModeHealth(effectiveConfig, ctx.llm)).status !== "active") return resolved;
		const isSubagent = payload.agent.session?.header?.origin === "subagent";
		if (!isSubagent && valueModeState.getDepth(sessionId) > 0) return resolved;
		const route = isSubagent ? effectiveConfig.executor : effectiveConfig.expert;
		if (!isCompleteModelRoute(route)) return resolved;
		if (isSubagent) valueModeState.recordSubagentCall(sessionId);
		else valueModeState.recordControllerCall(sessionId);
		const key = requestKey(payload);
		if (key !== void 0) {
			const now = Date.now();
			pruneRoutedRequestAttempts(now);
			routedRequestAttempts.set(key, now);
		}
		emitValueModeRuntimeTelemetry({
			event: "call",
			outcome: "started",
			role: isSubagent ? "subagent" : "controller"
		});
		return {
			...resolved,
			provider: route.provider,
			model: route.model,
			...route.reasoningEffort ? { reasoningEffort: route.reasoningEffort } : {}
		};
	});
	ctx.on("agent/request-error", async (payload, next) => {
		const result = await next();
		const key = requestKey(payload);
		if (key === void 0 || !routedRequestAttempts.has(key)) return result;
		routedRequestAttempts.delete(key);
		emitValueModeRuntimeTelemetry({
			event: "call",
			outcome: "failed",
			role: payload.agent?.session?.header?.origin === "subagent" ? "subagent" : "controller"
		});
		return result;
	});
}
//#endregion
export { Config, DEFAULT_ALLOW_REVIEW, DEFAULT_AUTO_REVIEW_KEYWORDS, DEFAULT_CONSECUTIVE_FAILURES_THRESHOLD, DEFAULT_MAX_CONTEXT_CHARS, DEFAULT_MAX_DEPTH, DEFAULT_MAX_EXPERT_CALLS_PER_TURN, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_SHOW_EXPERT_ACTIVITY, DEFAULT_STRATEGY, VALUE_MODE_RUNTIME_TELEMETRY_PREFIX, VALUE_MODE_SECTION_NAME, VALUE_MODE_SECTION_ORDER, VALUE_MODE_SETTINGS_NAMESPACE, apply, assessValueModeHealth, buildExpertSystemPrompt, buildSystemPromptGuidance, bundledPresetsRoot, checkRouteAvailability, consultExpertCallView, createConsultExpertTool, dshHome, emitValueModeRuntimeTelemetry, hasExplicitModelRoutes, inject, isCompleteModelRoute, isConfigured, isEffectivelyActive, isRouteConfigured, name, parseExpertResponse, resolveEffectiveConfig, resolveExpertRoute, resolveResolvedConfig, resolveSessionConfig, valueModeState };
