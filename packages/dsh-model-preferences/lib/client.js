window.__ModuleLoader__.load({
	id: "@linxin666/dsh-client-ui-model-preferences",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/core/config.ts
		/** Settings namespace registered by the Host half. */
		const MODEL_PREFERENCES_SETTINGS_NAMESPACE = "model-preferences";
		const DEFAULT_MODEL_PREFERENCES = {
			version: 1,
			pinnedModels: [],
			providerOrder: [],
			disabledProviders: [],
			recentModels: []
		};
		var InvalidModelPreferencesError = class extends Error {
			constructor(message) {
				super(message);
				this.name = "InvalidModelPreferencesError";
			}
		};
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function isBoundedString(value) {
			return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value && !/\s/u.test(value);
		}
		function keyOf(value) {
			if (!isRecord(value) || !isBoundedString(value.provider) || !isBoundedString(value.model)) return void 0;
			return {
				provider: value.provider,
				model: value.model
			};
		}
		/** Compare two structured identities. */
		function sameModelKey(left, right) {
			return left !== void 0 && right !== void 0 && left.provider === right.provider && left.model === right.model;
		}
		function uniqueModels(values, limit) {
			const result = [];
			for (const value of values) {
				const key = keyOf(value);
				if (key === void 0 || result.some((candidate) => sameModelKey(candidate, key))) continue;
				result.push(key);
				if (result.length >= limit) break;
			}
			return result;
		}
		function uniqueStrings(values) {
			const result = [];
			for (const value of values) {
				if (!isBoundedString(value) || result.includes(value)) continue;
				result.push(value);
			}
			return result;
		}
		/** Normalize a value received from a settings scope or an older profile. */
		function normalizeModelPreferences(value) {
			if (value === void 0) return { ...DEFAULT_MODEL_PREFERENCES };
			if (!isRecord(value)) throw new InvalidModelPreferencesError("model-preferences must be an object");
			if (value.version !== void 0 && value.version !== 1) throw new InvalidModelPreferencesError("unsupported model-preferences version");
			return {
				version: 1,
				pinnedModels: uniqueModels(Array.isArray(value.pinnedModels) ? value.pinnedModels : [], 2),
				providerOrder: uniqueStrings(Array.isArray(value.providerOrder) ? value.providerOrder : []),
				disabledProviders: uniqueStrings(Array.isArray(value.disabledProviders) ? value.disabledProviders : []),
				recentModels: uniqueModels(Array.isArray(value.recentModels) ? value.recentModels : [], 8)
			};
		}
		/** Record a successful selection without disturbing pinned/provider settings. */
		function recordRecentModel(config, selection) {
			const normalized = normalizeModelPreferences(config);
			return {
				...normalized,
				recentModels: [selection, ...normalized.recentModels.filter((candidate) => !sameModelKey(candidate, selection))].slice(0, 8)
			};
		}
		/** JSON-safe opaque command-row identity; decoding retains both structured fields. */
		function modelOptionId(key) {
			return JSON.stringify([key.provider, key.model]);
		}
		/** Decode a command option identity without treating a display string as authority. */
		function modelKeyFromOptionId(id) {
			try {
				const value = JSON.parse(id);
				if (!Array.isArray(value) || value.length !== 2) return void 0;
				return keyOf({
					provider: value[0],
					model: value[1]
				});
			} catch {
				return;
			}
		}
		function modelForCurrent(group, current) {
			if (current === null || current.provider !== group.id) return void 0;
			return group.models.find((model) => model.id === current.model);
		}
		function currentFallbackGroup(groups, current) {
			if (current === null) return groups.map((group) => ({
				...group,
				models: [...group.models]
			}));
			const result = groups.map((group) => ({
				...group,
				models: [...group.models]
			}));
			const group = result.find((candidate) => candidate.id === current.provider);
			if (group === void 0) {
				result.push({
					id: current.provider,
					name: current.provider,
					models: [{
						id: current.model,
						name: current.model
					}]
				});
				return result;
			}
			if (modelForCurrent(group, current) === void 0) group.models.push({
				id: current.model,
				name: current.model
			});
			return result;
		}
		/**
		* Apply pinned models, provider ordering, and disabled-provider filtering to a
		* Host catalog. Official provider/model order is preserved for all ties.
		*/
		function sortModelCatalog(snapshot, config, options = {}) {
			const normalized = normalizeModelPreferences(config);
			const includeDisabled = options.includeDisabled === true;
			const disabled = new Set(normalized.disabledProviders);
			const providerOrder = new Map(normalized.providerOrder.map((provider, index) => [provider, index]));
			const groups = currentFallbackGroup(snapshot.groups, snapshot.current).map((group, index) => ({
				group,
				index
			})).sort((left, right) => {
				const leftRank = providerOrder.get(left.group.id);
				const rightRank = providerOrder.get(right.group.id);
				if (leftRank !== void 0 && rightRank !== void 0) return leftRank - rightRank;
				if (leftRank !== void 0) return -1;
				if (rightRank !== void 0) return 1;
				return left.index - right.index;
			});
			const pinned = [];
			const visibleGroups = [];
			for (const { group } of groups) {
				const providerDisabled = disabled.has(group.id);
				const isCurrentProvider = snapshot.current?.provider === group.id;
				if (providerDisabled && !isCurrentProvider && !includeDisabled) continue;
				const modelOptions = group.models.map((model) => ({
					provider: group.id,
					providerName: group.name || group.id,
					model,
					pinned: normalized.pinnedModels.some((key) => key.provider === group.id && key.model === model.id),
					current: snapshot.current?.provider === group.id && snapshot.current.model === model.id,
					providerDisabled
				}));
				const visibleModels = providerDisabled && isCurrentProvider && !includeDisabled ? modelOptions.filter((option) => option.current) : modelOptions;
				for (const option of visibleModels) if (option.pinned && (!providerDisabled || option.current || includeDisabled)) pinned.push(option);
				visibleGroups.push({
					id: group.id,
					name: group.name || group.id,
					providerDisabled,
					models: visibleModels.filter((option) => !option.pinned)
				});
			}
			pinned.sort((left, right) => {
				return normalized.pinnedModels.findIndex((key) => key.provider === left.provider && key.model === left.model.id) - normalized.pinnedModels.findIndex((key) => key.provider === right.provider && key.model === right.model.id);
			});
			return {
				pinned,
				groups: visibleGroups,
				failures: snapshot.failures
			};
		}
		/** Flatten a projection in the same order used by both UI entry points. */
		function flattenModelOptions(catalog) {
			return [...catalog.pinned, ...catalog.groups.flatMap((group) => group.models)];
		}
		/** Build the complete Host selection, retaining the current effort only for the same route. */
		function selectionForModel(option, current, reasoningEffort) {
			const effort = reasoningEffort ?? (current?.provider === option.provider && current.model === option.model.id ? current.reasoningEffort : option.model.reasoning?.defaultEffort);
			return {
				provider: option.provider,
				model: option.model.id,
				...effort === void 0 ? {} : { reasoningEffort: effort }
			};
		}
		/** Return all catalog providers in effective settings order, including disabled rows. */
		function providerIdsInOrder(groups, config) {
			const normalized = normalizeModelPreferences(config);
			const known = [];
			for (const group of groups) if (!known.includes(group.id)) known.push(group.id);
			const result = normalized.providerOrder.filter((provider) => known.includes(provider));
			for (const provider of known) if (!result.includes(provider)) result.push(provider);
			return result;
		}
		/** Move one provider in the effective order while preserving unknown providers. */
		function moveProvider(config, provider, direction, knownProviders) {
			const order = providerIdsInOrder(knownProviders.map((id) => ({
				id,
				name: id,
				models: []
			})), config);
			const index = order.indexOf(provider);
			const target = index + direction;
			if (index < 0 || target < 0 || target >= order.length) return normalizeModelPreferences(config);
			const next = [...order];
			const [item] = next.splice(index, 1);
			next.splice(target, 0, item);
			return {
				...normalizeModelPreferences(config),
				providerOrder: next
			};
		}
		//#endregion
		//#region \0dsh-css:packages/dsh-model-preferences/src/client/model-preferences.module.css.mjs
		const css = ".c7FF3q_root{min-width:0;display:inline-flex;position:relative}.c7FF3q_trigger{box-sizing:border-box;width:auto;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary,#6b7280);cursor:pointer;font:inherit;background:0 0;border:0;border-radius:24px;outline:none;align-items:center;gap:4px;padding:0 4px 0 8px;font-size:13px;font-weight:500;line-height:20px;display:inline-flex}.c7FF3q_trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#0000000f)}.c7FF3q_trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3,#0000002e)}.c7FF3q_trigger:disabled{color:var(--dsw-alias-label-dimmed,#a1a1aa);cursor:default}.c7FF3q_triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.c7FF3q_triggerEffort{color:var(--dsw-alias-label-caption,#9ca3af);flex:none}.c7FF3q_chevron{width:14px;height:14px;color:var(--dsw-alias-label-caption,#9ca3af);flex:none;transition:transform .12s;position:relative}.c7FF3q_chevron:before{content:\"\";border-bottom:1.5px solid;border-right:1.5px solid;width:5px;height:5px;position:absolute;top:3px;left:4px;transform:rotate(45deg)}.c7FF3q_chevronOpen{transform:rotate(180deg)}.c7FF3q_menu{z-index:20;box-sizing:border-box;border:1px solid var(--dsw-alias-border-inverted,#00000029);background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));width:max-content;min-width:min(240px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3,0 12px 36px #0000002e);color:var(--dsw-alias-label-primary,#1f2329);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2,#00000029);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2,#0000003d);border-radius:12px;outline:none;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden}.c7FF3q_status,.c7FF3q_empty{color:var(--dsw-alias-label-tertiary,#81858c);padding:10px;font-size:13px;line-height:20px}.c7FF3q_error,.c7FF3q_warning{background:var(--dsw-alias-interactive-bg-hover-danger,#f53f3f14);color:var(--dsw-alias-state-error-primary,#b42318);border-radius:8px;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;padding:7px 8px;font-size:12px;line-height:18px;display:flex}.c7FF3q_warning{background:var(--dsw-alias-bg-module-platform,#0000000a);color:var(--dsw-alias-state-warn-label,#a15c00)}.c7FF3q_retry{color:inherit;cursor:pointer;font:inherit;background:0 0;border:0;flex:none;padding:0;font-weight:600}.c7FF3q_groups{min-height:0;overflow-y:auto}.c7FF3q_group+.c7FF3q_group{margin-top:4px}.c7FF3q_groupTitle{z-index:1;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-tertiary,#81858c);padding:5px 8px 3px;font-size:12px;font-weight:500;line-height:18px;position:sticky;top:0}.c7FF3q_option{box-sizing:border-box;width:auto;min-width:100%;min-height:38px;color:inherit;cursor:pointer;text-align:left;font:inherit;background:0 0;border:0;border-radius:10px;outline:none;align-items:center;gap:8px;padding:6px 8px;display:flex}.c7FF3q_option:hover:not(:disabled),.c7FF3q_option:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#0000000f)}.c7FF3q_optionCurrent{background:0 0}.c7FF3q_option:disabled{color:var(--dsw-alias-label-dimmed,#a1a1aa);cursor:default}.c7FF3q_optionCopy{flex-direction:column;flex:1;min-width:0;display:flex}.c7FF3q_modelName{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:20px;overflow:hidden}.c7FF3q_description{color:var(--dsw-alias-label-tertiary,#81858c);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;overflow:hidden}.c7FF3q_check{color:var(--dsw-alias-label-primary,#1f2329);flex:0 0 18px;place-items:center;display:grid}.c7FF3q_checkmark{border-bottom:1.5px solid;border-left:1.5px solid;width:8px;height:4px;display:block;transform:rotate(-45deg)translate(1px,-1px)}.c7FF3q_cell{box-sizing:border-box;width:auto;min-width:100%;height:40px;color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer;text-align:left;font:inherit;background:0 0;border:0;border-radius:10px;align-items:center;gap:8px;padding:0 10px;font-size:14px;line-height:22px;display:flex}.c7FF3q_cell:hover,.c7FF3q_cell:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#0000000f);outline:none}.c7FF3q_cellLabel{white-space:nowrap;flex:none}.c7FF3q_cellValue{min-width:0;color:var(--dsw-alias-label-tertiary,#81858c);text-align:right;text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.c7FF3q_cellChevron{width:14px;height:14px;color:var(--dsw-alias-label-tertiary,#81858c);flex:none;position:relative}.c7FF3q_cellChevron:before{content:\"\";border-bottom:1.5px solid;border-right:1.5px solid;width:5px;height:5px;position:absolute;top:4px;left:2px;transform:rotate(-45deg)}.c7FF3q_card{width:100%;max-width:720px;color:var(--dsw-alias-label-primary,#1f2329);flex-direction:column;gap:12px;display:flex}.c7FF3q_cardHeader{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.c7FF3q_title{color:var(--dsw-alias-label-primary,#1f2329);margin:0;font-size:16px;font-weight:500;line-height:24px}.c7FF3q_cardHeader .c7FF3q_description{white-space:normal;max-width:720px;margin:4px 0 0}.c7FF3q_badge,.c7FF3q_badgeDirty{border:1px solid var(--dsw-alias-border-l3,#0000001f);color:var(--dsw-alias-label-tertiary,#81858c);white-space:nowrap;border-radius:12px;flex:none;padding:2px 7px;font-size:11px;line-height:16px}.c7FF3q_badgeDirty{border-color:var(--dsw-alias-state-warn-primary,#d99000);color:var(--dsw-alias-state-warn-label,#a15c00)}.c7FF3q_notice{color:var(--dsw-alias-state-warn-label,#a15c00);margin:0;font-size:12px;line-height:18px}.c7FF3q_card>.c7FF3q_error{margin:0}.c7FF3q_card .c7FF3q_section{gap:8px;margin:0;display:grid}.c7FF3q_sectionHeader{border-bottom:1px solid var(--dsw-alias-border-l2,#0000001a);justify-content:space-between;align-items:center;gap:8px;padding-bottom:5px;display:flex}.c7FF3q_sectionHeader h4{color:var(--dsw-alias-label-secondary,#62666d);margin:0;font-size:13px;font-weight:500;line-height:20px}.c7FF3q_pinnedList,.c7FF3q_providerList{gap:8px;display:grid}.c7FF3q_pinnedRow,.c7FF3q_providerRow{border:1px solid var(--dsw-alias-border-l2,#0000001a);background:var(--dsw-alias-bg-layer-1,transparent);border-radius:12px}.c7FF3q_pinnedRow{align-items:center;gap:8px;min-height:36px;padding:6px 10px;display:flex}.c7FF3q_pinnedIndex{width:18px;color:var(--dsw-alias-label-tertiary,#81858c);text-align:center}.c7FF3q_modelText{min-width:0;color:var(--dsw-alias-label-primary,#1f2329);font-family:var(--ds-font-family-code,ui-monospace, SFMono-Regular, Consolas, monospace);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;overflow:hidden}.c7FF3q_manualPin{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.c7FF3q_manualLabel{width:100%;color:var(--dsw-alias-label-secondary,#62666d);font-size:12px;line-height:18px}.c7FF3q_manualPin input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#0000001a);background:var(--dsw-alias-bg-layer-1,transparent);min-width:0;height:32px;color:var(--dsw-alias-label-primary,#1f2329);font:inherit;border-radius:8px;flex:120px;padding:0 10px;font-size:13px}.c7FF3q_manualPin input:focus{border-color:var(--dsw-alias-brand-primary,#3370ff);outline:none}.c7FF3q_providerRow{gap:8px;padding:10px 12px;display:grid}.c7FF3q_providerMain{align-items:baseline;gap:7px;min-width:0;display:flex}.c7FF3q_providerName{color:var(--dsw-alias-label-primary,#1f2329);text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;overflow:hidden}.c7FF3q_providerMain code,.c7FF3q_modelRow code{color:var(--dsw-alias-label-tertiary,#81858c);font-family:var(--ds-font-family-code,ui-monospace, SFMono-Regular, Consolas, monospace);text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}.c7FF3q_providerActions{flex-wrap:wrap;gap:4px;display:flex}.c7FF3q_providerModels{border-top:1px solid var(--dsw-alias-border-l2,#0000001a);gap:4px;padding-top:8px;display:grid}.c7FF3q_modelRow{align-items:center;gap:8px;min-width:0;min-height:28px;display:flex}.c7FF3q_modelRow>span{min-width:0;color:var(--dsw-alias-label-primary,#1f2329);text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.c7FF3q_modelRow code{text-align:right;flex:1}.c7FF3q_footer{justify-content:flex-end;align-items:center;gap:8px;display:flex}.c7FF3q_smallButton,.c7FF3q_toggleButton,.c7FF3q_primaryButton,.c7FF3q_secondaryButton{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#0000001a);height:28px;color:var(--dsw-alias-label-primary,#1f2329);cursor:pointer;font:inherit;background:0 0;border-radius:14px;padding:0 10px;font-size:12px;line-height:18px}.c7FF3q_smallButton:hover:not(:disabled),.c7FF3q_toggleButton:hover:not(:disabled),.c7FF3q_secondaryButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#0000000f)}.c7FF3q_primaryButton{border-color:var(--dsw-alias-button-primary-fill,#3370ff);background:var(--dsw-alias-button-primary-fill,#3370ff);color:var(--dsw-alias-label-primary-foreground,#fff)}.c7FF3q_primaryButton:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#2860db)}.c7FF3q_primaryButton:disabled,.c7FF3q_secondaryButton:disabled,.c7FF3q_smallButton:disabled,.c7FF3q_toggleButton:disabled{cursor:default;opacity:.4}@media (width<=520px){.c7FF3q_cardHeader,.c7FF3q_pinnedRow{flex-wrap:wrap;align-items:flex-start}.c7FF3q_providerMain{flex-basis:100%}.c7FF3q_providerActions{width:100%}.c7FF3q_modelRow{flex-wrap:wrap;align-items:flex-start}.c7FF3q_modelRow code{text-align:left;flex-basis:100%}}";
		const tagId = "@linxin666/dsh-client-ui-model-preferences/model-preferences.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-client-ui-model-preferences";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var model_preferences_module_css_default = {
			"badge": "c7FF3q_badge",
			"badgeDirty": "c7FF3q_badgeDirty",
			"card": "c7FF3q_card",
			"cardHeader": "c7FF3q_cardHeader",
			"cell": "c7FF3q_cell",
			"cellChevron": "c7FF3q_cellChevron",
			"cellLabel": "c7FF3q_cellLabel",
			"cellValue": "c7FF3q_cellValue",
			"check": "c7FF3q_check",
			"checkmark": "c7FF3q_checkmark",
			"chevron": "c7FF3q_chevron",
			"chevronOpen": "c7FF3q_chevronOpen",
			"description": "c7FF3q_description",
			"empty": "c7FF3q_empty",
			"error": "c7FF3q_error",
			"footer": "c7FF3q_footer",
			"group": "c7FF3q_group",
			"groupTitle": "c7FF3q_groupTitle",
			"groups": "c7FF3q_groups",
			"manualLabel": "c7FF3q_manualLabel",
			"manualPin": "c7FF3q_manualPin",
			"menu": "c7FF3q_menu",
			"modelName": "c7FF3q_modelName",
			"modelRow": "c7FF3q_modelRow",
			"modelText": "c7FF3q_modelText",
			"notice": "c7FF3q_notice",
			"option": "c7FF3q_option",
			"optionCopy": "c7FF3q_optionCopy",
			"optionCurrent": "c7FF3q_optionCurrent",
			"pinnedIndex": "c7FF3q_pinnedIndex",
			"pinnedList": "c7FF3q_pinnedList",
			"pinnedRow": "c7FF3q_pinnedRow",
			"primaryButton": "c7FF3q_primaryButton",
			"providerActions": "c7FF3q_providerActions",
			"providerList": "c7FF3q_providerList",
			"providerMain": "c7FF3q_providerMain",
			"providerModels": "c7FF3q_providerModels",
			"providerName": "c7FF3q_providerName",
			"providerRow": "c7FF3q_providerRow",
			"retry": "c7FF3q_retry",
			"root": "c7FF3q_root",
			"secondaryButton": "c7FF3q_secondaryButton",
			"section": "c7FF3q_section",
			"sectionHeader": "c7FF3q_sectionHeader",
			"smallButton": "c7FF3q_smallButton",
			"status": "c7FF3q_status",
			"title": "c7FF3q_title",
			"toggleButton": "c7FF3q_toggleButton",
			"trigger": "c7FF3q_trigger",
			"triggerEffort": "c7FF3q_triggerEffort",
			"triggerLabel": "c7FF3q_triggerLabel",
			"warning": "c7FF3q_warning"
		};
		//#endregion
		//#region src/client/ModelPreferencesCard.tsx
		const EMPTY_CATALOG = {
			groups: [],
			failures: []
		};
		function modelLabel(key) {
			return `${key.provider} / ${key.model}`;
		}
		function replacePinned(config, pinnedModels) {
			return normalizeModelPreferences({
				...config,
				pinnedModels
			});
		}
		/** Settings card for the durable model preference projection. */
		function ModelPreferencesCard(props) {
			const { config, settingsScope, loadCatalog, renderSlot, t } = props;
			const settingsSnapshot = (0, react.useSyncExternalStore)((listener) => settingsScope.subscribe(listener), () => settingsScope.getSnapshot(), () => settingsScope.getSnapshot());
			const liveConfig = (0, react.useMemo)(() => normalizeModelPreferences(settingsSnapshot.value ?? config), [config, settingsSnapshot.value]);
			const [draft, setDraft] = (0, react.useState)(liveConfig);
			const [dirty, setDirty] = (0, react.useState)(false);
			const [conflict, setConflict] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [saveError, setSaveError] = (0, react.useState)(null);
			const [saved, setSaved] = (0, react.useState)(false);
			const [catalog, setCatalog] = (0, react.useState)(EMPTY_CATALOG);
			const [catalogLoading, setCatalogLoading] = (0, react.useState)(true);
			const [catalogError, setCatalogError] = (0, react.useState)(false);
			const [manualProvider, setManualProvider] = (0, react.useState)("");
			const [manualModel, setManualModel] = (0, react.useState)("");
			const lastRevision = (0, react.useRef)(settingsSnapshot.revision);
			(0, react.useEffect)(() => {
				if (!dirty) setDraft(liveConfig);
				if (lastRevision.current !== settingsSnapshot.revision) {
					if (dirty) setConflict(true);
					lastRevision.current = settingsSnapshot.revision;
				}
			}, [
				dirty,
				liveConfig,
				settingsSnapshot.revision
			]);
			const readCatalog = () => {
				setCatalogLoading(true);
				setCatalogError(false);
				loadCatalog().then((value) => {
					setCatalog(value);
					setCatalogLoading(false);
				}, () => {
					setCatalog(EMPTY_CATALOG);
					setCatalogError(true);
					setCatalogLoading(false);
				});
			};
			(0, react.useEffect)(() => {
				readCatalog();
			}, []);
			const knownProviders = (0, react.useMemo)(() => catalog.groups.map((group) => group.id), [catalog.groups]);
			const orderedProviders = (0, react.useMemo)(() => providerIdsInOrder(catalog.groups, draft), [catalog.groups, draft]);
			const providerById = (0, react.useMemo)(() => new Map(catalog.groups.map((group) => [group.id, group])), [catalog.groups]);
			const edit = (next) => {
				setDraft(normalizeModelPreferences(next));
				setDirty(true);
				setSaved(false);
				setSaveError(null);
			};
			const persist = async (next) => {
				if (!settingsSnapshot.writable || saving) return;
				setSaving(true);
				setSaved(false);
				setSaveError(null);
				try {
					await settingsScope.set("pinnedModels", next.pinnedModels);
					await settingsScope.set("providerOrder", next.providerOrder);
					await settingsScope.set("disabledProviders", next.disabledProviders);
					await settingsScope.set("recentModels", next.recentModels);
					setDraft(normalizeModelPreferences(next));
					setDirty(false);
					setConflict(false);
					setSaved(true);
				} catch (reason) {
					setSaveError(reason instanceof Error ? reason.message : t("settings.conflict"));
				} finally {
					setSaving(false);
				}
			};
			const pin = (key) => {
				if (draft.pinnedModels.some((candidate) => sameModelKey(candidate, key))) return;
				if (draft.pinnedModels.length >= 2) return;
				edit(replacePinned(draft, [...draft.pinnedModels, key]));
			};
			const unpin = (key) => {
				edit(replacePinned(draft, draft.pinnedModels.filter((candidate) => !sameModelKey(candidate, key))));
			};
			const swapPinned = (index, direction) => {
				const target = index + direction;
				if (target < 0 || target >= draft.pinnedModels.length) return;
				const pinned = [...draft.pinnedModels];
				const [item] = pinned.splice(index, 1);
				pinned.splice(target, 0, item);
				edit(replacePinned(draft, pinned));
			};
			const addManualPin = () => {
				const provider = manualProvider.trim();
				const model = manualModel.trim();
				if (!provider || !model || draft.pinnedModels.length >= 2) return;
				pin({
					provider,
					model
				});
				setManualProvider("");
				setManualModel("");
			};
			const disabled = new Set(draft.disabledProviders);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: model_preferences_module_css_default.card,
				"data-model-preferences-card": "true",
				children: [
					renderSlot("model-preferences.onboarding", {}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: model_preferences_module_css_default.cardHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: model_preferences_module_css_default.title,
							children: t("settings.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: model_preferences_module_css_default.description,
							children: t("settings.description")
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: dirty ? model_preferences_module_css_default.badgeDirty : model_preferences_module_css_default.badge,
							children: dirty ? t("settings.unsaved") : saved ? t("settings.saved") : "OK"
						})]
					}),
					!settingsSnapshot.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: model_preferences_module_css_default.notice,
						role: "status",
						children: t("settings.readonly")
					}),
					conflict && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: model_preferences_module_css_default.error,
						role: "alert",
						children: t("settings.conflict")
					}),
					saveError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: model_preferences_module_css_default.error,
						role: "alert",
						children: saveError
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: model_preferences_module_css_default.section,
						"aria-labelledby": "model-preferences-pinned-title",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: model_preferences_module_css_default.sectionHeader,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
									id: "model-preferences-pinned-title",
									children: t("settings.pinned")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									draft.pinnedModels.length,
									" / ",
									2
								] })]
							}),
							draft.pinnedModels.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: model_preferences_module_css_default.muted,
								children: t("settings.pinnedEmpty")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: model_preferences_module_css_default.pinnedList,
								children: draft.pinnedModels.map((key, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: model_preferences_module_css_default.pinnedRow,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: model_preferences_module_css_default.pinnedIndex,
											children: index + 1
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: model_preferences_module_css_default.modelText,
											children: modelLabel(key)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: model_preferences_module_css_default.smallButton,
											disabled: index === 0,
											onClick: () => swapPinned(index, -1),
											"aria-label": t("settings.swapUp"),
											children: t("settings.swapUp")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: model_preferences_module_css_default.smallButton,
											disabled: index === draft.pinnedModels.length - 1,
											onClick: () => swapPinned(index, 1),
											"aria-label": t("settings.swapDown"),
											children: t("settings.swapDown")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: model_preferences_module_css_default.smallButton,
											onClick: () => unpin(key),
											children: t("settings.unpin")
										})
									]
								}, `${key.provider}\u0000${key.model}`))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: model_preferences_module_css_default.manualPin,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: model_preferences_module_css_default.manualLabel,
										children: t("settings.manualPin")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										value: manualProvider,
										onChange: (event) => setManualProvider(event.target.value),
										placeholder: t("settings.modelInputProvider"),
										"aria-label": t("settings.modelInputProvider"),
										maxLength: 128
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										value: manualModel,
										onChange: (event) => setManualModel(event.target.value),
										placeholder: t("settings.modelInputName"),
										"aria-label": t("settings.modelInputName"),
										maxLength: 128
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: model_preferences_module_css_default.smallButton,
										disabled: draft.pinnedModels.length >= 2,
										onClick: addManualPin,
										children: t("settings.add")
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: model_preferences_module_css_default.section,
						"aria-labelledby": "model-preferences-providers-title",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: model_preferences_module_css_default.sectionHeader,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
									id: "model-preferences-providers-title",
									children: t("settings.providers")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: model_preferences_module_css_default.smallButton,
									onClick: readCatalog,
									disabled: catalogLoading,
									children: t("settings.reload")
								})]
							}),
							catalogLoading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: model_preferences_module_css_default.muted,
								role: "status",
								children: t("settings.loading")
							}),
							catalogError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: model_preferences_module_css_default.error,
								role: "alert",
								children: t("settings.catalogError")
							}),
							!catalogLoading && orderedProviders.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: model_preferences_module_css_default.muted,
								children: t("settings.noProviders")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: model_preferences_module_css_default.providerList,
								children: orderedProviders.map((provider, index) => {
									const group = providerById.get(provider);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: model_preferences_module_css_default.providerRow,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: model_preferences_module_css_default.providerMain,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: model_preferences_module_css_default.providerName,
													children: group?.name || provider
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: provider })]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: model_preferences_module_css_default.providerActions,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: model_preferences_module_css_default.smallButton,
														disabled: index === 0,
														onClick: () => edit(moveProvider(draft, provider, -1, knownProviders)),
														"aria-label": t("settings.swapUp"),
														children: t("settings.swapUp")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: model_preferences_module_css_default.smallButton,
														disabled: index === orderedProviders.length - 1,
														onClick: () => edit(moveProvider(draft, provider, 1, knownProviders)),
														"aria-label": t("settings.swapDown"),
														children: t("settings.swapDown")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: model_preferences_module_css_default.toggleButton,
														"aria-pressed": !disabled.has(provider),
														onClick: () => edit({
															...draft,
															disabledProviders: disabled.has(provider) ? draft.disabledProviders.filter((id) => id !== provider) : [...draft.disabledProviders, provider]
														}),
														children: disabled.has(provider) ? t("settings.enable") : t("settings.disable")
													})
												]
											}),
											group && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: model_preferences_module_css_default.providerModels,
												children: group.models.map((model) => {
													const key = {
														provider,
														model: model.id
													};
													const isPinned = draft.pinnedModels.some((candidate) => sameModelKey(candidate, key));
													return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: model_preferences_module_css_default.modelRow,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																title: model.description,
																children: model.name || model.id
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: model.id }),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: model_preferences_module_css_default.smallButton,
																disabled: !isPinned && draft.pinnedModels.length >= 2,
																onClick: () => isPinned ? unpin(key) : pin(key),
																children: isPinned ? t("settings.unpin") : t("settings.pin")
															})
														]
													}, model.id);
												})
											})
										]
									}, provider);
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: model_preferences_module_css_default.footer,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: model_preferences_module_css_default.secondaryButton,
							disabled: saving,
							onClick: () => {
								const next = { ...DEFAULT_MODEL_PREFERENCES };
								edit(next);
								persist(next);
							},
							children: t("settings.reset")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: model_preferences_module_css_default.primaryButton,
							disabled: !dirty || saving || !settingsSnapshot.writable,
							onClick: () => void persist(draft),
							children: saving ? t("status.selecting") : t("settings.save")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/model-projection.ts
		/** Use the official directory state as the sole catalog/current-model source. */
		function catalogFromDirectory(state) {
			return {
				current: state.current,
				groups: state.groups,
				failures: state.failures
			};
		}
		/** Build the model selection represented by one option id. */
		function selectionFromOptionId(state, id, config) {
			const key = modelKeyFromOptionId(id);
			if (key === void 0) return void 0;
			const option = flattenModelOptions(sortModelCatalog(catalogFromDirectory(state), config)).find((candidate) => sameModelKey({
				provider: candidate.provider,
				model: candidate.model.id
			}, key));
			return option === void 0 ? void 0 : selectionForModel(option, state.current);
		}
		/** Shared persistence path used by both `/model` and the composer seat. */
		async function selectModelWithPreferences(directory, settingsScope, selection) {
			await directory.select(selection);
			const next = recordRecentModel(normalizeModelPreferences(settingsScope.getSnapshot().value), {
				provider: selection.provider,
				model: selection.model
			});
			try {
				await settingsScope.set("recentModels", next.recentModels);
			} catch {}
		}
		/** Display label that remains useful for an advertised or stale current route. */
		function modelDisplayName(option, current) {
			if (option !== void 0) return option.model.name || option.model.id;
			if (current !== null) return current.model;
			return "";
		}
		/** Resolve one model from a provider group without comparing display names. */
		function findModel(groups, key) {
			if (key === void 0) return void 0;
			return groups.find((group) => group.id === key.provider)?.models.find((model) => model.id === key.model);
		}
		/** Build `/model` rows from the same sorted projection rendered by the composer. */
		function commandOptions(state, config, translate) {
			const catalog = sortModelCatalog(catalogFromDirectory(state), config);
			const options = flattenModelOptions(catalog).map((option) => ({
				id: modelOptionId({
					provider: option.provider,
					model: option.model.id
				}),
				label: option.model.name || option.model.id,
				detail: `${option.providerName} / ${option.model.id}${option.providerDisabled ? ` — ${translate("status.providerDisabled")}` : ""}`,
				...option.current ? { active: true } : {}
			}));
			for (const failure of catalog.failures) options.push({
				id: `failure:${failure.id}`,
				label: failure.name || failure.id,
				detail: `${translate("error.load")} ${failure.message}`
			});
			return options;
		}
		//#endregion
		//#region src/client/model-refresh.ts
		/** Event-driven model reconciliation for visible Desktop renderer windows. */
		const MODEL_REFRESH_CHANNEL = "dsh-model-selection-confirmed-v1";
		/**
		* Re-read confirmed host state on visibility/network recovery and after a
		* sibling Desktop window confirms a selection. This owns no polling timer.
		*/
		function installModelRefreshBridge(options) {
			const windowTarget = options.windowTarget ?? window;
			const documentTarget = options.documentTarget ?? document;
			const schedule = options.schedule ?? queueMicrotask;
			const channelFactory = options.channelFactory ?? (typeof BroadcastChannel === "function" ? (name) => new BroadcastChannel(name) : void 0);
			let disposed = false;
			let queued = false;
			const requestRefresh = () => {
				if (disposed || queued) return;
				queued = true;
				schedule(() => {
					queued = false;
					if (!disposed) options.refresh();
				});
			};
			const onVisible = () => {
				if (documentTarget.visibilityState === void 0 || documentTarget.visibilityState === "visible") requestRefresh();
			};
			const onRecovery = () => requestRefresh();
			documentTarget.addEventListener("visibilitychange", onVisible);
			windowTarget.addEventListener("focus", onRecovery);
			windowTarget.addEventListener("online", onRecovery);
			let channel;
			try {
				channel = channelFactory?.(MODEL_REFRESH_CHANNEL);
				if (channel !== void 0) channel.onmessage = (event) => {
					const message = event.data;
					if (typeof message === "object" && message !== null && message.sessionId === options.sessionId) requestRefresh();
				};
			} catch {
				channel = void 0;
			}
			return {
				announce: () => {
					try {
						channel?.postMessage({ sessionId: options.sessionId });
					} catch {}
				},
				dispose: () => {
					if (disposed) return;
					disposed = true;
					documentTarget.removeEventListener("visibilitychange", onVisible);
					windowTarget.removeEventListener("focus", onRecovery);
					windowTarget.removeEventListener("online", onRecovery);
					if (channel !== void 0) {
						channel.onmessage = null;
						try {
							channel.close();
						} catch {}
					}
				}
			};
		}
		//#endregion
		//#region src/client/ModelSelect.tsx
		function errorText(reason, fallback) {
			return reason instanceof Error && reason.message.trim() ? reason.message.trim() : fallback;
		}
		/**
		* Preference-aware composer model seat. Its data projection is local to this
		* plugin, while its geometry and interaction model follow the official
		* model-selection seat so the desktop composer keeps its native appearance.
		*/
		function ModelSelect(props) {
			const { locked, available, directory, load, modelSessionId, select, settingsScope, t } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const [selecting, setSelecting] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const lastActionRef = (0, react.useRef)("load");
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const refreshBridgeRef = (0, react.useRef)(null);
			const id = (0, react.useId)();
			const state = (0, react.useSyncExternalStore)((listener) => directory.subscribe(listener), () => directory.getSnapshot(), () => directory.getSnapshot());
			const config = (0, react.useSyncExternalStore)((listener) => settingsScope.subscribe(listener), () => settingsScope.getSnapshot(), () => settingsScope.getSnapshot()).value ?? {
				version: 1,
				pinnedModels: [],
				providerOrder: [],
				disabledProviders: [],
				recentModels: []
			};
			const catalog = (0, react.useMemo)(() => sortModelCatalog(catalogFromDirectory(state), config), [config, state]);
			const options = (0, react.useMemo)(() => [...catalog.pinned, ...catalog.groups.flatMap((group) => group.models)], [catalog]);
			const currentOption = options.find((option) => option.current);
			const reasoning = currentOption?.model.reasoning;
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? t("effort.default") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const effortChoices = (0, react.useMemo)(() => {
				if (reasoning === void 0) return [];
				return [...reasoning.defaultEffort === void 0 ? [{
					key: "provider-default",
					effort: void 0,
					label: t("effort.default")
				}] : [], ...reasoning.efforts.map((effort) => ({
					key: `effort:${effort.id}`,
					effort: effort.id,
					label: effort.name,
					...effort.description === void 0 ? {} : { description: effort.description }
				}))];
			}, [reasoning, t]);
			const busy = state.status === "selecting" || selecting;
			const currentName = modelDisplayName(currentOption, state.current);
			const modelLabel = currentName || t("trigger.fallback");
			const triggerLabel = effortLabel === void 0 ? modelLabel : `${modelLabel} · ${effortLabel}`;
			const reload = () => {
				lastActionRef.current = "load";
				load();
			};
			(0, react.useEffect)(() => {
				if (!available) return;
				lastActionRef.current = "load";
				load();
			}, [available, load]);
			(0, react.useEffect)(() => {
				refreshBridgeRef.current?.dispose();
				refreshBridgeRef.current = null;
				if (!available) return;
				const bridge = installModelRefreshBridge({
					sessionId: modelSessionId,
					refresh: load
				});
				refreshBridgeRef.current = bridge;
				return () => {
					bridge.dispose();
					if (refreshBridgeRef.current === bridge) refreshBridgeRef.current = null;
				};
			}, [
				available,
				load,
				modelSessionId
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					if (pane !== "root") setPane("root");
					else {
						setOpen(false);
						triggerRef.current?.focus();
					}
				};
				document.addEventListener("pointerdown", closeOutside);
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("pointerdown", closeOutside);
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open, pane]);
			if (!available) return null;
			const close = () => {
				setOpen(false);
				setPane("root");
				setError(null);
			};
			const chooseSelection = async (selection) => {
				if (busy) return;
				setSelecting(true);
				setError(null);
				lastActionRef.current = "select";
				try {
					if (!await select(selection)) throw new Error(t("error.select"));
					refreshBridgeRef.current?.announce();
					close();
					triggerRef.current?.focus();
				} catch (reason) {
					setError(errorText(reason, t("error.select")));
				} finally {
					setSelecting(false);
				}
			};
			const chooseModel = (option) => {
				if (option.providerDisabled || busy) return;
				chooseSelection(selectionForModel(option, state.current));
			};
			const chooseEffort = (effort) => {
				if (state.current === null || busy) return;
				chooseSelection({
					provider: state.current.provider,
					model: state.current.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				});
			};
			const renderOption = (option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: `${model_preferences_module_css_default.option} ${option.current ? model_preferences_module_css_default.optionCurrent : ""}`,
				role: "menuitemradio",
				"aria-checked": option.current,
				title: option.model.name || option.model.id,
				disabled: option.providerDisabled || busy,
				onClick: () => chooseModel(option),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: model_preferences_module_css_default.optionCopy,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: model_preferences_module_css_default.modelName,
							children: option.model.name || option.model.id
						}),
						option.model.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: model_preferences_module_css_default.description,
							children: option.model.description
						}),
						option.providerDisabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: model_preferences_module_css_default.description,
							children: t("status.providerDisabled")
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: model_preferences_module_css_default.check,
					"aria-hidden": "true",
					children: option.current && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: model_preferences_module_css_default.checkmark })
				})]
			}, `${option.provider}\u0000${option.model.id}`);
			const renderGroup = (label, groupOptions, key) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				role: "group",
				"aria-label": label,
				className: model_preferences_module_css_default.group,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: model_preferences_module_css_default.groupTitle,
					children: label
				}), groupOptions.map(renderOption)]
			}, key);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: model_preferences_module_css_default.root,
				ref: rootRef,
				onKeyDown: (event) => {
					if (event.key !== "Escape" || !open) return;
					event.preventDefault();
					if (pane !== "root") setPane("root");
					else close();
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef,
					type: "button",
					className: model_preferences_module_css_default.trigger,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					"aria-controls": open ? `${id}-menu` : void 0,
					"aria-label": currentName ? t("trigger.aria", { model: triggerLabel }) : t("trigger.fallback"),
					title: triggerLabel,
					disabled: locked,
					onClick: () => {
						if (open) close();
						else {
							setOpen(true);
							setPane("root");
							setError(null);
							reload();
						}
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: model_preferences_module_css_default.triggerLabel,
							children: modelLabel
						}),
						effortLabel !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: model_preferences_module_css_default.triggerEffort,
							children: effortLabel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							className: `${model_preferences_module_css_default.chevron} ${open ? model_preferences_module_css_default.chevronOpen : ""}`
						})
					]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					id: `${id}-menu`,
					className: model_preferences_module_css_default.menu,
					role: "menu",
					"aria-label": t("menu.aria"),
					"aria-busy": state.status === "loading" || busy,
					children: [
						pane === "root" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "menuitem",
							className: model_preferences_module_css_default.cell,
							onClick: () => setPane("model"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: model_preferences_module_css_default.cellLabel,
									children: t("menu.models")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: model_preferences_module_css_default.cellValue,
									children: modelLabel
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									className: model_preferences_module_css_default.cellChevron
								})
							]
						}), reasoning !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "menuitem",
							className: model_preferences_module_css_default.cell,
							onClick: () => setPane("effort"),
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: model_preferences_module_css_default.cellLabel,
									children: t("menu.effort")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: model_preferences_module_css_default.cellValue,
									children: effortLabel
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									className: model_preferences_module_css_default.cellChevron
								})
							]
						})] }),
						pane === "model" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							state.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: model_preferences_module_css_default.status,
								role: "status",
								children: t("status.loading")
							}),
							state.error !== null && lastActionRef.current === "load" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: model_preferences_module_css_default.error,
								role: "alert",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									t("error.load"),
									" ",
									state.error
								] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: model_preferences_module_css_default.retry,
									onClick: reload,
									children: t("action.reload")
								})]
							}),
							error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: model_preferences_module_css_default.error,
								role: "alert",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: error })
							}),
							catalog.failures.map((failure) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: model_preferences_module_css_default.warning,
								role: "status",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									failure.name || failure.id,
									": ",
									failure.message
								] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: model_preferences_module_css_default.retry,
									onClick: reload,
									children: t("action.reload")
								})]
							}, failure.id)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: `${model_preferences_module_css_default.groups} scrollable`,
								children: [catalog.pinned.length > 0 && renderGroup(t("menu.pinned"), catalog.pinned, "pinned"), catalog.groups.map((group) => renderGroup(group.name, group.models, group.id))]
							}),
							state.status === "ready" && options.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: model_preferences_module_css_default.empty,
								children: t("status.empty")
							})
						] }),
						pane === "effort" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: model_preferences_module_css_default.error,
								role: "alert",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: error })
							}),
							effortChoices.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: model_preferences_module_css_default.empty,
								children: t("status.empty")
							}),
							effortChoices.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitemradio",
								"aria-checked": effectiveEffort === choice.effort,
								className: `${model_preferences_module_css_default.option} ${effectiveEffort === choice.effort ? model_preferences_module_css_default.optionCurrent : ""}`,
								disabled: busy,
								onClick: () => chooseEffort(choice.effort),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: model_preferences_module_css_default.optionCopy,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: model_preferences_module_css_default.modelName,
										children: choice.label
									}), choice.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: model_preferences_module_css_default.description,
										children: choice.description
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: model_preferences_module_css_default.check,
									"aria-hidden": "true",
									children: effectiveEffort === choice.effort && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: model_preferences_module_css_default.checkmark })
								})]
							}, choice.key))
						] })
					]
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** Chinese copy is the key-set source of truth for the model preferences UI. */
		const zh = {
			"command.description": "选择模型（支持自定义置顶和供应商排序）",
			"trigger.fallback": "选择模型",
			"trigger.aria": "当前模型：{model}",
			"trigger.ariaDisabled": "模型选择不可用",
			"menu.aria": "模型选择器",
			"menu.models": "模型",
			"menu.effort": "推理强度",
			"menu.pinned": "置顶模型",
			"menu.providers": "供应商",
			"action.close": "关闭",
			"action.reload": "重新加载",
			"action.back": "返回模型列表",
			"status.loading": "正在加载模型目录…",
			"status.selecting": "正在切换模型…",
			"status.empty": "当前没有可用模型。",
			"status.unavailable": "当前会话不支持模型选择。",
			"status.notRoutable": "当前供应商暂不可用，请选择其他模型。",
			"status.providerDisabled": "当前供应商已禁用，请选择其他模型。",
			"status.providerFailure": "部分供应商加载失败，已加载的模型仍可选择。",
			"error.load": "模型目录加载失败。",
			"error.select": "模型切换失败，请重试。",
			"effort.default": "供应商默认",
			"settings.nav": "模型偏好",
			"settings.title": "模型偏好",
			"settings.description": "自定义模型置顶、供应商顺序和供应商启用状态。不会删除凭据，也不会中断当前请求。",
			"settings.pinned": "置顶模型（最多 2 个）",
			"settings.pinnedEmpty": "尚未置顶模型",
			"settings.unpin": "取消置顶",
			"settings.pin": "置顶",
			"settings.swapUp": "上移",
			"settings.swapDown": "下移",
			"settings.providers": "供应商顺序与状态",
			"settings.enable": "启用",
			"settings.disable": "禁用",
			"settings.loading": "正在读取供应商目录…",
			"settings.reload": "重新读取",
			"settings.save": "保存",
			"settings.reset": "恢复默认",
			"settings.saved": "已保存",
			"settings.unsaved": "有未保存修改",
			"settings.conflict": "设置在其他窗口发生变化，请先重新加载或覆盖保存。",
			"settings.readonly": "当前设置不可写，偏好只能在本地桌面配置中保存。",
			"settings.catalogError": "供应商目录加载失败，仍可保存已有偏好。",
			"settings.noProviders": "暂无已配置的供应商。",
			"settings.modelInputProvider": "供应商 ID",
			"settings.modelInputName": "模型 ID",
			"settings.manualPin": "手动添加置顶模型",
			"settings.add": "添加"
		};
		/** English dictionary must keep the Chinese key set complete. */
		const en = {
			"command.description": "Choose a model with custom pins and provider ordering",
			"trigger.fallback": "Select model",
			"trigger.aria": "Current model: {model}",
			"trigger.ariaDisabled": "Model selection unavailable",
			"menu.aria": "Model selector",
			"menu.models": "Models",
			"menu.effort": "Reasoning effort",
			"menu.pinned": "Pinned models",
			"menu.providers": "Providers",
			"action.close": "Close",
			"action.reload": "Reload",
			"action.back": "Back to models",
			"status.loading": "Loading model catalog…",
			"status.selecting": "Switching model…",
			"status.empty": "No models are available.",
			"status.unavailable": "Model selection is unavailable for this session.",
			"status.notRoutable": "The current provider is unavailable; choose another model.",
			"status.providerDisabled": "The current provider is disabled; choose another model.",
			"status.providerFailure": "Some providers failed to load; loaded models remain selectable.",
			"error.load": "The model catalog failed to load.",
			"error.select": "The model switch failed. Try again.",
			"effort.default": "Provider default",
			"settings.nav": "Model preferences",
			"settings.title": "Model preferences",
			"settings.description": "Customize pinned models, provider order, and provider availability. Credentials and active requests are untouched.",
			"settings.pinned": "Pinned models (up to 2)",
			"settings.pinnedEmpty": "No pinned models",
			"settings.unpin": "Unpin",
			"settings.pin": "Pin",
			"settings.swapUp": "Move up",
			"settings.swapDown": "Move down",
			"settings.providers": "Provider order and status",
			"settings.enable": "Enable",
			"settings.disable": "Disable",
			"settings.loading": "Loading provider catalog…",
			"settings.reload": "Reload",
			"settings.save": "Save",
			"settings.reset": "Restore defaults",
			"settings.saved": "Saved",
			"settings.unsaved": "Unsaved changes",
			"settings.conflict": "Settings changed elsewhere. Reload or save to overwrite.",
			"settings.readonly": "Settings are read-only; preferences can only be saved in a local desktop profile.",
			"settings.catalogError": "The provider catalog failed to load; existing preferences can still be saved.",
			"settings.noProviders": "No configured providers.",
			"settings.modelInputProvider": "Provider ID",
			"settings.modelInputName": "Model ID",
			"settings.manualPin": "Add a pinned model manually",
			"settings.add": "Add"
		};
		//#endregion
		//#region src/client/index.ts
		const inject = [
			"slots",
			"locale",
			"connection",
			"settingsScope",
			"remote",
			"sessions"
		];
		const EMPTY_CONFIG = {
			version: 1,
			pinnedModels: [],
			providerOrder: [],
			disabledProviders: [],
			recentModels: []
		};
		function settingsBinder(ctx) {
			const compatibility = ctx.get("webUiSettings");
			if (typeof compatibility === "object" && compatibility !== null && typeof compatibility.bind === "function") return compatibility;
			return ctx.settingsScope;
		}
		function currentConfig(scope) {
			try {
				return normalizeModelPreferences(scope.getSnapshot().value);
			} catch {
				return { ...EMPTY_CONFIG };
			}
		}
		function catalogLoader(ctx) {
			return async () => {
				const models = (ctx.get("connection")?.api)?.llm?.models;
				if (models === void 0) throw new Error("model catalog is unavailable");
				const response = await models({});
				if (!response.result.ok) throw new Error(response.result.error?.message || "model catalog request failed");
				return {
					groups: response.result.value.groups ?? [],
					failures: response.result.value.failures ?? []
				};
			};
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("model-preferences", {
				zh,
				en
			}), "model-preferences: dictionaries");
			const settingsScope = settingsBinder(ctx).bind({
				namespace: MODEL_PREFERENCES_SETTINGS_NAMESPACE,
				decode: (value) => {
					try {
						return normalizeModelPreferences(value);
					} catch {
						return;
					}
				}
			});
			const loadCatalog = catalogLoader(ctx);
			ctx.inject(["slots"], (scope) => {
				scope.slots.inject("settings.models.content", () => scope.slots.register({
					name: "settings.models.content",
					id: "model-preferences",
					order: 10,
					locale: "model-preferences",
					children: { "model-preferences.onboarding": {
						kind: "list",
						scope: "root"
					} },
					inject: () => ({
						config: currentConfig(settingsScope),
						settingsScope,
						loadCatalog
					})
				}, ModelPreferencesCard));
			});
			ctx.inject(["commandUi", "modelDirectories"], (scope) => {
				const command = scope.get("commandUi");
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				const translate = ctx.locale.bind("model-preferences");
				const available = (session) => sessions.subagentAddress(session.sessionId) === void 0;
				const ui = {
					kind: "popupSelect",
					options: async (session, signal) => {
						if (signal.aborted || sessions.subagentAddress(session.sessionId) !== void 0) return [];
						const directory = models.directoryFor(session.sessionId);
						await directory.load();
						if (signal.aborted) return [];
						return commandOptions(directory.store.getSnapshot(), currentConfig(settingsScope), (key, params) => translate(key, params));
					},
					onSelect: async (option, session) => {
						if (sessions.subagentAddress(session.sessionId) !== void 0) throw new Error("model selection is unavailable for addressed subagent sessions");
						const directory = models.directoryFor(session.sessionId);
						const selection = selectionFromOptionId(directory.store.getSnapshot(), option.id, currentConfig(settingsScope));
						if (selection === void 0) throw new Error("the selected model is no longer available");
						await selectModelWithPreferences(directory, settingsScope, selection);
					}
				};
				scope.effect(() => {
					return command.decorate({
						name: "model",
						available,
						ui
					});
				}, "model-preferences: decorate /model when supported");
			});
			ctx.inject(["slots", "modelDirectories"], (scope) => {
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					priority: -10,
					locale: "model-preferences",
					inject: (sessionId) => {
						const directory = models.directoryFor(sessionId);
						const available = sessions.subagentAddress(sessionId) === void 0;
						return {
							available,
							modelSessionId: String(sessionId),
							directory: directory.store,
							settingsScope,
							load: () => {
								if (available) directory.load().catch(() => {});
							},
							select: (selection) => available ? selectModelWithPreferences(directory, settingsScope, selection).then(() => true, () => false) : Promise.resolve(false)
						};
					}
				}, ModelSelect));
			});
		}
		//#endregion
		exports.ModelPreferencesCard = ModelPreferencesCard;
		exports.ModelSelect = ModelSelect;
		exports.apply = apply;
		exports.catalogFromDirectory = catalogFromDirectory;
		exports.commandOptions = commandOptions;
		exports.en = en;
		exports.findModel = findModel;
		exports.flattenModelOptions = flattenModelOptions;
		exports.inject = inject;
		exports.modelDisplayName = modelDisplayName;
		exports.modelKeyFromOptionId = modelKeyFromOptionId;
		exports.modelOptionId = modelOptionId;
		exports.selectModelWithPreferences = selectModelWithPreferences;
		exports.selectionForModel = selectionForModel;
		exports.selectionFromOptionId = selectionFromOptionId;
		exports.sortModelCatalog = sortModelCatalog;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map