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
import { createHash, randomUUID } from 'node:crypto';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ARTIFACT_DEFAULT_HEIGHT, ARTIFACT_KINDS, normalizeArtifactArgs, } from "./core/types.js";
import { CHAT_ARTIFACTS_TOOL_NAME } from "./invariant.js";
export { ARTIFACT_DEFAULT_HEIGHT, ARTIFACT_KINDS, ARTIFACT_MAX_BYTES, ARTIFACT_MAX_HEIGHT, ARTIFACT_MIN_HEIGHT, ArtifactValidationError, artifactSourceFromMeta, isArtifactRecord, normalizeArtifactArgs, utf8ByteLength, validateArtifactHtml, } from "./core/types.js";
export { CHAT_ARTIFACTS_PLUGIN_ID, CHAT_ARTIFACTS_TOOL_NAME } from "./invariant.js";
export const name = 'chat-artifacts';
export const inject = ['tools', 'systemPrompt'];
/** Order inside the model tool-guidance band. */
export const CHAT_ARTIFACTS_SECTION_ORDER = 230;
/**
 * Model-facing guidance. It intentionally describes when not to use the tool:
 * visual output should reduce cognitive load, not decorate every response.
 */
export const CHAT_ARTIFACTS_GUIDANCE = 'You can use the render_artifact tool to place a safe visualization directly in the conversation. '
    + 'Use it only when a diagram, flow, timeline, roadmap, comparison matrix, dashboard, table, wireframe, '
    + 'or report materially improves understanding; do not use it for simple questions, short lists, or '
    + 'ordinary code explanations. Keep the normal written answer and use one artifact for the visual part. '
    + 'The tool accepts a self-contained HTML fragment with inline CSS and SVG. It does not run JavaScript: '
    + 'never emit script elements, inline event handlers, fetch, WebSocket, external URLs or CDNs, Electron '
    + 'or Node APIs, parent-window access, popups, forms, or automatic downloads. Use data: or blob: media '
    + 'resources only. Make the layout responsive, keep height between 240 and 720 pixels (default 420), '
    + 'and keep HTML at or below 512 KiB. Choose the narrowest useful kind from architecture, flow, timeline, '
    + 'comparison, roadmap, dashboard, table, wireframe, report, and other.';
/** Build the canonical value persisted in presentationMeta. */
export function createArtifactRecord(args) {
    const normalized = normalizeArtifactArgs(args);
    const bytes = Buffer.byteLength(normalized.html, 'utf8');
    const sha256 = createHash('sha256').update(normalized.html, 'utf8').digest('hex');
    return {
        artifactId: 'artifact_' + randomUUID().replaceAll('-', ''),
        ...normalized,
        bytes,
        sha256,
    };
}
/** Pending row intent for the official generic fallback. */
export function renderArtifactCallView(args) {
    return {
        card: 'generic',
        title: 'Render artifact',
        kind: 'other',
        rawInput: {
            title: args.title,
            kind: args.kind,
        },
    };
}
/** Register the model tool and the automatic-use guidance section. */
export function apply(ctx) {
    ctx.effect(() => ctx.tools.register(defineTool({
        name: CHAT_ARTIFACTS_TOOL_NAME,
        description: 'Render a safe, self-contained HTML/CSS/SVG visualization inline in the conversation when it materially improves comprehension. The HTML is sandboxed with JavaScript and network access disabled.',
        parameters: {
            title: {
                type: 'string',
                required: true,
                description: 'Short human-readable title shown above the visualization.',
            },
            kind: {
                type: 'string',
                required: true,
                enum: ARTIFACT_KINDS,
                description: 'Visualization category.',
            },
            html: {
                type: 'string',
                required: true,
                description: 'Self-contained HTML fragment with inline CSS and SVG; no JavaScript, external resources, or network calls.',
            },
            height: {
                type: 'integer',
                default: ARTIFACT_DEFAULT_HEIGHT,
                description: 'Preferred frame height in pixels, from 240 to 720. Defaults to 420.',
            },
            description: {
                type: 'string',
                description: 'Optional one-line description for the artifact.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    artifactId: { type: 'string', required: true },
                    title: { type: 'string', required: true },
                    kind: { type: 'string', required: true, enum: ARTIFACT_KINDS },
                    html: { type: 'string', required: true },
                    height: { type: 'integer', required: true },
                    description: { type: 'string' },
                    bytes: { type: 'integer', required: true },
                    sha256: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: 'Artifact "' + value.title + '" is ready (' + value.artifactId + ', ' + value.kind + ', ' + value.bytes + ' bytes).',
                }],
            presentationMeta: (_args, value) => value,
        },
        async execute(args, exec) {
            exec.signal.throwIfAborted();
            const record = createArtifactRecord(args);
            exec.signal.throwIfAborted();
            return record;
        },
        presentCall: renderArtifactCallView,
        presentResult: (_args, _result) => ({
            card: 'generic',
            title: 'Render artifact',
        }),
    })), 'dsh-chat-artifacts: tool');
    ctx.effect(() => ctx.systemPrompt.section({
        name: 'plugin:chat-artifacts',
        order: CHAT_ARTIFACTS_SECTION_ORDER,
        text: CHAT_ARTIFACTS_GUIDANCE,
    }), 'dsh-chat-artifacts: prompt section');
}
