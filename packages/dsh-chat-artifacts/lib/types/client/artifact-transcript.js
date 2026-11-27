import { isMcpAppDescriptor } from "../core/mcp-apps.js";
import { isArtifactRecord } from "../core/types.js";
import { CHAT_ARTIFACTS_PATCH_TOOL_NAME, CHAT_ARTIFACTS_TOOL_NAME } from "../invariant.js";
export const artifactVersion = (record) => record.version ?? 1;
const records = new WeakMap();
function readRecord(block) {
    const knownTool = block.name === CHAT_ARTIFACTS_TOOL_NAME || block.name === CHAT_ARTIFACTS_PATCH_TOOL_NAME;
    const orphanedResult = block.name === '' && block.call === null;
    if (block.isError || (!knownTool && !orphanedResult))
        return undefined;
    const meta = block.meta;
    if (typeof meta !== 'object' || !meta)
        return undefined;
    if (!records.has(meta))
        records.set(meta, isArtifactRecord(meta) ? meta : null);
    return records.get(meta) ?? undefined;
}
const indexes = new WeakMap();
export function artifactTranscript(snapshot) {
    const cached = indexes.get(snapshot);
    if (cached)
        return cached;
    const completed = new Set();
    const ordered = [];
    const mcpAppTails = new Map();
    const visit = (block, turn) => {
        if (!('kind' in block))
            return;
        const record = readRecord(block);
        if (record)
            ordered.push({ record, turn, seq: block.seq, callId: block.callId });
        const app = block.meta;
        if (!block.isError && block.name.startsWith('mcp__') && isMcpAppDescriptor(app)) {
            const apps = mcpAppTails.get(turn) ?? [];
            if (!apps.some(entry => entry.handle === app.handle))
                apps.push(app);
            mcpAppTails.set(turn, apps);
        }
        for (const child of block.subCalls)
            visit(child, turn);
    };
    for (const node of snapshot.nodes.values()) {
        const location = node.location;
        if (location.kind !== 'turn' && location.kind !== 'step')
            continue;
        if (node.kind === 'turn-tail' && location.turn.status === 'closed')
            completed.add(location.turn.turn);
        if (node.kind === 'tool-call')
            visit(node.data.root, location.turn.turn);
    }
    ordered.sort((a, b) => a.seq - b.seq);
    const byTurn = new Map();
    const history = new Map();
    for (const artifact of ordered) {
        const id = artifact.record.artifactId;
        const entries = history.get(id) ?? [];
        entries.push(artifact);
        history.set(id, entries);
        if (!completed.has(artifact.turn))
            continue;
        const latest = byTurn.get(artifact.turn) ?? new Map();
        latest.set(id, artifact);
        byTurn.set(artifact.turn, latest);
    }
    const pinnedCalls = new Map();
    for (const entry of ordered) {
        const pinned = byTurn.get(entry.turn)?.get(entry.record.artifactId);
        if (pinned)
            pinnedCalls.set(entry.callId, pinned);
    }
    const tails = new Map([...byTurn].map(([turn, latest]) => [turn, [...latest.values()]]));
    const result = { tails, history, pinnedCalls, mcpAppTails };
    indexes.set(snapshot, result);
    return result;
}
export function artifactAnchor(turn, id) {
    return 'dsh-artifact-' + turn + '-' + id;
}
export function sameArtifactEntries(a, b) {
    return a.length === b.length && a.every((item, index) => item.record === b[index]?.record && item.seq === b[index]?.seq);
}
