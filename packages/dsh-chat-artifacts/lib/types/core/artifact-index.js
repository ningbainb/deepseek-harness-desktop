import { z } from 'zod';
import { CHAT_ARTIFACTS_PATCH_TOOL_NAME, CHAT_ARTIFACTS_TOOL_NAME } from "../invariant.js";
import { isArtifactId, isArtifactRecord } from "./types.js";
const artifactTools = [CHAT_ARTIFACTS_TOOL_NAME, CHAT_ARTIFACTS_PATCH_TOOL_NAME];
const RECENT_ARTIFACT_LIMIT = 3;
export function recentArtifactReferences(state) {
    const ids = state.recent ?? Object.keys(state.latest).slice(-RECENT_ARTIFACT_LIMIT).reverse();
    const references = ids.flatMap(id => {
        const record = state.latest[id];
        return record ? [id + ' (' + record.kind + ', v' + (record.version ?? 1) + ')'] : [];
    });
    return references.length > 0 ? 'Recent diagrams in this conversation, most recently updated first: '
        + references.join(', ') + '. Match the current subject before using an identifier in patch_artifact.' : '';
}
function resultKey(turn, step, callId) {
    return `${turn}/${step}/${callId}`;
}
function patchTarget(args) {
    try {
        const value = JSON.parse(args)?.artifactId;
        if (isArtifactId(value))
            return value;
    }
    catch {
        // The runtime settles malformed arguments without running the tool body.
    }
}
function projectArtifactEvent(state, event) {
    if (event.type === 'tool/call') {
        const { turn, step, name, callId } = event.data;
        if (name !== CHAT_ARTIFACTS_TOOL_NAME && name !== CHAT_ARTIFACTS_PATCH_TOOL_NAME)
            return state;
        const artifactId = name === CHAT_ARTIFACTS_PATCH_TOOL_NAME ? patchTarget(event.data.arguments) : undefined;
        const key = resultKey(turn, step, callId);
        const call = { name, callId, ...(artifactId === undefined ? {} : { artifactId }) };
        return { ...state, calls: { ...state.calls, [key]: call } };
    }
    if (event.type !== 'tool/result')
        return state;
    const { turn, step, message, meta } = event.data;
    const key = resultKey(turn, step, message.toolCallId);
    const call = state.calls[key];
    if (!call)
        return state;
    const calls = { ...state.calls };
    delete calls[key];
    if (message.isError || !isArtifactRecord(meta))
        return { ...state, calls };
    const current = state.latest[meta.artifactId];
    const valid = call.name === CHAT_ARTIFACTS_TOOL_NAME
        ? current === undefined && (meta.version ?? 1) === 1
        : call.artifactId === meta.artifactId && current !== undefined && meta.version === (current.version ?? 1) + 1;
    if (!valid)
        return { ...state, calls };
    const recent = state.recent ?? Object.keys(state.latest).slice(-RECENT_ARTIFACT_LIMIT).reverse();
    return {
        calls,
        latest: { ...state.latest, [meta.artifactId]: meta },
        recent: [meta.artifactId, ...recent.filter(id => id !== meta.artifactId)].slice(0, RECENT_ARTIFACT_LIMIT),
    };
}
/** Fold only committed records, including the SDK's restored session prefix. */
export const artifactIndex = {
    key: 'chatArtifacts',
    stateVersion: 1,
    stateSchema: z.object({
        latest: z.record(z.custom(isArtifactId), z.custom(isArtifactRecord)),
        recent: z.array(z.custom(isArtifactId)).max(RECENT_ARTIFACT_LIMIT).optional(),
        calls: z.record(z.string(), z.object({
            callId: z.custom(value => typeof value === 'string'),
            name: z.enum(artifactTools),
            artifactId: z.custom(isArtifactId).optional(),
        })),
    }),
    init: () => ({ latest: {}, calls: {} }),
    apply: projectArtifactEvent,
};
