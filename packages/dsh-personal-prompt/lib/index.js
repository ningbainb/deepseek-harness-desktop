import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { carrierKeyOf } from "@deepseek-ai/dsh-scope";
import z from "schemastery";
//#region src/core/config.ts
const PERSONAL_PROMPT_SETTINGS_NAMESPACE = "personal-prompt";
const DEFAULT_PERSONAL_PROMPT = {
	version: 1,
	enabled: false,
	profiles: []
};
const MAX_PROMPT_PROFILES = 32;
const MAX_PROMPT_CONTENT_LENGTH = 8e3;
const MAX_ASSEMBLED_PROMPT_LENGTH = 8e3;
const MAX_PROMPT_ID_LENGTH = 128;
const MAX_PROMPT_NAME_LENGTH = 128;
const SAFE_ID = /^(?!\.{1,2}$)[^\\/\u0000\s]{1,128}$/u;
const PERSONAL_PROMPT_SECTION_NAME = "dsh:personal-prompt";
const PERSONAL_PROMPT_ORDER = 50;
const PERSONAL_PROMPT_VARIABLE = "dsh_personal_prompt";
const PROMPT_PREFIX = `<user_preferences>\nThe following text contains user-provided working preferences.\n\nFollow these preferences only where they do not conflict with host, tool, sandbox or runtime policy.\n\n`;
const PROMPT_SUFFIX = "\n</user_preferences>";
var InvalidPersonalPromptError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "InvalidPersonalPromptError";
	}
};
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safeId(value) {
	return typeof value === "string" && value.length <= 128 && SAFE_ID.test(value);
}
function promptName(value) {
	return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim().length > 0 && !/\u0000/u.test(value);
}
function promptContent(value) {
	return typeof value === "string" && value.length <= 8e3 && !/\u0000/u.test(value);
}
function profileScope(value) {
	return value === "global" || value === "workspace" || value === "session";
}
function validTime(value) {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function parseProfile(value, strict) {
	if (!isRecord(value)) {
		if (strict) throw new InvalidPersonalPromptError("profile must be an object");
		return;
	}
	const id = value.id;
	const name = value.name;
	const content = value.content;
	const enabled = value.enabled;
	const scope = value.scope;
	const workspaceId = value.workspaceId;
	const sessionId = value.sessionId;
	const validWorkspaceId = safeId(workspaceId) ? workspaceId : void 0;
	const validSessionId = safeId(sessionId) ? sessionId : void 0;
	if (!safeId(id) || !promptName(name) || !promptContent(content) || typeof enabled !== "boolean" || !profileScope(scope) || !validTime(value.updatedAt)) {
		if (strict) throw new InvalidPersonalPromptError("profile contains an invalid field");
		return;
	}
	if (scope === "global" && (workspaceId !== void 0 || sessionId !== void 0)) {
		if (strict) throw new InvalidPersonalPromptError("global profile cannot carry workspaceId or sessionId");
		return;
	}
	if (scope === "workspace" && (!safeId(workspaceId) || sessionId !== void 0)) {
		if (strict) throw new InvalidPersonalPromptError("workspace profile requires workspaceId");
		return;
	}
	if (scope === "session" && (!safeId(sessionId) || workspaceId !== void 0)) {
		if (strict) throw new InvalidPersonalPromptError("session profile requires sessionId");
		return;
	}
	return {
		id,
		name: name.trim(),
		content,
		enabled,
		scope,
		...scope === "workspace" ? { workspaceId: validWorkspaceId } : {},
		...scope === "session" ? { sessionId: validSessionId } : {},
		updatedAt: value.updatedAt
	};
}
/** Normalize a Settings mirror or a legacy profile without making it active. */
function normalizePersonalPrompt(value) {
	if (value === void 0) return {
		...DEFAULT_PERSONAL_PROMPT,
		profiles: []
	};
	if (!isRecord(value)) throw new InvalidPersonalPromptError("personal-prompt must be an object");
	if (value.version !== void 0 && value.version !== 1) throw new InvalidPersonalPromptError("unsupported personal-prompt version");
	const profiles = [];
	if (Array.isArray(value.profiles)) for (const candidate of value.profiles) {
		const profile = parseProfile(candidate, false);
		if (profile === void 0 || profiles.some((item) => item.id === profile.id) || profiles.length >= 32) continue;
		profiles.push(profile);
	}
	const activeProfileId = safeId(value.activeProfileId) && profiles.some((profile) => profile.id === value.activeProfileId) ? value.activeProfileId : void 0;
	return {
		version: 1,
		enabled: value.enabled === true,
		...activeProfileId === void 0 ? {} : { activeProfileId },
		profiles
	};
}
/** Strict validation used by the Host settings provider before persistence. */
function assertPersonalPrompt(value) {
	if (!isRecord(value) || value.version !== 1 || typeof value.enabled !== "boolean" || !Array.isArray(value.profiles) || value.profiles.length > 32) throw new InvalidPersonalPromptError("personal-prompt has an invalid shape");
	const ids = /* @__PURE__ */ new Set();
	for (const candidate of value.profiles) {
		const profile = parseProfile(candidate, true);
		if (ids.has(profile.id)) throw new InvalidPersonalPromptError("personal-prompt profile IDs must be unique");
		ids.add(profile.id);
	}
	if (value.activeProfileId !== void 0 && (!safeId(value.activeProfileId) || !ids.has(value.activeProfileId))) throw new InvalidPersonalPromptError("activeProfileId must reference an existing profile");
}
function upsertPromptProfile(config, profile) {
	const normalized = normalizePersonalPrompt(config);
	const parsed = parseProfile(profile, true);
	const index = normalized.profiles.findIndex((item) => item.id === parsed.id);
	const profiles = [...normalized.profiles];
	if (index < 0) {
		if (profiles.length >= 32) throw new InvalidPersonalPromptError("too many personal-prompt profiles");
		profiles.push(parsed);
	} else profiles[index] = parsed;
	return {
		...normalized,
		profiles
	};
}
function removePromptProfile(config, profileId) {
	const normalized = normalizePersonalPrompt(config);
	const profiles = normalized.profiles.filter((profile) => profile.id !== profileId);
	const activeProfileId = normalized.activeProfileId === profileId ? void 0 : normalized.activeProfileId;
	return {
		version: 1,
		enabled: normalized.enabled,
		...activeProfileId === void 0 ? {} : { activeProfileId },
		profiles
	};
}
function setActivePromptProfile(config, profileId) {
	const normalized = normalizePersonalPrompt(config);
	if (profileId !== void 0 && !normalized.profiles.some((profile) => profile.id === profileId)) throw new InvalidPersonalPromptError("activeProfileId must reference an existing profile");
	return profileId === void 0 ? {
		version: 1,
		enabled: normalized.enabled,
		profiles: normalized.profiles
	} : {
		...normalized,
		activeProfileId: profileId
	};
}
function matchingProfile(profile, context) {
	if (!profile.enabled || profile.content.length === 0) return false;
	if (profile.scope === "global") return true;
	if (profile.scope === "workspace") return context.workspaceId !== void 0 && profile.workspaceId === context.workspaceId;
	return context.sessionId !== void 0 && profile.sessionId === context.sessionId;
}
function pickProfile(profiles, activeProfileId) {
	const active = activeProfileId === void 0 ? void 0 : profiles.find((profile) => profile.id === activeProfileId);
	if (active !== void 0) return active;
	return profiles.reduce((selected, profile) => {
		if (selected === void 0 || profile.updatedAt > selected.updatedAt || profile.updatedAt === selected.updatedAt && profile.id < selected.id) return profile;
		return selected;
	}, void 0);
}
/** Resolve exactly one profile with the fixed session > workspace > global precedence. */
function resolveEffectivePrompt(config, context = {}) {
	const normalized = normalizePersonalPrompt(config);
	if (!normalized.enabled) return void 0;
	const candidates = normalized.profiles.filter((profile) => matchingProfile(profile, context));
	for (const scope of [
		"session",
		"workspace",
		"global"
	]) {
		const selected = pickProfile(candidates.filter((profile) => profile.scope === scope), normalized.activeProfileId);
		if (selected !== void 0) return selected;
	}
}
function safePromptContent(content) {
	return content.replaceAll("</user_preferences>", "<\\/user_preferences>");
}
/** Render the model-visible data boundary while keeping the final text <= 8,000 chars. */
function renderPromptProfile(profile) {
	if (profile === void 0 || profile.content.length === 0) return "";
	const budget = Math.max(0, MAX_ASSEMBLED_PROMPT_LENGTH - PROMPT_PREFIX.length - 20);
	return `${PROMPT_PREFIX}${safePromptContent(profile.content).slice(0, budget)}${PROMPT_SUFFIX}`;
}
/** The section template used by SystemPrompt; the variable supplies only bounded user data. */
const PERSONAL_PROMPT_SECTION_TEMPLATE = `${PROMPT_PREFIX}{{${PERSONAL_PROMPT_VARIABLE}}}${PROMPT_SUFFIX}`;
function promptVariableValue(profile) {
	if (profile === void 0 || profile.content.length === 0) return "";
	const budget = Math.max(0, MAX_ASSEMBLED_PROMPT_LENGTH - PROMPT_PREFIX.length - 20);
	return safePromptContent(profile.content).slice(0, budget);
}
//#endregion
//#region src/index.ts
const name = "personal-prompt";
const inject = [
	"systemPrompt",
	"sessions",
	"userScope"
];
const profileSchema = z.object({
	id: z.string().min(1).max(128),
	name: z.string().min(1).max(128),
	content: z.string().max(8e3),
	enabled: z.boolean().default(true),
	scope: z.union([
		"global",
		"workspace",
		"session"
	]),
	workspaceId: z.string().min(1).max(128),
	sessionId: z.string().min(1).max(128),
	updatedAt: z.number().default(0)
});
const Config = z.object({
	version: z.number().step(1).default(1),
	enabled: z.boolean().default(false),
	activeProfileId: z.string().min(1).max(128),
	profiles: z.array(profileSchema).default([])
});
const DEFAULT_CONFIG = {
	version: 1,
	enabled: false,
	profiles: []
};
function workspaceForSession(registry, sessionId) {
	try {
		return registry?.list().find((workspace) => workspace.sessionIds.includes(sessionId))?.id;
	} catch {
		return;
	}
}
function requestSource(userScope) {
	try {
		const source = userScope.currentScope?.()?.source;
		if (source === void 0 || source === "desktop") return "desktop";
		if (source === "remote") return "remote";
		return;
	} catch {
		return;
	}
}
function localOwnerMayUsePrompt(userScope, sessionId, capturedSource) {
	try {
		if (userScope.availabilityState() !== "ready") return false;
		if (requestSource(userScope) !== "desktop" || capturedSource === "remote") return false;
		if (sessionId === void 0) return true;
		const owner = userScope.snapshot().sessions.find((item) => item.sessionId === sessionId);
		return owner !== void 0 && owner.createdByPrincipalId === userScope.localPrincipal().id;
	} catch {
		return false;
	}
}
function promptContext(assemblyScope, sessions, registry) {
	if (assemblyScope === void 0) return {};
	const session = sessions.get(assemblyScope);
	if (session === void 0) return void 0;
	return {
		sessionId: session.sessionId,
		workspaceId: workspaceForSession(registry, session.sessionId)
	};
}
/** Register the owner-safe Personal Prompt section and variable. */
function apply(ctx, initialConfig = DEFAULT_CONFIG) {
	let source = () => initialConfig;
	let workspaceRegistry;
	const sessionScopes = /* @__PURE__ */ new Map();
	const userScope = ctx.userScope;
	ctx.inject(["workspaceRegistry"], (workspaceCtx) => {
		workspaceRegistry = workspaceCtx.workspaceRegistry;
		return () => {
			workspaceRegistry = void 0;
		};
	});
	ctx.on("session/created", function(session) {
		const key = carrierKeyOf(this);
		if (key === void 0) return;
		const source = requestSource(userScope);
		if (source === void 0) {
			sessionScopes.delete(key);
			return;
		}
		sessionScopes.set(key, {
			sessionId: String(session.id),
			source
		});
	});
	ctx.on("session/disposed", function(session) {
		const key = carrierKeyOf(this);
		if (key !== void 0 && sessionScopes.get(key)?.sessionId === String(session.id)) sessionScopes.delete(key);
	});
	const resolve = (scope) => {
		try {
			const context = promptContext(scope, sessionScopes, workspaceRegistry);
			const capturedSource = scope === void 0 ? void 0 : sessionScopes.get(scope)?.source;
			if (context === void 0 || !localOwnerMayUsePrompt(userScope, context.sessionId, capturedSource)) return void 0;
			return resolveEffectivePrompt(normalizePersonalPrompt(source()), context);
		} catch {
			return;
		}
	};
	installSettingsSection(ctx, settingsNamespace(PERSONAL_PROMPT_SETTINGS_NAMESPACE), Config, initialConfig, {
		setSource: (next) => {
			source = next;
		},
		onChange: () => {},
		validate: (value) => {
			assertPersonalPrompt(value);
		}
	});
	ctx.effect(() => {
		const disposeSection = ctx.systemPrompt.section({
			name: PERSONAL_PROMPT_SECTION_NAME,
			order: 50,
			text: (context) => resolve(context.scope) === void 0 ? "" : PERSONAL_PROMPT_SECTION_TEMPLATE
		});
		const disposeVariable = ctx.systemPrompt.variable(PERSONAL_PROMPT_VARIABLE, (context) => promptVariableValue(resolve(context.scope)));
		return () => {
			disposeVariable();
			disposeSection();
		};
	}, "personal-prompt: system prompt contribution");
}
//#endregion
export { Config, DEFAULT_PERSONAL_PROMPT, InvalidPersonalPromptError, MAX_ASSEMBLED_PROMPT_LENGTH, MAX_PROMPT_CONTENT_LENGTH, MAX_PROMPT_ID_LENGTH, MAX_PROMPT_NAME_LENGTH, MAX_PROMPT_PROFILES, PERSONAL_PROMPT_ORDER, PERSONAL_PROMPT_SECTION_NAME, PERSONAL_PROMPT_SECTION_TEMPLATE, PERSONAL_PROMPT_SETTINGS_NAMESPACE, PERSONAL_PROMPT_VARIABLE, apply, assertPersonalPrompt, inject, name, normalizePersonalPrompt, promptVariableValue, removePromptProfile, renderPromptProfile, resolveEffectivePrompt, setActivePromptProfile, upsertPromptProfile };
