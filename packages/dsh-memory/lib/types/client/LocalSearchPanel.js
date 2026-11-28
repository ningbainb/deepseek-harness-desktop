import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { postLocalSearch } from "./local-search-api.js";
import styles from './memory.module.css';
export function LocalSearchPanel({ t, onSuggest, onOpenSession }) {
    const [open, setOpen] = useState(false);
    const [status, setStatus] = useState();
    const [workspaceId, setWorkspaceId] = useState('');
    const [sourcePath, setSourcePath] = useState('');
    const [query, setQuery] = useState('');
    const [after, setAfter] = useState('');
    const [before, setBefore] = useState('');
    const [hits, setHits] = useState();
    const [searchIndexing, setSearchIndexing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [revision, setRevision] = useState(0);
    const action = useRef();
    useEffect(() => () => action.current?.abort(), []);
    useEffect(() => {
        if (!open)
            return;
        const abort = new AbortController();
        let timer;
        const refresh = async () => {
            try {
                const snapshot = await postLocalSearch('status', { workspaceId: workspaceId || undefined }, abort.signal);
                if (!abort.signal.aborted) {
                    setStatus(snapshot);
                    if (snapshot.indexing)
                        timer = setTimeout(() => { void refresh(); }, 2500);
                }
            }
            catch {
                if (!abort.signal.aborted) {
                    setStatus(undefined);
                    setError(true);
                }
            }
        };
        void refresh();
        return () => { clearTimeout(timer); abort.abort(); };
    }, [open, workspaceId, revision]);
    const perform = async (operation) => {
        action.current?.abort();
        const abort = new AbortController();
        action.current = abort;
        setBusy(true);
        setError(false);
        try {
            await operation(abort.signal);
        }
        catch {
            if (!abort.signal.aborted)
                setError(true);
        }
        finally {
            if (action.current === abort && !abort.signal.aborted)
                setBusy(false);
        }
    };
    const search = (event) => {
        event.preventDefault();
        if (!query.trim())
            return;
        void perform(async (signal) => {
            const result = await postLocalSearch('sessions', {
                query: query.trim(), workspaceId: workspaceId || undefined,
                after: after ? new Date(after + 'T00:00:00').getTime() : undefined,
                before: before ? new Date(before + 'T23:59:59.999').getTime() : undefined,
            }, signal);
            if (!signal.aborted) {
                setHits(result.hits);
                setSearchIndexing(result.indexing);
                setRevision(value => value + 1);
            }
        });
    };
    const change = (operation, path) => {
        if (!workspaceId || !path.trim())
            return;
        void perform(async (signal) => {
            await postLocalSearch('sources', { workspaceId, path: path.trim(), operation }, signal);
            if (!signal.aborted) {
                if (operation === 'add')
                    setSourcePath('');
                setRevision(value => value + 1);
            }
        });
    };
    return _jsxs("details", { className: styles.details, "data-memory-local-search": "true", onToggle: event => setOpen(event.currentTarget.open), children: [_jsx("summary", { children: t('search.title') }), _jsxs("div", { className: styles.searchBody, children: [status && _jsxs("div", { className: styles.searchStatus, "aria-live": "polite", children: [_jsx("span", { children: status.status.vectorCount > 0 ? 'BM25 + ' + t('search.vector') : 'BM25' }), _jsxs("span", { children: [t('search.memoryCount'), " ", status.status.counts.memory] }), _jsxs("span", { children: [t('search.sessionCount'), " ", status.status.counts.sessions] }), _jsxs("span", { children: [t('search.chunkCount'), " ", status.status.counts.knowledge] }), status.indexing && _jsx("span", { children: t('search.indexing') })] }), error && _jsx("p", { className: styles.error, role: "alert", children: t('search.unavailable') }), status && _jsx("div", { className: styles.actions, children: _jsx("button", { type: "button", className: styles.button, disabled: busy || status.indexing, onClick: () => void perform(async (signal) => {
                                await postLocalSearch('rebuild', {}, signal);
                                if (!signal.aborted)
                                    setRevision(value => value + 1);
                            }), children: t('search.rebuild') }) }), _jsxs("label", { className: styles.field, children: [t('settings.workspace'), _jsxs("select", { value: workspaceId, onChange: event => { setWorkspaceId(event.target.value); setHits(undefined); }, disabled: busy, children: [_jsx("option", { value: "", children: t('search.allWorkspaces') }), status?.workspaces.map(workspace => _jsx("option", { value: workspace.id, children: workspace.title }, workspace.id))] })] }), _jsxs("form", { onSubmit: search, className: styles.searchForm, children: [_jsxs("label", { className: styles.field, children: [t('search.history'), _jsx("input", { type: "search", value: query, maxLength: 1200, onChange: event => setQuery(event.target.value) })] }), _jsxs("div", { className: styles.searchDates, children: [_jsxs("label", { className: styles.field, children: [t('search.after'), _jsx("input", { type: "date", value: after, onChange: event => setAfter(event.target.value) })] }), _jsxs("label", { className: styles.field, children: [t('search.before'), _jsx("input", { type: "date", value: before, onChange: event => setBefore(event.target.value) })] })] }), _jsx("button", { type: "submit", className: styles.primary, disabled: busy || !query.trim(), children: t('search.submit') })] }), hits && hits.length === 0 && _jsx("p", { className: styles.muted, role: "status", children: t(searchIndexing ? 'search.indexing' : 'search.noMatches') }), hits && hits.length > 0 && _jsx("ul", { className: styles.searchHits, "aria-label": t('search.history'), children: hits.map(hit => _jsxs("li", { className: styles.activityItem, children: [_jsx("strong", { children: hit.title || hit.sessionId }), _jsx("p", { children: hit.excerpt }), _jsxs("p", { className: styles.muted, children: [t('search.turn'), " ", hit.turn, " \u00B7 ", new Date(hit.timestamp).toLocaleString()] }), _jsx("div", { className: styles.searchStatus, children: hit.reasons.map(reason => _jsx("span", { children: t(('search.reason.' + reason)) }, reason)) }), _jsxs("div", { className: styles.actions, children: [onOpenSession && _jsx("button", { type: "button", className: styles.button, onClick: () => onOpenSession(hit.sessionId), children: t('search.openSession') }), _jsx("button", { type: "button", className: styles.button, onClick: () => onSuggest(hit.sessionId), children: t('search.suggestTurn') })] })] }, hit.sessionId + ':' + hit.seq + ':' + hit.excerpt)) }), _jsxs("details", { className: styles.details, children: [_jsx("summary", { children: t('search.sources') }), _jsxs("form", { className: styles.searchForm, onSubmit: event => { event.preventDefault(); change('add', sourcePath); }, children: [_jsxs("label", { className: styles.field, children: [t('search.sourcePath'), " ", _jsx("input", { value: sourcePath, maxLength: 4096, onChange: event => setSourcePath(event.target.value), disabled: !workspaceId || busy })] }), _jsx("button", { type: "submit", className: styles.button, disabled: !workspaceId || !sourcePath.trim() || busy, children: t('search.addSource') })] }), _jsx("ul", { className: styles.searchHits, children: status?.sources.map(source => _jsxs("li", { className: styles.actions, children: [_jsx("span", { className: styles.searchSource, children: source.path }), _jsx("button", { type: "button", className: styles.button, disabled: busy, onClick: () => change('remove', source.path), children: t('search.removeSource') })] }, source.path)) })] })] })] });
}
