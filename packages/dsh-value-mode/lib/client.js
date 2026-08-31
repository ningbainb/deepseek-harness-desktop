window.__ModuleLoader__.load({
	id: "@linxin666/dsh-value-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_dom_client = require("react-dom/client");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/core/config.ts
		const VALUE_MODE_SETTINGS_NAMESPACE = "value-mode";
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
		function isConfigured(config, defaultExpert) {
			if (!config) return false;
			const exec = config.executor;
			const exp = resolveExpertRoute(config, defaultExpert);
			return isCompleteModelRoute(exec) && isCompleteModelRoute(exp);
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
		//#region src/client/locales.ts
		const zh = {
			title: "性价比模式",
			description: "由专家主控模型理解、拆解和汇总任务，再按需派发副模型子代理，在交付质量与模型使用成本之间取得平衡。",
			descSupplement: "模型直接从你已经配置好的供应商中选择，不需要重新填写 API Key。",
			status: "运行状态",
			enabled: "已开启",
			disabled: "已关闭",
			unconfigured: "配置不完整",
			degraded: "部分模型不可用",
			executorModel: "副模型 / 子代理执行模型",
			expertModel: "专家主控模型",
			executorDesc: "只执行主控派发的单项任务，适合并行调查、局部实现和重复性工作。",
			expertDesc: "负责理解任务、拆分工作、汇总子代理结果并完成最终交付。",
			strategy: "运行策略",
			strategySaver: "更省",
			strategySaverDesc: "优先由主控直接处理，只在需要并行或明确拆分时派发子代理。",
			strategyBalanced: "智能平衡",
			strategyBalancedDesc: "复杂设计、疑难问题和重要改动按需派发副模型并由主控复核。",
			strategyPowerful: "更强",
			strategyPowerfulDesc: "更积极地派发并行子任务，主控统一审查结果和风险。",
			change: "更换",
			selectModel: "选择模型",
			notSelected: "未配置",
			selectProvider: "选择供应商",
			noAvailableModels: "暂无可用的已配置模型，请先在模型设置中添加供应商",
			allowReview: "重要改动完成后保留主控复核",
			showExpertActivity: "显式显示主控与子代理活动",
			advancedSettings: "高级成本护栏",
			maxOutputTokens: "主控最大输出 Token",
			maxContextChars: "主控上下文最大字符数",
			maxDepth: "子代理最大深度",
			consecutiveFailuresThreshold: "连续失败自动升级阈值",
			headerStatusPrefix: "性价比",
			sessionExpertCalls: "本会话专家主控调用",
			sessionExecutorCalls: "本会话副模型子代理调用",
			estimatedSavings: "副模型调用占比",
			tokensUsage: "Token 消耗与统计",
			sessionScope: "生效范围",
			thisSessionOnly: "仅当前会话",
			globalDefault: "全局默认",
			setAsGlobal: "设为全局默认",
			resetSessionOverride: "重置会话独立设置",
			consultationHistory: "专家咨询记录",
			noConsultationsYet: "本会话尚未产生兼容专家咨询",
			quickSettings: "快速设置",
			openFullSettings: "打开完整设置",
			manualExpertButton: "专家分析",
			manualExpertArmed: "本次使用专家分析",
			onboardingTitle: "首次使用指引",
			onboardingStep1: "第一步：确认专家主控模型（负责拆解、派发与最终交付）",
			onboardingStep2: "第二步：选择副模型（用于执行主控派发的子任务）",
			onboardingStep3: "第三步：选择策略（默认智能平衡）",
			onboardingComplete: "确认并开启性价比模式",
			conflictWarning: "检测到其他模型路由插件，同时开启可能导致模型选择不可预测。",
			times: "次",
			active: "生效中",
			inactive: "未生效",
			cancel: "取消",
			save: "保存",
			close: "关闭",
			duration: "耗时",
			purpose: "用途",
			tokens: "Token"
		};
		const en = {
			title: "Value Mode",
			description: "Use an expert controller to understand, delegate, review, and deliver the task, with a secondary worker model for delegated subtasks.",
			descSupplement: "Models are selected from providers already configured in DeepSeek Harness without re-entering API keys.",
			status: "Status",
			enabled: "Enabled",
			disabled: "Disabled",
			unconfigured: "Incomplete Configuration",
			degraded: "Partially Unavailable",
			executorModel: "Subagent Worker Model",
			expertModel: "Expert Controller Model",
			executorDesc: "Runs only bounded tasks delegated by the controller, such as investigation and local implementation.",
			expertDesc: "Owns task understanding, delegation, result review, and final delivery.",
			strategy: "Strategy",
			strategySaver: "Saver",
			strategySaverDesc: "Prefer direct controller work; delegate only when a task is clearly split or benefits from parallelism.",
			strategyBalanced: "Balanced",
			strategyBalancedDesc: "Delegate complex design, difficult issues, and important changes as needed, then review centrally.",
			strategyPowerful: "Powerful",
			strategyPowerfulDesc: "Delegate parallel subtasks proactively while the controller owns review and risk decisions.",
			change: "Change",
			selectModel: "Select Model",
			notSelected: "Not Configured",
			selectProvider: "Select Provider",
			noAvailableModels: "No configured models available. Please add a provider in Settings first.",
			allowReview: "Keep controller review after major changes",
			showExpertActivity: "Show controller and subagent activity",
			advancedSettings: "Advanced Cost Guardrails",
			maxOutputTokens: "Controller Max Output Tokens",
			maxContextChars: "Controller Max Context Characters",
			maxDepth: "Subagent Max Depth",
			consecutiveFailuresThreshold: "Consecutive Failures Escalation Threshold",
			headerStatusPrefix: "Value",
			sessionExpertCalls: "Session Expert Controller Calls",
			sessionExecutorCalls: "Session Subagent Worker Calls",
			estimatedSavings: "Subagent Call Share",
			tokensUsage: "Token Usage & Stats",
			sessionScope: "Scope",
			thisSessionOnly: "This Session Only",
			globalDefault: "Global Default",
			setAsGlobal: "Set as Global Default",
			resetSessionOverride: "Reset to Global Default",
			consultationHistory: "Expert Consultations",
			noConsultationsYet: "No legacy expert consultations in this session yet",
			quickSettings: "Quick Settings",
			openFullSettings: "Open Full Settings",
			manualExpertButton: "Expert Analysis",
			manualExpertArmed: "Next turn uses Expert Analysis",
			onboardingTitle: "Getting Started with Value Mode",
			onboardingStep1: "Step 1: Confirm Expert Controller Model (delegation and final delivery)",
			onboardingStep2: "Step 2: Select Subagent Worker Model (delegated tasks)",
			onboardingStep3: "Step 3: Select Strategy (Balanced by default)",
			onboardingComplete: "Confirm and Enable Value Mode",
			conflictWarning: "Multiple model router plugins detected; model selection behavior may be unpredictable.",
			times: "calls",
			active: "Active",
			inactive: "Inactive",
			cancel: "Cancel",
			save: "Save",
			close: "Close",
			duration: "Duration",
			purpose: "Purpose",
			tokens: "Tokens"
		};
		//#endregion
		//#region \0dsh-css:packages/dsh-value-mode/src/client/value-mode.module.css.mjs
		const css$4 = ".NEKbHG_card{background:var(--dsh-surface-secondary,#ffffff0a);border:1px solid var(--dsh-border-primary,#ffffff14);color:var(--dsh-text-primary,#fff);border-radius:8px;flex-direction:column;gap:16px;padding:16px;font-size:13px;display:flex}.NEKbHG_header{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.NEKbHG_titleArea{flex-direction:column;gap:4px;display:flex}.NEKbHG_titleRow{align-items:center;gap:8px;display:flex}.NEKbHG_title{color:var(--dsh-text-primary,#fff);font-size:15px;font-weight:600}.NEKbHG_badge{border-radius:4px;padding:2px 6px;font-size:11px;font-weight:500}.NEKbHG_badgeActive{color:#10b981;background:#10b98126;border:1px solid #10b9814d}.NEKbHG_badgeInactive{color:#9ca3af;background:#9ca3af26;border:1px solid #9ca3af4d}.NEKbHG_badgeDegraded{color:#f59e0b;background:#f59e0b26;border:1px solid #f59e0b4d}.NEKbHG_desc{color:var(--dsh-text-secondary,#9ca3af);font-size:12px;line-height:1.5}.NEKbHG_switchArea{align-items:center;gap:8px;display:flex}.NEKbHG_toggleSwitch{cursor:pointer;background:#9ca3af4d;border-radius:11px;width:40px;height:22px;transition:background .2s;position:relative}.NEKbHG_toggleSwitchChecked{background:var(--dsh-brand-primary,#3b82f6)}.NEKbHG_toggleKnob{background:#fff;border-radius:50%;width:18px;height:18px;transition:transform .2s;position:absolute;top:2px;left:2px}.NEKbHG_toggleSwitchChecked .NEKbHG_toggleKnob{transform:translate(18px)}.NEKbHG_section{flex-direction:column;gap:12px;display:flex}.NEKbHG_sectionTitle{color:var(--dsh-text-primary,#fff);font-size:13px;font-weight:600}.NEKbHG_modelRow{background:var(--dsh-surface-tertiary,#ffffff05);border:1px solid var(--dsh-border-secondary,#ffffff0f);border-radius:6px;justify-content:space-between;align-items:center;gap:12px;padding:10px 12px;display:flex}.NEKbHG_modelInfo{flex-direction:column;gap:2px;display:flex}.NEKbHG_modelRole{color:var(--dsh-text-primary,#fff);font-size:13px;font-weight:500}.NEKbHG_modelValue{color:var(--dsh-brand-primary,#60a5fa);font-family:monospace;font-size:12px}.NEKbHG_modelDesc{color:var(--dsh-text-tertiary,#6b7280);font-size:11px}.NEKbHG_button{border:1px solid var(--dsh-border-primary,#ffffff1f);background:var(--dsh-surface-primary,#ffffff14);color:var(--dsh-text-primary,#fff);cursor:pointer;border-radius:4px;padding:5px 12px;font-size:12px;font-weight:500;transition:background .15s,border-color .15s}.NEKbHG_button:hover{background:var(--dsh-surface-hover,#ffffff1f);border-color:var(--dsh-border-hover,#fff3)}.NEKbHG_buttonPrimary{background:var(--dsh-brand-primary,#3b82f6);border-color:var(--dsh-brand-primary,#3b82f6);color:#fff}.NEKbHG_buttonPrimary:hover{background:var(--dsh-brand-primary-hover,#2563eb)}.NEKbHG_strategyGroup{grid-template-columns:repeat(3,1fr);gap:8px;display:grid}.NEKbHG_strategyItem{background:var(--dsh-surface-tertiary,#ffffff05);border:1px solid var(--dsh-border-secondary,#ffffff0f);cursor:pointer;border-radius:6px;flex-direction:column;gap:4px;padding:10px;transition:border-color .15s,background .15s;display:flex}.NEKbHG_strategyItemSelected{border-color:var(--dsh-brand-primary,#3b82f6);background:#3b82f614}.NEKbHG_strategyTitle{font-size:13px;font-weight:600}.NEKbHG_strategyDesc{color:var(--dsh-text-secondary,#9ca3af);font-size:11px;line-height:1.4}.NEKbHG_checkboxRow{cursor:pointer;user-select:none;align-items:center;gap:8px;font-size:12px;display:flex}.NEKbHG_accordion{border-top:1px solid var(--dsh-border-secondary,#ffffff0f);padding-top:12px}.NEKbHG_accordionHeader{cursor:pointer;color:var(--dsh-text-secondary,#9ca3af);justify-content:space-between;align-items:center;font-size:12px;display:flex}.NEKbHG_accordionBody{flex-direction:column;gap:10px;margin-top:10px;display:flex}.NEKbHG_fieldRow{justify-content:space-between;align-items:center;display:flex}.NEKbHG_fieldLabel{color:var(--dsh-text-secondary,#9ca3af);font-size:12px}.NEKbHG_inputNumber{border:1px solid var(--dsh-border-primary,#ffffff1f);color:#fff;text-align:right;background:#0003;border-radius:4px;width:90px;padding:4px 8px;font-size:12px}.NEKbHG_headerChip{color:#93c5fd;cursor:pointer;background:#3b82f61a;border:1px solid #3b82f640;border-radius:12px;align-items:center;gap:5px;padding:2px 8px;font-size:12px;transition:background .15s,border-color .15s;display:inline-flex}.NEKbHG_headerChip:hover{background:#3b82f633;border-color:#3b82f666}.NEKbHG_headerChipDisabled{color:#9ca3af;background:#9ca3af1a;border-color:#9ca3af33}.NEKbHG_popover{z-index:1000;background:#18181b;border:1px solid #ffffff26;border-radius:8px;flex-direction:column;gap:10px;width:320px;margin-top:6px;padding:14px;display:flex;position:absolute;top:100%;right:0;box-shadow:0 10px 25px #00000080}.NEKbHG_popoverItem{justify-content:space-between;font-size:12px;display:flex}.NEKbHG_popoverItemLabel{color:#9ca3af}.NEKbHG_popoverItemValue{color:#fff;font-weight:500}.NEKbHG_roleSummary{border-top:1px solid #ffffff0f;border-bottom:1px solid #ffffff0f;flex-direction:column;gap:8px;padding:10px 0;display:flex}.NEKbHG_scopeSwitcher{background:#0000004d;border-radius:6px;gap:2px;padding:2px;display:flex}.NEKbHG_scopeButton{color:#9ca3af;cursor:pointer;text-align:center;background:0 0;border:none;border-radius:4px;flex:1;padding:4px 6px;font-size:11px;transition:all .15s}.NEKbHG_scopeButtonActive{background:var(--dsh-brand-primary,#3b82f6);color:#fff;font-weight:500}.NEKbHG_statsCard{background:#ffffff08;border:1px solid #ffffff0f;border-radius:6px;grid-template-columns:repeat(2,1fr);gap:6px;padding:8px;display:grid}.NEKbHG_statItem{flex-direction:column;gap:2px;display:flex}.NEKbHG_statItemLabel{color:#9ca3af;font-size:10px}.NEKbHG_statItemValue{color:#60a5fa;font-size:13px;font-weight:600}.NEKbHG_statSavingsHighlight{color:#34d399;border-top:1px solid #ffffff0f;grid-column:span 2;justify-content:space-between;align-items:center;padding-top:4px;font-size:11px;display:flex}.NEKbHG_historyBox{border-top:1px solid #ffffff0f;flex-direction:column;gap:6px;max-height:140px;padding-top:8px;display:flex;overflow-y:auto}.NEKbHG_historyItem{background:#ffffff05;border:1px solid #ffffff0a;border-radius:4px;flex-direction:column;gap:2px;padding:6px;display:flex}.NEKbHG_historyHeader{color:#93c5fd;justify-content:space-between;font-size:11px;font-weight:500;display:flex}.NEKbHG_historySummary{color:#9ca3af;text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:1.3;overflow:hidden}.NEKbHG_manualToggle{color:var(--dsh-text-secondary,#9ca3af);cursor:pointer;background:#ffffff0d;border:1px solid #ffffff1a;border-radius:4px;align-items:center;gap:4px;padding:3px 8px;font-size:11px;transition:all .15s;display:inline-flex}.NEKbHG_manualToggleActive{color:#c4b5fd;background:#8b5cf633;border-color:#8b5cf666}.NEKbHG_modalBackdrop{z-index:2000;background:#0009;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}.NEKbHG_modalContent{background:#1f2937;border:1px solid #ffffff26;border-radius:8px;flex-direction:column;gap:12px;width:420px;max-height:80vh;padding:16px;display:flex;box-shadow:0 20px 30px #000000b3}.NEKbHG_modelList{flex-direction:column;gap:6px;max-height:320px;display:flex;overflow-y:auto}.NEKbHG_providerGroup{color:#9ca3af;text-transform:uppercase;margin-top:6px;margin-bottom:2px;font-size:11px;font-weight:600}.NEKbHG_modelOption{cursor:pointer;background:#ffffff08;border:1px solid #0000;border-radius:4px;flex-direction:column;gap:2px;padding:8px 10px;transition:background .1s,border-color .1s;display:flex}.NEKbHG_modelOption:hover{background:#ffffff14;border-color:#ffffff26}.NEKbHG_modelOptionSelected{border-color:var(--dsh-brand-primary,#3b82f6);background:#3b82f626}";
		const tagId$4 = "@linxin666/dsh-value-mode/value-mode.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-value-mode";
			tag.dataset.pluginCss = tagId$4;
			tag.textContent = css$4;
			document.head.appendChild(tag);
		}
		var value_mode_module_css_default = {
			"accordion": "NEKbHG_accordion",
			"accordionBody": "NEKbHG_accordionBody",
			"accordionHeader": "NEKbHG_accordionHeader",
			"badge": "NEKbHG_badge",
			"badgeActive": "NEKbHG_badgeActive",
			"badgeDegraded": "NEKbHG_badgeDegraded",
			"badgeInactive": "NEKbHG_badgeInactive",
			"button": "NEKbHG_button",
			"buttonPrimary": "NEKbHG_buttonPrimary",
			"card": "NEKbHG_card",
			"checkboxRow": "NEKbHG_checkboxRow",
			"desc": "NEKbHG_desc",
			"fieldLabel": "NEKbHG_fieldLabel",
			"fieldRow": "NEKbHG_fieldRow",
			"header": "NEKbHG_header",
			"headerChip": "NEKbHG_headerChip",
			"headerChipDisabled": "NEKbHG_headerChipDisabled",
			"historyBox": "NEKbHG_historyBox",
			"historyHeader": "NEKbHG_historyHeader",
			"historyItem": "NEKbHG_historyItem",
			"historySummary": "NEKbHG_historySummary",
			"inputNumber": "NEKbHG_inputNumber",
			"manualToggle": "NEKbHG_manualToggle",
			"manualToggleActive": "NEKbHG_manualToggleActive",
			"modalBackdrop": "NEKbHG_modalBackdrop",
			"modalContent": "NEKbHG_modalContent",
			"modelDesc": "NEKbHG_modelDesc",
			"modelInfo": "NEKbHG_modelInfo",
			"modelList": "NEKbHG_modelList",
			"modelOption": "NEKbHG_modelOption",
			"modelOptionSelected": "NEKbHG_modelOptionSelected",
			"modelRole": "NEKbHG_modelRole",
			"modelRow": "NEKbHG_modelRow",
			"modelValue": "NEKbHG_modelValue",
			"popover": "NEKbHG_popover",
			"popoverItem": "NEKbHG_popoverItem",
			"popoverItemLabel": "NEKbHG_popoverItemLabel",
			"popoverItemValue": "NEKbHG_popoverItemValue",
			"providerGroup": "NEKbHG_providerGroup",
			"roleSummary": "NEKbHG_roleSummary",
			"scopeButton": "NEKbHG_scopeButton",
			"scopeButtonActive": "NEKbHG_scopeButtonActive",
			"scopeSwitcher": "NEKbHG_scopeSwitcher",
			"section": "NEKbHG_section",
			"sectionTitle": "NEKbHG_sectionTitle",
			"statItem": "NEKbHG_statItem",
			"statItemLabel": "NEKbHG_statItemLabel",
			"statItemValue": "NEKbHG_statItemValue",
			"statSavingsHighlight": "NEKbHG_statSavingsHighlight",
			"statsCard": "NEKbHG_statsCard",
			"strategyDesc": "NEKbHG_strategyDesc",
			"strategyGroup": "NEKbHG_strategyGroup",
			"strategyItem": "NEKbHG_strategyItem",
			"strategyItemSelected": "NEKbHG_strategyItemSelected",
			"strategyTitle": "NEKbHG_strategyTitle",
			"switchArea": "NEKbHG_switchArea",
			"title": "NEKbHG_title",
			"titleArea": "NEKbHG_titleArea",
			"titleRow": "NEKbHG_titleRow",
			"toggleKnob": "NEKbHG_toggleKnob",
			"toggleSwitch": "NEKbHG_toggleSwitch",
			"toggleSwitchChecked": "NEKbHG_toggleSwitchChecked"
		};
		//#endregion
		//#region \0dsh-css:packages/dsh-value-mode/src/client/value-mode-polish.module.css.mjs
		const css$3 = ".I9CORW_card{box-sizing:border-box;width:100%;min-width:0;max-width:100%}.I9CORW_header{flex-wrap:wrap;min-width:0}.I9CORW_titleArea{flex:240px;min-width:0}.I9CORW_titleRow{flex-wrap:wrap;min-width:0}.I9CORW_title{overflow-wrap:anywhere;min-width:0}.I9CORW_switchArea{flex:none;margin-left:auto}.I9CORW_onboarding{box-sizing:border-box;overflow-wrap:anywhere;min-width:0}.I9CORW_modelRow{flex-wrap:wrap;align-items:flex-start;min-width:0}.I9CORW_modelInfo{flex:220px;min-width:0}.I9CORW_modelValue,.I9CORW_modelDesc{overflow-wrap:anywhere;word-break:break-word;min-width:0}.I9CORW_modelAction{flex:none;margin-left:auto}.I9CORW_strategyGroup{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));min-width:0}.I9CORW_strategyItem{box-sizing:border-box;min-width:0}.I9CORW_popover{box-sizing:border-box;width:min(320px,100vw - 16px);max-width:calc(100vw - 16px);max-height:calc(100vh - 48px);margin:0;position:fixed;overflow:hidden auto}.I9CORW_modalBackdrop{box-sizing:border-box;padding:12px}.I9CORW_modalContent{box-sizing:border-box;width:min(420px,100%);max-width:100%;min-height:0;max-height:min(80vh,100vh - 24px);overflow:hidden}.I9CORW_modelList{flex:auto;min-height:0;max-height:none}.I9CORW_interactiveButton{box-sizing:border-box;min-width:0}@media (width<=560px){.I9CORW_modelAction{width:100%;margin-left:0}.I9CORW_interactiveButton{width:100%}}";
		const tagId$3 = "@linxin666/dsh-value-mode/value-mode-polish.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-value-mode";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var value_mode_polish_module_css_default = {
			"card": "I9CORW_card",
			"header": "I9CORW_header",
			"interactiveButton": "I9CORW_interactiveButton",
			"modalBackdrop": "I9CORW_modalBackdrop",
			"modalContent": "I9CORW_modalContent",
			"modelAction": "I9CORW_modelAction",
			"modelDesc": "I9CORW_modelDesc",
			"modelInfo": "I9CORW_modelInfo",
			"modelList": "I9CORW_modelList",
			"modelRow": "I9CORW_modelRow",
			"modelValue": "I9CORW_modelValue",
			"onboarding": "I9CORW_onboarding",
			"popover": "I9CORW_popover",
			"strategyGroup": "I9CORW_strategyGroup",
			"strategyItem": "I9CORW_strategyItem",
			"switchArea": "I9CORW_switchArea",
			"title": "I9CORW_title",
			"titleArea": "I9CORW_titleArea",
			"titleRow": "I9CORW_titleRow"
		};
		//#endregion
		//#region \0dsh-css:packages/dsh-value-mode/src/client/value-mode-picker.module.css.mjs
		const css$2 = ".ncXPLW_subtitle{max-width:360px;line-height:1.4}.ncXPLW_optionButton{box-sizing:border-box;color:#fff;width:100%;font:inherit;text-align:left}.ncXPLW_providerLabel{color:#9ca3af;text-transform:uppercase;justify-content:space-between;align-items:baseline;gap:8px;margin-top:6px;margin-bottom:2px;font-size:11px;font-weight:600;display:flex}.ncXPLW_providerCount{color:#6b7280;text-transform:none;flex:none;font-size:10px;font-weight:500}.ncXPLW_modelLine{justify-content:space-between;align-items:center;gap:8px;min-width:0;display:flex}.ncXPLW_modelName{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-weight:500;overflow:hidden}.ncXPLW_modelId{color:#9ca3af;overflow-wrap:anywhere;font-family:monospace;font-size:11px}.ncXPLW_modelDescription{color:#9ca3af;text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}.ncXPLW_selectedBadge{color:#bfdbfe;border:1px solid #60a5fa73;border-radius:999px;flex:none;padding:1px 5px;font-size:10px;font-weight:600;line-height:1.3}.ncXPLW_errorPanel{background:#7f1d1d33;border:1px solid #f8717159;border-radius:6px;justify-content:space-between;align-items:flex-start;gap:10px;padding:9px 10px;display:flex}.ncXPLW_errorMessage{color:#fca5a5;overflow-wrap:anywhere;min-width:0;font-size:12px;line-height:1.45}.ncXPLW_failurePanel{color:#fcd34d;background:#78350f2e;border:1px solid #fbbf244d;border-radius:6px;flex-direction:column;gap:5px;padding:8px 10px;font-size:11px;line-height:1.4;display:flex}.ncXPLW_failureTitle{font-weight:600}.ncXPLW_failureItem{color:#fde68a;overflow-wrap:anywhere;gap:6px;min-width:0;display:flex}.ncXPLW_failureProvider{color:#fef3c7;flex:none;font-weight:600}.ncXPLW_footer{justify-content:space-between;align-items:center;gap:10px;margin-top:8px;display:flex}.ncXPLW_footerHint{color:#6b7280;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:11px;overflow:hidden}.ncXPLW_error{color:#ef4444;overflow-wrap:anywhere}";
		const tagId$2 = "@linxin666/dsh-value-mode/value-mode-picker.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-value-mode";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var value_mode_picker_module_css_default = {
			"error": "ncXPLW_error",
			"errorMessage": "ncXPLW_errorMessage",
			"errorPanel": "ncXPLW_errorPanel",
			"failureItem": "ncXPLW_failureItem",
			"failurePanel": "ncXPLW_failurePanel",
			"failureProvider": "ncXPLW_failureProvider",
			"failureTitle": "ncXPLW_failureTitle",
			"footer": "ncXPLW_footer",
			"footerHint": "ncXPLW_footerHint",
			"modelDescription": "ncXPLW_modelDescription",
			"modelId": "ncXPLW_modelId",
			"modelLine": "ncXPLW_modelLine",
			"modelName": "ncXPLW_modelName",
			"optionButton": "ncXPLW_optionButton",
			"providerCount": "ncXPLW_providerCount",
			"providerLabel": "ncXPLW_providerLabel",
			"selectedBadge": "ncXPLW_selectedBadge",
			"subtitle": "ncXPLW_subtitle"
		};
		//#endregion
		//#region src/client/ModelPicker.tsx
		function errorText$2(reason) {
			if (reason instanceof Error && reason.message.trim()) return reason.message.trim();
			if (typeof reason === "string" && reason.trim()) return reason.trim();
			return "模型目录加载失败，请稍后重试。";
		}
		const ModelPicker = ({ title, current, onSelect, onClose, fetchModels }) => {
			const [groups, setGroups] = (0, react.useState)([]);
			const [failures, setFailures] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [error, setError] = (0, react.useState)(null);
			const [reloadToken, setReloadToken] = (0, react.useState)(0);
			const dialogRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				dialogRef.current?.querySelector("button:not([disabled]), [tabindex]:not([tabindex=\"-1\"])")?.focus();
			}, []);
			(0, react.useEffect)(() => {
				let active = true;
				setLoading(true);
				setError(null);
				setGroups([]);
				setFailures([]);
				if (!fetchModels) {
					setError("模型目录服务未连接，请更新或重启 DeepSeek Harness 后重试。");
					setLoading(false);
					return () => {
						active = false;
					};
				}
				fetchModels().then((result) => {
					if (!active) return;
					setGroups(result.groups ?? []);
					setFailures(result.failures ?? []);
					setLoading(false);
				}, (reason) => {
					if (!active) return;
					setError(errorText$2(reason));
					setLoading(false);
				});
				return () => {
					active = false;
				};
			}, [fetchModels, reloadToken]);
			const choiceCount = groups.reduce((count, group) => count + group.models.length, 0);
			const hasFailures = failures.length > 0;
			const pickerContent = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: `${value_mode_module_css_default.modalBackdrop} ${value_mode_polish_module_css_default.modalBackdrop}`,
				role: "presentation",
				"data-value-mode-model-picker": "true",
				onClick: onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: dialogRef,
					className: `${value_mode_module_css_default.modalContent} ${value_mode_polish_module_css_default.modalContent}`,
					role: "dialog",
					"aria-modal": "true",
					"aria-label": title,
					onClick: (event) => event.stopPropagation(),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_module_css_default.header,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: value_mode_module_css_default.titleArea,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: value_mode_module_css_default.title,
									children: title
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: `${value_mode_module_css_default.desc} ${value_mode_picker_module_css_default.subtitle}`,
									children: "仅显示已配置并可访问的供应商模型，不会读取或填写 API Key。"
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: value_mode_module_css_default.button,
								"aria-label": "关闭模型选择器",
								onClick: onClose,
								children: "×"
							})]
						}),
						loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: value_mode_module_css_default.desc,
							role: "status",
							children: "加载已配置模型列表中..."
						}),
						error && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_picker_module_css_default.errorPanel,
							role: "alert",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: value_mode_picker_module_css_default.errorMessage,
								children: error
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: value_mode_module_css_default.button,
								onClick: () => setReloadToken((value) => value + 1),
								children: "重试"
							})]
						}),
						!loading && hasFailures && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_picker_module_css_default.failurePanel,
							role: "status",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: value_mode_picker_module_css_default.failureTitle,
								children: choiceCount > 0 ? "部分供应商暂时无法读取模型，已成功加载的模型仍可选择。" : "已配置供应商暂时无法读取模型。"
							}), failures.map((failure) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: value_mode_picker_module_css_default.failureItem,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: value_mode_picker_module_css_default.failureProvider,
									children: failure.name || failure.id
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: failure.message.trim() || "模型列表读取失败。" })]
							}, `${failure.id}:${failure.message}`))]
						}),
						!loading && groups.length === 0 && !error && !hasFailures && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: value_mode_module_css_default.desc,
							role: "status",
							children: "暂无已配置的模型。请先在 DeepSeek Harness 设置中添加并启用供应商。"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: `${value_mode_module_css_default.modelList} ${value_mode_polish_module_css_default.modelList}`,
							children: groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: `${value_mode_module_css_default.providerGroup} ${value_mode_picker_module_css_default.providerLabel}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: group.name || group.id }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: value_mode_picker_module_css_default.providerCount,
									children: [group.models.length, " 个模型"]
								})]
							}), group.models.map((model) => {
								const selected = current?.provider === group.id && current?.model === model.id;
								const reasoningDefault = model.reasoning?.defaultEffort;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: `${value_mode_module_css_default.modelOption} ${value_mode_picker_module_css_default.optionButton} ${selected ? value_mode_module_css_default.modelOptionSelected : ""}`,
									"aria-pressed": selected,
									"data-model-provider": group.id,
									"data-model-id": model.id,
									"data-testid": `value-mode-model-${model.id}`,
									onClick: () => {
										onSelect({
											provider: group.id,
											model: model.id,
											...reasoningDefault ? { reasoningEffort: reasoningDefault } : {}
										});
										onClose();
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: value_mode_picker_module_css_default.modelLine,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: value_mode_picker_module_css_default.modelName,
												children: model.name || model.id
											}), selected && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: value_mode_picker_module_css_default.selectedBadge,
												children: "当前"
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: value_mode_picker_module_css_default.modelId,
											children: [
												group.id,
												" / ",
												model.id
											]
										}),
										model.description && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: value_mode_picker_module_css_default.modelDescription,
											children: model.description
										})
									]
								}, `${group.id}:${model.id}`);
							})] }, group.id))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_picker_module_css_default.footer,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_picker_module_css_default.footerHint,
								children: choiceCount > 0 ? `${choiceCount} 个可用模型` : "模型来自当前运行时目录"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: value_mode_module_css_default.button,
								onClick: onClose,
								children: "关闭"
							})]
						})
					]
				})
			});
			return typeof document === "undefined" ? pickerContent : (0, react_dom.createPortal)(pickerContent, document.body);
		};
		//#endregion
		//#region src/client/useValueModeConfig.ts
		const EMPTY_GENERIC_SETTINGS_SNAPSHOT = {
			status: "ready",
			value: void 0,
			base: void 0,
			user: void 0,
			revision: void 0,
			writable: false,
			mode: "memory",
			value: void 0
		};
		const subscribeNothing = (_listener) => () => {};
		/**
		* Read the latest settings namespace value and subscribe to host commits.
		* Components may still be used standalone with a plain `config` prop, while
		* the injected desktop surfaces receive immediate updates after `scope.set`.
		*/
		function useValueModeConfig(settingsScope, fallback) {
			return useSettingsValue(settingsScope, fallback);
		}
		/** Read and subscribe to any host settings namespace used by the client UI. */
		function useSettingsValue(settingsScope, fallback) {
			const subscribe = (0, react.useCallback)((listener) => settingsScope ? settingsScope.subscribe(listener) : subscribeNothing(listener), [settingsScope]);
			const getSnapshot = (0, react.useCallback)(() => settingsScope ? settingsScope.getSnapshot() : EMPTY_GENERIC_SETTINGS_SNAPSHOT, [settingsScope]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
			return settingsScope ? snapshot.value ?? fallback : fallback;
		}
		//#endregion
		//#region \0dsh-css:packages/dsh-value-mode/src/client/value-mode-a11y.module.css.mjs
		const css$1 = ".AMg6Ua_onboarding{box-sizing:border-box;overflow-wrap:anywhere;background:#3b82f614;border:1px dashed #3b82f64d;border-radius:6px;flex-direction:column;gap:6px;min-width:0;padding:12px;display:flex}.AMg6Ua_onboardingTitle{color:#93c5fd;font-size:12px;font-weight:600}.AMg6Ua_onboardingText{color:#bfdbfe;font-size:11px;line-height:1.4}.AMg6Ua_mutedNote{color:#6b7280;font-size:11px}.AMg6Ua_error{box-sizing:border-box;color:#fecaca;overflow-wrap:anywhere;background:#7f1d1d38;border:1px solid #f8717161;border-radius:8px;padding:9px 12px;font-size:12px;line-height:1.45}.AMg6Ua_toggleButton{font:inherit;border:0;flex:none;padding:0}.AMg6Ua_strategyButton{width:100%;color:inherit;font:inherit;text-align:left}.AMg6Ua_accordionToggle{width:100%;color:inherit;font:inherit;text-align:left;background:0 0;border:0;padding:0}.AMg6Ua_fieldValue{flex:none}";
		const tagId$1 = "@linxin666/dsh-value-mode/value-mode-a11y.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-value-mode";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var value_mode_a11y_module_css_default = {
			"accordionToggle": "AMg6Ua_accordionToggle",
			"error": "AMg6Ua_error",
			"fieldValue": "AMg6Ua_fieldValue",
			"mutedNote": "AMg6Ua_mutedNote",
			"onboarding": "AMg6Ua_onboarding",
			"onboardingText": "AMg6Ua_onboardingText",
			"onboardingTitle": "AMg6Ua_onboardingTitle",
			"strategyButton": "AMg6Ua_strategyButton",
			"toggleButton": "AMg6Ua_toggleButton"
		};
		//#endregion
		//#region src/client/telemetry.ts
		const emittedDedupeKeys = /* @__PURE__ */ new Set();
		/**
		* Best-effort renderer-to-main bridge. The renderer can only construct the
		* closed TypeScript vocabulary above; Electron performs the runtime validation
		* again before passing an event to ProductMetricsRecorder.
		*/
		function reportValueModeTelemetry(event, dedupeKey) {
			const bridge = typeof window === "undefined" ? void 0 : window.dshDesktop;
			if (typeof bridge?.recordValueModeEvent !== "function") return;
			if (dedupeKey !== void 0 && emittedDedupeKeys.has(dedupeKey)) return;
			if (dedupeKey !== void 0) {
				emittedDedupeKeys.add(dedupeKey);
				setTimeout(() => emittedDedupeKeys.delete(dedupeKey), 1e3);
			}
			try {
				Promise.resolve(bridge.recordValueModeEvent(event)).catch(() => {});
			} catch {}
		}
		//#endregion
		//#region src/client/ValueModeSettingsCard.tsx
		const ValueModeSettingsCard = ({ config, settingsScope, defaultModelScope, onChange, fetchModels }) => {
			const liveConfig = useValueModeConfig(settingsScope, config);
			const defaultExpert = useSettingsValue(defaultModelScope, void 0);
			const resolved = resolveResolvedConfig(liveConfig, defaultExpert);
			const configured = isConfigured(liveConfig, defaultExpert);
			const [pickingTarget, setPickingTarget] = (0, react.useState)(null);
			const [showAdvanced, setShowAdvanced] = (0, react.useState)(false);
			const [saveError, setSaveError] = (0, react.useState)(null);
			const persist = (patch) => {
				setSaveError(null);
				Promise.resolve().then(() => onChange(patch)).then(() => {
					if (typeof patch.enabled === "boolean") reportValueModeTelemetry({
						kind: "state",
						state: patch.enabled ? "enabled" : "disabled",
						source: "settings"
					});
					if (patch.strategy !== void 0) reportValueModeTelemetry({
						kind: "strategy",
						strategy: patch.strategy
					});
				}).catch((reason) => {
					setSaveError(reason instanceof Error ? reason.message : "配置写入失败，请重试。");
					if (typeof patch.enabled === "boolean") reportValueModeTelemetry({
						kind: "state",
						state: "failed",
						source: "settings"
					});
				});
			};
			const handleToggleEnable = () => {
				if (!configured && !resolved.enabled) return;
				persist({ enabled: !resolved.enabled });
			};
			const handleModelSelected = (selection) => {
				persist(pickingTarget === "executor" ? { executor: selection } : { expert: selection });
				setPickingTarget(null);
			};
			const formatModelLabel = (route) => {
				if (!route?.provider || !route?.model) return "未配置";
				return `${route.provider} / ${route.model}`;
			};
			const statusClass = resolved.enabled ? configured ? value_mode_module_css_default.badgeActive : value_mode_module_css_default.badgeDegraded : value_mode_module_css_default.badgeInactive;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${value_mode_module_css_default.card} ${value_mode_polish_module_css_default.card}`,
				"data-value-mode-card": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `${value_mode_module_css_default.header} ${value_mode_polish_module_css_default.header}`,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `${value_mode_module_css_default.titleArea} ${value_mode_polish_module_css_default.titleArea}`,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: `${value_mode_module_css_default.titleRow} ${value_mode_polish_module_css_default.titleRow}`,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `${value_mode_module_css_default.title} ${value_mode_polish_module_css_default.title}`,
										children: "性价比模式 (Value Mode)"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `${value_mode_module_css_default.badge} ${statusClass}`,
										children: resolved.enabled ? configured ? "已开启" : "配置不完整" : "已关闭"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: value_mode_module_css_default.desc,
									children: "由专家主控模型理解和拆解任务，再按需派发副模型子代理完成并行调查、文件处理和局部实现，在交付质量与模型成本之间取得平衡。"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: `${value_mode_module_css_default.desc} ${value_mode_a11y_module_css_default.mutedNote}`,
									children: "模型直接从你已经配置好的供应商中选择，不需要重新填写 API Key。"
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: `${value_mode_module_css_default.switchArea} ${value_mode_polish_module_css_default.switchArea}`,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "switch",
								"aria-checked": resolved.enabled,
								"aria-label": "开启性价比模式",
								className: `${value_mode_module_css_default.toggleSwitch} ${resolved.enabled ? value_mode_module_css_default.toggleSwitchChecked : ""} ${value_mode_a11y_module_css_default.toggleButton}`,
								onClick: handleToggleEnable,
								disabled: !configured && !resolved.enabled,
								title: !configured && !resolved.enabled ? "请先配置专家主控模型和副模型" : resolved.enabled ? "点击关闭" : "点击开启",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: value_mode_module_css_default.toggleKnob })
							})
						})]
					}),
					saveError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: value_mode_a11y_module_css_default.error,
						role: "alert",
						children: saveError
					}),
					!configured && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_a11y_module_css_default.onboarding,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: value_mode_a11y_module_css_default.onboardingTitle,
							children: "首次使用指引"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_a11y_module_css_default.onboardingText,
							children: [
								"1. 确认【专家主控模型】（默认使用当前默认模型）；",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								"2. 选择【副模型 / 子代理执行模型】；",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								"3. 选择运行策略并开启，主控会按任务需要派发子代理。"
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_module_css_default.section,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: value_mode_module_css_default.sectionTitle,
								children: "模型配置"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: `${value_mode_module_css_default.modelRow} ${value_mode_polish_module_css_default.modelRow}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: `${value_mode_module_css_default.modelInfo} ${value_mode_polish_module_css_default.modelInfo}`,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: value_mode_module_css_default.modelRole,
											children: "专家主控模型 (Expert Controller)"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: `${value_mode_module_css_default.modelValue} ${value_mode_polish_module_css_default.modelValue}`,
											children: formatModelLabel(resolved.expert)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: `${value_mode_module_css_default.modelDesc} ${value_mode_polish_module_css_default.modelDesc}`,
											children: "负责理解任务、拆分工作、汇总子代理结果并完成最终交付。"
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${value_mode_module_css_default.button} ${value_mode_polish_module_css_default.interactiveButton} ${value_mode_polish_module_css_default.modelAction}`,
									"aria-label": "更换专家主控模型",
									onClick: () => setPickingTarget("expert"),
									children: "更换"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: `${value_mode_module_css_default.modelRow} ${value_mode_polish_module_css_default.modelRow}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: `${value_mode_module_css_default.modelInfo} ${value_mode_polish_module_css_default.modelInfo}`,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: value_mode_module_css_default.modelRole,
											children: "副模型 / 子代理执行模型 (Subagent Worker)"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: `${value_mode_module_css_default.modelValue} ${value_mode_polish_module_css_default.modelValue}`,
											children: formatModelLabel(resolved.executor)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: `${value_mode_module_css_default.modelDesc} ${value_mode_polish_module_css_default.modelDesc}`,
											children: "只执行主控派发的单项任务，适合并行调查、局部实现和重复性工作。"
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${value_mode_module_css_default.button} ${value_mode_polish_module_css_default.interactiveButton} ${value_mode_polish_module_css_default.modelAction}`,
									"aria-label": "更换副模型子代理执行模型",
									onClick: () => setPickingTarget("executor"),
									children: "更换"
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_module_css_default.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: value_mode_module_css_default.sectionTitle,
							children: "运行策略"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `${value_mode_module_css_default.strategyGroup} ${value_mode_polish_module_css_default.strategyGroup}`,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-pressed": resolved.strategy === "saver",
									className: `${value_mode_module_css_default.strategyItem} ${value_mode_a11y_module_css_default.strategyButton} ${resolved.strategy === "saver" ? value_mode_module_css_default.strategyItemSelected : ""}`,
									onClick: () => persist({ strategy: "saver" }),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.strategyTitle,
										children: "更省"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.strategyDesc,
										children: "优先由主控直接处理，只在需要并行或明确拆分时派发子代理。"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-pressed": resolved.strategy === "balanced",
									className: `${value_mode_module_css_default.strategyItem} ${value_mode_a11y_module_css_default.strategyButton} ${resolved.strategy === "balanced" ? value_mode_module_css_default.strategyItemSelected : ""}`,
									onClick: () => persist({ strategy: "balanced" }),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.strategyTitle,
										children: "智能平衡 (默认)"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.strategyDesc,
										children: "复杂设计、疑难问题和重要改动按需派发副模型并由主控复核。"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									"aria-pressed": resolved.strategy === "powerful",
									className: `${value_mode_module_css_default.strategyItem} ${value_mode_a11y_module_css_default.strategyButton} ${resolved.strategy === "powerful" ? value_mode_module_css_default.strategyItemSelected : ""}`,
									onClick: () => persist({ strategy: "powerful" }),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.strategyTitle,
										children: "更强"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.strategyDesc,
										children: "更积极地派发并行子任务，主控统一审查结果和风险。"
									})]
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_module_css_default.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: value_mode_module_css_default.checkboxRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: resolved.allowReview,
								onChange: (event) => persist({ allowReview: event.target.checked })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "重要改动完成后保留主控复核" })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: value_mode_module_css_default.checkboxRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: resolved.showExpertActivity,
								onChange: (event) => persist({ showExpertActivity: event.target.checked })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "显式显示主控与子代理活动" })]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_module_css_default.accordion,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: `${value_mode_module_css_default.accordionHeader} ${value_mode_a11y_module_css_default.accordionToggle}`,
							"aria-expanded": showAdvanced,
							onClick: () => setShowAdvanced((value) => !value),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "高级成本护栏 (Advanced Guardrails)" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								children: showAdvanced ? "▲" : "▼"
							})]
						}), showAdvanced && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_module_css_default.accordionBody,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: value_mode_module_css_default.fieldRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.fieldLabel,
										children: "主控最大输出 Token:"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										"aria-label": "主控最大输出 Token",
										className: `${value_mode_module_css_default.inputNumber} ${value_mode_a11y_module_css_default.fieldValue}`,
										value: resolved.maxOutputTokens,
										min: 256,
										max: 16384,
										step: 256,
										onChange: (event) => persist({ maxOutputTokens: Number.parseInt(event.target.value, 10) || 4096 })
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: value_mode_module_css_default.fieldRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.fieldLabel,
										children: "主控上下文最大字符数:"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										"aria-label": "主控上下文最大字符数",
										className: `${value_mode_module_css_default.inputNumber} ${value_mode_a11y_module_css_default.fieldValue}`,
										value: resolved.maxContextChars,
										min: 1e3,
										max: 64e3,
										step: 1e3,
										onChange: (event) => persist({ maxContextChars: Number.parseInt(event.target.value, 10) || 16e3 })
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: value_mode_module_css_default.fieldRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.fieldLabel,
										children: "子代理最大深度:"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										"aria-label": "子代理最大深度",
										className: `${value_mode_module_css_default.inputNumber} ${value_mode_a11y_module_css_default.fieldValue}`,
										value: resolved.maxDepth,
										min: 1,
										max: 2,
										onChange: (event) => persist({ maxDepth: Number.parseInt(event.target.value, 10) || 1 })
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: value_mode_module_css_default.fieldRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.fieldLabel,
										children: "连续失败升级阈值:"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										"aria-label": "连续失败升级阈值",
										className: `${value_mode_module_css_default.inputNumber} ${value_mode_a11y_module_css_default.fieldValue}`,
										value: resolved.consecutiveFailuresThreshold,
										min: 1,
										max: 10,
										step: 1,
										onChange: (event) => persist({ consecutiveFailuresThreshold: Number.parseInt(event.target.value, 10) || 2 })
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: value_mode_module_css_default.fieldRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: value_mode_module_css_default.fieldLabel,
										children: "每轮最大专家调用数:"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										"aria-label": "每轮最大专家调用数",
										className: `${value_mode_module_css_default.inputNumber} ${value_mode_a11y_module_css_default.fieldValue}`,
										value: resolved.maxExpertCallsPerTurn,
										min: 1,
										max: 10,
										step: 1,
										onChange: (event) => persist({ maxExpertCallsPerTurn: Number.parseInt(event.target.value, 10) || 3 })
									})]
								})
							]
						})]
					}),
					pickingTarget && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelPicker, {
						title: pickingTarget === "executor" ? "选择副模型 / 子代理执行模型" : "选择专家主控模型",
						current: pickingTarget === "executor" ? resolved.executor : resolved.expert,
						onSelect: handleModelSelected,
						onClose: () => setPickingTarget(null),
						fetchModels
					})
				]
			});
		};
		//#endregion
		//#region \0dsh-css:packages/dsh-value-mode/src/client/value-mode-header.module.css.mjs
		const css = "._7Tz1MG_root{align-items:center;min-width:0;display:inline-flex;position:relative}._7Tz1MG_popover{box-sizing:border-box;z-index:1000;overflow:hidden auto;top:max(52px, calc(env(safe-area-inset-top,0px) + 44px))!important;right:max(12px, env(safe-area-inset-right,0px))!important;width:min(320px,100vw - 24px)!important;max-width:calc(100vw - 24px)!important;height:auto!important;max-height:calc(100dvh - 68px)!important;margin:0!important;position:fixed!important;left:auto!important}html[data-dsh-desktop-window-chrome=true] ._7Tz1MG_root ._7Tz1MG_popover{top:max(52px, calc(env(safe-area-inset-top,0px) + 44px))!important;height:auto!important;max-height:calc(100dvh - 68px)!important}html[data-dsh-desktop-window-chrome=true] body ._7Tz1MG_popover{top:max(52px, calc(env(safe-area-inset-top,0px) + 44px))!important;height:auto!important;min-height:0!important;max-height:calc(100dvh - 68px)!important}._7Tz1MG_onboardingPopover{background:radial-gradient(circle at 100% 0,#3b82f629,#0000 42%),linear-gradient(145deg,#1c2432 0%,#18181b 72%)!important;border-color:#60a5fa4d!important;border-radius:14px!important;gap:14px!important;width:min(420px,100vw - 24px)!important;max-width:calc(100vw - 24px)!important;padding:18px!important;box-shadow:0 20px 55px #00000094,0 0 0 1px #60a5fa0f!important}._7Tz1MG_heroOnboardingPopover{height:auto!important}._7Tz1MG_setupHeader{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}._7Tz1MG_setupEyebrow{color:#7dd3fc;letter-spacing:.1em;text-transform:uppercase;font-size:10px;font-weight:700}._7Tz1MG_setupTitle{color:#f8fafc;letter-spacing:-.02em;margin:4px 0 0;font-size:20px;font-weight:700}._7Tz1MG_setupClose{color:#cbd5e1;cursor:pointer;background:#ffffff0a;border:1px solid #ffffff1a;border-radius:8px;flex:none;width:28px;height:28px;padding:0;font-size:18px;line-height:1}._7Tz1MG_setupClose:hover{color:#fff;background:#7dd3fc1a;border-color:#7dd3fc80}._7Tz1MG_setupLead{color:#cbd5e1;margin:-2px 0 0;font-size:12px;line-height:1.6}._7Tz1MG_setupSteps{flex-direction:column;gap:8px;display:flex}._7Tz1MG_setupStep{background:#0f172a85;border:1px solid #ffffff17;border-radius:10px;grid-template-columns:28px minmax(0,1fr) auto;align-items:start;gap:10px;padding:11px;transition:border-color .16s,background .16s;display:grid}._7Tz1MG_setupStepReady{background:#064e3b2e;border-color:#34d3994d}._7Tz1MG_setupStepNumber{color:#93c5fd;letter-spacing:.08em;background:#60a5fa29;border-radius:8px;place-items:center;width:28px;height:28px;font-size:10px;font-weight:800;display:grid}._7Tz1MG_setupStepReady ._7Tz1MG_setupStepNumber{color:#6ee7b7;background:#34d39929}._7Tz1MG_setupStepBody{min-width:0}._7Tz1MG_setupStepHeading{color:#f8fafc;font-size:12px;font-weight:700;line-height:1.35}._7Tz1MG_setupStepValue{color:#93c5fd;text-overflow:ellipsis;white-space:nowrap;margin-top:3px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;overflow:hidden}._7Tz1MG_setupDefaultNote{color:#94a3b8;margin-top:3px;font-size:10px;line-height:1.4}._7Tz1MG_setupModelButton{align-self:center;min-width:48px}._7Tz1MG_setupStrategy{flex-direction:column;gap:8px;display:flex}._7Tz1MG_setupStrategyLabel{color:#cbd5e1;font-size:11px;font-weight:700}._7Tz1MG_setupFooter{justify-content:space-between;align-items:center;gap:10px;padding-top:2px;display:flex}._7Tz1MG_setupHint{color:#64748b;min-width:0;font-size:10px;line-height:1.4}._7Tz1MG_setupSubmit{border-radius:8px;flex:none;padding:8px 12px;font-size:11px}._7Tz1MG_setupError{color:#fca5a5;background:#7f1d1d33;border:1px solid #f8717159;border-radius:8px;padding:8px 10px;font-size:11px;line-height:1.45}._7Tz1MG_popoverHeader,._7Tz1MG_historyToggle,._7Tz1MG_actionRow,._7Tz1MG_actionStack{min-width:0}._7Tz1MG_popoverHeader,._7Tz1MG_historyToggle,._7Tz1MG_actionRow{align-items:center;gap:6px;display:flex}._7Tz1MG_popoverHeader,._7Tz1MG_historyToggle{justify-content:space-between}._7Tz1MG_actionStack{flex-direction:column;gap:6px;margin-top:4px;display:flex}._7Tz1MG_actionRow{align-items:stretch}._7Tz1MG_actionButton{flex:1 1 0;min-width:0;padding:4px 6px;font-size:11px}._7Tz1MG_historyToggle{color:#93c5fd;width:100%;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;padding:0;font-size:11px}._7Tz1MG_historyTime{color:#9ca3af}._7Tz1MG_savingsValue{font-weight:600}@media (width<=560px){._7Tz1MG_popover{top:max(48px, calc(env(safe-area-inset-top,0px) + 40px))!important;width:calc(100vw - 16px)!important;max-width:calc(100vw - 16px)!important;max-height:calc(100dvh - 60px)!important;right:8px!important}html[data-dsh-desktop-window-chrome=true] ._7Tz1MG_root ._7Tz1MG_popover{top:max(48px, calc(env(safe-area-inset-top,0px) + 40px))!important}html[data-dsh-desktop-window-chrome=true] body ._7Tz1MG_popover{top:max(48px, calc(env(safe-area-inset-top,0px) + 40px))!important;max-height:calc(100dvh - 60px)!important}._7Tz1MG_onboardingPopover{width:calc(100vw - 16px)!important;max-width:calc(100vw - 16px)!important;padding:14px!important}._7Tz1MG_setupStep{grid-template-columns:28px minmax(0,1fr)}._7Tz1MG_setupModelButton{grid-column:2;justify-self:start}._7Tz1MG_setupFooter{flex-direction:column;align-items:stretch}._7Tz1MG_setupSubmit{width:100%}}";
		const tagId = "@linxin666/dsh-value-mode/value-mode-header.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@linxin666/dsh-value-mode";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var value_mode_header_module_css_default = {
			"actionButton": "_7Tz1MG_actionButton",
			"actionRow": "_7Tz1MG_actionRow",
			"actionStack": "_7Tz1MG_actionStack",
			"heroOnboardingPopover": "_7Tz1MG_heroOnboardingPopover",
			"historyTime": "_7Tz1MG_historyTime",
			"historyToggle": "_7Tz1MG_historyToggle",
			"onboardingPopover": "_7Tz1MG_onboardingPopover",
			"popover": "_7Tz1MG_popover",
			"popoverHeader": "_7Tz1MG_popoverHeader",
			"root": "_7Tz1MG_root",
			"savingsValue": "_7Tz1MG_savingsValue",
			"setupClose": "_7Tz1MG_setupClose",
			"setupDefaultNote": "_7Tz1MG_setupDefaultNote",
			"setupError": "_7Tz1MG_setupError",
			"setupEyebrow": "_7Tz1MG_setupEyebrow",
			"setupFooter": "_7Tz1MG_setupFooter",
			"setupHeader": "_7Tz1MG_setupHeader",
			"setupHint": "_7Tz1MG_setupHint",
			"setupLead": "_7Tz1MG_setupLead",
			"setupModelButton": "_7Tz1MG_setupModelButton",
			"setupStep": "_7Tz1MG_setupStep",
			"setupStepBody": "_7Tz1MG_setupStepBody",
			"setupStepHeading": "_7Tz1MG_setupStepHeading",
			"setupStepNumber": "_7Tz1MG_setupStepNumber",
			"setupStepReady": "_7Tz1MG_setupStepReady",
			"setupStepValue": "_7Tz1MG_setupStepValue",
			"setupSteps": "_7Tz1MG_setupSteps",
			"setupStrategy": "_7Tz1MG_setupStrategy",
			"setupStrategyLabel": "_7Tz1MG_setupStrategyLabel",
			"setupSubmit": "_7Tz1MG_setupSubmit",
			"setupTitle": "_7Tz1MG_setupTitle"
		};
		//#endregion
		//#region src/client/ValueModeHeaderStatus.tsx
		function formatModel$1(route) {
			if (!isCompleteModelRoute(route)) return "未配置";
			return `${route.provider} / ${route.model}`;
		}
		function renderPortal(node) {
			return typeof document === "undefined" ? node : (0, react_dom.createPortal)(node, document.body);
		}
		const ValueModeHeaderStatus = ({ config, sessionId, useSessions, settingsScope, defaultModelScope, sessionMetrics, sessionOverride, onChange, onSessionOverrideChange, fetchModels, onOpenSettings }) => {
			const [open, setOpen] = (0, react.useState)(false);
			const [onboarding, setOnboarding] = (0, react.useState)(false);
			const [pickingTarget, setPickingTarget] = (0, react.useState)(null);
			const [scope, setScope] = (0, react.useState)("global");
			const [showHistory, setShowHistory] = (0, react.useState)(false);
			const [setupDraft, setSetupDraft] = (0, react.useState)({
				executor: {},
				expert: {},
				strategy: "balanced"
			});
			const [setupError, setSetupError] = (0, react.useState)(null);
			const [saving, setSaving] = (0, react.useState)(false);
			const rootRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const handledEntryRef = (0, react.useRef)(null);
			const activePreset = useSessions((state) => state.byId[sessionId]?.agentPreset);
			const liveConfig = useValueModeConfig(settingsScope, config);
			const defaultExpert = useSettingsValue(defaultModelScope, void 0);
			const activeConfig = resolveSessionConfig(liveConfig, sessionOverride);
			const resolved = resolveResolvedConfig(activeConfig, defaultExpert);
			const configured = isConfigured(activeConfig, defaultExpert);
			const explicitlyConfigured = hasExplicitModelRoutes(activeConfig);
			const label = !configured ? "性价比 · 待配置" : !resolved.enabled ? "性价比 · 已关闭" : `性价比 · ${{
				saver: "更省",
				balanced: "平衡",
				powerful: "更强"
			}[resolved.strategy] || "平衡"}`;
			const startOnboarding = () => {
				setSetupDraft({
					executor: { ...resolved.executor },
					expert: { ...resolved.expert },
					strategy: resolved.strategy
				});
				setScope("global");
				setSetupError(null);
				setOnboarding(true);
				setOpen(true);
				reportValueModeTelemetry({
					kind: "onboarding",
					outcome: "shown",
					surface: "header"
				}, `value-mode-onboarding-shown:header:${sessionId}`);
			};
			const dismissOnboarding = () => {
				if (onboarding) reportValueModeTelemetry({
					kind: "onboarding",
					outcome: "dismissed",
					surface: "header"
				});
				setOpen(false);
				setOnboarding(false);
			};
			const reportSetupError = (reason, fallback) => {
				setSetupError(reason instanceof Error ? reason.message : fallback);
				setOpen(true);
			};
			const persistGlobalPatch = (patch, fallback) => {
				Promise.resolve().then(() => onChange(patch)).catch((reason) => reportSetupError(reason, fallback));
			};
			const enableCurrentScope = async (source = "manual") => {
				try {
					if (scope === "session" && onSessionOverrideChange) onSessionOverrideChange({
						...sessionOverride,
						enabled: true
					});
					else await onChange({ enabled: true });
					reportValueModeTelemetry({
						kind: "state",
						state: "enabled",
						source
					});
				} catch (reason) {
					reportValueModeTelemetry({
						kind: "state",
						state: "failed",
						source
					});
					reportSetupError(reason, "性价比模式开启失败，请重试。");
				}
			};
			(0, react.useEffect)(() => {
				if (activePreset !== "value-mode") {
					setOpen(false);
					setOnboarding(false);
					setPickingTarget(null);
					setShowHistory(false);
					handledEntryRef.current = null;
					return;
				}
				const entryKey = `${sessionId}:value-mode`;
				if (handledEntryRef.current === entryKey) return;
				handledEntryRef.current = entryKey;
				reportValueModeTelemetry({
					kind: "entry",
					configured: explicitlyConfigured
				}, "value-mode-entry");
				if (explicitlyConfigured) {
					if (!resolved.enabled) enableCurrentScope("auto");
				} else startOnboarding();
			}, [
				activePreset,
				sessionId,
				explicitlyConfigured
			]);
			(0, react.useEffect)(() => {
				if (!onboarding) return;
				setSetupDraft((draft) => ({
					...draft,
					expert: isCompleteModelRoute(draft.expert) ? draft.expert : { ...resolved.expert }
				}));
			}, [
				onboarding,
				defaultExpert?.provider,
				defaultExpert?.model,
				defaultExpert?.reasoningEffort,
				resolved.expert.provider,
				resolved.expert.model,
				resolved.expert.reasoningEffort
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const handleClickOutside = (event) => {
					const target = event.target;
					if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
					if (pickingTarget) return;
					dismissOnboarding();
				};
				const handleKeyDown = (event) => {
					if (event.key === "Escape") {
						if (pickingTarget) {
							setPickingTarget(null);
							return;
						}
						dismissOnboarding();
					}
				};
				document.addEventListener("mousedown", handleClickOutside);
				document.addEventListener("keydown", handleKeyDown);
				return () => {
					document.removeEventListener("mousedown", handleClickOutside);
					document.removeEventListener("keydown", handleKeyDown);
				};
			}, [
				open,
				onboarding,
				pickingTarget
			]);
			(0, react.useEffect)(() => {
				if (!open) {
					triggerRef.current?.focus();
					return;
				}
				(pickingTarget ? document.querySelector("[data-value-mode-model-picker=\"true\"] [role=\"dialog\"]") : panelRef.current)?.querySelector("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex=\"-1\"])")?.focus();
			}, [
				open,
				onboarding,
				pickingTarget
			]);
			const handleStrategyChange = (nextStrategy) => {
				if (onboarding) {
					setSetupDraft((draft) => ({
						...draft,
						strategy: nextStrategy
					}));
					reportValueModeTelemetry({
						kind: "strategy",
						strategy: nextStrategy
					});
					return;
				}
				if (scope === "session" && onSessionOverrideChange) onSessionOverrideChange({
					...sessionOverride,
					strategy: nextStrategy
				});
				else persistGlobalPatch({ strategy: nextStrategy }, "策略保存失败，请重试。");
				reportValueModeTelemetry({
					kind: "strategy",
					strategy: nextStrategy
				});
			};
			const handleModelSelect = (selection) => {
				if (onboarding) setSetupDraft((draft) => ({
					...draft,
					[pickingTarget]: selection
				}));
				else if (pickingTarget === "executor") persistGlobalPatch({ executor: selection }, "副模型保存失败，请重试。");
				else if (pickingTarget === "expert") if (scope === "session" && onSessionOverrideChange) onSessionOverrideChange({
					...sessionOverride,
					expert: selection
				});
				else persistGlobalPatch({ expert: selection }, "专家主控模型保存失败，请重试。");
				setPickingTarget(null);
			};
			const handleCompleteSetup = async () => {
				if (!isCompleteModelRoute(setupDraft.expert) || !isCompleteModelRoute(setupDraft.executor)) {
					setSetupError("请先选择专家主控模型和副模型 / 子代理执行模型。");
					return;
				}
				setSaving(true);
				setSetupError(null);
				try {
					await onChange({
						expert: setupDraft.expert,
						executor: setupDraft.executor
					});
					await onChange({ strategy: setupDraft.strategy });
					await onChange({ enabled: true });
					setOnboarding(false);
					setOpen(false);
					reportValueModeTelemetry({
						kind: "onboarding",
						outcome: "completed",
						surface: "header"
					});
					reportValueModeTelemetry({
						kind: "state",
						state: "enabled",
						source: "onboarding"
					});
				} catch (reason) {
					reportValueModeTelemetry({
						kind: "onboarding",
						outcome: "failed",
						surface: "header"
					});
					setSetupError(reason instanceof Error ? reason.message : "配置写入失败，请重试。");
				} finally {
					setSaving(false);
				}
			};
			const handleToggle = async () => {
				const nextEnabled = !resolved.enabled;
				try {
					if (scope === "session" && onSessionOverrideChange) onSessionOverrideChange({
						...sessionOverride,
						enabled: nextEnabled
					});
					else await onChange({ enabled: nextEnabled });
					reportValueModeTelemetry({
						kind: "state",
						state: nextEnabled ? "enabled" : "disabled",
						source: "manual"
					});
				} catch (reason) {
					reportValueModeTelemetry({
						kind: "state",
						state: "failed",
						source: "manual"
					});
					reportSetupError(reason, nextEnabled ? "性价比模式开启失败，请重试。" : "性价比模式关闭失败，请重试。");
				}
			};
			if (activePreset !== "value-mode") return null;
			const controllerCalls = sessionMetrics?.controllerCalls ?? sessionMetrics?.expertCalls ?? 0;
			const subagentCalls = sessionMetrics?.subagentCalls ?? sessionMetrics?.executorCalls ?? 0;
			const statusClass = !configured ? value_mode_module_css_default.badgeDegraded : resolved.enabled ? value_mode_module_css_default.badgeActive : value_mode_module_css_default.badgeInactive;
			const quickPopover = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: value_mode_header_module_css_default.popoverHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: value_mode_module_css_default.title,
						children: "性价比模式"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${value_mode_module_css_default.badge} ${statusClass}`,
						children: resolved.enabled ? configured ? "已开启" : "配置不完整" : configured ? "已关闭" : "待配置"
					})]
				}),
				setupError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: value_mode_header_module_css_default.setupError,
					role: "alert",
					children: setupError
				}),
				onSessionOverrideChange && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: value_mode_module_css_default.scopeSwitcher,
					role: "group",
					"aria-label": "生效范围",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${value_mode_module_css_default.scopeButton} ${scope === "global" ? value_mode_module_css_default.scopeButtonActive : ""}`,
						onClick: () => setScope("global"),
						children: "全局默认"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: `${value_mode_module_css_default.scopeButton} ${scope === "session" ? value_mode_module_css_default.scopeButtonActive : ""}`,
						onClick: () => setScope("session"),
						children: ["仅本会话 ", sessionOverride ? "(已覆写)" : ""]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: value_mode_module_css_default.roleSummary,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_module_css_default.popoverItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.popoverItemLabel,
								children: "专家主控:"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.popoverItemValue,
								children: formatModel$1(resolved.expert)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_module_css_default.popoverItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.popoverItemLabel,
								children: "副模型子代理:"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.popoverItemValue,
								children: formatModel$1(resolved.executor)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_module_css_default.popoverItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.popoverItemLabel,
								children: "当前策略:"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.popoverItemValue,
								children: resolved.strategy === "saver" ? "更省" : resolved.strategy === "powerful" ? "更强" : "智能平衡"
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: value_mode_module_css_default.statsCard,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_module_css_default.statItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.statItemLabel,
								children: "专家主控调用"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: value_mode_module_css_default.statItemValue,
								children: [controllerCalls, " 次"]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_module_css_default.statItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.statItemLabel,
								children: "副模型子代理调用"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: value_mode_module_css_default.statItemValue,
								children: [subagentCalls, " 次"]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_module_css_default.statSavingsHighlight,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "副模型调用占比" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: value_mode_header_module_css_default.savingsValue,
								children: [sessionMetrics?.estimatedSavingsPercent ?? 0, "%"]
							})]
						})
					]
				}),
				sessionMetrics?.consultations && sessionMetrics.consultations.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: value_mode_header_module_css_default.historyToggle,
					"aria-expanded": showHistory,
					onClick: () => setShowHistory((value) => !value),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						"历史专家咨询 (",
						sessionMetrics.consultations.length,
						")"
					] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: showHistory ? "收起" : "展开" })]
				}), showHistory && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: value_mode_module_css_default.historyBox,
					children: sessionMetrics.consultations.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_module_css_default.historyItem,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: value_mode_module_css_default.historyHeader,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.purpose }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_header_module_css_default.historyTime,
								children: new Date(item.timestamp).toLocaleTimeString()
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: value_mode_module_css_default.historySummary,
							children: item.question || item.summary
						})]
					}, item.id))
				})] }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: value_mode_header_module_css_default.actionStack,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_header_module_css_default.actionRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${value_mode_module_css_default.button} ${value_mode_header_module_css_default.actionButton}`,
								onClick: () => setPickingTarget("executor"),
								children: "换副模型"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${value_mode_module_css_default.button} ${value_mode_header_module_css_default.actionButton}`,
								onClick: () => setPickingTarget("expert"),
								children: "换专家主控"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${value_mode_module_css_default.button} ${value_mode_header_module_css_default.actionButton}`,
								onClick: () => {
									const nextStrategy = resolved.strategy === "saver" ? "balanced" : resolved.strategy === "balanced" ? "powerful" : "saver";
									handleStrategyChange(nextStrategy);
								},
								children: "切策略"
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_header_module_css_default.actionRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${value_mode_module_css_default.button} ${value_mode_header_module_css_default.actionButton} ${resolved.enabled ? "" : value_mode_module_css_default.buttonPrimary}`,
							disabled: !configured && !resolved.enabled,
							onClick: () => void handleToggle(),
							children: resolved.enabled ? "关闭模式" : "开启模式"
						}), onOpenSettings && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${value_mode_module_css_default.button} ${value_mode_header_module_css_default.actionButton}`,
							onClick: () => {
								setOpen(false);
								onOpenSettings();
							},
							children: "完整设置"
						})]
					})]
				})
			] });
			const onboardingPopover = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: value_mode_header_module_css_default.setupHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: value_mode_header_module_css_default.setupEyebrow,
						children: "首次设置 · 约 30 秒"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: value_mode_header_module_css_default.setupTitle,
						children: "性价比模式"
					})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: value_mode_header_module_css_default.setupClose,
						"aria-label": "关闭性价比模式引导",
						onClick: dismissOnboarding,
						children: "×"
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: value_mode_header_module_css_default.setupLead,
					children: "专家模型负责主控和最终交付，副模型只执行主控派发的子任务。先确认两种角色，完成后即可开启。"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: value_mode_header_module_css_default.setupSteps,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `${value_mode_header_module_css_default.setupStep} ${isCompleteModelRoute(setupDraft.expert) ? value_mode_header_module_css_default.setupStepReady : ""}`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_header_module_css_default.setupStepNumber,
								children: "01"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: value_mode_header_module_css_default.setupStepBody,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: value_mode_header_module_css_default.setupStepHeading,
										children: "专家主控模型"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: value_mode_header_module_css_default.setupStepValue,
										children: formatModel$1(setupDraft.expert)
									}),
									!isCompleteModelRoute(liveConfig.expert) && isCompleteModelRoute(defaultExpert) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: value_mode_header_module_css_default.setupDefaultNote,
										children: "已预选当前默认模型，确认后会保存到性价比模式"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${value_mode_module_css_default.button} ${value_mode_header_module_css_default.setupModelButton}`,
								onClick: () => setPickingTarget("expert"),
								children: isCompleteModelRoute(setupDraft.expert) ? "更换" : "选择"
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `${value_mode_header_module_css_default.setupStep} ${isCompleteModelRoute(setupDraft.executor) ? value_mode_header_module_css_default.setupStepReady : ""}`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_header_module_css_default.setupStepNumber,
								children: "02"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: value_mode_header_module_css_default.setupStepBody,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: value_mode_header_module_css_default.setupStepHeading,
										children: "副模型 / 子代理执行模型"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: value_mode_header_module_css_default.setupStepValue,
										children: formatModel$1(setupDraft.executor)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: value_mode_header_module_css_default.setupDefaultNote,
										children: "用于并行调查、局部实现和重复性工作"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${value_mode_module_css_default.button} ${value_mode_header_module_css_default.setupModelButton}`,
								onClick: () => setPickingTarget("executor"),
								children: isCompleteModelRoute(setupDraft.executor) ? "更换" : "选择"
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: value_mode_header_module_css_default.setupStrategy,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: value_mode_header_module_css_default.setupStrategyLabel,
						children: "运行策略"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: value_mode_module_css_default.strategyGroup,
						children: [
							"saver",
							"balanced",
							"powerful"
						].map((strategy) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							"aria-pressed": setupDraft.strategy === strategy,
							className: `${value_mode_module_css_default.strategyItem} ${setupDraft.strategy === strategy ? value_mode_module_css_default.strategyItemSelected : ""}`,
							onClick: () => handleStrategyChange(strategy),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.strategyTitle,
								children: strategy === "saver" ? "更省" : strategy === "powerful" ? "更强" : "平衡"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: value_mode_module_css_default.strategyDesc,
								children: strategy === "saver" ? "少派发，控制调用量" : strategy === "powerful" ? "积极并行，优先质量" : "按任务复杂度派发"
							})]
						}, strategy))
					})]
				}),
				setupError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: value_mode_header_module_css_default.setupError,
					role: "alert",
					children: setupError
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: value_mode_header_module_css_default.setupFooter,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: value_mode_header_module_css_default.setupHint,
						children: "配置保存在全局默认中，可在完整设置里调整"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${value_mode_module_css_default.button} ${value_mode_module_css_default.buttonPrimary} ${value_mode_header_module_css_default.setupSubmit}`,
						disabled: saving || !isCompleteModelRoute(setupDraft.expert) || !isCompleteModelRoute(setupDraft.executor),
						onClick: () => void handleCompleteSetup(),
						children: saving ? "保存并开启中…" : "完成配置并开启"
					})]
				})
			] });
			const popover = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: panelRef,
				className: `${value_mode_module_css_default.popover} ${value_mode_header_module_css_default.popover} ${onboarding ? value_mode_header_module_css_default.onboardingPopover : ""}`,
				role: "dialog",
				"aria-modal": "false",
				"aria-label": onboarding ? "性价比模式配置引导" : "性价比模式快捷设置",
				"data-value-mode-onboarding": onboarding ? "true" : "false",
				children: onboarding ? onboardingPopover : quickPopover
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: value_mode_header_module_css_default.root,
				ref: rootRef,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						ref: triggerRef,
						className: `${value_mode_module_css_default.headerChip} ${!resolved.enabled ? value_mode_module_css_default.headerChipDisabled : ""}`,
						"aria-expanded": open,
						"aria-label": "性价比模式状态",
						onClick: () => {
							if (!open && !explicitlyConfigured) startOnboarding();
							else setOpen((value) => !value);
						},
						title: "性价比模式状态与快捷设置",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: "V"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
					}),
					open && renderPortal(popover),
					pickingTarget && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelPicker, {
						title: pickingTarget === "executor" ? "选择副模型 / 子代理执行模型" : "选择专家主控模型",
						current: onboarding ? setupDraft[pickingTarget] : pickingTarget === "executor" ? resolved.executor : resolved.expert,
						onSelect: handleModelSelect,
						onClose: () => setPickingTarget(null),
						fetchModels
					})
				]
			});
		};
		//#endregion
		//#region src/client/ValueModeHeroOnboarding.tsx
		function formatModel(route) {
			if (!isCompleteModelRoute(route)) return "未配置";
			return `${route.provider} / ${route.model}`;
		}
		function errorText$1(reason, fallback) {
			if (reason instanceof Error && reason.message.trim()) return reason.message.trim();
			if (typeof reason === "string" && reason.trim()) return reason.trim();
			return fallback;
		}
		/**
		* Configuration guide for the blank-session hero. The official agent-preset
		* selector is a single root slot, so this guide is mounted as an additive
		* document-level surface rather than replacing the host selector.
		*/
		const ValueModeHeroOnboarding = ({ config, settingsScope, defaultModelScope, onChange, fetchModels, onClose, initialError = null }) => {
			const liveConfig = useValueModeConfig(settingsScope, config);
			const defaultExpert = useSettingsValue(defaultModelScope, void 0);
			const resolved = resolveResolvedConfig(liveConfig, defaultExpert);
			const [draft, setDraft] = (0, react.useState)(() => ({
				executor: { ...resolved.executor },
				expert: { ...resolved.expert },
				strategy: resolved.strategy
			}));
			const [pickingTarget, setPickingTarget] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(initialError);
			const [saving, setSaving] = (0, react.useState)(false);
			const dialogRef = (0, react.useRef)(null);
			const completedRef = (0, react.useRef)(false);
			const closeWithDismiss = () => {
				if (!completedRef.current) reportValueModeTelemetry({
					kind: "onboarding",
					outcome: "dismissed",
					surface: "hero"
				});
				onClose();
			};
			(0, react.useEffect)(() => {
				setDraft((current) => ({
					...current,
					expert: isCompleteModelRoute(current.expert) ? current.expert : { ...resolved.expert }
				}));
			}, [
				`${defaultExpert?.provider ?? ""}:${defaultExpert?.model ?? ""}:${defaultExpert?.reasoningEffort ?? ""}`,
				resolved.expert.provider,
				resolved.expert.model,
				resolved.expert.reasoningEffort
			]);
			(0, react.useEffect)(() => {
				setError(initialError ?? null);
			}, [initialError]);
			const loadModels = async () => {
				const catalog = await fetchModels();
				if (isCompleteModelRoute(defaultExpert)) {
					if (!catalog.groups.some((group) => group.id === defaultExpert.provider && group.models.some((model) => model.id === defaultExpert.model))) throw new Error(`当前默认模型 ${formatModel(defaultExpert)} 不在可用模型目录中，请先在模型设置中选择可用模型。`);
				}
				return catalog;
			};
			(0, react.useEffect)(() => {
				dialogRef.current?.querySelector("button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex=\"-1\"])")?.focus();
				const handleClickOutside = (event) => {
					const target = event.target;
					if (dialogRef.current?.contains(target)) return;
					if (pickingTarget) return;
					closeWithDismiss();
				};
				const handleKeyDown = (event) => {
					if (event.key !== "Escape") return;
					if (pickingTarget) {
						setPickingTarget(null);
						return;
					}
					closeWithDismiss();
				};
				document.addEventListener("mousedown", handleClickOutside);
				document.addEventListener("keydown", handleKeyDown);
				return () => {
					document.removeEventListener("mousedown", handleClickOutside);
					document.removeEventListener("keydown", handleKeyDown);
				};
			}, [onClose, pickingTarget]);
			const handleModelSelect = (selection) => {
				if (!pickingTarget) return;
				setDraft((current) => ({
					...current,
					[pickingTarget]: selection
				}));
				setPickingTarget(null);
			};
			const handleComplete = async () => {
				if (!isCompleteModelRoute(draft.expert) || !isCompleteModelRoute(draft.executor)) {
					setError("请先选择专家主控模型和副模型 / 子代理执行模型。");
					return;
				}
				setSaving(true);
				setError(null);
				try {
					await onChange({
						expert: draft.expert,
						executor: draft.executor
					});
					await onChange({ strategy: draft.strategy });
					await onChange({ enabled: true });
					completedRef.current = true;
					reportValueModeTelemetry({
						kind: "onboarding",
						outcome: "completed",
						surface: "hero"
					});
					reportValueModeTelemetry({
						kind: "state",
						state: "enabled",
						source: "onboarding"
					});
					onClose();
				} catch (reason) {
					reportValueModeTelemetry({
						kind: "onboarding",
						outcome: "failed",
						surface: "hero"
					});
					setError(errorText$1(reason, "配置写入失败，请重试。"));
				} finally {
					setSaving(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: dialogRef,
				className: `${value_mode_module_css_default.popover} ${value_mode_header_module_css_default.popover} ${value_mode_header_module_css_default.onboardingPopover} ${value_mode_header_module_css_default.heroOnboardingPopover}`,
				role: "dialog",
				"aria-modal": "false",
				"aria-label": "性价比模式配置引导",
				"data-value-mode-onboarding": "true",
				"data-value-mode-hero-onboarding": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_header_module_css_default.setupHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: value_mode_header_module_css_default.setupEyebrow,
							children: "新会话设置 · 约 30 秒"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: value_mode_header_module_css_default.setupTitle,
							children: "性价比模式"
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: value_mode_header_module_css_default.setupClose,
							"aria-label": "关闭性价比模式引导",
							onClick: closeWithDismiss,
							children: "×"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: value_mode_header_module_css_default.setupLead,
						children: "专家模型负责主控、拆解和最终交付，副模型只执行主控派发的子任务。先确认两种角色，完成后即可开启。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_header_module_css_default.setupSteps,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `${value_mode_header_module_css_default.setupStep} ${isCompleteModelRoute(draft.expert) ? value_mode_header_module_css_default.setupStepReady : ""}`,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: value_mode_header_module_css_default.setupStepNumber,
									children: "01"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: value_mode_header_module_css_default.setupStepBody,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: value_mode_header_module_css_default.setupStepHeading,
											children: "专家主控模型"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: value_mode_header_module_css_default.setupStepValue,
											children: formatModel(draft.expert)
										}),
										!isCompleteModelRoute(liveConfig.expert) && isCompleteModelRoute(defaultExpert) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: value_mode_header_module_css_default.setupDefaultNote,
											children: "已预选当前默认模型，确认后会保存到性价比模式"
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${value_mode_module_css_default.button} ${value_mode_header_module_css_default.setupModelButton}`,
									onClick: () => setPickingTarget("expert"),
									children: isCompleteModelRoute(draft.expert) ? "更换" : "选择"
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `${value_mode_header_module_css_default.setupStep} ${isCompleteModelRoute(draft.executor) ? value_mode_header_module_css_default.setupStepReady : ""}`,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: value_mode_header_module_css_default.setupStepNumber,
									children: "02"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: value_mode_header_module_css_default.setupStepBody,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: value_mode_header_module_css_default.setupStepHeading,
											children: "副模型 / 子代理执行模型"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: value_mode_header_module_css_default.setupStepValue,
											children: formatModel(draft.executor)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: value_mode_header_module_css_default.setupDefaultNote,
											children: "用于并行调查、局部实现和重复性工作"
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${value_mode_module_css_default.button} ${value_mode_header_module_css_default.setupModelButton}`,
									onClick: () => setPickingTarget("executor"),
									children: isCompleteModelRoute(draft.executor) ? "更换" : "选择"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_header_module_css_default.setupStrategy,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: value_mode_header_module_css_default.setupStrategyLabel,
							children: "03 · 运行策略"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: value_mode_module_css_default.strategyGroup,
							children: [
								"saver",
								"balanced",
								"powerful"
							].map((strategy) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								"aria-pressed": draft.strategy === strategy,
								className: `${value_mode_module_css_default.strategyItem} ${draft.strategy === strategy ? value_mode_module_css_default.strategyItemSelected : ""}`,
								onClick: () => {
									setDraft((current) => ({
										...current,
										strategy
									}));
									reportValueModeTelemetry({
										kind: "strategy",
										strategy
									});
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: value_mode_module_css_default.strategyTitle,
									children: strategy === "saver" ? "更省" : strategy === "powerful" ? "更强" : "平衡"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: value_mode_module_css_default.strategyDesc,
									children: strategy === "saver" ? "少派发，控制调用量" : strategy === "powerful" ? "积极并行，优先质量" : "按任务复杂度派发"
								})]
							}, strategy))
						})]
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: value_mode_header_module_css_default.setupError,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: value_mode_header_module_css_default.setupFooter,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: value_mode_header_module_css_default.setupHint,
							children: "配置保存在全局默认中，可在完整设置里调整"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${value_mode_module_css_default.button} ${value_mode_module_css_default.buttonPrimary} ${value_mode_header_module_css_default.setupSubmit}`,
							disabled: saving || !isCompleteModelRoute(draft.expert) || !isCompleteModelRoute(draft.executor),
							onClick: () => void handleComplete(),
							children: saving ? "保存并开启中…" : "完成配置并开启"
						})]
					})
				]
			}), pickingTarget && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelPicker, {
				title: pickingTarget === "executor" ? "选择副模型 / 子代理执行模型" : "选择专家主控模型",
				current: draft[pickingTarget],
				onSelect: handleModelSelect,
				onClose: () => setPickingTarget(null),
				fetchModels: loadModels
			})] });
		};
		//#endregion
		//#region src/client/ManualExpertToggle.tsx
		const ManualExpertToggle = ({ armed = false, onToggle }) => {
			const [isArmed, setIsArmed] = (0, react.useState)(armed);
			const handleClick = () => {
				const next = !isArmed;
				setIsArmed(next);
				onToggle?.(next);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: `${value_mode_module_css_default.manualToggle} ${isArmed ? value_mode_module_css_default.manualToggleActive : ""}`,
				onClick: handleClick,
				title: isArmed ? "本次请求将优先使用专家分析（点击取消）" : "点击指示下一次请求使用专家分析",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: { fontSize: 10 },
					children: "★"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: isArmed ? "本次使用专家分析" : "专家分析" })]
			});
		};
		//#endregion
		//#region src/client/index.ts
		/**
		* @module @linxin666/dsh-value-mode/client
		* Browser half of the Value Mode (性价比模式) plugin.
		*/
		function isSettingsBinderFace(value) {
			return typeof value === "object" && value !== null && typeof value.bind === "function";
		}
		const inject = [
			"slots",
			"locale",
			"connection",
			"settingsScope"
		];
		function heroPresetButton() {
			return [...document.querySelectorAll("button")].find((button) => {
				const metadata = `${button.getAttribute("title") ?? ""} ${button.getAttribute("aria-label") ?? ""} ${button.dataset.testid ?? ""}`;
				return /agent\s*(preset|预设)|agent\s*预设|预设/i.test(metadata);
			});
		}
		function isValueModeHeroButton(button) {
			const label = `${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""}`;
			return /性价比模式|value\s*mode|value-mode/i.test(label);
		}
		function errorText(reason) {
			if (reason instanceof Error && reason.message.trim()) return reason.message.trim();
			if (typeof reason === "string" && reason.trim()) return reason.trim();
			return "性价比模式自动开启失败，请打开设置重试。";
		}
		/**
		* The host's blank-session agent-preset seat is a single root slot owned by
		* the official UI. Keep that selector intact and add the setup guide as a
		* document-level surface that follows the selector's rendered state.
		*/
		function mountHeroOnboarding({ scope, defaultModelScope, onChange, fetchModels }) {
			if (typeof document === "undefined" || typeof MutationObserver === "undefined" || !document.body) return () => {};
			const container = document.createElement("div");
			container.dataset.dshValueModeHeroOnboardingRoot = "";
			document.body.appendChild(container);
			let root = (0, react_dom_client.createRoot)(container);
			let preset;
			let open = false;
			let dismissed = false;
			let enableRequested = false;
			let setupError = null;
			let scanQueued = false;
			const render = () => {
				root?.render(open ? (0, react.createElement)(ValueModeHeroOnboarding, {
					config: scope.getSnapshot().value ?? {},
					settingsScope: scope,
					defaultModelScope,
					onChange,
					fetchModels,
					initialError: setupError,
					onClose: () => {
						open = false;
						dismissed = true;
						root?.render(null);
					}
				}) : null);
			};
			const enableConfiguredMode = () => {
				if (enableRequested) return;
				enableRequested = true;
				Promise.resolve().then(() => onChange({ enabled: true })).then(() => reportValueModeTelemetry({
					kind: "state",
					state: "enabled",
					source: "auto"
				})).catch((reason) => {
					enableRequested = false;
					setupError = errorText(reason);
					reportValueModeTelemetry({
						kind: "state",
						state: "failed",
						source: "auto"
					});
					open = true;
					dismissed = false;
					render();
				});
			};
			const syncPreset = (next) => {
				const entered = preset !== "value-mode" && next === "value-mode";
				if (next !== "value-mode") {
					preset = next;
					open = false;
					dismissed = false;
					enableRequested = false;
					setupError = null;
					render();
					return;
				}
				preset = next;
				if (entered) {
					dismissed = false;
					setupError = null;
					enableRequested = false;
					reportValueModeTelemetry({
						kind: "entry",
						configured: hasExplicitModelRoutes(scope.getSnapshot().value ?? {})
					}, "value-mode-entry");
				}
				if (dismissed || open) return;
				const config = scope.getSnapshot().value ?? {};
				if (hasExplicitModelRoutes(config)) {
					if (config.enabled !== true) enableConfiguredMode();
					return;
				}
				open = true;
				reportValueModeTelemetry({
					kind: "onboarding",
					outcome: "shown",
					surface: "hero"
				}, "value-mode-onboarding-shown:hero");
				render();
			};
			const scan = () => {
				scanQueued = false;
				const button = heroPresetButton();
				if (!button) return;
				syncPreset(isValueModeHeroButton(button) ? "value-mode" : "other");
			};
			const onPresetMenuClick = (event) => {
				const item = event.target?.closest("[role=\"menuitem\"]");
				if (!item || !/性价比模式|value\s*mode|value-mode/i.test(item.textContent ?? "")) return;
				dismissed = false;
				setupError = null;
				syncPreset("value-mode");
			};
			const observer = new MutationObserver(() => {
				if (scanQueued) return;
				scanQueued = true;
				queueMicrotask(scan);
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true,
				characterData: true,
				attributes: true,
				attributeFilter: ["title", "aria-label"]
			});
			document.addEventListener("click", onPresetMenuClick);
			scan();
			return () => {
				observer.disconnect();
				document.removeEventListener("click", onPresetMenuClick);
				root?.unmount();
				root = void 0;
				container.remove();
			};
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("value-mode", {
				zh,
				en
			}), "value-mode: locales");
			const compatibilityBinder = ctx.get("webUiSettings");
			const binder = isSettingsBinderFace(compatibilityBinder) ? compatibilityBinder : ctx.settingsScope;
			const scope = binder.bind({ namespace: VALUE_MODE_SETTINGS_NAMESPACE });
			const defaultModelScope = binder.bind({ namespace: "agent-default-model" });
			const fetchModels = async () => {
				const api = ctx.get("connection")?.api;
				if (!api || typeof api.llm?.models !== "function") throw new Error("当前运行时不支持模型目录，请更新或重启 DeepSeek Harness 后重试。");
				const response = await api.llm.models({});
				if (!response.result.ok) {
					const message = response.result.error?.message?.trim();
					throw new Error(message || "模型目录加载失败，请稍后重试。");
				}
				return {
					groups: response.result.value.groups ?? [],
					failures: response.result.value.failures ?? []
				};
			};
			const onChange = async (patch) => {
				for (const [key, value] of Object.entries(patch)) await scope.set(key, value);
			};
			ctx.effect(() => mountHeroOnboarding({
				scope,
				defaultModelScope,
				onChange,
				fetchModels
			}), "value-mode: blank-session onboarding");
			ctx.slots.inject("web-ui.plugin.item", () => ctx.slots.register({
				name: "web-ui.plugin.item",
				id: "value-mode",
				order: 115,
				locale: "value-mode",
				inject: () => {
					return {
						config: scope.getSnapshot().value ?? {},
						settingsScope: scope,
						defaultModelScope,
						onChange,
						fetchModels
					};
				}
			}, ValueModeSettingsCard));
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "value-mode-status",
				order: -8,
				inject: () => {
					return {
						config: scope.getSnapshot().value ?? {},
						settingsScope: scope,
						defaultModelScope,
						onChange,
						fetchModels
					};
				}
			}, ValueModeHeaderStatus));
		}
		//#endregion
		exports.ManualExpertToggle = ManualExpertToggle;
		exports.ModelPicker = ModelPicker;
		exports.ValueModeHeaderStatus = ValueModeHeaderStatus;
		exports.ValueModeHeroOnboarding = ValueModeHeroOnboarding;
		exports.ValueModeSettingsCard = ValueModeSettingsCard;
		exports.apply = apply;
		exports.en = en;
		exports.inject = inject;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map