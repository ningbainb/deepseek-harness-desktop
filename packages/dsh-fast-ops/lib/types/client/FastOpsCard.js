import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { INLINE_BYTE_OPTIONS, TTL_MS_OPTIONS, defaultSettings, } from "../core/settings.js";
import { fetchFastOpsState, reclaimFastOpsCache, saveFastOpsSettings, } from "./api.js";
import css from './FastOps.module.css';
const RESIDENT_TOOL_NAMES = ['fast_read_files', 'fast_search', 'fast_edit_batch', 'fast_discover'];
const SPECIALIZED_TOOL_NAMES = [
    'fast_stat', 'fast_diff', 'fast_replace', 'fast_read_table', 'fast_result',
    'fast_outline', 'fast_ast_search', 'fast_ast_rewrite', 'fast_repo_map',
];
const DENOISE_RULES = { enabled: 'denoiseEnabled', git: 'denoiseGit', test: 'denoiseTest', build: 'denoiseBuild' };
function formatBytes(bytes) {
    if (bytes >= 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}
export function FastOpsCard({ t }) {
    const [state, setState] = useState(null);
    const [draft, setDraft] = useState(defaultSettings);
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const refresh = useCallback(async () => {
        try {
            const next = await fetchFastOpsState();
            setState(next);
            setDraft(next.settings);
        }
        catch {
            setFeedback({ kind: 'err', text: t('errorNotice') });
        }
    }, [t]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    async function handleSave() {
        setBusy(true);
        setFeedback(null);
        try {
            const res = await saveFastOpsSettings(draft);
            setDraft(res.settings);
            setState(prev => (prev ? { ...prev, settings: res.settings } : prev));
            setFeedback({ kind: 'ok', text: t('savedNotice') });
            if (typeof window !== 'undefined')
                window.dispatchEvent(new CustomEvent('dsh-fast-ops:state-changed'));
        }
        catch {
            setFeedback({ kind: 'err', text: t('errorNotice') });
        }
        finally {
            setBusy(false);
        }
    }
    async function handleReclaim() {
        setBusy(true);
        setFeedback(null);
        try {
            const res = await reclaimFastOpsCache();
            setState(prev => (prev ? { ...prev, cache: res.cache } : prev));
            setFeedback({ kind: 'ok', text: t('reclaimedNotice') });
            if (typeof window !== 'undefined')
                window.dispatchEvent(new CustomEvent('dsh-fast-ops:state-changed'));
        }
        catch {
            setFeedback({ kind: 'err', text: t('errorNotice') });
        }
        finally {
            setBusy(false);
        }
    }
    const ttlLabel = (ms) => {
        if (ms === 900000)
            return t('ttl15m');
        if (ms === 3600000)
            return t('ttl1h');
        return t('ttl6h');
    };
    const counters = state?.counters ?? {
        batchCalls: 0,
        filesReadInBatches: 0,
        cacheSpills: 0,
        toolsActivated: 0,
        astCalls: 0,
        denoiseTokensSaved: 0,
        spillTokensSaved: 0,
    };
    const denoiseSaved = counters.denoiseTokensSaved ?? 0;
    const spillSaved = counters.spillTokensSaved ?? 0;
    const totalSaved = denoiseSaved + spillSaved;
    const cache = state?.cache ?? { totalRefs: 0, totalBytes: 0, sessionCount: 0 };
    const isDirty = state !== null && JSON.stringify(draft) !== JSON.stringify(state.settings);
    return (_jsxs("section", { className: css.card, "data-fast-ops-settings": true, "data-fast-ops-loaded": state ? 'true' : 'false', children: [_jsxs("header", { className: css.hero, children: [_jsxs("div", { className: css.heroText, children: [_jsxs("div", { className: css.titleRow, children: [_jsx("h3", { className: css.title, children: t('cardTitle') }), _jsxs("span", { className: css.statusPill, "data-active": draft.enabled ? 'true' : 'false', children: [_jsx("span", { className: css.statusDot, "aria-hidden": "true" }), _jsx("span", { children: draft.enabled ? t('statusActive') : t('statusDisabled') })] })] }), _jsx("p", { className: css.description, children: t('cardDescription') })] }), _jsxs("label", { className: css.heroControl, children: [_jsx("span", { className: css.masterText, children: t('enableLabel') }), _jsxs("span", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('enableLabel'), className: css.switchInput, checked: draft.enabled, onChange: e => setDraft(prev => ({ ...prev, enabled: e.target.checked })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] })] }), _jsxs("div", { className: css.metricsStrip, "data-fast-ops-stats": true, children: [_jsxs("div", { className: css.metricCard, children: [_jsx("div", { className: css.metricValue, children: counters.batchCalls }), _jsx("div", { className: css.metricLabel, children: t('statsBatchCalls') })] }), _jsxs("div", { className: css.metricCard, children: [_jsx("div", { className: css.metricValue, children: counters.filesReadInBatches }), _jsx("div", { className: css.metricLabel, children: t('statsFilesBatched') })] }), _jsxs("div", { className: css.metricCard, children: [_jsx("div", { className: css.metricValue, children: counters.toolsActivated }), _jsx("div", { className: css.metricLabel, children: t('statsActivated') })] }), _jsxs("div", { className: css.metricCard, children: [_jsx("div", { className: css.metricValue, children: `${cache.totalRefs} (${formatBytes(cache.totalBytes)})` }), _jsx("div", { className: css.metricLabel, children: t('statsCacheRefs') }), _jsx("div", { className: css.metricSub, children: `${counters.cacheSpills} ${t('statsSpillSuffix')}` })] }), _jsxs("div", { className: css.metricCard, children: [_jsx("div", { className: css.metricValue, children: counters.astCalls }), _jsx("div", { className: css.metricLabel, children: t('statsAstCalls') }), state && _jsx("div", { className: css.metricSub, children: t(state.astAvailable ? 'astNative' : 'astFallback') })] }), _jsxs("div", { className: css.metricCard, children: [_jsx("div", { className: css.metricValue, children: totalSaved }), _jsx("div", { className: css.metricLabel, children: t('statsDenoiseTokens') }), spillSaved > 0 && (_jsx("div", { className: css.metricSub, children: `${t('statsTotalSavedSubDenoise')} ${denoiseSaved} · ${t('statsTotalSavedSubSpill')} ${spillSaved}` }))] })] }), _jsxs("div", { className: css.sectionBlock, children: [_jsx("div", { className: css.sectionHeading, children: t('coreSectionTitle') }), _jsxs("div", { className: css.settingRow, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.rowTitle, children: t('lazyToolsLabel') }), _jsx("div", { className: css.rowDesc, children: t('lazyToolsDesc') })] }), _jsxs("label", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('lazyToolsLabel'), className: css.switchInput, checked: draft.lazySpecializedTools, onChange: e => setDraft(prev => ({ ...prev, lazySpecializedTools: e.target.checked })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] }), _jsxs("div", { className: css.settingRow, children: [_jsxs("div", { className: css.rowText, children: [_jsx("div", { className: css.rowTitle, children: t('batchGuidanceLabel') }), _jsx("div", { className: css.rowDesc, children: t('batchGuidanceDesc') })] }), _jsxs("label", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", "aria-label": t('batchGuidanceLabel'), className: css.switchInput, checked: draft.batchingGuidance, onChange: e => setDraft(prev => ({ ...prev, batchingGuidance: e.target.checked })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] })] }), _jsxs("div", { className: css.legendPanel, children: [_jsxs("div", { className: css.legendRow, children: [_jsx("span", { className: css.legendGroupLabel, children: t('residentLabel') }), RESIDENT_TOOL_NAMES.map(name => (_jsx("code", { className: `${css.toolTag} ${css.toolTagPrimary}`, children: name }, name)))] }), _jsxs("div", { className: css.legendRow, children: [_jsx("span", { className: css.legendGroupLabel, children: t('specializedLabel') }), SPECIALIZED_TOOL_NAMES.map(name => (_jsx("code", { className: css.toolTag, children: name }, name)))] })] }), _jsxs("details", { className: css.disclosure, children: [_jsx("summary", { className: css.disclosureSummary, children: t('denoiseTitle') }), _jsxs("div", { className: css.disclosureBody, children: [_jsx("p", { className: css.fieldDesc, children: t('denoiseDescription') }), Object.entries(DENOISE_RULES).map(([rule, label]) => {
                                const key = rule;
                                return (_jsxs("label", { className: css.settingRow, children: [_jsx("span", { className: css.rowTitle, children: t(label) }), _jsxs("span", { className: css.switchControl, children: [_jsx("input", { type: "checkbox", role: "switch", className: css.switchInput, checked: draft.denoise[key], onChange: event => setDraft(prev => ({ ...prev, denoise: { ...prev.denoise, [key]: event.target.checked } })) }), _jsx("span", { className: css.switchTrack, "aria-hidden": "true" })] })] }, key));
                            })] })] }), _jsxs("details", { className: css.disclosure, children: [_jsx("summary", { className: css.disclosureSummary, children: t('advancedTitle') }), _jsxs("div", { className: css.disclosureBody, children: [_jsxs("div", { className: css.fieldGroup, children: [_jsx("div", { className: css.fieldTitle, children: t('maxInlineLabel') }), _jsx("div", { className: css.fieldDesc, children: t('maxInlineDesc') }), _jsx("div", { className: css.segmented4, role: "group", "aria-label": t('maxInlineLabel'), children: INLINE_BYTE_OPTIONS.map(bytes => (_jsx("button", { type: "button", className: css.segBtn, "aria-pressed": draft.maxInlineBytes === bytes, onClick: () => setDraft(prev => ({ ...prev, maxInlineBytes: bytes })), children: `${bytes / 1024} KB` }, bytes))) })] }), _jsxs("div", { className: css.fieldGroup, children: [_jsx("div", { className: css.fieldTitle, children: t('ttlLabel') }), _jsx("div", { className: css.segmented3, role: "group", "aria-label": t('ttlLabel'), children: TTL_MS_OPTIONS.map(ms => (_jsx("button", { type: "button", className: css.segBtn, "aria-pressed": draft.resultCacheTtlMs === ms, onClick: () => setDraft(prev => ({ ...prev, resultCacheTtlMs: ms })), children: ttlLabel(ms) }, ms))) })] })] })] }), _jsxs("footer", { className: css.footer, children: [_jsx("div", { children: feedback ? (_jsx("span", { className: feedback.kind === 'ok' ? css.notice : css.error, children: feedback.text })) : isDirty ? (_jsx("span", { className: css.dirty, children: t('dirtyNotice') })) : null }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.btn, disabled: busy, onClick: () => void refresh(), children: t('refresh') }), _jsx("button", { type: "button", className: css.btn, disabled: busy, onClick: () => void handleReclaim(), children: t('reclaimAction') }), _jsx("button", { type: "button", className: css.primaryBtn, disabled: busy, onClick: () => void handleSave(), children: busy ? t('saving') : t('saveAction') })] })] })] }));
}
