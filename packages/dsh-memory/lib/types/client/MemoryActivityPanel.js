import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import styles from './memory.module.css';
export function MemoryActivityPanel({ t, enabled, sessionId, onEdit }) {
    const [open, setOpen] = useState(false);
    const [activity, setActivity] = useState(null);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(null);
    const [content, setContent] = useState('');
    const [deleting, setDeleting] = useState(null);
    const requestSequence = useRef(0);
    const detailsRef = useRef(null);
    const query = sessionId ? '?sessionId=' + encodeURIComponent(sessionId) : '';
    const refresh = async () => {
        const sequence = ++requestSequence.current;
        try {
            const response = await fetch('/api/dsh-memory/activity' + query, { cache: 'no-store' });
            const value = await response.json();
            if (!response.ok || !value.ok)
                throw new Error('unavailable');
            if (sequence === requestSequence.current) {
                setActivity(value.activity);
                setError(false);
            }
        }
        catch {
            if (sequence === requestSequence.current) {
                setActivity(null);
                setError(true);
            }
        }
    };
    useEffect(() => {
        setActivity(null);
        if (!open)
            return;
        void refresh();
        const timer = setInterval(() => { if (document.visibilityState === 'visible')
            void refresh(); }, 5_000);
        return () => { clearInterval(timer); requestSequence.current++; };
    }, [open, sessionId, enabled]);
    useEffect(() => { setEditing(null); setDeleting(null); }, [sessionId]);
    const mutate = async (path, body) => {
        if (busy)
            return;
        setBusy(true);
        setError(false);
        try {
            const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
            const value = await response.json();
            if (!response.ok || !value.ok)
                throw new Error('unavailable');
            setEditing(null);
            setDeleting(null);
            await refresh();
        }
        catch {
            setError(true);
        }
        finally {
            setBusy(false);
        }
    };
    const activityQuery = activity?.sessionId ? '?sessionId=' + encodeURIComponent(activity.sessionId) : query;
    return _jsxs("details", { ref: detailsRef, className: styles.activity, "data-memory-activity": "true", onToggle: event => setOpen(event.currentTarget.open), onKeyDown: event => {
            if (event.key === 'Escape' && detailsRef.current) {
                event.stopPropagation();
                detailsRef.current.open = false;
                detailsRef.current.querySelector('summary')?.focus();
            }
        }, children: [_jsxs("summary", { children: [t(onEdit ? 'settings.activity.ready' : 'settings.activityTitle'), open && activity ? ` · ${activity.items.length}` : ''] }), _jsxs("div", { className: styles.activityBody, children: [_jsx("p", { className: styles.muted, children: t('settings.activityHint') }), _jsxs("p", { role: "status", children: [t(('settings.activity.' + (!enabled ? 'disabled' : activity?.status ?? 'none'))), activity?.preparedAt ? ' · ' + new Date(activity.preparedAt).toLocaleTimeString() : ''] }), error && _jsx("p", { className: styles.error, role: "alert", children: t('settings.activityError') }), enabled && activity?.items.map(({ item, reason, truncated }) => _jsxs("article", { className: styles.activityItem, children: [_jsx("p", { children: item.content }), _jsxs("p", { className: styles.muted, children: [t(('settings.' + item.scope)), " \u00B7 ", t(('settings.reason.' + reason)), truncated ? ' · ' + t('settings.truncated') : ''] }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.button, disabled: busy, onClick: () => void mutate('/api/dsh-memory/activity' + activityQuery, { operation: 'ignore', id: item.id }), children: t('settings.ignore') }), _jsx("button", { type: "button", className: styles.button, disabled: busy, onClick: () => { if (onEdit)
                                            onEdit(item);
                                        else {
                                            setEditing(item);
                                            setContent(item.content);
                                        } }, children: t('settings.edit') }), _jsx("button", { type: "button", className: styles.danger, disabled: busy, onClick: () => setDeleting(item.id), children: t('settings.delete') })] }), deleting === item.id && _jsxs("div", { className: styles.actions, children: [_jsx("button", { className: styles.button, onClick: () => setDeleting(null), children: t('settings.cancelAction') }), _jsx("button", { className: styles.danger, disabled: busy, onClick: () => void mutate('/api/dsh-memory/items', { operation: 'remove', id: item.id, expectedUpdatedAt: item.updatedAt }), children: t('settings.confirmDelete') })] })] }, item.id)), editing && _jsxs("div", { className: styles.field, children: [_jsx("textarea", { "aria-label": t('settings.content'), value: content, maxLength: 2000, onChange: event => setContent(event.target.value) }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { className: styles.button, onClick: () => setEditing(null), children: t('settings.cancelAction') }), _jsx("button", { className: styles.primary, disabled: busy || !content.trim(), onClick: () => void mutate('/api/dsh-memory/items', { ...editing, operation: 'save', content, expectedUpdatedAt: editing.updatedAt }), children: t('settings.save') })] })] }), _jsxs("div", { className: styles.actions, children: [!!activity?.ignoredCount && _jsxs("button", { type: "button", className: styles.button, disabled: busy, onClick: () => void mutate('/api/dsh-memory/activity' + activityQuery, { operation: 'ignore', id: null }), children: [t('settings.restoreIgnored'), " \u00B7 ", activity.ignoredCount] }), _jsx("button", { type: "button", className: styles.button, disabled: busy, onClick: () => void refresh(), children: t('settings.reload') })] })] })] });
}
export function MemoryHeaderStatus(props) {
    const snapshot = useSyncExternalStore(listener => props.settingsScope.subscribe(listener), () => props.settingsScope.getSnapshot());
    return _jsx("div", { className: styles.headerActivity, children: _jsx(MemoryActivityPanel, { sessionId: props.sessionId, t: props.t, enabled: snapshot.value?.enabled === true }) });
}
