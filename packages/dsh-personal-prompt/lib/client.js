window.__ModuleLoader__.load({
	id: "@ningbainb/dsh-personal-prompt",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/core/config.ts
		const PERSONAL_PROMPT_SETTINGS_NAMESPACE = "personal-prompt";
		const DEFAULT_PERSONAL_PROMPT = {
			version: 1,
			enabled: false,
			profiles: []
		};
		const MAX_ASSEMBLED_PROMPT_LENGTH = 8e3;
		const SAFE_ID = /^(?!\.{1,2}$)[^\\/\u0000\s]{1,128}$/u;
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
		function safePromptContent(content) {
			return content.replaceAll("</user_preferences>", "<\\/user_preferences>");
		}
		/** Render the model-visible data boundary while keeping the final text <= 8,000 chars. */
		function renderPromptProfile(profile) {
			if (profile === void 0 || profile.content.length === 0) return "";
			const budget = Math.max(0, MAX_ASSEMBLED_PROMPT_LENGTH - PROMPT_PREFIX.length - 20);
			return `${PROMPT_PREFIX}${safePromptContent(profile.content).slice(0, budget)}${PROMPT_SUFFIX}`;
		}
		`${PROMPT_PREFIX}`;
		//#endregion
		//#region \0dsh-css:packages/dsh-personal-prompt/src/client/personal-prompt.module.css.mjs
		const css = ".jlQrGq_card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#ffffff14);background:var(--dsw-alias-bg-layer-3,#ffffff0a);width:100%;color:var(--dsw-alias-label-primary,#fff);border-radius:12px;flex-direction:column;gap:16px;padding:16px 20px;font-family:inherit;font-size:13px;line-height:1.5;transition:border-color .16s,background-color .16s;display:flex}.jlQrGq_card:hover{border-color:var(--dsw-alias-label-dimmed,#ffffff29)}.jlQrGq_header,.jlQrGq_profileHeader{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.jlQrGq_title{color:var(--dsw-alias-label-primary,#fff);margin:0;font-size:16px;font-weight:600;line-height:1.4}.jlQrGq_description{color:var(--dsw-alias-label-tertiary,#81858c);margin:4px 0 0;font-size:13px;line-height:1.5}.jlQrGq_notice{background:var(--dsw-alias-bg-module-platform,#ffffff08);border:1px solid var(--dsw-alias-border-l2,#ffffff0f);color:var(--dsw-alias-label-tertiary,#81858c);border-radius:8px;margin:0;padding:10px 14px;font-size:12px;line-height:1.5}.jlQrGq_muted{color:var(--dsw-alias-label-tertiary,#81858c);margin:4px 0;font-size:12px}.jlQrGq_badge,.jlQrGq_dirty{white-space:nowrap;border-radius:999px;flex:none;align-items:center;padding:2px 8px;font-size:11px;font-weight:500;line-height:16px;display:inline-flex}.jlQrGq_badge{background:var(--dsw-alias-bg-module-platform,#9ca3af26);color:var(--dsw-alias-label-secondary,#9ca3af);border:1px solid var(--dsw-alias-border-l2,#9ca3af40)}.jlQrGq_dirty{background:var(--dsw-alias-bg-module-warning-subtle,#f59e0b26);color:var(--dsw-alias-label-warning,#f59e0b);border:1px solid #f59e0b4d}.jlQrGq_toolbar{background:var(--dsw-alias-bg-layer-2,#ffffff05);border:1px solid var(--dsw-alias-border-l2,#ffffff0f);border-radius:8px;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;display:flex}.jlQrGq_toggle{color:var(--dsw-alias-label-primary,#fff);cursor:pointer;user-select:none;align-items:center;gap:8px;font-size:13px;font-weight:500;display:inline-flex}.jlQrGq_toggle input[type=checkbox]{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary,#3370ff);cursor:pointer;margin:0}.jlQrGq_activeSelect{border:1px solid var(--dsw-alias-border-l2,#ffffff1a);background:var(--dsw-alias-bg-layer-1,#00000026);height:32px;color:var(--dsw-alias-label-primary,#fff);font:inherit;cursor:pointer;border-radius:8px;padding:0 10px;font-size:12px}.jlQrGq_activeSelect:focus{border-color:var(--dsw-alias-brand-primary,#3370ff);box-shadow:0 0 0 2px var(--dsw-alias-border-l3,#3370ff40);outline:none}.jlQrGq_profileHeader{border-top:1px solid var(--dsw-alias-border-l2,#ffffff14);padding-top:14px}.jlQrGq_profileHeader strong{color:var(--dsw-alias-label-primary,#fff);font-size:13px;font-weight:600}.jlQrGq_profileList{background:var(--dsw-alias-bg-layer-1,#0000001f);border:1px solid var(--dsw-alias-border-l2,#ffffff14);border-radius:8px;flex-direction:column;gap:3px;max-height:200px;padding:4px;display:flex;overflow-y:auto}.jlQrGq_profileButton{appearance:none;box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary,inherit);cursor:pointer;text-align:left;font:inherit;background:0 0;border:1px solid #0000;border-radius:6px;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;font-size:13px;transition:background-color .12s,border-color .12s;display:flex}.jlQrGq_profileButton:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff0f)}.jlQrGq_profileSelected{background:var(--dsw-alias-bg-module-platform,#3370ff1a);border-color:var(--dsw-alias-brand-primary,#3370ff)}.jlQrGq_profileMain{flex:1;min-width:0}.jlQrGq_profileName{color:var(--dsw-alias-label-primary,#fff);text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;display:block;overflow:hidden}.jlQrGq_profileMeta{color:var(--dsw-alias-label-tertiary,#81858c);margin-top:2px;font-size:11px;display:block}.jlQrGq_profileState{color:var(--dsw-alias-label-secondary,#9ca3af);white-space:nowrap;background:var(--dsw-alias-bg-module-platform,#ffffff0a);border-radius:4px;flex:none;padding:2px 6px;font-size:11px;font-weight:500}.jlQrGq_editor{background:var(--dsw-alias-bg-layer-2,#ffffff05);border:1px solid var(--dsw-alias-border-l2,#ffffff14);border-radius:10px;flex-direction:column;gap:12px;margin-top:6px;padding:16px;display:flex}.jlQrGq_field{flex-direction:column;gap:5px;display:flex}.jlQrGq_fieldLabel{color:var(--dsw-alias-label-secondary,#9ca3af);font-size:12px;font-weight:500;line-height:1.4}.jlQrGq_field input,.jlQrGq_field select,.jlQrGq_field textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#ffffff1a);background:var(--dsw-alias-bg-layer-1,#00000026);width:100%;min-width:0;height:34px;color:var(--dsw-alias-label-primary,#fff);font:inherit;border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;transition:border-color .16s,box-shadow .16s}.jlQrGq_field select{cursor:pointer}.jlQrGq_field input:focus,.jlQrGq_field select:focus,.jlQrGq_field textarea:focus{border-color:var(--dsw-alias-brand-primary,#3370ff);box-shadow:0 0 0 2px var(--dsw-alias-border-l3,#3370ff40);outline:none}.jlQrGq_field input::placeholder,.jlQrGq_field textarea::placeholder{color:var(--dsw-alias-label-dimmed,#6b7280)}.jlQrGq_field textarea{resize:vertical;height:auto;min-height:140px;padding:10px 12px}.jlQrGq_field input:disabled,.jlQrGq_field select:disabled,.jlQrGq_field textarea:disabled{opacity:.5;cursor:not-allowed}.jlQrGq_counter{color:var(--dsw-alias-label-dimmed,#6b7280);text-align:right;font-variant-numeric:tabular-nums;margin-top:-2px;font-size:11px}.jlQrGq_preview{border:1px solid var(--dsw-alias-border-l2,#ffffff14);background:var(--dsw-alias-bg-layer-1,#0003);color:var(--dsw-alias-label-secondary,#9ca3af);font-family:var(--ds-font-family-code,ui-monospace, SFMono-Regular, Consolas, monospace);white-space:pre-wrap;word-break:break-all;border-radius:8px;max-height:200px;margin:6px 0 0;padding:12px;font-size:12px;line-height:1.5;overflow-y:auto}.jlQrGq_button,.jlQrGq_primary,.jlQrGq_danger{appearance:none;box-sizing:border-box;height:32px;font:inherit;cursor:pointer;white-space:nowrap;border-radius:8px;justify-content:center;align-items:center;padding:0 14px;font-size:13px;font-weight:500;transition:all .16s;display:inline-flex}.jlQrGq_button{background:var(--dsw-alias-bg-layer-2,transparent);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-primary,#fff)}.jlQrGq_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff0f);border-color:var(--dsw-alias-label-dimmed,#fff3)}.jlQrGq_primary{background:var(--dsw-alias-brand-primary,#3370ff);color:#fff;border:1px solid #0000}.jlQrGq_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#2860db)}.jlQrGq_danger{border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-error,#ef4444);background:0 0}.jlQrGq_danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,#ef44441a);border-color:var(--dsw-alias-label-error,#ef4444)}.jlQrGq_button:disabled,.jlQrGq_primary:disabled,.jlQrGq_danger:disabled{opacity:.45;cursor:not-allowed}.jlQrGq_error{background:var(--dsw-alias-interactive-bg-hover-danger,#ef44441a);border:1px solid var(--dsw-alias-label-error,#ef44444d);color:var(--dsw-alias-label-error,#ef4444);border-radius:8px;margin:0;padding:8px 12px;font-size:12px;line-height:1.5}.jlQrGq_footer,.jlQrGq_actions{justify-content:flex-end;align-items:center;gap:8px;margin-top:4px;display:flex}@media (width<=520px){.jlQrGq_header,.jlQrGq_profileHeader{flex-wrap:wrap}.jlQrGq_toolbar{flex-direction:column;align-items:stretch}.jlQrGq_footer,.jlQrGq_actions{flex-wrap:wrap}}";
		const tagId = "@ningbainb/dsh-personal-prompt/personal-prompt.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ningbainb/dsh-personal-prompt";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var personal_prompt_module_css_default = {
			"actions": "jlQrGq_actions",
			"activeSelect": "jlQrGq_activeSelect",
			"badge": "jlQrGq_badge",
			"button": "jlQrGq_button",
			"card": "jlQrGq_card",
			"counter": "jlQrGq_counter",
			"danger": "jlQrGq_danger",
			"description": "jlQrGq_description",
			"dirty": "jlQrGq_dirty",
			"editor": "jlQrGq_editor",
			"error": "jlQrGq_error",
			"field": "jlQrGq_field",
			"fieldLabel": "jlQrGq_fieldLabel",
			"footer": "jlQrGq_footer",
			"header": "jlQrGq_header",
			"muted": "jlQrGq_muted",
			"notice": "jlQrGq_notice",
			"preview": "jlQrGq_preview",
			"primary": "jlQrGq_primary",
			"profileButton": "jlQrGq_profileButton",
			"profileHeader": "jlQrGq_profileHeader",
			"profileList": "jlQrGq_profileList",
			"profileMain": "jlQrGq_profileMain",
			"profileMeta": "jlQrGq_profileMeta",
			"profileName": "jlQrGq_profileName",
			"profileSelected": "jlQrGq_profileSelected",
			"profileState": "jlQrGq_profileState",
			"title": "jlQrGq_title",
			"toggle": "jlQrGq_toggle",
			"toolbar": "jlQrGq_toolbar"
		};
		//#endregion
		//#region src/client/PersonalPromptCard.tsx
		function workspaceIdOf(item) {
			return item.workspaceId ?? item.id;
		}
		function toDraft(profile) {
			return {
				id: profile.id,
				name: profile.name,
				content: profile.content,
				enabled: profile.enabled,
				scope: profile.scope,
				workspaceId: profile.workspaceId ?? "",
				sessionId: profile.sessionId ?? "",
				updatedAt: profile.updatedAt
			};
		}
		function newProfile() {
			return {
				id: `prompt-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
				name: "",
				content: "",
				enabled: true,
				scope: "global",
				workspaceId: "",
				sessionId: "",
				updatedAt: Date.now()
			};
		}
		function profileFromDraft(draft) {
			return {
				id: draft.id.trim(),
				name: draft.name,
				content: draft.content,
				enabled: draft.enabled,
				scope: draft.scope,
				...draft.scope === "workspace" ? { workspaceId: draft.workspaceId.trim() } : {},
				...draft.scope === "session" ? { sessionId: draft.sessionId.trim() } : {},
				updatedAt: Date.now()
			};
		}
		function errorText(_reason, fallback) {
			return fallback;
		}
		function editableProfiles(config) {
			return config.profiles.filter((profile) => profile.scope !== "session");
		}
		function PersonalPromptCard(props) {
			const { config, settingsScope, t } = props;
			const dock = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("desktop-dock-setting");
			const [editorOpen, setEditorOpen] = (0, react.useState)(!dock);
			const settingsSnapshot = (0, react.useSyncExternalStore)((listener) => settingsScope.subscribe(listener), () => settingsScope.getSnapshot(), () => settingsScope.getSnapshot());
			const liveConfig = (0, react.useMemo)(() => {
				try {
					return normalizePersonalPrompt(settingsSnapshot.value ?? config);
				} catch {
					return {
						...DEFAULT_PERSONAL_PROMPT,
						profiles: []
					};
				}
			}, [config, settingsSnapshot.value]);
			const [draftConfig, setDraftConfig] = (0, react.useState)(liveConfig);
			const initialProfile = liveConfig.profiles.find((profile) => profile.scope !== "session");
			const [selectedId, setSelectedId] = (0, react.useState)(initialProfile?.id);
			const [editor, setEditor] = (0, react.useState)(() => initialProfile === void 0 ? void 0 : toDraft(initialProfile));
			const [editorDirty, setEditorDirty] = (0, react.useState)(false);
			const [configDirty, setConfigDirty] = (0, react.useState)(false);
			const [conflict, setConflict] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [saved, setSaved] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const lastRevision = (0, react.useRef)(settingsSnapshot.revision);
			const useWorkspaces = props.useWorkspaces;
			const workspaceItems = (useWorkspaces === void 0 ? { items: [] } : useWorkspaces((state) => state)).items;
			const visibleProfiles = (0, react.useMemo)(() => editableProfiles(draftConfig), [draftConfig]);
			(0, react.useEffect)(() => {
				if (lastRevision.current !== settingsSnapshot.revision) {
					if (editorDirty || configDirty) setConflict(true);
					lastRevision.current = settingsSnapshot.revision;
				}
			}, [
				configDirty,
				editorDirty,
				settingsSnapshot.revision
			]);
			(0, react.useEffect)(() => {
				if (editorDirty || configDirty) return;
				setDraftConfig(liveConfig);
				const next = selectedId === void 0 ? visibleProfiles[0] : visibleProfiles.find((profile) => profile.id === selectedId);
				if (next === void 0) {
					setSelectedId(visibleProfiles[0]?.id);
					setEditor(visibleProfiles[0] === void 0 ? void 0 : toDraft(visibleProfiles[0]));
				} else setEditor(toDraft(next));
			}, [
				configDirty,
				editorDirty,
				liveConfig,
				selectedId,
				visibleProfiles
			]);
			const listedProfiles = (0, react.useMemo)(() => {
				if (editor === void 0 || editor.scope === "session" || visibleProfiles.some((profile) => profile.id === editor.id)) return visibleProfiles;
				return [...visibleProfiles, profileFromDraft(editor)];
			}, [editor, visibleProfiles]);
			const selectProfile = (id) => {
				setEditorOpen(true);
				const profile = visibleProfiles.find((item) => item.id === id);
				if (profile === void 0) return;
				setSelectedId(id);
				setEditor(toDraft(profile));
				setEditorDirty(false);
				setError(null);
			};
			const editEditor = (patch) => {
				setEditor((current) => current === void 0 ? current : {
					...current,
					...patch
				});
				setEditorDirty(true);
				setSaved(false);
				setError(null);
			};
			const persist = async (next) => {
				if (!settingsSnapshot.writable || saving) return false;
				setSaving(true);
				setSaved(false);
				setError(null);
				try {
					await settingsScope.set("profiles", next.profiles);
					await settingsScope.set("enabled", next.enabled);
					if (next.activeProfileId === void 0) await settingsScope.unset("activeProfileId");
					else await settingsScope.set("activeProfileId", next.activeProfileId);
					setDraftConfig(next);
					setConfigDirty(false);
					setEditorDirty(false);
					setConflict(false);
					setSaved(true);
					return true;
				} catch (reason) {
					setError(errorText(reason, t("error.save")));
					return false;
				} finally {
					setSaving(false);
				}
			};
			const save = () => {
				if (editor === void 0 && !configDirty) return;
				try {
					const next = editorDirty && editor !== void 0 ? upsertPromptProfile(draftConfig, profileFromDraft(editor)) : draftConfig;
					persist(next);
				} catch (reason) {
					setError(errorText(reason, t("error.invalid")));
				}
			};
			const create = () => {
				setEditorOpen(true);
				const next = newProfile();
				setSelectedId(next.id);
				setEditor(next);
				setEditorDirty(true);
				setError(null);
				setSaved(false);
			};
			const remove = () => {
				if (selectedId === void 0) return;
				if (!draftConfig.profiles.some((profile) => profile.id === selectedId)) {
					setSelectedId(visibleProfiles[0]?.id);
					setEditor(visibleProfiles[0] === void 0 ? void 0 : toDraft(visibleProfiles[0]));
					setEditorDirty(false);
					return;
				}
				const next = removePromptProfile(draftConfig, selectedId);
				const nextVisible = editableProfiles(next);
				setSelectedId(nextVisible[0]?.id);
				setEditor(nextVisible[0] === void 0 ? void 0 : toDraft(nextVisible[0]));
				setDraftConfig(next);
				setConfigDirty(true);
				setEditorDirty(false);
				setSaved(false);
			};
			const reload = () => {
				setDraftConfig(liveConfig);
				const next = liveConfig.profiles.find((profile) => profile.scope !== "session");
				setSelectedId(next?.id);
				setEditor(next === void 0 ? void 0 : toDraft(next));
				setEditorDirty(false);
				setConfigDirty(false);
				setConflict(false);
				setError(null);
			};
			const activeProfile = editor === void 0 ? void 0 : (() => {
				try {
					return profileFromDraft(editor);
				} catch {
					return;
				}
			})();
			const preview = draftConfig.enabled && activeProfile?.enabled === true ? renderPromptProfile(activeProfile) : "";
			const dirty = editorDirty || configDirty;
			const readOnlySession = editor?.scope === "session";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: personal_prompt_module_css_default.card,
				"data-personal-prompt-card": "true",
				"data-dock-dirty": dirty,
				"data-dock-owner": "personal-prompt",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: personal_prompt_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: personal_prompt_module_css_default.title,
							children: t("settings.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: personal_prompt_module_css_default.description,
							children: t("settings.description")
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: dirty ? personal_prompt_module_css_default.dirty : personal_prompt_module_css_default.badge,
							children: dirty ? t("settings.unsaved") : saved ? t("settings.saved") : t("settings.ready")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: personal_prompt_module_css_default.notice,
						children: t("settings.ownerNotice")
					}),
					!settingsSnapshot.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: personal_prompt_module_css_default.notice,
						role: "status",
						children: t("settings.readonly")
					}),
					settingsSnapshot.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: personal_prompt_module_css_default.muted,
						role: "status",
						children: t("settings.loading")
					}),
					conflict && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: personal_prompt_module_css_default.error,
						role: "alert",
						children: t("settings.conflict")
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: personal_prompt_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: personal_prompt_module_css_default.toolbar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: personal_prompt_module_css_default.toggle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: draftConfig.enabled,
								disabled: !settingsSnapshot.writable,
								onChange: (event) => {
									setDraftConfig((current) => ({
										...current,
										enabled: event.target.checked
									}));
									setConfigDirty(true);
									setSaved(false);
								}
							}), t("settings.enabled")]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: personal_prompt_module_css_default.toggle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.active") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: personal_prompt_module_css_default.activeSelect,
								value: draftConfig.activeProfileId ?? "",
								disabled: !settingsSnapshot.writable,
								onChange: (event) => {
									const next = setActivePromptProfile(draftConfig, event.target.value || void 0);
									setDraftConfig(next);
									setConfigDirty(true);
									setSaved(false);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("settings.none")
								}), visibleProfiles.map((profile) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: profile.id,
									children: profile.name
								}, profile.id))]
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: personal_prompt_module_css_default.profileHeader,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("settings.profiles") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: personal_prompt_module_css_default.button,
								disabled: !settingsSnapshot.writable || saving,
								onClick: create,
								children: t("settings.new")
							})]
						}),
						listedProfiles.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: personal_prompt_module_css_default.muted,
							children: t("settings.noProfiles")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: personal_prompt_module_css_default.profileList,
							role: "list",
							children: listedProfiles.map((profile) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "listitem",
								className: `${personal_prompt_module_css_default.profileButton} ${profile.id === selectedId ? personal_prompt_module_css_default.profileSelected : ""}`,
								onClick: () => selectProfile(profile.id),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: personal_prompt_module_css_default.profileMain,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: personal_prompt_module_css_default.profileName,
										children: profile.name || profile.id
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: personal_prompt_module_css_default.profileMeta,
										children: profile.scope === "global" ? t("settings.global") : profile.scope === "workspace" ? `${t("settings.workspace")} · ${profile.workspaceId}` : t("settings.session")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: personal_prompt_module_css_default.profileState,
									children: profile.enabled ? t("settings.enable") : t("settings.disable")
								})]
							}, profile.id))
						})
					] }),
					editor !== void 0 && editor.scope !== "session" && editorOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: personal_prompt_module_css_default.editor,
						"aria-label": t("settings.title"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: personal_prompt_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: personal_prompt_module_css_default.fieldLabel,
									children: t("settings.profileName")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									value: editor.name,
									maxLength: 128,
									disabled: readOnlySession,
									placeholder: t("settings.profileNamePlaceholder"),
									onChange: (event) => editEditor({ name: event.target.value })
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: personal_prompt_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: personal_prompt_module_css_default.fieldLabel,
									children: t("settings.scope")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: editor.scope,
									disabled: readOnlySession,
									onChange: (event) => {
										const scope = event.target.value;
										editEditor({
											scope,
											workspaceId: scope === "workspace" ? editor.workspaceId : "",
											sessionId: scope === "session" ? editor.sessionId : ""
										});
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "global",
											children: t("settings.global")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "workspace",
											children: t("settings.workspace")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "session",
											disabled: true,
											children: t("settings.session")
										})
									]
								})]
							}),
							editor.scope === "workspace" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: personal_prompt_module_css_default.field,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: personal_prompt_module_css_default.fieldLabel,
										children: t("settings.workspaceId")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										list: "personal-prompt-workspaces",
										value: editor.workspaceId,
										maxLength: 128,
										disabled: readOnlySession,
										placeholder: t("settings.workspaceIdPlaceholder"),
										onChange: (event) => editEditor({ workspaceId: event.target.value })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("datalist", {
										id: "personal-prompt-workspaces",
										children: workspaceItems.map((item) => {
											const id = workspaceIdOf(item);
											return id === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: id,
												children: item.title ?? item.path ?? id
											}, id);
										})
									})
								]
							}),
							readOnlySession && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: personal_prompt_module_css_default.notice,
								children: t("settings.sessionReadonly")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: personal_prompt_module_css_default.toggle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: editor.enabled,
									disabled: readOnlySession,
									onChange: (event) => editEditor({ enabled: event.target.checked })
								}), editor.enabled ? t("settings.enable") : t("settings.disable")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: personal_prompt_module_css_default.field,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: personal_prompt_module_css_default.fieldLabel,
										children: t("settings.content")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										value: editor.content,
										maxLength: 8e3,
										disabled: readOnlySession,
										placeholder: t("settings.contentPlaceholder"),
										onChange: (event) => editEditor({ content: event.target.value })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: personal_prompt_module_css_default.counter,
										children: [
											editor.content.length,
											" / ",
											8e3
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: personal_prompt_module_css_default.fieldLabel,
								children: t("settings.preview")
							}), preview ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
								className: personal_prompt_module_css_default.preview,
								children: preview
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: personal_prompt_module_css_default.muted,
								children: t("settings.previewEmpty")
							})] }),
							!dock && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
								className: personal_prompt_module_css_default.footer,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: personal_prompt_module_css_default.danger,
										disabled: !settingsSnapshot.writable || saving,
										onClick: remove,
										children: t("settings.delete")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: personal_prompt_module_css_default.button,
										disabled: !dirty || saving,
										onClick: reload,
										children: t("settings.discard")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: personal_prompt_module_css_default.primary,
										disabled: !dirty || saving || readOnlySession || !settingsSnapshot.writable,
										onClick: save,
										children: saving ? t("settings.loading") : t("settings.save")
									})
								]
							}) })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: personal_prompt_module_css_default.actions,
						"data-dock-save-bar": dock || void 0,
						children: [
							dock && editorOpen && editor !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: personal_prompt_module_css_default.danger,
								disabled: !settingsSnapshot.writable || saving,
								onClick: remove,
								children: t("settings.delete")
							}),
							dock && dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: personal_prompt_module_css_default.button,
								disabled: saving,
								onClick: reload,
								children: t("settings.discard")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: personal_prompt_module_css_default.button,
								disabled: saving,
								onClick: reload,
								children: t("settings.reload")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: personal_prompt_module_css_default.primary,
								"data-dock-save": "true",
								disabled: !dirty || saving || !settingsSnapshot.writable,
								onClick: save,
								children: saving ? t("settings.saving") : t("settings.save")
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			"settings.ready": "无待保存修改",
			"settings.saving": "保存中…",
			"settings.title": "个性化 Prompt",
			"settings.description": "为当前本机 Profile 管理全局或工作区 Prompt。它会作为请求上下文发送给当前模型供应商。",
			"settings.enabled": "启用个性化 Prompt",
			"settings.active": "默认生效 Profile",
			"settings.none": "不指定（按作用域优先级选择）",
			"settings.profiles": "Prompt Profiles",
			"settings.new": "新建 Profile",
			"settings.profileName": "名称",
			"settings.profileNamePlaceholder": "例如：简洁代码审查",
			"settings.scope": "作用域",
			"settings.global": "全局",
			"settings.workspace": "工作区",
			"settings.session": "会话（预留）",
			"settings.workspaceId": "工作区",
			"settings.workspaceIdPlaceholder": "选择或输入 workspace ID",
			"settings.content": "内容",
			"settings.contentPlaceholder": "写下你希望模型长期遵循的工作偏好…",
			"settings.preview": "预览（最终会包裹在 user_preferences 数据边界中）",
			"settings.previewEmpty": "启用并保存后，这里会显示模型可见的 Prompt 预览。",
			"settings.save": "保存",
			"settings.reload": "重新加载",
			"settings.delete": "删除",
			"settings.discard": "放弃修改",
			"settings.enable": "启用",
			"settings.disable": "停用",
			"settings.readonly": "当前设置不可写；远程/只读模式不会保存 Prompt。",
			"settings.unsaved": "有未保存修改",
			"settings.saved": "已保存",
			"settings.conflict": "设置在其他窗口发生变化，请重新加载后再编辑。",
			"settings.loading": "正在读取设置…",
			"settings.noProfiles": "还没有 Prompt Profile。",
			"settings.sessionReadonly": "Session scope 已保留在数据契约中，第一阶段 UI 不允许编辑。",
			"settings.ownerNotice": "Prompt 只对已确认归属的本地会话注入；无法确认身份或作用域时自动不注入。",
			"error.invalid": "Profile 内容或作用域无效，请检查名称、长度和 workspace ID。",
			"error.save": "保存失败，请重试。",
			"action.close": "关闭"
		};
		const en = {
			"settings.ready": "No unsaved changes",
			"settings.saving": "Saving…",
			"settings.title": "Personal Prompt",
			"settings.description": "Manage global or workspace Prompt Profiles for this local Profile. The selected content is sent to the current model provider as request context.",
			"settings.enabled": "Enable Personal Prompt",
			"settings.active": "Default active profile",
			"settings.none": "None (use scope precedence)",
			"settings.profiles": "Prompt Profiles",
			"settings.new": "New Profile",
			"settings.profileName": "Name",
			"settings.profileNamePlaceholder": "For example: concise code review",
			"settings.scope": "Scope",
			"settings.global": "Global",
			"settings.workspace": "Workspace",
			"settings.session": "Session (reserved)",
			"settings.workspaceId": "Workspace",
			"settings.workspaceIdPlaceholder": "Choose or enter a workspace ID",
			"settings.content": "Content",
			"settings.contentPlaceholder": "Write the working preferences you want the model to follow…",
			"settings.preview": "Preview (wrapped in the user_preferences data boundary)",
			"settings.previewEmpty": "A model-visible Prompt preview appears here after an enabled profile is saved.",
			"settings.save": "Save",
			"settings.reload": "Reload",
			"settings.delete": "Delete",
			"settings.discard": "Discard changes",
			"settings.enable": "Enable",
			"settings.disable": "Disable",
			"settings.readonly": "Settings are read-only; remote/read-only mode will not save Prompt content.",
			"settings.unsaved": "Unsaved changes",
			"settings.saved": "Saved",
			"settings.conflict": "Settings changed elsewhere. Reload before editing again.",
			"settings.loading": "Loading settings…",
			"settings.noProfiles": "No Prompt Profiles yet.",
			"settings.sessionReadonly": "Session scope remains in the storage contract; the first UI does not edit it.",
			"settings.ownerNotice": "Prompt is injected only for local sessions with confirmed ownership; unknown identity or scope means no injection.",
			"error.invalid": "The profile scope or content is invalid. Check its name, length, and workspace ID.",
			"error.save": "Save failed. Try again.",
			"action.close": "Close"
		};
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"locale",
			"settingsScope"
		];
		function settingsBinder(ctx) {
			const compatibility = ctx.get("webUiSettings");
			if (compatibility !== void 0 && typeof compatibility.bind === "function") return compatibility;
			return ctx.settingsScope;
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("personal-prompt", {
				zh,
				en
			}), "personal-prompt: dictionaries");
			const settingsScope = settingsBinder(ctx).bind({
				namespace: PERSONAL_PROMPT_SETTINGS_NAMESPACE,
				decode: (value) => {
					try {
						return normalizePersonalPrompt(value);
					} catch {
						return;
					}
				}
			});
			ctx.inject(["slots"], (scope) => {
				scope.slots.inject("web-ui.plugin.item", () => scope.slots.register({
					name: "web-ui.plugin.item",
					id: "personal-prompt",
					order: 117,
					locale: "personal-prompt",
					inject: () => ({
						config: normalizePersonalPrompt(settingsScope.getSnapshot().value),
						settingsScope
					})
				}, PersonalPromptCard));
			});
		}
		//#endregion
		exports.PersonalPromptCard = PersonalPromptCard;
		exports.apply = apply;
		exports.en = en;
		exports.inject = inject;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map