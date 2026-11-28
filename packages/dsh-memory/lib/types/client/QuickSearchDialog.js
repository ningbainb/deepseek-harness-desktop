import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { postLocalSearch } from "./local-search-api.js";
import styles from './memory.module.css';
let dialogOpen = false;
const listeners = new Set();
function subscribe(listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
function setDialogOpen(next) {
    if (dialogOpen === next)
        return;
    dialogOpen = next;
    for (const listener of listeners)
        listener();
}
export function openQuickSearch() {
    setDialogOpen(true);
}
export function toggleQuickSearch() {
    setDialogOpen(!dialogOpen);
}
function SearchGlyph() {
    return (_jsxs("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [_jsx("circle", { cx: "11", cy: "11", r: "7" }), _jsx("path", { d: "m20 20-3.5-3.5" })] }));
}
export function QuickSearchDialog({ t, onOpenSession }) {
    const open = useSyncExternalStore(subscribe, () => dialogOpen, () => false);
    const dialog = useRef(null);
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [workspaceId, setWorkspaceId] = useState('');
    const [status, setStatus] = useState();
    const [hits, setHits] = useState();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    useEffect(() => {
        const node = dialog.current;
        if (!node)
            return;
        if (open && !node.open) {
            node.showModal();
            inputRef.current?.focus();
        }
        else if (!open && node.open) {
            node.close();
        }
    }, [open]);
    useEffect(() => {
        if (!open)
            return;
        const controller = new AbortController();
        void postLocalSearch('status', { workspaceId: workspaceId || undefined }, controller.signal)
            .then(next => { if (!controller.signal.aborted)
            setStatus(next); })
            .catch(() => { });
        return () => controller.abort();
    }, [open, workspaceId]);
    useEffect(() => {
        if (!open)
            return;
        const trimmed = query.trim();
        if (!trimmed) {
            setHits(undefined);
            setError(false);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
            setBusy(true);
            setError(false);
            void postLocalSearch('sessions', {
                query: trimmed,
                workspaceId: workspaceId || undefined,
                limit: 20,
            }, controller.signal)
                .then(result => {
                if (!controller.signal.aborted)
                    setHits(result.hits);
            })
                .catch(() => {
                if (!controller.signal.aborted)
                    setError(true);
            })
                .finally(() => {
                if (!controller.signal.aborted)
                    setBusy(false);
            });
        }, 160);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [open, query, workspaceId]);
    if (!open)
        return null;
    return (_jsxs("dialog", { ref: dialog, className: styles.quickDialog, "data-dsh-quick-search-dialog": "true", "aria-label": t('search.quickOpen'), onClose: () => setDialogOpen(false), onClick: event => {
            if (event.target === event.currentTarget)
                setDialogOpen(false);
        }, children: [_jsxs("header", { className: styles.quickHeader, children: [_jsxs("div", { className: styles.quickSearchBox, children: [_jsx(SearchGlyph, {}), _jsx("input", { ref: inputRef, type: "search", value: query, maxLength: 1200, "aria-label": t('search.history'), placeholder: t('search.quickPlaceholder'), onChange: event => setQuery(event.target.value) })] }), _jsx("button", { type: "button", className: styles.button, onClick: () => setDialogOpen(false), children: t('search.close') })] }), _jsxs("div", { className: styles.quickControls, children: [_jsxs("select", { "aria-label": t('settings.workspace'), value: workspaceId, onChange: event => setWorkspaceId(event.target.value), children: [_jsx("option", { value: "", children: t('search.allWorkspaces') }), status?.workspaces.map(ws => _jsx("option", { value: ws.id, children: ws.title }, ws.id))] }), status && (_jsxs("div", { className: styles.searchStatus, children: [_jsx("span", { children: status.status.vectorCount > 0 ? `BM25 + ${t('search.vector')}` : 'BM25' }), _jsxs("span", { children: [t('search.sessionCount'), " ", status.status.counts.sessions] }), _jsxs("span", { children: [t('search.chunkCount'), " ", status.status.counts.knowledge] })] }))] }), _jsxs("div", { className: styles.quickResults, children: [error && _jsx("p", { className: styles.error, role: "alert", children: t('search.unavailable') }), !query.trim() && _jsx("p", { className: styles.muted, children: t('search.quickHint') }), busy && _jsx("p", { className: styles.muted, role: "status", children: t('settings.loading') }), !busy && query.trim() && hits && hits.length === 0 && (_jsx("p", { className: styles.muted, role: "status", children: t('search.noMatches') })), hits && hits.length > 0 && (_jsx("ul", { className: styles.searchHits, "aria-label": t('search.history'), children: hits.map(hit => (_jsx("li", { children: _jsxs("button", { type: "button", className: styles.quickHitBtn, onClick: () => {
                                    onOpenSession?.(hit.sessionId);
                                    setDialogOpen(false);
                                }, children: [_jsxs("div", { className: styles.quickHitHead, children: [_jsx("strong", { children: hit.title || hit.sessionId }), _jsxs("span", { className: styles.muted, children: [t('search.turn'), " ", hit.turn] })] }), _jsx("p", { className: styles.quickHitExcerpt, children: hit.excerpt }), _jsx("div", { className: styles.searchStatus, children: hit.reasons.map(reason => (_jsx("span", { children: t(('search.reason.' + reason)) }, reason))) })] }) }, `${hit.sessionId}:${hit.seq}:${hit.excerpt}`))) }))] })] }));
}
export function QuickSearchSidebarEntry({ wide, t, onOpenSession }) {
    const label = t('search.quickOpen');
    return (_jsxs("div", { className: styles.quickFooterWrap, "data-wide": wide ? 'wide' : 'rail', "data-dsh-quick-search-entry": "true", children: [_jsxs("button", { type: "button", className: styles.quickFooterBtn, "data-dsh-quick-search-trigger": "true", "aria-label": label, title: `${label} (Ctrl+K)`, onClick: () => openQuickSearch(), children: [_jsx(SearchGlyph, {}), wide && _jsx("span", { className: styles.quickFooterLabel, children: label }), wide && _jsx("span", { className: styles.quickShortcut, children: "Ctrl+K" })] }), _jsx(QuickSearchDialog, { t: t, onOpenSession: onOpenSession })] }));
}
