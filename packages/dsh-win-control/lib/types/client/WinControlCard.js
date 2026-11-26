import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
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
    const statusLabel = ready
        ? `${t('statusReady')} · ${state?.bridgedToolCount ?? 0} ${t('toolsMountedSuffix')}`
        : state && state.platform !== 'win32'
            ? t('statusNonWindows')
            : installed
                ? t('statusInstalledRestart')
                : t('statusNotInstalled');
    return (_jsxs("section", { className: css.card, "data-win-control-settings": true, children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { children: [_jsx("h3", { className: css.title, children: t('cardTitle') }), _jsx("p", { className: css.description, children: t('cardDescription') })] }), _jsx("span", { className: css.statusPill, "data-ready": ready ? 'true' : 'false', children: statusLabel })] }), _jsxs("div", { className: css.toolbar, children: [installing ? (_jsx("button", { type: "button", className: css.btn, onClick: () => void handleCancelInstall(), children: t('cancelInstall') })) : (_jsx("button", { type: "button", className: css.primaryBtn, disabled: busyAction !== null || (state !== null && state.platform !== 'win32'), onClick: () => void handleInstall(), children: installed ? t('reinstallAction') : t('installAction') })), _jsx("button", { type: "button", className: css.btn, disabled: busyAction !== null, onClick: () => void handleProbeMirrors(), children: t('probeMirrors') }), _jsx("button", { type: "button", className: css.btn, disabled: busyAction !== null, onClick: () => void handleDoctor(), children: t('runDoctor') }), _jsx("button", { type: "button", className: css.btn, disabled: busyAction !== null, onClick: () => void refresh(), children: t('refresh') })] }), state?.installer.message && (_jsxs("div", { className: css.box, children: [_jsx("strong", { children: state.installer.message }), state.installer.logs.length > 0 && (_jsx("pre", { className: css.pre, children: state.installer.logs.slice(-10).join('\n') }))] })), mirrors.length > 0 && (_jsxs("div", { className: css.box, children: [_jsx("strong", { children: t('mirrorsTitle') }), _jsx("pre", { className: css.pre, children: mirrors.map(m => (m.ok
                            ? `${m.label}: ${formatSpeed(m.speedBps)} (${m.indexMs ?? '?'}ms, v${m.version ?? '?'})`
                            : `${m.label}: 不可用 (${m.error ?? 'error'})`)).join('\n') })] })), doctorReport && (_jsxs("div", { className: css.box, children: [_jsx("strong", { children: t('doctorTitle') }), _jsx("pre", { className: css.pre, children: doctorReport })] })), _jsxs("div", { className: css.grid, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('preferredMirror') }), _jsx("select", { className: css.select, value: draft.plugin.preferredMirror, onChange: e => setDraft(prev => ({
                                    ...prev,
                                    plugin: { ...prev.plugin, preferredMirror: e.target.value },
                                })), children: MIRROR_IDS.map(id => (_jsx("option", { value: id, children: id === 'auto' ? t('mirrorAuto') : id }, id))) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('screenshotScale') }), _jsx("select", { className: css.select, value: String(draft.bridge.screenshotScale), onChange: e => setDraft(prev => ({
                                    ...prev,
                                    bridge: { ...prev.bridge, screenshotScale: Number(e.target.value) },
                                })), children: SCREENSHOT_SCALES.map(scale => (_jsx("option", { value: String(scale), children: `${Math.round(scale * 100)}%` }, scale))) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('screenshotBackend') }), _jsx("select", { className: css.select, value: draft.bridge.screenshotBackend, onChange: e => setDraft(prev => ({
                                    ...prev,
                                    bridge: { ...prev.bridge, screenshotBackend: e.target.value },
                                })), children: SCREENSHOT_BACKENDS.map(b => _jsx("option", { value: b, children: b }, b)) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('timeoutLabel') }), _jsx("input", { type: "number", className: css.input, min: 5000, max: 600000, step: 5000, value: draft.bridge.toolCallTimeoutMs, onChange: e => setDraft(prev => ({
                                    ...prev,
                                    bridge: { ...prev.bridge, toolCallTimeoutMs: Number(e.target.value) },
                                })) })] })] }), _jsxs("div", { className: css.excludeGroup, children: [_jsxs("span", { children: [t('excludeToolsLabel'), ":"] }), EXCLUDABLE_TOOLS.map(tool => (_jsxs("label", { className: css.checkRow, children: [_jsx("input", { type: "checkbox", checked: draft.bridge.excludeTools.includes(tool), onChange: () => toggleExcludedTool(tool) }), _jsx("span", { children: tool })] }, tool)))] }), _jsxs("label", { className: css.checkRow, children: [_jsx("input", { type: "checkbox", checked: draft.bridge.disableFlash, onChange: e => setDraft(prev => ({ ...prev, bridge: { ...prev.bridge, disableFlash: e.target.checked } })) }), _jsx("span", { children: t('disableFlash') })] }), _jsxs("label", { className: css.checkRow, children: [_jsx("input", { type: "checkbox", checked: draft.plugin.lazyTools, onChange: e => setDraft(prev => ({ ...prev, plugin: { ...prev.plugin, lazyTools: e.target.checked } })) }), _jsx("span", { children: t('lazyTools') })] }), _jsxs("label", { className: css.checkRow, children: [_jsx("input", { type: "checkbox", checked: draft.plugin.defaultGrant, onChange: e => setDraft(prev => ({ ...prev, plugin: { ...prev.plugin, defaultGrant: e.target.checked } })) }), _jsx("span", { children: t('defaultGrant') })] }), _jsxs("footer", { className: css.footer, children: [_jsx("div", { children: feedback && (_jsx("span", { className: feedback.kind === 'ok' ? css.notice : css.error, children: feedback.text })) }), _jsx("button", { type: "button", className: css.primaryBtn, disabled: busyAction !== null, onClick: () => void handleSave(), children: busyAction === 'save' ? t('saving') : t('saveSettings') })] })] }));
}
