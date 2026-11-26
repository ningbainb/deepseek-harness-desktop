import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EXCLUDABLE_TOOLS, MIRROR_IDS, SCREENSHOT_BACKENDS, SCREENSHOT_SCALES, defaultSettings, } from "../core/settings.js";
import { cancelWinControlInstall, fetchWinControlState, probeWinControlMirrors, runWinControlDoctor, saveWinControlSettings, startWinControlInstall, } from "./api.js";
import css from './WinControl.module.css';
function formatSpeed(bps) {
    if (!bps || bps <= 0)
        return '—';
    return bps >= 1024 * 1024
        ? `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
        : `${Math.max(1, Math.round(bps / 1024))} KB/s`;
}
function parseDoctorReport(raw) {
    const metrics = [];
    const notes = [];
    let inNotes = false;
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        if (trimmed === '诊断提示:' || trimmed === 'Diagnostics:') {
            inNotes = true;
            continue;
        }
        if (inNotes || trimmed.startsWith('- ')) {
            notes.push(trimmed.replace(/^-\s*/, ''));
            continue;
        }
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0) {
            metrics.push({
                key: trimmed.slice(0, colonIdx).trim(),
                value: trimmed.slice(colonIdx + 1).trim(),
            });
        }
        else {
            notes.push(trimmed);
        }
    }
    return { metrics, notes };
}
function scaleLabel(scale, t) {
    switch (scale) {
        case 0.25: return t('scale25');
        case 0.5: return t('scale50');
        case 0.75: return t('scale75');
        case 1: return t('scale100');
    }
}
export function WinControlCard({ t }) {
    const [state, setState] = useState(null);
    const [draft, setDraft] = useState(defaultSettings);
    const [mirrors, setMirrors] = useState([]);
    const [doctorReport, setDoctorReport] = useState(null);
    const [busyAction, setBusyAction] = useState(null);
    const [feedback, setFeedback] = useState(null);
    const refresh = useCallback(async () => {
        try {
            const next = await fetchWinControlState();
            setState(next);
            setDraft(next.settings);
            if (next.mirrors.length > 0)
                setMirrors(next.mirrors);
        }
        catch {
            setFeedback({ kind: 'err', text: t('saveError') });
        }
    }, [t]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    useEffect(() => {
        const running = state?.installer.state === 'probing' || state?.installer.state === 'installing';
        if (!running)
            return;
        const timer = setInterval(() => {
            void fetchWinControlState().then((next) => {
                setState(next);
                if (next.installer.mirrors.length > 0)
                    setMirrors(next.installer.mirrors);
            }).catch(() => { });
        }, 1000);
        return () => clearInterval(timer);
    }, [state?.installer.state]);
    async function handleProbeMirrors() {
        setBusyAction('probe');
        setFeedback(null);
        try {
            const res = await probeWinControlMirrors();
            setMirrors(res.mirrors);
        }
        catch {
            setFeedback({ kind: 'err', text: t('saveError') });
        }
        finally {
            setBusyAction(null);
        }
    }
    async function handleInstall() {
        setBusyAction('install');
        setFeedback(null);
        try {
            const res = await startWinControlInstall();
            setState(prev => (prev ? { ...prev, installer: res.installer } : prev));
        }
        catch {
            setFeedback({ kind: 'err', text: t('saveError') });
        }
        finally {
            setBusyAction(null);
        }
    }
    async function handleCancelInstall() {
        try {
            const res = await cancelWinControlInstall();
            setState(prev => (prev ? { ...prev, installer: res.installer } : prev));
        }
        catch { }
    }
    async function handleDoctor() {
        setBusyAction('doctor');
        setFeedback(null);
        try {
            const res = await runWinControlDoctor();
            setDoctorReport(res.report);
        }
        catch {
            setFeedback({ kind: 'err', text: t('saveError') });
        }
        finally {
            setBusyAction(null);
        }
    }
    async function handleSave() {
        setBusyAction('save');
        setFeedback(null);
        try {
            const res = await saveWinControlSettings(draft);
            setDraft(res.settings);
            setState(prev => (prev ? { ...prev, settings: res.settings } : prev));
            setFeedback({ kind: 'ok', text: t('savedNotice') });
        }
        catch {
            setFeedback({ kind: 'err', text: t('saveError') });
        }
        finally {
            setBusyAction(null);
        }
    }
    function toggleExcludedTool(tool) {
        setDraft((prev) => {
            const exists = prev.bridge.excludeTools.includes(tool);
            const excludeTools = exists
                ? prev.bridge.excludeTools.filter(item => item !== tool)
                : [...prev.bridge.excludeTools, tool];
            return { ...prev, bridge: { ...prev.bridge, excludeTools } };
        });
    }
    const installing = state?.installer.state === 'probing' || state?.installer.state === 'installing';
    const ready = (state?.bridgedToolCount ?? 0) > 0;
    const installed = (state?.installedVersions.length ?? 0) > 0;
    const statusState = ready ? 'ready' : installed ? 'installed' : 'pending';
    const statusLabel = ready
        ? `${t('statusReady')} · ${state?.bridgedToolCount ?? 0} ${t('toolsMountedSuffix')}`
        : state && state.platform !== 'win32'
            ? t('statusNonWindows')
            : installed
                ? t('statusInstalledRestart')
                : t('statusNotInstalled');
    const isDirty = state !== null && JSON.stringify(draft) !== JSON.stringify(state.settings);
    const parsedDoctor = useMemo(() => (doctorReport ? parseDoctorReport(doctorReport) : null), [doctorReport]);
    const okMirrors = useMemo(() => mirrors.filter(m => m.ok), [mirrors]);
    const failedMirrors = useMemo(() => mirrors.filter(m => !m.ok), [mirrors]);
    const fastestMirrorId = okMirrors[0]?.id;
    return (_jsxs("section", { className: css.card, "data-win-control-settings": true, children: [_jsxs("header", { className: css.hero, children: [_jsxs("div", { className: css.heroText, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("h3", { className: css.title, children: t('cardTitle') }), _jsxs("span", { className: css.statusPill, "data-state": statusState, "data-ready": ready ? 'true' : 'false', children: [_jsx("span", { className: css.statusDot, "aria-hidden": "true" }), _jsx("span", { children: statusLabel })] })] }), _jsx("p", { className: css.description, children: t('cardDescription') })] }), _jsx("div", { className: css.heroActions, children: installing ? (_jsx("button", { type: "button", className: css.btn, onClick: () => void handleCancelInstall(), children: t('cancelInstall') })) : (_jsx("button", { type: "button", className: css.primaryBtn, disabled: busyAction !== null || (state !== null && state.platform !== 'win32'), onClick: () => void handleInstall(), children: installed ? t('reinstallAction') : t('installAction') })) })] }), _jsxs("div", { className: css.stepsRail, children: [_jsxs("div", { className: css.stepItem, "data-done": installed || ready ? 'true' : 'false', children: [_jsx("span", { className: css.stepTitle, children: t('step1Title') }), _jsx("span", { className: css.stepDesc, children: t('step1Desc') })] }), _jsxs("div", { className: css.stepItem, "data-done": doctorReport ? 'true' : 'false', children: [_jsx("span", { className: css.stepTitle, children: t('step2Title') }), _jsx("span", { className: css.stepDesc, children: t('step2Desc') })] }), _jsxs("div", { className: css.stepItem, "data-done": ready ? 'true' : 'false', children: [_jsx("span", { className: css.stepTitle, children: t('step3Title') }), _jsx("span", { className: css.stepDesc, children: t('step3Desc') })] })] }), _jsxs("div", { className: css.actionStrip, children: [_jsx("button", { type: "button", className: css.btn, disabled: busyAction !== null, onClick: () => void handleDoctor(), children: t('runDoctor') }), _jsx("button", { type: "button", className: css.btn, disabled: busyAction !== null, onClick: () => void handleProbeMirrors(), children: t('probeMirrors') }), _jsx("button", { type: "button", className: css.btn, disabled: busyAction !== null, onClick: () => void refresh(), children: t('refresh') })] }), state?.installer.message && (_jsxs("div", { className: css.panelBox, children: [_jsx("div", { className: css.panelHeader, children: _jsx("span", { children: state.installer.message }) }), state.installer.logs.length > 0 && (_jsx("pre", { className: css.pre, children: state.installer.logs.slice(-8).join('\n') }))] })), mirrors.length > 0 && (_jsxs("div", { className: css.panelBox, children: [_jsx("div", { className: css.panelHeader, children: _jsx("span", { children: t('mirrorsTitle') }) }), _jsx("div", { className: css.mirrorTable, children: okMirrors.map(m => (_jsxs("div", { className: css.mirrorRow, "data-fastest": m.id === fastestMirrorId ? 'true' : 'false', children: [_jsxs("span", { className: css.mirrorName, children: [_jsx("span", { children: m.label }), m.id === fastestMirrorId && _jsx("span", { className: css.fastestTag, children: t('fastestBadge') })] }), _jsxs("span", { className: css.mirrorMeta, children: ["v", m.version ?? '?'] }), _jsxs("span", { className: css.mirrorMeta, children: [m.indexMs ?? '?', "ms"] }), _jsx("span", { className: css.mirrorSpeed, children: formatSpeed(m.speedBps) })] }, m.id))) }), failedMirrors.length > 0 && (_jsxs("div", { className: css.mirrorMuted, children: [t('unavailableLabel'), ": ", failedMirrors.map(m => m.label).join(' / ')] }))] })), doctorReport && parsedDoctor && (_jsxs("div", { className: css.panelBox, "data-win-control-doctor": true, children: [_jsx("div", { className: css.panelHeader, children: _jsx("span", { children: t('doctorTitle') }) }), _jsx("div", { className: css.doctorGrid, children: parsedDoctor.metrics.map(item => (_jsxs("div", { className: css.doctorMetric, children: [_jsx("div", { className: css.doctorKey, children: item.key }), _jsx("div", { className: css.doctorVal, children: item.value })] }, item.key))) }), parsedDoctor.notes.length > 0 && (_jsx("div", { className: css.calloutAmber, children: parsedDoctor.notes.map((note, idx) => _jsx("div", { children: note }, idx)) })), _jsx("pre", { className: css.pre, hidden: true, children: doctorReport })] })), _jsxs("div", { className: css.sectionBlock, children: [_jsx("div", { className: css.sectionHeading, children: t('coreSectionTitle') }), _jsxs("div", { className: css.settingRowColumn, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.rowTitle, children: t('screenshotScale') }), _jsx("div", { className: css.rowDesc, children: t('screenshotScaleDesc') })] }), _jsx("div", { className: css.segmented, role: "group", "aria-label": t('screenshotScale'), children: SCREENSHOT_SCALES.map(scale => (_jsx("button", { type: "button", className: css.segBtn, "data-win-scale": String(scale), "aria-pressed": draft.bridge.screenshotScale === scale, onClick: () => setDraft(prev => ({
                                        ...prev,
                                        bridge: { ...prev.bridge, screenshotScale: scale },
                                    })), children: scaleLabel(scale, t) }, scale))) })] }), _jsxs("div", { className: css.settingRow, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.rowTitle, children: t('lazyTools') }), _jsx("div", { className: css.rowDesc, children: t('lazyToolsDesc') })] }), _jsxs("label", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('lazyTools'), className: css.switchInput, checked: draft.plugin.lazyTools, onChange: e => setDraft(prev => ({ ...prev, plugin: { ...prev.plugin, lazyTools: e.target.checked } })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] }), _jsxs("div", { className: css.settingRow, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.rowTitle, children: t('disableFlash') }), _jsx("div", { className: css.rowDesc, children: t('disableFlashDesc') })] }), _jsxs("label", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('disableFlash'), className: css.switchInput, checked: draft.bridge.disableFlash, onChange: e => setDraft(prev => ({ ...prev, bridge: { ...prev.bridge, disableFlash: e.target.checked } })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] }), _jsxs("div", { className: css.settingRow, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.rowTitle, children: t('defaultGrant') }), _jsx("div", { className: css.rowDesc, children: t('defaultGrantDesc') })] }), _jsxs("label", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('defaultGrant'), className: css.switchInput, checked: draft.plugin.defaultGrant, onChange: e => setDraft(prev => ({ ...prev, plugin: { ...prev.plugin, defaultGrant: e.target.checked } })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] })] }), _jsxs("details", { className: css.disclosure, children: [_jsx("summary", { className: css.disclosureSummary, children: t('advancedSectionTitle') }), _jsxs("div", { className: css.disclosureBody, children: [_jsxs("div", { className: css.grid, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('preferredMirror') }), _jsx("select", { className: css.select, value: draft.plugin.preferredMirror, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    plugin: { ...prev.plugin, preferredMirror: e.target.value },
                                                })), children: MIRROR_IDS.map(id => (_jsx("option", { value: id, children: id === 'auto' ? t('mirrorAuto') : id }, id))) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('screenshotBackend') }), _jsx("select", { className: css.select, value: draft.bridge.screenshotBackend, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    bridge: { ...prev.bridge, screenshotBackend: e.target.value },
                                                })), children: SCREENSHOT_BACKENDS.map(b => _jsx("option", { value: b, children: b }, b)) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('timeoutLabel') }), _jsx("input", { type: "number", className: css.input, min: 5000, max: 600000, step: 5000, value: draft.bridge.toolCallTimeoutMs, onChange: e => setDraft(prev => ({
                                                    ...prev,
                                                    bridge: { ...prev.bridge, toolCallTimeoutMs: Number(e.target.value) },
                                                })) })] })] }), _jsxs("div", { className: css.chipGroup, children: [_jsxs("span", { children: [t('excludeToolsLabel'), ":"] }), EXCLUDABLE_TOOLS.map(tool => (_jsxs("label", { className: css.chipLabel, children: [_jsx("input", { type: "checkbox", checked: draft.bridge.excludeTools.includes(tool), onChange: () => toggleExcludedTool(tool) }), _jsx("span", { children: tool })] }, tool)))] })] })] }), _jsxs("footer", { className: css.footer, children: [_jsx("div", { className: css.feedbackArea, children: feedback ? (_jsx("span", { className: feedback.kind === 'ok' ? css.notice : css.error, children: feedback.text })) : isDirty ? (_jsx("span", { className: css.dirty, children: t('dirtyNotice') })) : null }), _jsx("button", { type: "button", className: css.primaryBtn, disabled: busyAction !== null, onClick: () => void handleSave(), children: busyAction === 'save' ? t('saving') : t('saveSettings') })] })] }));
}
