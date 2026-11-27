import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconDataOutlineMedium, StateDot, } from '@deepseek-ai/dsh-client-ui-primitives';
import { artifactSourceFromMeta, isArtifactRecord } from "../core/types.js";
import { CHAT_ARTIFACTS_PATCH_TOOL_NAME } from "../invariant.js";
import { ArtifactCard } from "./ArtifactCard.js";
import { artifactAnchor, artifactTranscript } from "./artifact-transcript.js";
import css from './artifact.module.css';
function errorText(node, t) {
    const firstLine = node.content.flatMap(block => block.type === 'text' ? block.text.split(/\r?\n/u) : [])
        .map(line => line.trim()).find(Boolean);
    return firstLine ?? node.error?.code ?? t('card.unknownError');
}
function openPinnedArtifact(anchor) {
    const target = document.getElementById(anchor);
    if (!target)
        return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}
export function ArtifactToolRow({ phase, block, toolName, useChat, inputActions, inspect, t }) {
    const pinned = useChat(snapshot => phase === 'result' ? artifactTranscript(snapshot).pinnedCalls.get(block.callId) : undefined, (a, b) => a?.record === b?.record && a?.turn === b?.turn);
    const label = t(toolName === CHAT_ARTIFACTS_PATCH_TOOL_NAME ? 'tool.patch' : 'tool.render');
    if (phase !== 'result') {
        const title = block.args.textPrefix('title', 160)?.trim() || label;
        return _jsx("div", { className: css.toolSummary, children: _jsxs("span", { children: [_jsx(IconDataOutlineMedium, {}), title] }) });
    }
    if (!block.isError && isArtifactRecord(block.meta)) {
        if (!pinned)
            return _jsx(ArtifactCard, { artifact: block.meta, t: t, inputActions: inputActions });
        const anchor = artifactAnchor(pinned.turn, pinned.record.artifactId);
        return _jsxs("div", { "data-artifact-tool-summary": "", className: css.toolSummary, children: [_jsxs("span", { children: [_jsx(IconDataOutlineMedium, {}), block.meta.title] }), _jsx("button", { type: "button", className: css.actionButton, onClick: () => openPinnedArtifact(anchor), children: t('card.locate') }), inspect && _jsx("button", { type: "button", className: css.actionButton, onClick: inspect, children: t('card.inspect') }), !inspect && _jsxs("details", { children: [_jsx("summary", { children: t('card.inspect') }), _jsx("pre", { className: css.source, children: _jsx("code", { children: block.meta.html }) })] })] });
    }
    const source = artifactSourceFromMeta(block.meta);
    return _jsxs("section", { className: css.fallback, "data-artifact-state": "error", children: [_jsx("div", { className: css.fallbackHeader, children: _jsxs("div", { className: css.heading, children: [_jsx(StateDot, { state: "error" }), _jsxs("div", { className: css.headingText, children: [_jsx("div", { className: css.title, children: label }), _jsx("p", { className: css.errorText, children: block.isError ? errorText(block, t) : t(source === undefined ? 'card.unavailable' : 'card.invalid') })] })] }) }), source !== undefined && _jsxs("details", { className: css.fallbackSource, children: [_jsx("summary", { children: t('card.viewSource') }), _jsx("pre", { className: css.source, children: _jsx("code", { children: source }) })] })] });
}
