import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { IconCheckOutline16, IconCodeOutline16, IconCopyOutline16, IconDataOutline16, IconFullscreenOutline16, writeClipboard, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './artifact.module.css';
import { SafeArtifactFrame } from "./SafeArtifactFrame.js";
const KIND_KEYS = {
    architecture: 'kind.architecture',
    flow: 'kind.flow',
    timeline: 'kind.timeline',
    comparison: 'kind.comparison',
    roadmap: 'kind.roadmap',
    dashboard: 'kind.dashboard',
    table: 'kind.table',
    wireframe: 'kind.wireframe',
    report: 'kind.report',
    other: 'kind.other',
};
function kindLabel(t, kind) {
    return t(KIND_KEYS[kind]);
}
/** Card body for one validated artifact record. */
export function ArtifactCard({ artifact, t }) {
    const [expanded, setExpanded] = useState(false);
    const [sourceOpen, setSourceOpen] = useState(false);
    const [copyState, setCopyState] = useState('idle');
    const copyTimer = useRef(undefined);
    useEffect(() => () => {
        if (copyTimer.current !== undefined)
            clearTimeout(copyTimer.current);
    }, []);
    const copyHtml = async () => {
        let copied = false;
        try {
            copied = await writeClipboard(artifact.html);
        }
        catch {
            copied = false;
        }
        setCopyState(copied ? 'copied' : 'failed');
        if (copyTimer.current !== undefined)
            clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopyState('idle'), 2200);
    };
    const copyLabel = copyState === 'copied'
        ? t('card.copied')
        : copyState === 'failed' ? t('card.copyFailed') : t('card.copy');
    return (_jsxs("section", { className: css.card, "data-artifact-id": artifact.artifactId, children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { className: css.heading, children: [_jsx(IconDataOutline16, { className: css.headingIcon }), _jsxs("div", { className: css.headingText, children: [_jsx("div", { className: css.title, title: artifact.title, children: artifact.title }), _jsxs("div", { className: css.meta, children: [_jsx("span", { children: kindLabel(t, artifact.kind) }), _jsx("span", { "aria-hidden": "true", children: "\u00B7" }), _jsxs("span", { children: [artifact.bytes, " ", t('card.bytes')] })] })] })] }), _jsxs("button", { type: "button", className: css.expandButton, "aria-expanded": expanded, onClick: () => setExpanded(value => !value), children: [_jsx(IconFullscreenOutline16, {}), _jsx("span", { children: expanded ? t('card.collapse') : t('card.expand') })] })] }), artifact.description !== undefined ? (_jsx("p", { className: css.description, children: artifact.description })) : null, _jsx(SafeArtifactFrame, { html: artifact.html, title: artifact.title, height: artifact.height, expanded: expanded, unloadedLabel: t('card.frameUnloaded') }), sourceOpen ? (_jsxs("div", { className: css.sourcePanel, children: [_jsxs("div", { className: css.sourceHeading, children: [_jsx("span", { children: t('card.source') }), _jsx("span", { className: css.sourceId, children: artifact.artifactId })] }), _jsx("pre", { className: css.source, children: _jsx("code", { children: artifact.html }) })] })) : null, _jsxs("footer", { className: css.actions, children: [_jsxs("button", { type: "button", className: css.actionButton, onClick: () => setSourceOpen(value => !value), children: [_jsx(IconCodeOutline16, {}), _jsx("span", { children: sourceOpen ? t('card.hideSource') : t('card.viewSource') })] }), _jsxs("button", { type: "button", className: css.actionButton, onClick: () => { void copyHtml(); }, children: [copyState === 'copied' ? _jsx(IconCheckOutline16, {}) : _jsx(IconCopyOutline16, {}), _jsx("span", { children: copyLabel })] }), copyState !== 'idle' ? _jsx("span", { className: css.copyStatus, role: "status", children: copyLabel }) : null, _jsxs("span", { className: css.artifactId, title: artifact.artifactId, children: [t('card.artifactId'), ": ", artifact.artifactId] })] })] }));
}
