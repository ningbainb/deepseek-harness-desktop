import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useState } from 'react';
import { LOCAL_SEARCH_UPDATED_EVENT, notifyLocalSearchUpdated, postLocalSearch } from "./local-search-api.js";
import styles from './memory.module.css';
export function WorkspaceKnowledgeCount({ sessionId, useSessions }) {
    const session = useSessions(state => state.byId?.[sessionId]);
    const workspaceId = session?.workspaceId;
    const [count, setCount] = useState();
    useEffect(() => {
        if (!workspaceId) {
            setCount(undefined);
            return;
        }
        const controller = new AbortController();
        const load = () => {
            void postLocalSearch('status', { workspaceId }, controller.signal)
                .then(res => { if (!controller.signal.aborted)
                setCount(res.sources.length); })
                .catch(() => { });
        };
        load();
        window.addEventListener(LOCAL_SEARCH_UPDATED_EVENT, load);
        return () => {
            controller.abort();
            window.removeEventListener(LOCAL_SEARCH_UPDATED_EVENT, load);
        };
    }, [workspaceId]);
    if (!count)
        return null;
    return _jsx("span", { className: styles.kbBadge, children: count });
}
export function WorkspaceKnowledgeSection({ sessionId, useSessions, t }) {
    const session = useSessions(state => state.byId?.[sessionId]);
    const workspaceId = session?.workspaceId;
    const [status, setStatus] = useState();
    const [pathInput, setPathInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const refresh = useCallback(async (signal) => {
        if (!workspaceId)
            return;
        try {
            const res = await postLocalSearch('status', { workspaceId }, signal);
            if (!signal?.aborted) {
                setStatus(res);
                setError(false);
            }
        }
        catch {
            if (!signal?.aborted)
                setError(true);
        }
    }, [workspaceId]);
    useEffect(() => {
        if (!workspaceId)
            return;
        const controller = new AbortController();
        void refresh(controller.signal);
        const onUpdated = () => { void refresh(); };
        window.addEventListener(LOCAL_SEARCH_UPDATED_EVENT, onUpdated);
        return () => {
            controller.abort();
            window.removeEventListener(LOCAL_SEARCH_UPDATED_EVENT, onUpdated);
        };
    }, [workspaceId, refresh]);
    if (!workspaceId)
        return null;
    const mutateSource = async (operation, path) => {
        const trimmed = path.trim();
        if (!trimmed || busy)
            return;
        setBusy(true);
        setError(false);
        try {
            await postLocalSearch('sources', { workspaceId, path: trimmed, operation });
            if (operation === 'add')
                setPathInput('');
            notifyLocalSearchUpdated();
            await refresh();
        }
        catch {
            setError(true);
        }
        finally {
            setBusy(false);
        }
    };
    const onSubmit = (event) => {
        event.preventDefault();
        void mutateSource('add', pathInput);
    };
    return (_jsxs("div", { className: styles.kbSection, "data-dsh-workspace-kb": "true", children: [status && (_jsxs("div", { className: styles.searchStatus, children: [_jsxs("span", { children: [t('search.chunkCount'), " ", status.status.counts.knowledge] }), _jsx("button", { type: "button", className: styles.kbSmallBtn, disabled: busy || status.indexing, onClick: () => {
                            setBusy(true);
                            void postLocalSearch('rebuild', {})
                                .then(() => { notifyLocalSearchUpdated(); return refresh(); })
                                .catch(() => setError(true))
                                .finally(() => setBusy(false));
                        }, children: t('search.rebuild') })] })), error && _jsx("p", { className: styles.error, role: "alert", children: t('search.unavailable') }), _jsxs("form", { className: styles.kbAddForm, onSubmit: onSubmit, children: [_jsx("input", { type: "text", value: pathInput, maxLength: 4096, "aria-label": t('search.sourcePath'), placeholder: t('search.sourcePath'), disabled: busy, onChange: event => setPathInput(event.target.value) }), _jsx("button", { type: "submit", className: styles.kbSmallBtn, disabled: busy || !pathInput.trim(), children: t('search.addSource') })] }), status && status.sources.length === 0 && (_jsx("p", { className: styles.muted, children: t('search.kbEmpty') })), status && status.sources.length > 0 && (_jsx("ul", { className: styles.kbSourceList, children: status.sources.map(source => (_jsxs("li", { className: styles.kbSourceRow, children: [_jsx("span", { className: styles.searchSource, children: source.path }), _jsx("button", { type: "button", className: styles.kbSmallBtn, disabled: busy, onClick: () => void mutateSource('remove', source.path), children: t('search.removeSource') })] }, source.path))) }))] }));
}
function relativeSourcePath(cwd, absolutePath) {
    const norm = (value) => value.replaceAll('\\', '/').replace(/\/+$/u, '');
    const root = norm(cwd);
    const target = norm(absolutePath);
    if (!root || !target)
        return undefined;
    if (target.toLowerCase() === root.toLowerCase())
        return '.';
    if (target.toLowerCase().startsWith(root.toLowerCase() + '/')) {
        return target.slice(root.length + 1);
    }
    return undefined;
}
export function FilesTreeKnowledgeButton({ sessionId, absolutePath, useSessions, t }) {
    const session = useSessions(state => state.byId?.[sessionId]);
    const [state, setState] = useState('idle');
    const rel = session?.cwd ? relativeSourcePath(session.cwd, absolutePath) : undefined;
    if (!session?.workspaceId || !rel)
        return null;
    const workspaceId = session.workspaceId;
    const label = state === 'done'
        ? t('search.kbAddedToast')
        : state === 'error'
            ? t('search.kbFailedToast')
            : t('search.kbAddCurrentDir');
    return (_jsx("button", { type: "button", className: styles.kbFileAction, "data-dsh-kb-index-dir": "true", disabled: state === 'busy', title: t('search.kbSectionTitle'), onClick: () => {
            setState('busy');
            void postLocalSearch('sources', { workspaceId, path: rel, operation: 'add' })
                .then(() => {
                notifyLocalSearchUpdated();
                setState('done');
                setTimeout(() => setState('idle'), 2400);
            })
                .catch(() => {
                setState('error');
                setTimeout(() => setState('idle'), 2400);
            });
        }, children: label }));
}
