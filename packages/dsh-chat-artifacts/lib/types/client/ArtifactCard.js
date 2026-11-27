import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { IconCheckOutlineMedium, IconCopyOutlineMedium, IconDataOutlineMedium, IconDownloadOutlineMedium, IconFullscreenOutlineMedium, IconRefreshOutlineMedium, Tooltip, writeClipboard, } from '@deepseek-ai/dsh-client-ui-primitives';
import { utf8ByteLength } from "../core/types.js";
import { sanitizeStreamingHtml } from "../core/streaming.js";
import { ArtifactFullscreenModal } from "./ArtifactFullscreenModal.js";
import { MAX_PREVIEW_HEIGHT, MIN_PREVIEW_HEIGHT, SafeArtifactFrame, buildSafeArtifactDocument, } from "./SafeArtifactFrame.js";
import { artifactVersion } from "./artifact-transcript.js";
import { downloadDiagram, findInlineSvg, findMermaidBlock, rasterizeDiagram, renderOfflineMermaid, sanitizeExportSvg } from "./diagram-export.js";
import css from './artifact.module.css';
function Action({ label, onClick, children, disabled }) {
    return _jsx(Tooltip, { label: label, portal: true, children: _jsx("button", { type: "button", className: css.actionButton, "aria-label": label, onClick: onClick, disabled: disabled, children: children }) });
}
function exportHtml(artifact, t) {
    const html = artifact.mode === 'interactive' ? sanitizeStreamingHtml(artifact.html) : artifact.html;
    if (!html)
        return false;
    downloadDiagram(artifactFileBase(artifact.title, t) + '.html', new Blob([buildSafeArtifactDocument(html)], { type: 'text/html;charset=utf-8' }));
    return true;
}
function artifactFileBase(title, t) {
    return title.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-').slice(0, 80).trim() || t('card.preview');
}
function ResizeHandle({ height, onHeight, t }) {
    const drag = useRef();
    const move = (next) => onHeight(Math.min(MAX_PREVIEW_HEIGHT, Math.max(MIN_PREVIEW_HEIGHT, next)));
    return _jsx("div", { role: "separator", "aria-label": t('card.resize'), "aria-orientation": "horizontal", "aria-valuemin": MIN_PREVIEW_HEIGHT, "aria-valuemax": MAX_PREVIEW_HEIGHT, "aria-valuenow": height, tabIndex: 0, className: css.resizeHandle, onPointerDown: event => {
            if (event.button !== 0)
                return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const viewport = event.currentTarget.previousElementSibling?.querySelector('.' + css.frameViewport);
            drag.current = { top: event.clientY, height: viewport?.getBoundingClientRect().height ?? height };
        }, onPointerMove: event => {
            if (drag.current)
                move(drag.current.height + event.clientY - drag.current.top);
        }, onLostPointerCapture: () => { drag.current = undefined; }, onDoubleClick: () => onHeight(), onKeyDown: event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onHeight();
                return;
            }
            const next = { ArrowUp: height - 16, ArrowDown: height + 16, Home: MIN_PREVIEW_HEIGHT, End: MAX_PREVIEW_HEIGHT }[event.key];
            if (next === undefined)
                return;
            event.preventDefault();
            move(next);
        } });
}
function ArtifactContents({ artifact, t, inputActions, expanded = false, onFullscreen, heading }) {
    const [view, setView] = useState('preview');
    const [runNonce, setRunNonce] = useState(0);
    const [height, setHeight] = useState();
    const [automaticHeight, setAutomaticHeight] = useState(artifact.height);
    const [diagnostic, setDiagnostic] = useState();
    const [action, setAction] = useState();
    const [diagram, setDiagram] = useState();
    const [diagramBusy, setDiagramBusy] = useState(false);
    const [status, setStatus] = useState();
    const statusTimer = useRef();
    const currentHeight = height ?? automaticHeight;
    const mermaid = artifact.mode !== 'interactive' ? findMermaidBlock(artifact.html) : undefined;
    const previewHtml = diagram && mermaid ? artifact.html.replace(mermaid.markup, () => diagram) : artifact.html;
    const exportableSvg = diagram ?? findInlineSvg(artifact.html);
    useEffect(() => () => clearTimeout(statusTimer.current), []);
    function notify(value) {
        setStatus(value);
        clearTimeout(statusTimer.current);
        statusTimer.current = setTimeout(() => setStatus(undefined), 2200);
    }
    const stageDraft = (text) => {
        if (!inputActions)
            return;
        const inserted = inputActions.insertText('\n' + text + '\n', inputActions.captureInsertion());
        notify(inserted ? 'inserted' : 'insertFailed');
        if (inserted)
            setAction(undefined);
    };
    async function copy() {
        let copied = false;
        try {
            copied = await writeClipboard(artifact.html);
        }
        catch { }
        notify(copied ? 'copied' : 'copyFailed');
    }
    async function renderDiagram() {
        if (!mermaid || diagramBusy)
            return;
        setDiagramBusy(true);
        try {
            const dark = document.body.hasAttribute('data-ds-dark-theme');
            setDiagram(await renderOfflineMermaid(mermaid.text, dark));
            setView('preview');
        }
        catch {
            notify('diagramUnavailable');
        }
        finally {
            setDiagramBusy(false);
        }
    }
    async function exportGraphic(format) {
        if (!exportableSvg)
            return;
        try {
            const svg = new Blob([sanitizeExportSvg(exportableSvg)], { type: 'image/svg+xml' });
            downloadDiagram(artifactFileBase(artifact.title, t) + '.' + format, format === 'png' ? await rasterizeDiagram(svg) : svg);
        }
        catch {
            notify('graphicExportFailed');
        }
    }
    return _jsxs(_Fragment, { children: [_jsxs("div", { className: css.toolbar, children: [heading, _jsx("div", { className: css.segments, role: "group", "aria-label": t('card.view'), children: ['preview', 'source', 'split'].map(item => _jsx("button", { type: "button", "aria-pressed": view === item, onClick: () => setView(item), children: t(`view.${item}`) }, item)) }), _jsxs("div", { className: css.iconActions, children: [artifact.mode === 'interactive' && _jsx(Action, { label: t('card.runAgain'), onClick: () => {
                                    setDiagnostic(undefined);
                                    setAction(undefined);
                                    setHeight(undefined);
                                    setRunNonce(previous => previous + 1);
                                }, children: _jsx(IconRefreshOutlineMedium, {}) }), _jsx(Action, { label: t('card.copy'), onClick: () => { void copy(); }, children: status === 'copied' ? _jsx(IconCheckOutlineMedium, {}) : _jsx(IconCopyOutlineMedium, {}) }), _jsx(Action, { label: t('card.export'), onClick: () => { if (!exportHtml(artifact, t))
                                    notify('exportFailed'); }, children: _jsx(IconDownloadOutlineMedium, {}) }), mermaid && !diagram && _jsx(Action, { label: t('card.renderDiagram'), onClick: () => void renderDiagram(), disabled: diagramBusy, children: _jsx(IconRefreshOutlineMedium, {}) }), exportableSvg && _jsxs(_Fragment, { children: [_jsx(Action, { label: t('card.exportSvg'), onClick: () => void exportGraphic('svg'), children: _jsx("span", { className: css.graphicFormat, children: "SVG" }) }), _jsx(Action, { label: t('card.exportPng'), onClick: () => void exportGraphic('png'), children: _jsx("span", { className: css.graphicFormat, children: "PNG" }) })] }), onFullscreen && _jsx(Action, { label: t('card.fullscreen'), onClick: onFullscreen, children: _jsx(IconFullscreenOutlineMedium, {}) })] })] }), !expanded && artifact.description && _jsx("p", { className: css.description, children: artifact.description }), _jsxs("div", { "data-artifact-view": view, className: css.canvas, children: [_jsx("div", { hidden: view === 'source', className: css.previewPane, children: _jsx(SafeArtifactFrame, { html: previewHtml, title: artifact.title, height: artifact.height, mode: artifact.mode, runNonce: runNonce, manualHeight: height, expanded: expanded, unloadedLabel: t('card.frameUnloaded'), onAutoHeight: setAutomaticHeight, onDiagnostic: setDiagnostic, onAction: setAction }) }), view !== 'preview' && _jsx("pre", { className: css.source, "aria-label": t('card.source'), children: _jsx("code", { children: artifact.html }) })] }), !expanded && view !== 'source' && _jsx(ResizeHandle, { height: currentHeight, onHeight: next => setHeight(next), t: t }), diagnostic && _jsxs("details", { className: css.diagnostic, children: [_jsx("summary", { children: t('card.scriptError') }), _jsxs("pre", { children: [diagnostic.message, diagnostic.line && ' (' + diagnostic.line + ':' + (diagnostic.column ?? 0) + ')'] }), inputActions && _jsx("button", { className: css.actionButton, type: "button", onClick: () => stageDraft(t('card.repairRequest', {
                            id: artifact.artifactId, error: diagnostic.message + (diagnostic.line ? ' (' + diagnostic.line + ':' + (diagnostic.column ?? 0) + ')' : ''),
                        })), children: t('card.askRepair') })] }), action && inputActions && _jsxs("div", { className: css.diagnostic, "data-artifact-action-request": "", children: [_jsx("strong", { children: t('card.actionProposed', { action: action.action }) }), _jsx("pre", { children: JSON.stringify(action.payload, null, 2) }), _jsx("button", { className: css.actionButton, type: "button", onClick: () => stageDraft(t('card.actionDraft', {
                            id: artifact.artifactId, action: action.action, payload: JSON.stringify(action.payload) ?? 'null',
                        })), children: t('card.insertAction') }), _jsx("button", { className: css.actionButton, type: "button", onClick: () => setAction(undefined), children: t('card.dismissAction') })] }), status && _jsx("span", { className: css.copyStatus, role: "status", children: t(`card.${status}`) })] });
}
export function ArtifactCard({ artifact, t, versions = [], anchor, inputActions }) {
    const [version, setVersion] = useState();
    const [fullscreen, setFullscreen] = useState(false);
    const catalogue = [...new Map([...versions, artifact].map(record => [artifactVersion(record), record])).values()]
        .sort((a, b) => artifactVersion(b) - artifactVersion(a));
    const active = catalogue.find(record => artifactVersion(record) === version) ?? artifact;
    const details = [active.title, t(`kind.${active.kind}`), t(active.mode === 'interactive' ? 'card.interactive' : 'card.static'),
        t('card.size', { size: (active.bytes / 1024).toFixed(1) })].join(' · ');
    const heading = _jsxs("div", { className: css.heading, children: [_jsx(IconDataOutlineMedium, { className: css.headingIcon }), _jsx("div", { className: css.title, title: details, children: active.title }), catalogue.length > 1 && _jsx("select", { className: css.version, "aria-label": t('card.version'), value: artifactVersion(active), onChange: e => setVersion(Number(e.target.value)), children: catalogue.map(record => _jsxs("option", { value: artifactVersion(record), children: ["v", artifactVersion(record)] }, artifactVersion(record))) })] });
    return _jsxs("section", { id: anchor, tabIndex: anchor ? -1 : undefined, className: css.card, "data-artifact-id": artifact.artifactId, "data-artifact-version": artifactVersion(active), children: [_jsx(ArtifactContents, { artifact: active, inputActions: inputActions, t: t, heading: heading, onFullscreen: () => setFullscreen(true) }, active.sha256 + ':' + artifactVersion(active)), fullscreen && _jsx(ArtifactFullscreenModal, { title: active.title, t: t, open: fullscreen, onClose: () => setFullscreen(false), children: _jsx(ArtifactContents, { artifact: active, inputActions: inputActions, t: t, expanded: true }) })] });
}
export function StreamingArtifactCard({ title, kind, html, t }) {
    const bytes = utf8ByteLength(html);
    return _jsxs("section", { className: css.card, "data-artifact-streaming": "", children: [_jsx("header", { className: css.header, children: _jsxs("div", { className: css.heading, children: [_jsx(IconDataOutlineMedium, { className: css.headingIcon }), _jsxs("div", { className: css.headingText, children: [_jsx("div", { className: css.title, children: title }), kind && _jsx("div", { className: css.meta, children: t(`kind.${kind}`) })] })] }) }), html ? _jsx(SafeArtifactFrame, { html: html, title: title, mode: "static", phase: "streaming", height: 320, expanded: false, unloadedLabel: t('card.frameUnloaded') }) : _jsx("div", { className: css.skeleton }), _jsx("div", { className: css.progress, role: "status", children: t('card.building', { size: (bytes / 1024).toFixed(1) }) })] });
}
