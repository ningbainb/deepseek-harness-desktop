window.__ModuleLoader__.load({
	id: "@ningbainb/dsh-chat-artifacts",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/core/types.ts
		/**
		* Shared, DOM-free contracts and validation for Chat Artifact.
		*
		* The same validator runs before a value enters the session log and again
		* before a replayed value reaches an iframe. Keeping it DOM-free means the
		* host and browser halves cannot drift on the security boundary.
		*/
		const ARTIFACT_KINDS = [
			"architecture",
			"flow",
			"timeline",
			"comparison",
			"roadmap",
			"dashboard",
			"table",
			"wireframe",
			"report",
			"other"
		];
		/** Return UTF-8 byte length without relying on a Node-only Buffer API. */
		function utf8ByteLength(value) {
			return new TextEncoder().encode(value).byteLength;
		}
		/** Validate the subset of HTML that the safe artifact frame is allowed to host. */
		function validateArtifactHtml(html) {
			const issues = [];
			const add = (message) => {
				if (!issues.includes(message)) issues.push(message);
			};
			if (html.trim().length === 0) add("HTML must not be empty");
			if (utf8ByteLength(html) > 524288) add("HTML exceeds the 524288-byte limit");
			if (html.includes("\0")) add("NUL characters are not allowed");
			if (/<\s*\/?\s*(?:script|iframe|object|embed|applet|portal|form|base|link)\b/i.test(html)) add("script, nested frame, object, embed, form, base, and link elements are not allowed");
			if (/<\s*\/?\s*(?:html|head|body)\b/i.test(html)) add("document shell elements are not allowed");
			if (/<\s*meta\b/i.test(html)) add("meta elements are not allowed");
			if (/\bsrcdoc\s*=/i.test(html)) add("srcdoc attributes are not allowed");
			if (/\bon[a-z][\w:-]*\s*=/i.test(html)) add("inline event-handler attributes are not allowed");
			if (/(?:javascript|vbscript)\s*:/i.test(html)) add("script URL schemes are not allowed");
			if (/@import\b/i.test(html)) add("CSS @import is not allowed");
			if (/(?:expression\s*\(|-moz-binding\b|behavior\s*:)/i.test(html)) add("legacy CSS execution hooks are not allowed");
			if (/(?:fetch\s*\(|XMLHttpRequest\b|WebSocket\s*\(|EventSource\s*\(|sendBeacon\s*\(|window\.open\b|document\.cookie\b|parent\.|top\.|opener\b|electron\b|require\s*\(|process\.)/i.test(html)) add("network, parent-window, Electron, and Node execution APIs are not allowed");
			const urlAttribute = /\b(?:src|href|action|formaction|poster|cite|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
			for (let match = urlAttribute.exec(html); match !== null; match = urlAttribute.exec(html)) {
				const value = match[1] ?? match[2] ?? match[3] ?? "";
				if (/^(?:https?:|ftp:|file:|\/\/|javascript:|vbscript:)/i.test(value) || /^data:(?!image\/|font\/|audio\/|video\/)/i.test(value)) {
					add("external URLs and non-media data URLs are not allowed");
					break;
				}
			}
			const cssUrl = /\burl\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]+))\s*\)/gi;
			for (let match = cssUrl.exec(html); match !== null; match = cssUrl.exec(html)) {
				const value = match[1] ?? match[2] ?? match[3] ?? "";
				if (!/^#/i.test(value) && !/^blob:/i.test(value) && !/^data:(?:image\/|font\/|audio\/|video\/)/i.test(value)) {
					add("CSS resource URLs must be local fragment, blob, or media data URLs");
					break;
				}
			}
			return issues;
		}
		/** Softly validate a presentationMeta value received from a durable session. */
		function isArtifactRecord(value) {
			if (typeof value !== "object" || value === null) return false;
			const candidate = value;
			return typeof candidate.artifactId === "string" && /^artifact_[A-Za-z0-9_-]+$/.test(candidate.artifactId) && candidate.artifactId.length <= 80 && typeof candidate.title === "string" && candidate.title.trim().length > 0 && Array.from(candidate.title).length <= 160 && typeof candidate.kind === "string" && ARTIFACT_KINDS.includes(candidate.kind) && typeof candidate.html === "string" && validateArtifactHtml(candidate.html).length === 0 && typeof candidate.height === "number" && Number.isSafeInteger(candidate.height) && candidate.height >= 240 && candidate.height <= 720 && Number.isSafeInteger(candidate.bytes) && candidate.bytes === utf8ByteLength(candidate.html) && typeof candidate.sha256 === "string" && /^[a-f0-9]{64}$/.test(candidate.sha256) && (candidate.description === void 0 || typeof candidate.description === "string" && Array.from(candidate.description).length <= 500);
		}
		/** Extract bounded source text from malformed metadata for the error fallback. */
		function artifactSourceFromMeta(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const html = value.html;
			if (typeof html !== "string" || utf8ByteLength(html) > 524288) return void 0;
			return html;
		}
		//#endregion
		//#region \0dsh-css:packages/dsh-chat-artifacts/src/client/artifact.module.css.mjs
		const css = ".mjFLyG_card,.mjFLyG_fallback{border:1px solid var(--dsw-border-subtle,#1018281f);background:var(--dsw-surface,var(--dsw-bg,#fff));width:100%;min-width:0;color:var(--dsw-text,#1f2329);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px #1018280a}.mjFLyG_header,.mjFLyG_fallbackHeader{justify-content:space-between;align-items:center;gap:12px;min-height:48px;padding:10px 12px;display:flex}.mjFLyG_heading{align-items:center;gap:9px;min-width:0;display:flex}.mjFLyG_headingIcon,.mjFLyG_statusIcon{color:var(--dsw-accent,#4f46e5);flex:none}.mjFLyG_headingText{min-width:0}.mjFLyG_title{text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;line-height:18px;overflow:hidden}.mjFLyG_meta{min-height:16px;color:var(--dsw-text-muted,#667085);align-items:center;gap:6px;font-size:11px;line-height:16px;display:flex}.mjFLyG_description{color:var(--dsw-text-muted,#667085);margin:0;padding:0 12px 10px;font-size:12px}.mjFLyG_expandButton,.mjFLyG_actionButton{color:var(--dsw-text-muted,#667085);cursor:pointer;font:inherit;background:0 0;border:0;border-radius:6px;justify-content:center;align-items:center;gap:5px;padding:4px 6px;font-size:11px;line-height:18px;display:inline-flex}.mjFLyG_expandButton:hover,.mjFLyG_actionButton:hover{background:var(--dsw-hover,#1018280f);color:var(--dsw-text,#1f2329)}.mjFLyG_frameViewport{border-top:1px solid var(--dsw-border-subtle,#10182814);border-bottom:1px solid var(--dsw-border-subtle,#10182814);background:var(--dsw-bg-secondary,#f8fafc);width:100%;min-height:0;overflow:hidden auto}.mjFLyG_frame{background:0 0;border:0;width:100%;height:100%;min-height:100%;display:block}.mjFLyG_unloaded{height:100%;min-height:120px;color:var(--dsw-text-muted,#667085);text-align:center;place-items:center;padding:16px;font-size:12px;display:grid}.mjFLyG_actions{flex-wrap:wrap;align-items:center;gap:3px 4px;min-height:42px;padding:7px 9px;display:flex}.mjFLyG_copyStatus{color:var(--dsw-accent,#4f46e5);font-size:11px}.mjFLyG_artifactId,.mjFLyG_sourceId{color:var(--dsw-text-tertiary,#98a2b3);text-overflow:ellipsis;white-space:nowrap;margin-left:auto;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;overflow:hidden}.mjFLyG_sourcePanel{background:var(--dsw-bg-secondary,#f8fafc);padding:10px 12px}.mjFLyG_sourceHeading{color:var(--dsw-text-muted,#667085);justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;font-size:11px;font-weight:600;display:flex}.mjFLyG_source,.mjFLyG_fallbackSource .mjFLyG_source{border:1px solid var(--dsw-border-subtle,#1018281a);background:var(--dsw-surface,#fff);max-height:280px;color:var(--dsw-text,#1f2329);white-space:pre-wrap;overflow-wrap:anywhere;border-radius:8px;margin:0;padding:10px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;line-height:1.55;overflow:auto}.mjFLyG_fallback{border-color:var(--dsw-border-subtle,#1018281f)}.mjFLyG_fallback[data-artifact-state=error] .mjFLyG_statusIcon{color:var(--dsw-danger,#d92d20)}.mjFLyG_fallbackHeader{min-height:44px}.mjFLyG_fallbackChevron{color:var(--dsw-text-tertiary,#98a2b3);flex:none}.mjFLyG_fallbackSource{margin:0 12px 12px}.mjFLyG_fallbackSource summary{color:var(--dsw-text-muted,#667085);cursor:pointer;font-size:11px}.mjFLyG_fallbackSource .mjFLyG_source{margin-top:6px}";
		const tagId = "@ningbainb/dsh-chat-artifacts/artifact.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ningbainb/dsh-chat-artifacts";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var artifact_module_css_default = {
			"actionButton": "mjFLyG_actionButton",
			"actions": "mjFLyG_actions",
			"artifactId": "mjFLyG_artifactId",
			"card": "mjFLyG_card",
			"copyStatus": "mjFLyG_copyStatus",
			"description": "mjFLyG_description",
			"expandButton": "mjFLyG_expandButton",
			"fallback": "mjFLyG_fallback",
			"fallbackChevron": "mjFLyG_fallbackChevron",
			"fallbackHeader": "mjFLyG_fallbackHeader",
			"fallbackSource": "mjFLyG_fallbackSource",
			"frame": "mjFLyG_frame",
			"frameViewport": "mjFLyG_frameViewport",
			"header": "mjFLyG_header",
			"heading": "mjFLyG_heading",
			"headingIcon": "mjFLyG_headingIcon",
			"headingText": "mjFLyG_headingText",
			"meta": "mjFLyG_meta",
			"source": "mjFLyG_source",
			"sourceHeading": "mjFLyG_sourceHeading",
			"sourceId": "mjFLyG_sourceId",
			"sourcePanel": "mjFLyG_sourcePanel",
			"statusIcon": "mjFLyG_statusIcon",
			"title": "mjFLyG_title",
			"unloaded": "mjFLyG_unloaded"
		};
		//#endregion
		//#region src/client/SafeArtifactFrame.tsx
		/** Defense-in-depth policy for the isolated artifact document. */
		const SAFE_ARTIFACT_CSP = [
			"default-src 'none'",
			"script-src 'none'",
			"style-src 'unsafe-inline'",
			"img-src data: blob:",
			"font-src data:",
			"connect-src 'none'",
			"media-src data: blob:",
			"object-src 'none'",
			"frame-src 'none'",
			"worker-src 'none'",
			"base-uri 'none'",
			"form-action 'none'",
			"navigate-to 'none'"
		].join("; ");
		const FRAME_CSS = [
			":root { color-scheme: light dark; --artifact-bg: #ffffff; --artifact-fg: #1f2329; --artifact-muted: #667085; }",
			"@media (prefers-color-scheme: dark) { :root { --artifact-bg: #17191d; --artifact-fg: #f2f4f7; --artifact-muted: #98a2b3; } }",
			"*, *::before, *::after { box-sizing: border-box; }",
			"html, body { margin: 0; min-height: 100%; }",
			"body { padding: 16px; overflow: auto; background: var(--artifact-bg); color: var(--artifact-fg); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; font-size: 14px; line-height: 1.5; }",
			"a { color: inherit; }",
			"svg { max-width: 100%; }"
		].join("\n");
		/** Wrap a validated fragment in a document with a restrictive CSP and theme tokens. */
		function buildSafeArtifactDocument(html) {
			return "<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"" + SAFE_ARTIFACT_CSP.replaceAll("\"", "&quot;") + "\"><style>" + FRAME_CSS + "</style></head><body>" + html + "</body></html>";
		}
		/**
		* Render an artifact in a sandbox without allow-scripts. Far-away frames are
		* removed to keep long conversations cheap; the document is deterministic, so
		* remounting has no application state to lose.
		*/
		function SafeArtifactFrame({ html, title, height, expanded, unloadedLabel }) {
			const rootRef = (0, react.useRef)(null);
			const [mounted, setMounted] = (0, react.useState)(true);
			const srcDoc = (0, react.useMemo)(() => buildSafeArtifactDocument(html), [html]);
			const frameHeight = expanded ? "min(" + height + "px, 90vh)" : Math.min(height, 420) + "px";
			(0, react.useEffect)(() => {
				const root = rootRef.current;
				if (root === null || typeof IntersectionObserver === "undefined") return;
				let observer;
				try {
					observer = new IntersectionObserver((entries) => {
						const entry = entries[0];
						if (entry !== void 0) setMounted(entry.isIntersecting || entry.intersectionRatio > 0);
					}, { rootMargin: "800px 0px" });
					observer.observe(root);
				} catch {
					setMounted(true);
				}
				return () => observer?.disconnect();
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				ref: rootRef,
				className: artifact_module_css_default.frameViewport,
				style: { height: frameHeight },
				children: mounted ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
					className: artifact_module_css_default.frame,
					title,
					srcDoc,
					sandbox: "",
					loading: "lazy",
					referrerPolicy: "no-referrer"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: artifact_module_css_default.unloaded,
					role: "status",
					children: unloadedLabel
				})
			});
		}
		//#endregion
		//#region src/client/ArtifactCard.tsx
		const KIND_KEYS = {
			architecture: "kind.architecture",
			flow: "kind.flow",
			timeline: "kind.timeline",
			comparison: "kind.comparison",
			roadmap: "kind.roadmap",
			dashboard: "kind.dashboard",
			table: "kind.table",
			wireframe: "kind.wireframe",
			report: "kind.report",
			other: "kind.other"
		};
		function kindLabel$1(t, kind) {
			return t(KIND_KEYS[kind]);
		}
		/** Card body for one validated artifact record. */
		function ArtifactCard({ artifact, t }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [sourceOpen, setSourceOpen] = (0, react.useState)(false);
			const [copyState, setCopyState] = (0, react.useState)("idle");
			const copyTimer = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => {
				if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
			}, []);
			const copyHtml = async () => {
				let copied = false;
				try {
					copied = await (0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(artifact.html);
				} catch {
					copied = false;
				}
				setCopyState(copied ? "copied" : "failed");
				if (copyTimer.current !== void 0) clearTimeout(copyTimer.current);
				copyTimer.current = setTimeout(() => setCopyState("idle"), 2200);
			};
			const copyLabel = copyState === "copied" ? t("card.copied") : copyState === "failed" ? t("card.copyFailed") : t("card.copy");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: artifact_module_css_default.card,
				"data-artifact-id": artifact.artifactId,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: artifact_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: artifact_module_css_default.heading,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, { className: artifact_module_css_default.headingIcon }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: artifact_module_css_default.headingText,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: artifact_module_css_default.title,
									title: artifact.title,
									children: artifact.title
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: artifact_module_css_default.meta,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: kindLabel$1(t, artifact.kind) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											children: "·"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											artifact.bytes,
											" ",
											t("card.bytes")
										] })
									]
								})]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: artifact_module_css_default.expandButton,
							"aria-expanded": expanded,
							onClick: () => setExpanded((value) => !value),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFullscreenOutline16, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: expanded ? t("card.collapse") : t("card.expand") })]
						})]
					}),
					artifact.description !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: artifact_module_css_default.description,
						children: artifact.description
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SafeArtifactFrame, {
						html: artifact.html,
						title: artifact.title,
						height: artifact.height,
						expanded,
						unloadedLabel: t("card.frameUnloaded")
					}),
					sourceOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: artifact_module_css_default.sourcePanel,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: artifact_module_css_default.sourceHeading,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("card.source") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: artifact_module_css_default.sourceId,
								children: artifact.artifactId
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							className: artifact_module_css_default.source,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: artifact.html })
						})]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: artifact_module_css_default.actions,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: artifact_module_css_default.actionButton,
								onClick: () => setSourceOpen((value) => !value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCodeOutline16, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: sourceOpen ? t("card.hideSource") : t("card.viewSource") })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: artifact_module_css_default.actionButton,
								onClick: () => {
									copyHtml();
								},
								children: [copyState === "copied" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: copyLabel })]
							}),
							copyState !== "idle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: artifact_module_css_default.copyStatus,
								role: "status",
								children: copyLabel
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: artifact_module_css_default.artifactId,
								title: artifact.artifactId,
								children: [
									t("card.artifactId"),
									": ",
									artifact.artifactId
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/ArtifactToolRow.tsx
		function isSettled(block) {
			return "kind" in block && block.kind === "tool-result";
		}
		function callArgs(block) {
			return isSettled(block) ? block.call?.argsRaw ?? "" : block.argsRaw;
		}
		function pendingArgs(raw) {
			try {
				const parsed = JSON.parse(raw);
				if (typeof parsed !== "object" || parsed === null) return {};
				const value = parsed;
				return {
					...typeof value.title === "string" ? { title: value.title } : {},
					...typeof value.kind === "string" && ARTIFACT_KINDS.includes(value.kind) ? { kind: value.kind } : {}
				};
			} catch {
				return {};
			}
		}
		function resultText(node) {
			return node.content.map((block) => block.type === "text" ? block.text : JSON.stringify(block) ?? "").join("\n").trim();
		}
		function firstLine(text) {
			return text.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) ?? "";
		}
		function errorText(node, t) {
			const text = firstLine(resultText(node));
			if (text.length > 0) return text;
			if (node.error !== void 0) return node.error.code;
			return t("card.unknownError");
		}
		function kindLabel(t, kind) {
			return t("kind." + kind);
		}
		function StatusIcon({ state }) {
			if (state === "running") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, { className: artifact_module_css_default.statusIcon });
			if (state === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" });
			if (state === "stopped") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "warning" });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, { className: artifact_module_css_default.statusIcon });
		}
		function FallbackRow({ state, title, summary, t, source }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: artifact_module_css_default.fallback,
				"data-artifact-state": state,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: artifact_module_css_default.fallbackHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: artifact_module_css_default.heading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusIcon, { state }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: artifact_module_css_default.headingText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: artifact_module_css_default.title,
								children: title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: artifact_module_css_default.meta,
								children: summary
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: artifact_module_css_default.fallbackChevron })]
				}), source !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
					className: artifact_module_css_default.fallbackSource,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("card.viewSource") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: artifact_module_css_default.source,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: source })
					})]
				}) : null]
			});
		}
		/** Keyed Tool renderer for render_artifact, including pending and replay fallback states. */
		function ArtifactToolRow({ block, t }) {
			if (!isSettled(block)) {
				const args = pendingArgs(callArgs(block));
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FallbackRow, {
					state: "running",
					title: args.title?.trim() || "Render artifact",
					summary: args.kind === void 0 ? t("card.generating") : kindLabel(t, args.kind) + " · " + t("card.generating"),
					t
				});
			}
			if (block.isError) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FallbackRow, {
				state: "error",
				title: "Render artifact",
				summary: errorText(block, t),
				t
			});
			if (isArtifactRecord(block.meta)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ArtifactCard, {
				artifact: block.meta,
				t
			});
			const source = artifactSourceFromMeta(block.meta);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FallbackRow, {
				state: "error",
				title: "Render artifact",
				summary: source === void 0 ? t("card.unavailable") : t("card.invalid"),
				t,
				source
			});
		}
		const dictionaries = {
			zh: {
				"card.expand": "展开",
				"card.collapse": "收起",
				"card.viewSource": "查看源码",
				"card.hideSource": "隐藏源码",
				"card.copy": "复制 HTML",
				"card.copied": "已复制",
				"card.copyFailed": "复制失败",
				"card.generating": "生成中",
				"card.unavailable": "可视化内容无法渲染",
				"card.invalid": "可视化内容校验失败",
				"card.source": "HTML 源码",
				"card.frameUnloaded": "已暂时卸载，滚动回来后重新加载",
				"card.unknownError": "工具调用失败",
				"card.bytes": "字节",
				"card.artifactId": "Artifact ID",
				"kind.architecture": "架构图",
				"kind.flow": "流程图",
				"kind.timeline": "时间轴",
				"kind.comparison": "比较矩阵",
				"kind.roadmap": "路线图",
				"kind.dashboard": "Dashboard",
				"kind.table": "表格",
				"kind.wireframe": "线框图",
				"kind.report": "报告",
				"kind.other": "可视化"
			},
			en: {
				"card.expand": "Expand",
				"card.collapse": "Collapse",
				"card.viewSource": "View source",
				"card.hideSource": "Hide source",
				"card.copy": "Copy HTML",
				"card.copied": "Copied",
				"card.copyFailed": "Copy failed",
				"card.generating": "Generating",
				"card.unavailable": "Visualization could not be rendered",
				"card.invalid": "Visualization validation failed",
				"card.source": "HTML source",
				"card.frameUnloaded": "Temporarily unloaded; it will reload when you scroll back",
				"card.unknownError": "Tool call failed",
				"card.bytes": "bytes",
				"card.artifactId": "Artifact ID",
				"kind.architecture": "Architecture",
				"kind.flow": "Flow",
				"kind.timeline": "Timeline",
				"kind.comparison": "Comparison",
				"kind.roadmap": "Roadmap",
				"kind.dashboard": "Dashboard",
				"kind.table": "Table",
				"kind.wireframe": "Wireframe",
				"kind.report": "Report",
				"kind.other": "Visualization"
			}
		};
		//#endregion
		//#region src/client/index.ts
		/** Locale namespace used by the Tool row and card. */
		const NS = "chat-artifacts";
		/** Required browser services: the keyed slot registry and locale service. */
		const inject = ["slots", "locale"];
		/** Register dictionaries and the render_artifact keyed Tool view. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, dictionaries), "dsh-chat-artifacts: dictionaries");
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "render_artifact",
				locale: NS
			}, ArtifactToolRow));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map