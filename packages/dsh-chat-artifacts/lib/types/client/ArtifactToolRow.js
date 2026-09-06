import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { IconChevronDownOutline14, IconDataOutline16, IconLoadingOutline16, StateDot, } from '@deepseek-ai/dsh-client-ui-primitives';
import { ARTIFACT_KINDS, artifactSourceFromMeta, isArtifactRecord, } from "../core/types.js";
import css from './artifact.module.css';
import { ArtifactCard } from "./ArtifactCard.js";
function isSettled(block) {
    return 'kind' in block && block.kind === 'tool-result';
}
function callArgs(block) {
    return isSettled(block) ? block.call?.argsRaw ?? '' : block.argsRaw;
}
function pendingArgs(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null)
            return {};
        const value = parsed;
        return {
            ...(typeof value.title === 'string' ? { title: value.title } : {}),
            ...(typeof value.kind === 'string' && ARTIFACT_KINDS.includes(value.kind)
                ? { kind: value.kind }
                : {}),
        };
    }
    catch {
        return {};
    }
}
function resultText(node) {
    return node.content.map(block => block.type === 'text' ? block.text : JSON.stringify(block) ?? '').join('\n').trim();
}
function firstLine(text) {
    return text.split(/\r?\n/u).map(line => line.trim()).find(Boolean) ?? '';
}
function errorText(node, t) {
    const text = firstLine(resultText(node));
    if (text.length > 0)
        return text;
    if (node.error !== undefined)
        return node.error.code;
    return t('card.unknownError');
}
function kindLabel(t, kind) {
    const key = ('kind.' + kind);
    return t(key);
}
function StatusIcon({ state }) {
    if (state === 'running')
        return _jsx(IconLoadingOutline16, { className: css.statusIcon });
    if (state === 'error')
        return _jsx(StateDot, { state: "error" });
    if (state === 'stopped')
        return _jsx(StateDot, { state: "warning" });
    return _jsx(IconDataOutline16, { className: css.statusIcon });
}
function FallbackRow({ state, title, summary, t, source }) {
    return (_jsxs("section", { className: css.fallback, "data-artifact-state": state, children: [_jsxs("div", { className: css.fallbackHeader, children: [_jsxs("div", { className: css.heading, children: [_jsx(StatusIcon, { state: state }), _jsxs("div", { className: css.headingText, children: [_jsx("div", { className: css.title, children: title }), _jsx("div", { className: css.meta, children: summary })] })] }), _jsx(IconChevronDownOutline14, { className: css.fallbackChevron })] }), source !== undefined ? (_jsxs("details", { className: css.fallbackSource, children: [_jsx("summary", { children: t('card.viewSource') }), _jsx("pre", { className: css.source, children: _jsx("code", { children: source }) })] })) : null] }));
}
/** Keyed Tool renderer for render_artifact, including pending and replay fallback states. */
export function ArtifactToolRow({ block, t }) {
    if (!isSettled(block)) {
        const args = pendingArgs(callArgs(block));
        const title = args.title?.trim() || 'Render artifact';
        const summary = args.kind === undefined ? t('card.generating') : kindLabel(t, args.kind) + ' · ' + t('card.generating');
        return _jsx(FallbackRow, { state: "running", title: title, summary: summary, t: t });
    }
    if (block.isError) {
        return _jsx(FallbackRow, { state: "error", title: "Render artifact", summary: errorText(block, t), t: t });
    }
    if (isArtifactRecord(block.meta)) {
        return _jsx(ArtifactCard, { artifact: block.meta, t: t });
    }
    const source = artifactSourceFromMeta(block.meta);
    return (_jsx(FallbackRow, { state: "error", title: "Render artifact", summary: source === undefined ? t('card.unavailable') : t('card.invalid'), t: t, source: source }));
}
