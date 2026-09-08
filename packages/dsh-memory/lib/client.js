window.__ModuleLoader__.load({
	id: "@ningbainb/dsh-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/core/config.ts
		const DEFAULT_MEMORY_CONFIG = {
			version: 1,
			enabled: false
		};
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function assertMemoryConfig(value) {
			if (!isRecord(value) || value.version !== 1 || typeof value.enabled !== "boolean") throw new Error("invalid memory settings");
		}
		function normalizeMemoryConfig(value) {
			if (value === void 0) return { ...DEFAULT_MEMORY_CONFIG };
			assertMemoryConfig(value);
			return {
				version: 1,
				enabled: value.enabled
			};
		}
		//#endregion
		//#region src/core/schema.ts
		const MEMORY_SETTINGS_NAMESPACE = "memory";
		const MAX_MEMORY_CONTENT_LENGTH = 2e3;
		//#endregion
		//#region \0dsh-css:packages/dsh-memory/src/client/memory.module.css.mjs
		const css = ".cPqCCW_card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#ffffff14);background:var(--dsw-alias-bg-layer-3,#ffffff0a);width:100%;color:var(--dsw-alias-label-primary,#fff);border-radius:12px;flex-direction:column;gap:12px;padding:16px 20px;font-family:inherit;font-size:13px;line-height:1.5;transition:border-color .16s,background-color .16s;display:flex}.cPqCCW_card:hover{border-color:var(--dsw-alias-label-dimmed,#ffffff29)}.cPqCCW_header{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.cPqCCW_title{color:var(--dsw-alias-label-primary,#fff);margin:0;font-size:16px;font-weight:600;line-height:1.4}.cPqCCW_description{color:var(--dsw-alias-label-tertiary,#81858c);margin:4px 0 0;font-size:13px;line-height:1.5}.cPqCCW_notice{background:var(--dsw-alias-bg-module-platform,#ffffff08);border:1px solid var(--dsw-alias-border-l2,#ffffff0f);color:var(--dsw-alias-label-tertiary,#81858c);border-radius:8px;margin:0;padding:10px 14px;font-size:12px;line-height:1.5}.cPqCCW_muted{color:var(--dsw-alias-label-tertiary,#81858c);margin:4px 0;font-size:12px}.cPqCCW_badge,.cPqCCW_badgeSaved{white-space:nowrap;border-radius:999px;flex:none;align-items:center;padding:2px 8px;font-size:11px;font-weight:500;line-height:16px;display:inline-flex}.cPqCCW_badge{background:var(--dsw-alias-bg-module-platform,#9ca3af26);color:var(--dsw-alias-label-secondary,#9ca3af);border:1px solid var(--dsw-alias-border-l2,#9ca3af40)}.cPqCCW_badgeSaved{background:var(--dsw-alias-bg-module-success-subtle,#10b98126);color:var(--dsw-alias-label-success,#10b981);border:1px solid #10b9814d}.cPqCCW_toggle{color:var(--dsw-alias-label-primary,#fff);cursor:pointer;user-select:none;align-items:center;gap:8px;font-size:13px;font-weight:500;display:inline-flex}.cPqCCW_toggle input[type=checkbox]{width:16px;height:16px;accent-color:var(--dsw-alias-brand-primary,#3370ff);cursor:pointer;margin:0}.cPqCCW_section{border-top:1px solid var(--dsw-alias-border-l2,#ffffff14);flex-direction:column;gap:10px;padding-top:14px;display:flex}.cPqCCW_activity{border:1px solid var(--dsw-alias-border-l2,#596777);color:var(--dsw-alias-label-primary,inherit);border-radius:8px;font:13px/1.5 system-ui,sans-serif}.cPqCCW_activity>summary{cursor:pointer;padding:8px 12px;font-weight:500}.cPqCCW_activityBody{gap:10px;padding:12px;display:grid}.cPqCCW_activityBody p{overflow-wrap:anywhere;margin:0}.cPqCCW_activityItem{border-top:1px solid var(--dsw-alias-border-l2,#596777);gap:8px;padding-top:10px;display:grid}.cPqCCW_headerActivity .cPqCCW_activity[open]{z-index:1000;background:var(--dsw-alias-bg-layer-1,#20242d);width:min(440px,100vw - 32px);max-height:calc(100vh - 100px);position:fixed;top:76px;right:16px;overflow:auto;box-shadow:0 8px 32px #0004}.cPqCCW_headerActivity summary{white-space:nowrap}.cPqCCW_section[hidden],.cPqCCW_editor[hidden]{display:none}.cPqCCW_tabs{border-bottom:1px solid var(--dsw-alias-border-l2);gap:16px;display:flex}.cPqCCW_tabs button{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;border-bottom:2px solid #0000;padding:8px 0}.cPqCCW_tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:600}.cPqCCW_tabs button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.cPqCCW_itemList:empty,.cPqCCW_pendingList:empty{display:none}.cPqCCW_sectionHeader{align-items:center;gap:8px;display:flex}.cPqCCW_sectionHeader strong{color:var(--dsw-alias-label-primary,#fff);font-size:13px;font-weight:600}.cPqCCW_sectionHeader>span{color:var(--dsw-alias-label-tertiary,#81858c);margin-right:auto;font-size:12px}.cPqCCW_filterRow{align-items:center;gap:8px;display:flex}.cPqCCW_filterRow input{flex:1;min-width:140px}.cPqCCW_itemList{background:var(--dsw-alias-bg-layer-1,#0000001f);border:1px solid var(--dsw-alias-border-l2,#ffffff14);border-radius:8px;flex-direction:column;gap:3px;max-height:220px;padding:4px;display:flex;overflow-y:auto}.cPqCCW_item,.cPqCCW_itemSelected{appearance:none;box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary,inherit);cursor:pointer;text-align:left;font:inherit;background:0 0;border:1px solid #0000;border-radius:6px;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;font-size:13px;transition:background-color .12s,border-color .12s;display:flex}.cPqCCW_item:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff0f)}.cPqCCW_itemSelected{background:var(--dsw-alias-bg-module-platform,#3370ff1a);border-color:var(--dsw-alias-brand-primary,#3370ff)}.cPqCCW_itemContent{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;overflow:hidden}.cPqCCW_itemMeta{color:var(--dsw-alias-label-tertiary,#81858c);white-space:nowrap;flex:none;font-size:11px}.cPqCCW_pendingList{flex-direction:column;gap:8px;display:flex}.cPqCCW_pendingItem{border:1px solid var(--dsw-alias-border-l2,#ffffff14);background:var(--dsw-alias-bg-layer-2,#ffffff05);border-radius:8px;flex-direction:column;gap:8px;padding:12px;display:flex}.cPqCCW_pendingContent{color:var(--dsw-alias-label-primary,#fff);white-space:pre-wrap;word-break:break-word;margin:0;font-size:13px;line-height:1.5}.cPqCCW_editor{background:var(--dsw-alias-bg-layer-2,#ffffff05);border:1px solid var(--dsw-alias-border-l2,#ffffff14);border-radius:10px;flex-direction:column;gap:12px;padding:16px;display:flex}.cPqCCW_editor .cPqCCW_sectionHeader{border-bottom:1px solid var(--dsw-alias-border-l2,#ffffff14);padding-bottom:8px}.cPqCCW_editor .cPqCCW_sectionHeader strong{color:var(--dsw-alias-label-primary,#fff);font-size:14px;font-weight:600}.cPqCCW_field{flex-direction:column;gap:5px;display:flex}.cPqCCW_field>span:first-child{color:var(--dsw-alias-label-secondary,#9ca3af);font-size:12px;font-weight:500}.cPqCCW_field input,.cPqCCW_field select,.cPqCCW_field textarea,.cPqCCW_filterRow input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#ffffff1a);background:var(--dsw-alias-bg-layer-1,#00000026);width:100%;min-width:0;height:34px;color:var(--dsw-alias-label-primary,#fff);font:inherit;border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;transition:border-color .16s,box-shadow .16s}.cPqCCW_field select{cursor:pointer}.cPqCCW_field input:focus,.cPqCCW_field select:focus,.cPqCCW_field textarea:focus,.cPqCCW_filterRow input:focus{border-color:var(--dsw-alias-brand-primary,#3370ff);box-shadow:0 0 0 2px var(--dsw-alias-border-l3,#3370ff40);outline:none}.cPqCCW_field input::placeholder,.cPqCCW_field textarea::placeholder,.cPqCCW_filterRow input::placeholder{color:var(--dsw-alias-label-dimmed,#6b7280)}.cPqCCW_field textarea{resize:vertical;height:auto;min-height:110px;padding:10px 12px}.cPqCCW_field input:disabled,.cPqCCW_field select:disabled,.cPqCCW_field textarea:disabled,.cPqCCW_filterRow input:disabled{opacity:.5;cursor:not-allowed}.cPqCCW_counter{color:var(--dsw-alias-label-dimmed,#6b7280);text-align:right;font-variant-numeric:tabular-nums;margin-top:-2px;font-size:11px}.cPqCCW_actions{justify-content:flex-end;align-items:center;gap:8px;margin-top:4px;display:flex}.cPqCCW_button,.cPqCCW_primary,.cPqCCW_danger{appearance:none;box-sizing:border-box;height:32px;font:inherit;cursor:pointer;white-space:nowrap;border-radius:8px;justify-content:center;align-items:center;padding:0 14px;font-size:13px;font-weight:500;transition:all .16s;display:inline-flex}.cPqCCW_button{background:var(--dsw-alias-bg-layer-2,transparent);border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-primary,#fff)}.cPqCCW_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff0f);border-color:var(--dsw-alias-label-dimmed,#fff3)}.cPqCCW_primary{background:var(--dsw-alias-brand-primary,#3370ff);color:#fff;border:1px solid #0000}.cPqCCW_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#2860db)}.cPqCCW_danger{border:1px solid var(--dsw-alias-border-l2,#ffffff1f);color:var(--dsw-alias-label-error,#ef4444);background:0 0}.cPqCCW_danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,#ef44441a);border-color:var(--dsw-alias-label-error,#ef4444)}.cPqCCW_button:disabled,.cPqCCW_primary:disabled,.cPqCCW_danger:disabled{opacity:.45;cursor:not-allowed}.cPqCCW_error{background:var(--dsw-alias-interactive-bg-hover-danger,#ef44441a);border:1px solid var(--dsw-alias-label-error,#ef44444d);color:var(--dsw-alias-label-error,#ef4444);border-radius:8px;margin:0;padding:8px 12px;font-size:12px;line-height:1.5}@media (width<=520px){.cPqCCW_header,.cPqCCW_sectionHeader{flex-wrap:wrap}.cPqCCW_filterRow{flex-direction:column;align-items:stretch}.cPqCCW_actions{flex-wrap:wrap}}.cPqCCW_scopeFilter{color:var(--dsw-alias-label-secondary);align-items:center;gap:12px;font-size:12px;display:flex}.cPqCCW_scopeFilter select{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;flex:1;padding:7px 10px}";
		const tagId = "@ningbainb/dsh-memory/memory.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ningbainb/dsh-memory";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var memory_module_css_default = {
			"actions": "cPqCCW_actions",
			"activity": "cPqCCW_activity",
			"activityBody": "cPqCCW_activityBody",
			"activityItem": "cPqCCW_activityItem",
			"badge": "cPqCCW_badge",
			"badgeSaved": "cPqCCW_badgeSaved",
			"button": "cPqCCW_button",
			"card": "cPqCCW_card",
			"counter": "cPqCCW_counter",
			"danger": "cPqCCW_danger",
			"description": "cPqCCW_description",
			"editor": "cPqCCW_editor",
			"error": "cPqCCW_error",
			"field": "cPqCCW_field",
			"filterRow": "cPqCCW_filterRow",
			"header": "cPqCCW_header",
			"headerActivity": "cPqCCW_headerActivity",
			"item": "cPqCCW_item",
			"itemContent": "cPqCCW_itemContent",
			"itemList": "cPqCCW_itemList",
			"itemMeta": "cPqCCW_itemMeta",
			"itemSelected": "cPqCCW_itemSelected",
			"muted": "cPqCCW_muted",
			"notice": "cPqCCW_notice",
			"pendingContent": "cPqCCW_pendingContent",
			"pendingItem": "cPqCCW_pendingItem",
			"pendingList": "cPqCCW_pendingList",
			"primary": "cPqCCW_primary",
			"scopeFilter": "cPqCCW_scopeFilter",
			"section": "cPqCCW_section",
			"sectionHeader": "cPqCCW_sectionHeader",
			"tabs": "cPqCCW_tabs",
			"title": "cPqCCW_title",
			"toggle": "cPqCCW_toggle"
		};
		//#endregion
		//#region src/client/MemoryActivityPanel.tsx
		function MemoryActivityPanel({ t, enabled, sessionId, onEdit }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [activity, setActivity] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [editing, setEditing] = (0, react.useState)(null);
			const [content, setContent] = (0, react.useState)("");
			const [deleting, setDeleting] = (0, react.useState)(null);
			const requestSequence = (0, react.useRef)(0);
			const detailsRef = (0, react.useRef)(null);
			const query = sessionId ? "?sessionId=" + encodeURIComponent(sessionId) : "";
			const refresh = async () => {
				const sequence = ++requestSequence.current;
				try {
					const response = await fetch("/api/dsh-memory/activity" + query, { cache: "no-store" });
					const value = await response.json();
					if (!response.ok || !value.ok) throw new Error("unavailable");
					if (sequence === requestSequence.current) {
						setActivity(value.activity);
						setError(false);
					}
				} catch {
					if (sequence === requestSequence.current) {
						setActivity(null);
						setError(true);
					}
				}
			};
			(0, react.useEffect)(() => {
				setActivity(null);
				if (!open) return;
				refresh();
				const timer = setInterval(() => {
					if (document.visibilityState === "visible") refresh();
				}, 5e3);
				return () => {
					clearInterval(timer);
					requestSequence.current++;
				};
			}, [
				open,
				sessionId,
				enabled
			]);
			(0, react.useEffect)(() => {
				setEditing(null);
				setDeleting(null);
			}, [sessionId]);
			const mutate = async (path, body) => {
				if (busy) return;
				setBusy(true);
				setError(false);
				try {
					const response = await fetch(path, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body)
					});
					const value = await response.json();
					if (!response.ok || !value.ok) throw new Error("unavailable");
					setEditing(null);
					setDeleting(null);
					await refresh();
				} catch {
					setError(true);
				} finally {
					setBusy(false);
				}
			};
			const activityQuery = activity?.sessionId ? "?sessionId=" + encodeURIComponent(activity.sessionId) : query;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				ref: detailsRef,
				className: memory_module_css_default.activity,
				"data-memory-activity": "true",
				onToggle: (event) => setOpen(event.currentTarget.open),
				onKeyDown: (event) => {
					if (event.key === "Escape" && detailsRef.current) {
						event.stopPropagation();
						detailsRef.current.open = false;
						detailsRef.current.querySelector("summary")?.focus();
					}
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [t(onEdit ? "settings.activity.ready" : "settings.activityTitle"), open && activity ? ` · ${activity.items.length}` : ""] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: memory_module_css_default.activityBody,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: memory_module_css_default.muted,
							children: t("settings.activityHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							role: "status",
							children: [t("settings.activity." + (!enabled ? "disabled" : activity?.status ?? "none")), activity?.preparedAt ? " · " + new Date(activity.preparedAt).toLocaleTimeString() : ""]
						}),
						error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: memory_module_css_default.error,
							role: "alert",
							children: t("settings.activityError")
						}),
						enabled && activity?.items.map(({ item, reason, truncated }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							className: memory_module_css_default.activityItem,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: item.content }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: memory_module_css_default.muted,
									children: [
										t("settings." + item.scope),
										" · ",
										t("settings.reason." + reason),
										truncated ? " · " + t("settings.truncated") : ""
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: memory_module_css_default.actions,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: memory_module_css_default.button,
											disabled: busy,
											onClick: () => void mutate("/api/dsh-memory/activity" + activityQuery, {
												operation: "ignore",
												id: item.id
											}),
											children: t("settings.ignore")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: memory_module_css_default.button,
											disabled: busy,
											onClick: () => {
												if (onEdit) onEdit(item);
												else {
													setEditing(item);
													setContent(item.content);
												}
											},
											children: t("settings.edit")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: memory_module_css_default.danger,
											disabled: busy,
											onClick: () => setDeleting(item.id),
											children: t("settings.delete")
										})
									]
								}),
								deleting === item.id && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: memory_module_css_default.actions,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: memory_module_css_default.button,
										onClick: () => setDeleting(null),
										children: t("settings.cancelAction")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: memory_module_css_default.danger,
										disabled: busy,
										onClick: () => void mutate("/api/dsh-memory/items", {
											operation: "remove",
											id: item.id,
											expectedUpdatedAt: item.updatedAt
										}),
										children: t("settings.confirmDelete")
									})]
								})
							]
						}, item.id)),
						editing && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: memory_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								"aria-label": t("settings.content"),
								value: content,
								maxLength: 2e3,
								onChange: (event) => setContent(event.target.value)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.actions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: memory_module_css_default.button,
									onClick: () => setEditing(null),
									children: t("settings.cancelAction")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: memory_module_css_default.primary,
									disabled: busy || !content.trim(),
									onClick: () => void mutate("/api/dsh-memory/items", {
										...editing,
										operation: "save",
										content,
										expectedUpdatedAt: editing.updatedAt
									}),
									children: t("settings.save")
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: memory_module_css_default.actions,
							children: [!!activity?.ignoredCount && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: memory_module_css_default.button,
								disabled: busy,
								onClick: () => void mutate("/api/dsh-memory/activity" + activityQuery, {
									operation: "ignore",
									id: null
								}),
								children: [
									t("settings.restoreIgnored"),
									" · ",
									activity.ignoredCount
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: memory_module_css_default.button,
								disabled: busy,
								onClick: () => void refresh(),
								children: t("settings.reload")
							})]
						})
					]
				})]
			});
		}
		function MemoryHeaderStatus(props) {
			const snapshot = (0, react.useSyncExternalStore)((listener) => props.settingsScope.subscribe(listener), () => props.settingsScope.getSnapshot());
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: memory_module_css_default.headerActivity,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryActivityPanel, {
					sessionId: props.sessionId,
					t: props.t,
					enabled: snapshot.value?.enabled === true
				})
			});
		}
		//#endregion
		//#region src/client/MemorySettingsCard.tsx
		function emptyDraft() {
			return {
				scope: "global",
				workspaceId: "",
				sessionId: "",
				content: "",
				tags: "",
				pinned: false,
				expiresAt: ""
			};
		}
		function draftOf(item) {
			return {
				id: item.id,
				expectedUpdatedAt: item.updatedAt,
				scope: item.scope,
				workspaceId: item.workspaceId ?? "",
				sessionId: item.sessionId ?? "",
				content: item.content,
				tags: item.tags.join(", "),
				pinned: item.pinned,
				expiresAt: item.expiresAt === void 0 ? "" : String(item.expiresAt)
			};
		}
		function itemFromDraft(draft) {
			const content = draft.content.trim();
			if (content === "" || content.length > 2e3) return void 0;
			const tags = draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean);
			if (tags.length > 10) return void 0;
			const body = {
				operation: "save",
				...draft.expectedUpdatedAt === void 0 ? {} : { expectedUpdatedAt: draft.expectedUpdatedAt },
				...draft.id === void 0 ? {} : { id: draft.id },
				scope: draft.scope,
				content,
				tags,
				pinned: draft.pinned
			};
			if (draft.scope === "workspace") {
				if (draft.workspaceId.trim() === "") return void 0;
				body.workspaceId = draft.workspaceId.trim();
			} else if (draft.scope === "session") {
				if (draft.sessionId.trim() === "") return void 0;
				body.sessionId = draft.sessionId.trim();
			}
			if (draft.expiresAt.trim() !== "") {
				const expiresAt = Number(draft.expiresAt.trim());
				if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) return void 0;
				body.expiresAt = expiresAt;
			}
			return body;
		}
		function errorMessage(code, t) {
			if (code === "sensitive") return t("settings.errorSensitive");
			if (code === "invalid" || code === "invalid-target") return t("settings.errorInvalid");
			if (code === "store-unavailable") return t("settings.errorStore");
			if (code === "duplicate") return t("settings.duplicate");
			if (code === "conflict") return t("settings.errorConflict");
			return t("settings.errorSave");
		}
		async function responseJson(response) {
			const value = await response.json();
			if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid memory response");
			return value;
		}
		function requestError(value) {
			const code = typeof value.code === "string" ? value.code : "request-failed";
			const error = new Error(code);
			error.code = code;
			return error;
		}
		async function getJson(path) {
			const response = await fetch(path, { cache: "no-store" });
			const value = await responseJson(response);
			if (!response.ok || value.ok !== true) throw requestError(value);
			return value;
		}
		function errorCode(reason) {
			return reason instanceof Error ? reason.code : void 0;
		}
		function retryableLoadError(reason) {
			return errorCode(reason) === "scope-unavailable" || errorCode(reason) === "store-unavailable";
		}
		async function waitBeforeReload(attempt) {
			await new Promise((resolve) => setTimeout(resolve, Math.min(1e3, 150 * 2 ** attempt)));
		}
		function responseItems(value) {
			if (!value.ok || !Array.isArray(value.items)) return [];
			return value.items.filter((item) => typeof item === "object" && item !== null);
		}
		function responsePending(value) {
			if (!value.ok || !Array.isArray(value.items)) return [];
			return value.items.filter((item) => typeof item === "object" && item !== null);
		}
		async function postJson(path, body) {
			const response = await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				cache: "no-store",
				body: JSON.stringify(body)
			});
			const value = await responseJson(response);
			if (!response.ok || value.ok !== true) throw requestError(value);
			return value;
		}
		function MemorySettingsCard(props) {
			const { config, settingsScope, t } = props;
			const settingsSnapshot = (0, react.useSyncExternalStore)((listener) => settingsScope.subscribe(listener), () => settingsScope.getSnapshot(), () => settingsScope.getSnapshot());
			const liveConfig = (0, react.useMemo)(() => {
				try {
					return normalizeMemoryConfig(settingsSnapshot.value ?? config);
				} catch {
					return config;
				}
			}, [config, settingsSnapshot.value]);
			const dock = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("desktop-dock-setting");
			const [editorOpen, setEditorOpen] = (0, react.useState)(!dock);
			const [memoryTab, setMemoryTab] = (0, react.useState)("items");
			const [cleanDraft, setCleanDraft] = (0, react.useState)(() => JSON.stringify(emptyDraft()));
			const [enabled, setEnabled] = (0, react.useState)(liveConfig.enabled);
			const [items, setItems] = (0, react.useState)([]);
			const [pending, setPending] = (0, react.useState)([]);
			const [selectedId, setSelectedId] = (0, react.useState)();
			const [draft, setDraft] = (0, react.useState)(emptyDraft);
			const [filter, setFilter] = (0, react.useState)("");
			const [scopeFilter, setScopeFilter] = (0, react.useState)("all");
			const [clearEntries, setClearEntries] = (0, react.useState)(null);
			const [replacements, setReplacements] = (0, react.useState)({});
			const [feedback, setFeedback] = (0, react.useState)("");
			const [loading, setLoading] = (0, react.useState)(true);
			const [saving, setSaving] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [saved, setSaved] = (0, react.useState)(false);
			const lastRevision = (0, react.useRef)(settingsSnapshot.revision);
			(0, react.useEffect)(() => {
				if (lastRevision.current !== settingsSnapshot.revision) {
					if (saving) setError(t("settings.errorConflict"));
					lastRevision.current = settingsSnapshot.revision;
				}
			}, [
				saving,
				settingsSnapshot.revision,
				t
			]);
			(0, react.useEffect)(() => {
				if (!saving) setEnabled(liveConfig.enabled);
			}, [liveConfig.enabled, saving]);
			const load = () => {
				setLoading(true);
				setError(null);
				(async () => {
					for (let attempt = 0; attempt < 8; attempt += 1) try {
						const [itemValue, pendingValue] = await Promise.all([getJson("/api/dsh-memory/items?view=manage&refresh=1"), getJson("/api/dsh-memory/pending")]);
						setItems(responseItems(itemValue));
						setPending(responsePending(pendingValue));
						setLoading(false);
						setFeedback(t("settings.refreshed"));
						return;
					} catch (reason) {
						if (!retryableLoadError(reason) || attempt === 7) break;
						await waitBeforeReload(attempt);
					}
					setItems([]);
					setPending([]);
					setLoading(false);
					setError(t("settings.errorLoad"));
				})();
			};
			(0, react.useEffect)(() => {
				load();
			}, []);
			const visibleItems = (0, react.useMemo)(() => {
				const needle = filter.trim().toLocaleLowerCase();
				const scoped = items.filter((item) => scopeFilter === "all" || item.scope === scopeFilter);
				if (needle === "") return scoped;
				return scoped.filter((item) => [item.content, ...item.tags].join(" ").toLocaleLowerCase().includes(needle));
			}, [
				filter,
				items,
				scopeFilter
			]);
			const select = (item) => {
				setEditorOpen(true);
				setCleanDraft(JSON.stringify(draftOf(item)));
				setSelectedId(item.id);
				setDraft(draftOf(item));
				setSaved(false);
				setError(null);
			};
			const create = () => {
				setEditorOpen(true);
				setCleanDraft(JSON.stringify(emptyDraft()));
				setSelectedId(void 0);
				setDraft(emptyDraft());
				setSaved(false);
				setError(null);
			};
			const saveConfig = (next) => {
				setEnabled(next);
				setSaved(false);
				settingsScope.set("enabled", next).then(() => setSaved(true), () => setError(t("settings.errorSave")));
			};
			const save = () => {
				const body = itemFromDraft(draft);
				if (body === void 0 || !settingsSnapshot.writable || saving) {
					setError(t("settings.errorInvalid"));
					return;
				}
				setSaving(true);
				setError(null);
				postJson("/api/dsh-memory/items", body).then((value) => {
					const item = value.item;
					setSelectedId(item.id);
					setDraft(draftOf(item));
					setCleanDraft(JSON.stringify(draftOf(item)));
					setFeedback(t("settings.savedTo") + " " + t("settings." + item.scope));
					setSaved(true);
					setSaving(false);
					load();
				}, (reason) => {
					const code = reason instanceof Error ? reason.code : void 0;
					setError(errorMessage(code, t));
					setSaving(false);
				});
			};
			const remove = () => {
				if (selectedId === void 0 || saving) return;
				setSaving(true);
				postJson("/api/dsh-memory/items", {
					operation: "remove",
					id: selectedId,
					expectedUpdatedAt: draft.expectedUpdatedAt
				}).then(() => {
					setSelectedId(void 0);
					setDraft(emptyDraft());
					setCleanDraft(JSON.stringify(emptyDraft()));
					setEditorOpen(!dock);
					setSaving(false);
					load();
				}, (reason) => {
					setError(errorMessage(reason instanceof Error ? reason.code : void 0, t));
					setSaving(false);
				});
			};
			const clear = () => {
				if (saving || !clearEntries) return;
				setSaving(true);
				postJson("/api/dsh-memory/items", {
					operation: "clear",
					entries: clearEntries.map((item) => ({
						id: item.id,
						updatedAt: item.updatedAt
					}))
				}).then(() => {
					setClearEntries(null);
					setSelectedId(void 0);
					setDraft(emptyDraft());
					setCleanDraft(JSON.stringify(emptyDraft()));
					setEditorOpen(!dock);
					setSaving(false);
					load();
				}, (reason) => {
					setError(errorMessage(reason instanceof Error ? reason.code : void 0, t));
					setSaving(false);
				});
			};
			const confirm = (entry) => {
				if (saving) return;
				setSaving(true);
				const replacement = items.find((item) => item.id === replacements[entry.id]);
				postJson("/api/dsh-memory/pending/" + encodeURIComponent(entry.id), {
					operation: "confirm",
					...replacement ? {
						replaceId: replacement.id,
						expectedUpdatedAt: replacement.updatedAt
					} : {}
				}).then(() => {
					setSaving(false);
					load();
				}, (reason) => {
					setError(errorMessage(reason instanceof Error ? reason.code : void 0, t));
					setSaving(false);
				});
			};
			const reject = (entry) => {
				if (saving) return;
				setSaving(true);
				postJson("/api/dsh-memory/pending/" + encodeURIComponent(entry.id), { operation: "cancel" }).then(() => {
					setSaving(false);
					load();
				}, (reason) => {
					setError(errorMessage(reason instanceof Error ? reason.code : void 0, t));
					setSaving(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: memory_module_css_default.card,
				"data-memory-card": "true",
				"data-dock-owner": "memory",
				"data-dock-dirty": editorOpen && JSON.stringify(draft) !== cleanDraft,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: memory_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: memory_module_css_default.title,
							children: t("settings.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: memory_module_css_default.description,
							children: t("settings.description")
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: saved ? memory_module_css_default.badgeSaved : memory_module_css_default.badge,
							children: saving ? t("settings.saving") : saved ? t("settings.saved") : editorOpen && JSON.stringify(draft) !== cleanDraft ? t("settings.unsaved") : t("settings.ready")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: memory_module_css_default.notice,
						children: t("settings.ownerNotice")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MemoryActivityPanel, {
						t,
						enabled,
						onEdit: select
					}),
					saved && selectedId && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: memory_module_css_default.muted,
						role: "status",
						children: [
							t("settings.savedTo"),
							" ",
							t("settings." + draft.scope),
							draft.workspaceId || draft.sessionId ? " · " + (draft.workspaceId || draft.sessionId) : ""
						]
					}),
					!settingsSnapshot.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: memory_module_css_default.notice,
						role: "status",
						children: t("settings.readonly")
					}),
					settingsSnapshot.status === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: memory_module_css_default.muted,
						role: "status",
						children: t("settings.loading")
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: memory_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: memory_module_css_default.toggle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: enabled,
							disabled: !settingsSnapshot.writable || saving,
							onChange: (event) => saveConfig(event.target.checked)
						}), t("settings.enabled")]
					}),
					dock && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: memory_module_css_default.tabs,
						role: "tablist",
						"aria-label": t("settings.title"),
						onKeyDown: (event) => {
							if (![
								"ArrowLeft",
								"ArrowRight",
								"Home",
								"End"
							].includes(event.key)) return;
							event.preventDefault();
							const next = event.key === "Home" ? "items" : event.key === "End" ? "pending" : memoryTab === "items" ? "pending" : "items";
							setMemoryTab(next);
							event.currentTarget.querySelectorAll("button")[next === "items" ? 0 : 1]?.focus();
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "tab",
							tabIndex: memoryTab === "items" ? 0 : -1,
							"aria-selected": memoryTab === "items",
							onClick: () => setMemoryTab("items"),
							children: [
								t("settings.items"),
								" · ",
								items.length
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "tab",
							tabIndex: memoryTab === "pending" ? 0 : -1,
							"aria-selected": memoryTab === "pending",
							onClick: () => setMemoryTab("pending"),
							children: [
								t("settings.pending"),
								" · ",
								pending.length
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: memory_module_css_default.section,
						hidden: dock && memoryTab !== "items",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: memory_module_css_default.sectionHeader,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("settings.items") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										visibleItems.length,
										" ",
										t("settings.count")
									] }),
									feedback && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
										className: memory_module_css_default.muted,
										role: "status",
										children: feedback
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: memory_module_css_default.button,
										disabled: saving,
										onClick: load,
										children: t("settings.reload")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: memory_module_css_default.scopeFilter,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.scopeFilter") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									"aria-label": t("settings.scopeFilter"),
									value: scopeFilter,
									onChange: (event) => {
										setScopeFilter(event.target.value);
										setClearEntries(null);
									},
									children: [
										"all",
										"global",
										"workspace",
										"session"
									].map((scope) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: scope,
										children: [
											t("settings." + scope),
											" · ",
											scope === "all" ? items.length : items.filter((item) => item.scope === scope).length
										]
									}, scope))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.filterRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										value: filter,
										onChange: (event) => {
											setFilter(event.target.value);
											setClearEntries(null);
										},
										placeholder: t("settings.searchPlaceholder"),
										"aria-label": t("settings.search")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: memory_module_css_default.button,
										disabled: saving || !settingsSnapshot.writable,
										onClick: create,
										children: t("settings.new")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: memory_module_css_default.danger,
										disabled: saving || visibleItems.length === 0 || !settingsSnapshot.writable,
										onClick: () => setClearEntries([...visibleItems]),
										children: t("settings.clearVisible")
									})
								]
							}),
							clearEntries && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: memory_module_css_default.notice,
								role: "alert",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
									t("settings.clearConfirm"),
									" ",
									clearEntries.length,
									" ",
									t("settings.count")
								] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: memory_module_css_default.actions,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: memory_module_css_default.button,
										onClick: () => setClearEntries(null),
										children: t("settings.cancelAction")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: memory_module_css_default.danger,
										disabled: saving,
										onClick: clear,
										children: t("settings.confirmDelete")
									})]
								})]
							}),
							loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: memory_module_css_default.muted,
								children: t("settings.loading")
							}),
							!loading && visibleItems.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: memory_module_css_default.muted,
								children: t("settings.noItems")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: memory_module_css_default.itemList,
								role: "list",
								children: visibleItems.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									role: "listitem",
									className: item.id === selectedId ? memory_module_css_default.itemSelected : memory_module_css_default.item,
									onClick: () => select(item),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: memory_module_css_default.itemContent,
										children: item.content
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: memory_module_css_default.itemMeta,
										children: [
											item.scope === "global" ? t("settings.global") : item.scope === "workspace" ? t("settings.workspace") : t("settings.session"),
											item.workspaceId || item.sessionId ? " · " + (item.workspaceId ?? item.sessionId) : "",
											item.pinned ? ` · ${t("settings.pinned")}` : "",
											item.expiresAt !== void 0 && item.expiresAt <= Date.now() ? " · " + t("settings.expired") : ""
										]
									})]
								}, item.id))
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: memory_module_css_default.section,
						hidden: dock && memoryTab !== "pending",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: memory_module_css_default.sectionHeader,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("settings.pending") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									pending.length,
									" ",
									t("settings.count")
								] })]
							}),
							pending.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: memory_module_css_default.muted,
								children: t("settings.noPending")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: memory_module_css_default.muted,
								children: t("settings.pendingHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: memory_module_css_default.pendingList,
								children: pending.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
									className: memory_module_css_default.pendingItem,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: memory_module_css_default.pendingContent,
											children: entry.item.content
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
											className: memory_module_css_default.notice,
											children: [
												t("settings.suggestion"),
												" ",
												t("settings." + entry.item.scope),
												" · ",
												new Date(entry.createdAt).toLocaleString()
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: memory_module_css_default.field,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.replacement") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												value: replacements[entry.id] ?? "",
												onChange: (event) => setReplacements((current) => ({
													...current,
													[entry.id]: event.target.value
												})),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "",
													children: t("settings.newMemory")
												}), items.filter((item) => item.scope === entry.item.scope && item.workspaceId === entry.item.workspaceId && item.sessionId === entry.item.sessionId).map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
													value: item.id,
													children: [
														t("settings.replaceMemory"),
														": ",
														item.content.slice(0, 80)
													]
												}, item.id))]
											})]
										}),
										replacements[entry.id] && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("blockquote", { children: items.find((item) => item.id === replacements[entry.id])?.content }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: memory_module_css_default.actions,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: memory_module_css_default.primary,
												disabled: saving || !settingsSnapshot.writable,
												onClick: () => confirm(entry),
												children: t("settings.confirm")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: memory_module_css_default.button,
												disabled: saving || !settingsSnapshot.writable,
												onClick: () => reject(entry),
												children: t("settings.reject")
											})]
										})
									]
								}, entry.id))
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: memory_module_css_default.editor,
						hidden: dock && !editorOpen,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: memory_module_css_default.muted,
								children: t("settings.targetHint")
							}),
							selectedId && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: memory_module_css_default.muted,
								children: [
									t("settings.updated"),
									" ",
									new Date(draft.expectedUpdatedAt ?? 0).toLocaleString()
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
								className: memory_module_css_default.sectionHeader,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: selectedId === void 0 ? t("settings.new") : selectedId })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: memory_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.scope") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: draft.scope,
									disabled: saving || !settingsSnapshot.writable,
									onChange: (event) => setDraft((current) => ({
										...current,
										scope: event.target.value
									})),
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
											children: t("settings.session")
										})
									]
								})]
							}),
							draft.scope === "workspace" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: memory_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.workspaceId") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									value: draft.workspaceId,
									maxLength: 128,
									disabled: saving || !settingsSnapshot.writable,
									onChange: (event) => setDraft((current) => ({
										...current,
										workspaceId: event.target.value
									}))
								})]
							}),
							draft.scope === "session" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: memory_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.sessionId") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									value: draft.sessionId,
									maxLength: 128,
									disabled: saving || !settingsSnapshot.writable,
									onChange: (event) => setDraft((current) => ({
										...current,
										sessionId: event.target.value
									}))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: memory_module_css_default.field,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.content") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										value: draft.content,
										maxLength: MAX_MEMORY_CONTENT_LENGTH,
										placeholder: t("settings.contentPlaceholder"),
										disabled: saving || !settingsSnapshot.writable,
										onChange: (event) => setDraft((current) => ({
											...current,
											content: event.target.value
										}))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: memory_module_css_default.counter,
										children: [
											draft.content.length,
											" / ",
											MAX_MEMORY_CONTENT_LENGTH
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: memory_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.tags") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									value: draft.tags,
									disabled: saving || !settingsSnapshot.writable,
									onChange: (event) => setDraft((current) => ({
										...current,
										tags: event.target.value
									}))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: memory_module_css_default.toggle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: draft.pinned,
									disabled: saving || !settingsSnapshot.writable,
									onChange: (event) => setDraft((current) => ({
										...current,
										pinned: event.target.checked
									}))
								}), t("settings.pinned")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: memory_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.expiresAt") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									value: draft.expiresAt,
									inputMode: "numeric",
									disabled: saving || !settingsSnapshot.writable,
									onChange: (event) => setDraft((current) => ({
										...current,
										expiresAt: event.target.value
									}))
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
								className: memory_module_css_default.actions,
								"data-dock-save-bar": dock || void 0,
								children: [
									selectedId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: memory_module_css_default.danger,
										disabled: saving || !settingsSnapshot.writable,
										onClick: remove,
										children: t("settings.delete")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: memory_module_css_default.button,
										disabled: saving,
										onClick: () => {
											setSelectedId(void 0);
											setDraft(emptyDraft());
											setCleanDraft(JSON.stringify(emptyDraft()));
											setEditorOpen(!dock);
										},
										children: t("settings.cancel")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: memory_module_css_default.primary,
										"data-dock-save": "true",
										disabled: saving || !settingsSnapshot.writable,
										onClick: save,
										children: saving ? t("settings.saving") : t("settings.save")
									})
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			"settings.all": "全部作用域",
			"settings.scopeFilter": "查看范围",
			"settings.clearVisible": "清空当前结果",
			"settings.clearConfirm": "确认删除当前显示的记忆？此操作无法撤销。",
			"settings.confirmDelete": "确认删除",
			"settings.cancelAction": "取消",
			"settings.refreshed": "已从本地文件刷新",
			"settings.savedTo": "已保存到",
			"settings.targetHint": "工作区和会话记忆仅对对应目标生效；目标 ID 必须属于当前用户。",
			"settings.pendingHint": "建议暂存于本次运行，重启后消失；确认前不会写入记忆文件。",
			"settings.newMemory": "新增记忆",
			"settings.replaceMemory": "更新已有记忆",
			"settings.replacement": "保存方式",
			"settings.duplicate": "相同作用域中已有这条记忆，请编辑已有条目。",
			"settings.expired": "已过期，不参与引用",
			"settings.sourceExplicit": "手动保存",
			"settings.sourceSuggested": "已确认的模型建议",
			"settings.updated": "更新于",
			"settings.refreshDirty": "有未保存的编辑，刷新后仍保留草稿；保存时会检查版本。",
			"settings.activityTitle": "记忆",
			"settings.activityHint": "展示最近为会话准备的记忆上下文，不代表模型已经采纳。忽略从后续请求生效，本次运行内保留。",
			"settings.activity.none": "此会话尚未准备记忆上下文。",
			"settings.activity.disabled": "记忆已关闭，可在个人偏好中开启。",
			"settings.activity.empty-query": "本轮没有可用于检索的直接用户文本。",
			"settings.activity.loading": "正在刷新记忆，请稍后重新查看。",
			"settings.activity.no-match": "本轮没有相关记忆。",
			"settings.activity.ready": "最近准备的记忆",
			"settings.reason.content": "正文匹配",
			"settings.reason.tag": "标签匹配",
			"settings.reason.content-and-tag": "正文和标签匹配",
			"settings.truncated": "受上下文限额影响，仅引用了部分内容",
			"settings.ignore": "本会话忽略",
			"settings.restoreIgnored": "恢复本会话忽略项",
			"settings.edit": "编辑",
			"settings.activityError": "暂时无法读取或更新记忆，请重试。",
			"settings.ready": "无待保存修改",
			"settings.saving": "保存中…",
			"settings.title": "记忆",
			"settings.description": "保存希望 AI 记住的事实和偏好。按本轮输入检索相关内容，模型建议由你确认后保存。",
			"settings.enabled": "允许模型在请求中引用记忆",
			"settings.ownerNotice": "记忆保存在本机并按用户隔离。引用内容会随请求发送给当前模型供应商；归属不明时不引用。",
			"settings.readonly": "当前设置不可写，或此页面不在本机回环环境中。",
			"settings.loading": "正在读取…",
			"settings.items": "已保存的记忆",
			"settings.pending": "待确认建议",
			"settings.new": "新建",
			"settings.search": "筛选",
			"settings.searchPlaceholder": "按内容或标签筛选",
			"settings.scope": "作用域",
			"settings.global": "全局",
			"settings.workspace": "工作区",
			"settings.session": "会话",
			"settings.workspaceId": "工作区 ID",
			"settings.sessionId": "会话 ID",
			"settings.content": "内容",
			"settings.contentPlaceholder": "只保存你愿意长期保留的事实或偏好…",
			"settings.tags": "标签（逗号分隔）",
			"settings.pinned": "置顶",
			"settings.expiresAt": "过期时间（Unix 毫秒，可选）",
			"settings.save": "保存",
			"settings.cancel": "取消编辑",
			"settings.delete": "删除",
			"settings.clear": "清空全部",
			"settings.confirm": "确认保存",
			"settings.reject": "忽略",
			"settings.noItems": "还没有记忆。",
			"settings.noPending": "没有待确认建议。",
			"settings.suggestion": "模型建议保存一条记忆；确认前不会写入本地文件。",
			"settings.saved": "已保存",
			"settings.unsaved": "未保存",
			"settings.errorLoad": "读取记忆失败，已保持为空。",
			"settings.errorSave": "保存失败，请检查内容、作用域和权限。",
			"settings.errorSensitive": "此内容看起来包含凭据，不建议保存为长期记忆。",
			"settings.errorInvalid": "内容、标签或作用域无效。",
			"settings.errorStore": "本地记忆暂时不可用。",
			"settings.errorConflict": "设置在其他窗口发生变化，请重新加载。",
			"settings.reload": "重新加载",
			"settings.count": "条"
		};
		const en = {
			"settings.all": "All scopes",
			"settings.scopeFilter": "Show scope",
			"settings.clearVisible": "Clear current results",
			"settings.clearConfirm": "Delete the memories currently shown? This cannot be undone.",
			"settings.confirmDelete": "Confirm delete",
			"settings.cancelAction": "Cancel",
			"settings.refreshed": "Reloaded from local storage",
			"settings.savedTo": "Saved to",
			"settings.targetHint": "Workspace and session memories apply only to that target. Target IDs must belong to the current user.",
			"settings.pendingHint": "Suggestions last for this process and disappear on restart. They are not written to memory until confirmed.",
			"settings.newMemory": "Create memory",
			"settings.replaceMemory": "Update existing memory",
			"settings.replacement": "Save as",
			"settings.duplicate": "This memory already exists in the same scope. Edit the existing item.",
			"settings.expired": "Expired; excluded from retrieval",
			"settings.sourceExplicit": "Manually saved",
			"settings.sourceSuggested": "Confirmed model suggestion",
			"settings.updated": "Updated",
			"settings.refreshDirty": "Unsaved edits are preserved when reloading. Saving checks for version conflicts.",
			"settings.activityTitle": "Memory",
			"settings.activityHint": "Shows memory context most recently prepared for the session, not proof the model used it. Ignoring applies to subsequent requests during this process.",
			"settings.activity.none": "No memory context has been prepared for this session.",
			"settings.activity.disabled": "Memory is off. Enable it in Personal preferences.",
			"settings.activity.empty-query": "No direct user text is available for retrieval in this turn.",
			"settings.activity.loading": "Refreshing memory. Check again shortly.",
			"settings.activity.no-match": "No relevant memories for this turn.",
			"settings.activity.ready": "Recently prepared memories",
			"settings.reason.content": "Content match",
			"settings.reason.tag": "Tag match",
			"settings.reason.content-and-tag": "Content and tag match",
			"settings.truncated": "Only part of this item fit the context budget",
			"settings.ignore": "Ignore in this session",
			"settings.restoreIgnored": "Restore ignored items",
			"settings.edit": "Edit",
			"settings.activityError": "Memory could not be read or updated. Retry.",
			"settings.ready": "No unsaved changes",
			"settings.saving": "Saving…",
			"settings.title": "Memory",
			"settings.description": "Save facts and preferences for AI to remember. Retrieval follows this turn’s direct input; model suggestions require your confirmation.",
			"settings.enabled": "Allow memory in model requests",
			"settings.ownerNotice": "Memory is stored locally and isolated by owner. Referenced content is sent to the current model provider; unknown ownership blocks retrieval.",
			"settings.readonly": "Settings are read-only, or this page is not running on the local loopback surface.",
			"settings.loading": "Loading…",
			"settings.items": "Saved memories",
			"settings.pending": "Pending suggestions",
			"settings.new": "New",
			"settings.search": "Filter",
			"settings.searchPlaceholder": "Filter by content or tag",
			"settings.scope": "Scope",
			"settings.global": "Global",
			"settings.workspace": "Workspace",
			"settings.session": "Session",
			"settings.workspaceId": "Workspace ID",
			"settings.sessionId": "Session ID",
			"settings.content": "Content",
			"settings.contentPlaceholder": "Keep only facts or preferences you want to retain…",
			"settings.tags": "Tags (comma-separated)",
			"settings.pinned": "Pinned",
			"settings.expiresAt": "Expires at (Unix ms, optional)",
			"settings.save": "Save",
			"settings.cancel": "Cancel edit",
			"settings.delete": "Delete",
			"settings.clear": "Clear all",
			"settings.confirm": "Confirm save",
			"settings.reject": "Dismiss",
			"settings.noItems": "No memories yet.",
			"settings.noPending": "No pending suggestions.",
			"settings.suggestion": "The model proposed a memory; it is not written locally until you confirm.",
			"settings.saved": "Saved",
			"settings.unsaved": "Unsaved",
			"settings.errorLoad": "Memory read failed; the list was kept empty.",
			"settings.errorSave": "Save failed. Check the content, scope, and permissions.",
			"settings.errorSensitive": "This content looks like a credential and should not be saved as long-term memory.",
			"settings.errorInvalid": "The content, tags, or scope is invalid.",
			"settings.errorStore": "Local memory is temporarily unavailable.",
			"settings.errorConflict": "Settings changed in another window. Reload before editing.",
			"settings.reload": "Reload",
			"settings.count": "items"
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
			ctx.effect(() => ctx.locale.register("memory", {
				zh,
				en
			}), "memory: dictionaries");
			const settingsScope = settingsBinder(ctx).bind({
				namespace: MEMORY_SETTINGS_NAMESPACE,
				decode: (value) => {
					try {
						return normalizeMemoryConfig(value);
					} catch {
						return;
					}
				}
			});
			ctx.inject(["slots"], (scope) => {
				scope.slots.inject("web-ui.plugin.item", () => scope.slots.register({
					name: "web-ui.plugin.item",
					id: "memory",
					order: 118,
					locale: "memory",
					inject: () => ({
						config: normalizeMemoryConfig(settingsScope.getSnapshot().value),
						settingsScope
					})
				}, MemorySettingsCard));
				scope.slots.inject("conversation.session.header.actions", () => scope.slots.register({
					name: "conversation.session.header.actions",
					id: "memory-status",
					order: -7,
					locale: "memory",
					inject: () => ({ settingsScope })
				}, MemoryHeaderStatus));
			});
		}
		//#endregion
		exports.MemorySettingsCard = MemorySettingsCard;
		exports.apply = apply;
		exports.en = en;
		exports.inject = inject;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map