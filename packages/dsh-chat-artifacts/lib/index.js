import { CHAT_ARTIFACTS_PLUGIN_ID, CHAT_ARTIFACTS_TOOL_NAME } from "./invariant.js";
import { createHash, randomUUID } from "node:crypto";
import { defineTool } from "@deepseek-ai/dsh-tools";
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
const ARTIFACT_MAX_BYTES = 512 * 1024;
const ARTIFACT_DEFAULT_HEIGHT = 420;
const ARTIFACT_MIN_HEIGHT = 240;
const ARTIFACT_MAX_HEIGHT = 720;
var ArtifactValidationError = class extends Error {
	issues;
	constructor(issues) {
		super(issues.join("; "));
		this.name = "ArtifactValidationError";
		this.issues = [...issues];
	}
};
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
/** Normalize and validate the tool arguments before producing a durable record. */
function normalizeArtifactArgs(args) {
	const issues = [];
	const title = typeof args.title === "string" ? args.title.trim() : "";
	const html = typeof args.html === "string" ? args.html : "";
	const kind = args.kind;
	const height = args.height ?? 420;
	const description = args.description === void 0 ? void 0 : typeof args.description === "string" ? args.description.trim() : "";
	if (title.length === 0) issues.push("title must not be empty");
	if (Array.from(title).length > 160) issues.push("title must be at most 160 characters");
	if (!ARTIFACT_KINDS.includes(kind)) issues.push("kind must be one of " + ARTIFACT_KINDS.join(", "));
	if (!Number.isSafeInteger(height) || height < 240 || height > 720) issues.push("height must be an integer between 240 and 720");
	if (description !== void 0 && Array.from(description).length > 500) issues.push("description must be at most 500 characters");
	issues.push(...validateArtifactHtml(html));
	if (issues.length > 0) throw new ArtifactValidationError(issues);
	return {
		title,
		kind,
		html,
		height,
		...description === void 0 || description.length === 0 ? {} : { description }
	};
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
//#region src/index.ts
/**
* Host half of Chat Artifact.
*
* The tool validates and records a self-contained HTML fragment. The durable
* model-facing result is a short text summary; the full artifact is carried by
* presentationMeta so the browser renderer can recover it on live and replay
* paths without putting HTML into the assistant's normal markdown stream.
*
* @module @ningbainb/dsh-chat-artifacts
*/
const name = "chat-artifacts";
const inject = ["tools", "systemPrompt"];
/** Order inside the model tool-guidance band. */
const CHAT_ARTIFACTS_SECTION_ORDER = 230;
/**
* Model-facing guidance. It intentionally describes when not to use the tool:
* visual output should reduce cognitive load, not decorate every response.
*/
const CHAT_ARTIFACTS_GUIDANCE = "You can use the render_artifact tool to place a safe visualization directly in the conversation. Use it only when a diagram, flow, timeline, roadmap, comparison matrix, dashboard, table, wireframe, or report materially improves understanding; do not use it for simple questions, short lists, or ordinary code explanations. Keep the normal written answer and use one artifact for the visual part. The tool accepts a self-contained HTML fragment with inline CSS and SVG. It does not run JavaScript: never emit script elements, inline event handlers, fetch, WebSocket, external URLs or CDNs, Electron or Node APIs, parent-window access, popups, forms, or automatic downloads. Use data: or blob: media resources only. Make the layout responsive, keep height between 240 and 720 pixels (default 420), and keep HTML at or below 512 KiB. Choose the narrowest useful kind from architecture, flow, timeline, comparison, roadmap, dashboard, table, wireframe, report, and other.";
/** Build the canonical value persisted in presentationMeta. */
function createArtifactRecord(args) {
	const normalized = normalizeArtifactArgs(args);
	const bytes = Buffer.byteLength(normalized.html, "utf8");
	const sha256 = createHash("sha256").update(normalized.html, "utf8").digest("hex");
	return {
		artifactId: "artifact_" + randomUUID().replaceAll("-", ""),
		...normalized,
		bytes,
		sha256
	};
}
/** Pending row intent for the official generic fallback. */
function renderArtifactCallView(args) {
	return {
		card: "generic",
		title: "Render artifact",
		kind: "other",
		rawInput: {
			title: args.title,
			kind: args.kind
		}
	};
}
/** Register the model tool and the automatic-use guidance section. */
function apply(ctx) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: CHAT_ARTIFACTS_TOOL_NAME,
		description: "Render a safe, self-contained HTML/CSS/SVG visualization inline in the conversation when it materially improves comprehension. The HTML is sandboxed with JavaScript and network access disabled.",
		parameters: {
			title: {
				type: "string",
				required: true,
				description: "Short human-readable title shown above the visualization."
			},
			kind: {
				type: "string",
				required: true,
				enum: ARTIFACT_KINDS,
				description: "Visualization category."
			},
			html: {
				type: "string",
				required: true,
				description: "Self-contained HTML fragment with inline CSS and SVG; no JavaScript, external resources, or network calls."
			},
			height: {
				type: "integer",
				default: 420,
				description: "Preferred frame height in pixels, from 240 to 720. Defaults to 420."
			},
			description: {
				type: "string",
				description: "Optional one-line description for the artifact."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					artifactId: {
						type: "string",
						required: true
					},
					title: {
						type: "string",
						required: true
					},
					kind: {
						type: "string",
						required: true,
						enum: ARTIFACT_KINDS
					},
					html: {
						type: "string",
						required: true
					},
					height: {
						type: "integer",
						required: true
					},
					description: { type: "string" },
					bytes: {
						type: "integer",
						required: true
					},
					sha256: {
						type: "string",
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: "Artifact \"" + value.title + "\" is ready (" + value.artifactId + ", " + value.kind + ", " + value.bytes + " bytes)."
			}],
			presentationMeta: (_args, value) => value
		},
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const record = createArtifactRecord(args);
			exec.signal.throwIfAborted();
			return record;
		},
		presentCall: renderArtifactCallView,
		presentResult: (_args, _result) => ({
			card: "generic",
			title: "Render artifact"
		})
	})), "dsh-chat-artifacts: tool");
	ctx.effect(() => ctx.systemPrompt.section({
		name: "plugin:chat-artifacts",
		order: 230,
		text: CHAT_ARTIFACTS_GUIDANCE
	}), "dsh-chat-artifacts: prompt section");
}
//#endregion
export { ARTIFACT_DEFAULT_HEIGHT, ARTIFACT_KINDS, ARTIFACT_MAX_BYTES, ARTIFACT_MAX_HEIGHT, ARTIFACT_MIN_HEIGHT, ArtifactValidationError, CHAT_ARTIFACTS_GUIDANCE, CHAT_ARTIFACTS_PLUGIN_ID, CHAT_ARTIFACTS_SECTION_ORDER, CHAT_ARTIFACTS_TOOL_NAME, apply, artifactSourceFromMeta, createArtifactRecord, inject, isArtifactRecord, name, normalizeArtifactArgs, renderArtifactCallView, utf8ByteLength, validateArtifactHtml };
