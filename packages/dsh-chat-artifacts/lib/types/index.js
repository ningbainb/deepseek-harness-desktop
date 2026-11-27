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
import { mountMcpApps } from "./host/mcp-app-servers.js";
import { mountDiagramRuntime } from "./host/diagram-runtime.js";
import { defineTool } from '@deepseek-ai/dsh-tools';
import { artifactIndex, recentArtifactReferences } from "./core/artifact-index.js";
import { applyArtifactEdits } from "./core/patch.js";
import { ARTIFACT_DEFAULT_HEIGHT, ARTIFACT_KINDS, ARTIFACT_MAX_DESCRIPTION_LENGTH, ARTIFACT_MODES, ArtifactValidationError, isArtifactId, normalizeArtifactArgs, } from "./core/types.js";
import { CHAT_ARTIFACTS_PATCH_TOOL_NAME, CHAT_ARTIFACTS_TOOL_NAME } from "./invariant.js";
import { CHAT_ARTIFACTS_GUIDANCE, CHAT_ARTIFACTS_SECTION_ORDER } from "./prompt.js";
export { ARTIFACT_DEFAULT_HEIGHT, ARTIFACT_KINDS, ARTIFACT_MAX_BYTES, ARTIFACT_MAX_HEIGHT, ARTIFACT_MIN_HEIGHT, ARTIFACT_MODES, ArtifactValidationError, artifactSourceFromMeta, isArtifactId, isArtifactRecord, normalizeArtifactArgs, utf8ByteLength, validateArtifactHtml, } from "./core/types.js";
export { applyArtifactEdits } from "./core/patch.js";
export { sanitizeStreamingHtml } from "./core/streaming.js";
export { CHAT_ARTIFACTS_PATCH_TOOL_NAME, CHAT_ARTIFACTS_PLUGIN_ID, CHAT_ARTIFACTS_TOOL_NAME } from "./invariant.js";
export { CHAT_ARTIFACTS_GUIDANCE, CHAT_ARTIFACTS_SECTION_ORDER } from "./prompt.js";
export const name = 'chat-artifacts';
export const inject = ['tools', 'systemPrompt', 'sessions', 'sessionProjections'];
const recordSchema = {
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
        mode: { type: 'string', enum: ARTIFACT_MODES },
        version: { type: 'integer' },
        parentArtifactId: { type: 'string' },
    },
};
function snapshot(args, identity) {
    const normalized = normalizeArtifactArgs(args);
    return {
        ...identity,
        ...normalized,
        bytes: Buffer.byteLength(normalized.html, 'utf8'),
        sha256: createHash('sha256').update(normalized.html, 'utf8').digest('hex'),
    };
}
/** Build the canonical value persisted in presentationMeta. */
export function createArtifactRecord(args) {
    return snapshot(args, {
        artifactId: 'artifact_' + randomUUID().replaceAll('-', ''),
        version: 1,
    });
}
function createPatchedRecord(current, args) {
    if (args.summary !== undefined && Array.from(args.summary.trim()).length > ARTIFACT_MAX_DESCRIPTION_LENGTH) {
        throw new ArtifactValidationError(['summary must be at most ' + ARTIFACT_MAX_DESCRIPTION_LENGTH + ' characters']);
    }
    const version = (current.version ?? 1) + 1;
    if (!Number.isSafeInteger(version))
        throw new ArtifactValidationError(['artifact version exceeds the supported range']);
    return snapshot({
        ...current,
        title: args.title ?? current.title,
        height: args.height ?? current.height,
        html: applyArtifactEdits(current.html, args.edits),
    }, {
        artifactId: current.artifactId,
        version,
        ...(current.parentArtifactId === undefined ? {} : { parentArtifactId: current.parentArtifactId }),
    });
}
function artifactResultText(value) {
    return 'Artifact "' + value.title + '" is ready (' + value.artifactId + ', v' + (value.version ?? 1)
        + ', ' + value.kind + ', ' + value.bytes + ' bytes).';
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
/** Register the native tools and the automatic-use guidance section. */
export async function apply(ctx, config = {}) {
    mountMcpApps(ctx, config.mcpAppServers);
    mountDiagramRuntime(ctx);
    const index = await ctx.sessionProjections.register(artifactIndex);
    ctx.effect(() => ctx.tools.register(defineTool({
        name: CHAT_ARTIFACTS_TOOL_NAME,
        description: 'Render a self-contained inline diagram, dashboard, or interactive example. Use it proactively for project architecture and concept explanations when a visual would clarify relationships or steps. Choose interactive mode for isolated inline JavaScript.',
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
                description: 'Self-contained HTML fragment with inline CSS and SVG. Interactive mode also permits inline JavaScript. External resources and network calls are prohibited.',
            },
            mode: {
                type: 'string',
                enum: ARTIFACT_MODES,
                default: 'static',
                description: 'Use static for purely visual artifacts. Use interactive when local controls require JavaScript.',
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
            schema: recordSchema,
            render: (_args, value) => [{
                    type: 'text',
                    text: artifactResultText(value),
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
    ctx.effect(() => ctx.tools.register(defineTool({
        name: CHAT_ARTIFACTS_PATCH_TOOL_NAME,
        description: 'Update the latest version of an artifact in this conversation using uniquely matching literal replacements.',
        parameters: {
            artifactId: { type: 'string', required: true, description: 'Artifact identifier returned by a previous artifact tool result.' },
            edits: {
                type: 'array',
                required: true,
                description: 'Ordered replacements. Each oldString must match exactly once after preceding edits. Use an empty array to update only title or height.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        oldString: { type: 'string', required: true },
                        newString: { type: 'string', required: true },
                    },
                },
            },
            title: { type: 'string', description: 'New display title when changing the title.' },
            height: { type: 'integer', description: 'New preferred frame height in pixels, from 240 to 720.' },
            summary: { type: 'string', description: 'Short description of the changes for the conversation.' },
        },
        output: {
            schema: recordSchema,
            render: (args, value) => [{
                    type: 'text',
                    text: [artifactResultText(value), args.summary?.trim()].filter(Boolean).join(' '),
                }],
            presentationMeta: (_args, value) => value,
        },
        async execute(args, exec) {
            exec.signal.throwIfAborted();
            if (!isArtifactId(args.artifactId))
                throw new ArtifactValidationError(['artifactId is invalid']);
            const session = exec.agent?.session;
            if (!session || ctx.sessions.get(session.id) !== session) {
                throw new ArtifactValidationError(['patch_artifact requires the current session to be live']);
            }
            const state = index.stateOf(session);
            const current = state.latest[args.artifactId];
            if (!current)
                throw new ArtifactValidationError(['artifactId was not found in the current session']);
            const pending = Object.values(state.calls).find(call => call.artifactId === args.artifactId);
            if (pending?.callId !== exec.callId) {
                throw new ArtifactValidationError(['patch_artifact requires a directly logged call and one update at a time for this artifact']);
            }
            const record = createPatchedRecord(current, args);
            exec.signal.throwIfAborted();
            return record;
        },
        presentCall: args => ({ card: 'generic', title: 'Update artifact', kind: 'other', rawInput: { artifactId: args.artifactId, title: args.title } }),
        presentResult: () => ({ card: 'generic', title: 'Update artifact' }),
    })), 'dsh-chat-artifacts: patch tool');
    ctx.effect(() => ctx.systemPrompt.section({
        name: 'plugin:chat-artifacts',
        order: CHAT_ARTIFACTS_SECTION_ORDER,
        text: CHAT_ARTIFACTS_GUIDANCE,
    }), 'dsh-chat-artifacts: prompt section');
    ctx.effect(() => ctx.systemPrompt.context({
        name: 'plugin:chat-artifacts:recent',
        order: CHAT_ARTIFACTS_SECTION_ORDER,
        text: ({ session }) => session && ctx.sessions.get(session.id) === session
            ? recentArtifactReferences(index.stateOf(session)) : '',
    }), 'dsh-chat-artifacts: recent diagrams');
}
