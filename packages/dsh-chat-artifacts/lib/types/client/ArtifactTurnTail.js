import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ArtifactCard } from "./ArtifactCard.js";
import { McpAppCard } from "./McpAppFrame.js";
import { artifactAnchor, artifactTranscript, sameArtifactEntries } from "./artifact-transcript.js";
import css from './artifact.module.css';
const empty = [];
const noApps = [];
export function ArtifactTurnTail({ turn, useChat, inputActions, t }) {
    const entries = useChat(snapshot => artifactTranscript(snapshot).tails.get(turn.turn) ?? empty, sameArtifactEntries);
    const apps = useChat(snapshot => artifactTranscript(snapshot).mcpAppTails.get(turn.turn) ?? noApps, (a, b) => a.length === b.length && a.every((item, index) => item === b[index]));
    return entries.length > 0 || apps.length > 0 ? _jsxs("div", { className: css.tail, "data-artifact-turn-tail": turn.turn, children: [entries.map(entry => _jsx(PinnedArtifact, { entry: entry, useChat: useChat, inputActions: inputActions, t: t }, entry.record.artifactId)), apps.map(app => _jsx(McpAppCard, { app: app, t: t, inputActions: inputActions }, app.handle))] }) : null;
}
function PinnedArtifact({ entry, useChat, inputActions, t }) {
    const artifacts = useChat(snapshot => artifactTranscript(snapshot).history.get(entry.record.artifactId)?.filter(item => item.seq <= entry.seq) ?? empty, sameArtifactEntries);
    return _jsx(ArtifactCard, { artifact: entry.record, versions: artifacts.map(item => item.record), anchor: artifactAnchor(entry.turn, entry.record.artifactId), inputActions: inputActions, t: t });
}
