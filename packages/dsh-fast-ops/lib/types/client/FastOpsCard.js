import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { INLINE_BYTE_OPTIONS, TTL_MS_OPTIONS, defaultSettings, } from "../core/settings.js";
import { fetchFastOpsState, reclaimFastOpsCache, saveFastOpsSettings, } from "./api.js";
import css from './FastOps.module.css';
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
    return (_jsxs("section", { className: css.card, "data-fast-ops-settings": true, children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { children: [_jsx("h3", { className: css.title, children: t('cardTitle') }), _jsx("p", { className: css.description, children: t('cardDescription') })] }), _jsx("span", { className: css.statusPill, "data-active": draft.enabled ? 'true' : 'false', children: draft.enabled ? t('statusActive') : t('statusDisabled') })] }), state && (_jsxs("div", { className: css.statsGrid, children: [_jsxs("div", { className: css.statBox, children: [_jsx("div", { className: css.statValue, children: state.counters.batchCalls }), _jsx("div", { className: css.statLabel, children: t('statsBatchCalls') })] }), _jsxs("div", { className: css.statBox, children: [_jsx("div", { className: css.statValue, children: state.counters.filesReadInBatches }), _jsx("div", { className: css.statLabel, children: t('statsFilesBatched') })] }), _jsxs("div", { className: css.statBox, children: [_jsx("div", { className: css.statValue, children: state.counters.cacheSpills }), _jsx("div", { className: css.statLabel, children: t('statsSpills') })] }), _jsxs("div", { className: css.statBox, children: [_jsx("div", { className: css.statValue, children: state.counters.toolsActivated }), _jsx("div", { className: css.statLabel, children: t('statsActivated') })] }), _jsxs("div", { className: css.statBox, children: [_jsx("div", { className: css.statValue, children: `${state.cache.totalRefs} (${formatBytes(state.cache.totalBytes)})` }), _jsx("div", { className: css.statLabel, children: t('statsCacheRefs') })] })] })), _jsxs("label", { className: css.checkRow, children: [_jsx("input", { type: "checkbox", checked: draft.enabled, onChange: e => setDraft(prev => ({ ...prev, enabled: e.target.checked })) }), _jsx("span", { children: t('enableLabel') })] }), _jsxs("label", { className: css.checkRow, children: [_jsx("input", { type: "checkbox", checked: draft.lazySpecializedTools, onChange: e => setDraft(prev => ({ ...prev, lazySpecializedTools: e.target.checked })) }), _jsx("span", { children: t('lazyToolsLabel') })] }), _jsxs("label", { className: css.checkRow, children: [_jsx("input", { type: "checkbox", checked: draft.batchingGuidance, onChange: e => setDraft(prev => ({ ...prev, batchingGuidance: e.target.checked })) }), _jsx("span", { children: t('batchGuidanceLabel') })] }), _jsxs("div", { className: css.grid, children: [_jsxs("label", { className: css.field, children: [_jsx("span", { children: t('maxInlineLabel') }), _jsx("select", { className: css.select, value: String(draft.maxInlineBytes), onChange: e => setDraft(prev => ({ ...prev, maxInlineBytes: Number(e.target.value) })), children: INLINE_BYTE_OPTIONS.map(bytes => (_jsx("option", { value: String(bytes), children: `${bytes / 1024} KB` }, bytes))) })] }), _jsxs("label", { className: css.field, children: [_jsx("span", { children: t('ttlLabel') }), _jsx("select", { className: css.select, value: String(draft.resultCacheTtlMs), onChange: e => setDraft(prev => ({ ...prev, resultCacheTtlMs: Number(e.target.value) })), children: TTL_MS_OPTIONS.map(ms => (_jsx("option", { value: String(ms), children: ttlLabel(ms) }, ms))) })] })] }), _jsxs("footer", { className: css.footer, children: [_jsx("div", { children: feedback && (_jsx("span", { className: feedback.kind === 'ok' ? css.notice : css.error, children: feedback.text })) }), _jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", className: css.btn, disabled: busy, onClick: () => void refresh(), children: t('refresh') }), _jsx("button", { type: "button", className: css.btn, disabled: busy, onClick: () => void handleReclaim(), children: t('reclaimAction') }), _jsx("button", { type: "button", className: css.primaryBtn, disabled: busy, onClick: () => void handleSave(), children: busy ? t('saving') : t('saveAction') })] })] })] }));
}
