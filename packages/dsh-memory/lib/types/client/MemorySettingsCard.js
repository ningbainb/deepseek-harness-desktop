import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_MEMORY_CONTENT_LENGTH, MAX_MEMORY_TAGS, } from "../core/schema.js";
import { normalizeMemoryConfig } from "../core/config.js";
import styles from './memory.module.css';
import { MemoryActivityPanel } from "./MemoryActivityPanel.js";
import { filterMemoryItems, isMemoryItem, memoryRequestErrorCode, postMemoryJson, readMemoryCatalog } from "./settings-data.js";
const emptyCatalog = { items: [], pending: [] };
function emptyDraft(scope = 'global') {
    return {
        scope,
        workspaceId: '',
        sessionId: '',
        content: '',
        tags: '',
        pinned: false,
        expiresAt: '',
    };
}
function draftOf(item) {
    return {
        id: item.id,
        expectedUpdatedAt: item.updatedAt,
        scope: item.scope,
        workspaceId: item.workspaceId ?? '',
        sessionId: item.sessionId ?? '',
        content: item.content,
        tags: item.tags.join(', '),
        pinned: item.pinned,
        expiresAt: item.expiresAt === undefined ? '' : String(item.expiresAt),
    };
}
function itemFromDraft(draft) {
    const content = draft.content.trim();
    if (content === '' || content.length > MAX_MEMORY_CONTENT_LENGTH)
        return undefined;
    const tags = draft.tags.split(',').map(tag => tag.trim()).filter(Boolean);
    if (tags.length > MAX_MEMORY_TAGS)
        return undefined;
    const body = {
        operation: 'save',
        ...(draft.expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt: draft.expectedUpdatedAt }),
        ...(draft.id === undefined ? {} : { id: draft.id }),
        scope: draft.scope,
        content,
        tags,
        pinned: draft.pinned,
    };
    if (draft.scope === 'workspace') {
        if (draft.workspaceId.trim() === '')
            return undefined;
        body.workspaceId = draft.workspaceId.trim();
    }
    else if (draft.scope === 'session') {
        if (draft.sessionId.trim() === '')
            return undefined;
        body.sessionId = draft.sessionId.trim();
    }
    if (draft.expiresAt.trim() !== '') {
        const expiresAt = Number(draft.expiresAt.trim());
        if (!Number.isSafeInteger(expiresAt) || expiresAt < 0)
            return undefined;
        body.expiresAt = expiresAt;
    }
    return body;
}
function errorMessage(code, t) {
    if (code === 'sensitive')
        return t('settings.errorSensitive');
    if (code === 'invalid' || code === 'invalid-target')
        return t('settings.errorInvalid');
    if (code === 'store-unavailable')
        return t('settings.errorStore');
    if (code === 'duplicate')
        return t('settings.duplicate');
    if (code === 'conflict')
        return t('settings.errorConflict');
    return t('settings.errorSave');
}
function retryableLoadError(reason) {
    const code = memoryRequestErrorCode(reason);
    return code === 'scope-unavailable' || code === 'store-unavailable';
}
async function waitBeforeReload(attempt) {
    await new Promise(resolve => setTimeout(resolve, Math.min(1_000, 150 * 2 ** attempt)));
}
export function MemorySettingsCard(props) {
    const { config, settingsScope, t } = props;
    const settingsSnapshot = useSyncExternalStore(listener => settingsScope.subscribe(listener), () => settingsScope.getSnapshot(), () => settingsScope.getSnapshot());
    const liveConfig = useMemo(() => {
        try {
            return normalizeMemoryConfig(settingsSnapshot.value ?? config);
        }
        catch {
            return config;
        }
    }, [config, settingsSnapshot.value]);
    const dock = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('desktop-dock-setting');
    const [editorOpen, setEditorOpen] = useState(!dock);
    const [memoryTab, setMemoryTab] = useState('items');
    const [cleanDraft, setCleanDraft] = useState(() => JSON.stringify(emptyDraft()));
    const [catalog, setCatalog] = useState({ status: 'loading' });
    const [selectedId, setSelectedId] = useState();
    const [draft, setDraft] = useState(emptyDraft);
    const [filter, setFilter] = useState('');
    const [scopeFilter, setScopeFilter] = useState('all');
    const [clearEntries, setClearEntries] = useState(null);
    const [deleteRequested, setDeleteRequested] = useState(false);
    const [replacements, setReplacements] = useState({});
    const [feedback, setFeedback] = useState();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);
    const pendingRead = useRef();
    const mounted = useRef(false);
    const content = useRef(null);
    const [focusRequest, setFocusRequest] = useState(0);
    const panelId = useId();
    const ready = catalog.status === 'ready';
    const { items, pending } = ready ? catalog.value : emptyCatalog;
    const mayWrite = ready && settingsSnapshot.writable && !saving;
    const editorVisible = ready && editorOpen && (!dock || memoryTab === 'items');
    const dirty = editorOpen && JSON.stringify(draft) !== cleanDraft;
    useEffect(() => {
        if (!focusRequest)
            return;
        content.current?.focus();
    }, [focusRequest]);
    const load = useCallback((notice) => {
        if (!mounted.current)
            return;
        pendingRead.current?.abort();
        const read = new AbortController();
        pendingRead.current = read;
        const { signal } = read;
        setCatalog({ status: 'loading' });
        setClearEntries(null);
        setDeleteRequested(false);
        setReplacements({});
        setFeedback(undefined);
        setError(null);
        void (async () => {
            for (let attempt = 0; attempt < 8 && !signal.aborted; attempt += 1) {
                try {
                    const value = await readMemoryCatalog(signal);
                    if (signal.aborted)
                        return;
                    setCatalog({ status: 'ready', value });
                    setFeedback(notice);
                    return;
                }
                catch (reason) {
                    if (signal.aborted)
                        return;
                    if (!retryableLoadError(reason) || attempt === 7) {
                        setCatalog({ status: 'error' });
                        return;
                    }
                    await waitBeforeReload(attempt);
                }
            }
        })();
    }, []);
    useEffect(() => {
        mounted.current = true;
        load();
        return () => {
            mounted.current = false;
            pendingRead.current?.abort();
        };
    }, [load]);
    const filtering = scopeFilter !== 'all' || filter.trim() !== '';
    const visibleItems = useMemo(() => filterMemoryItems(items, scopeFilter, filter), [filter, items, scopeFilter]);
    const scopeCounts = useMemo(() => items.reduce((counts, item) => {
        counts[item.scope] += 1;
        return counts;
    }, { global: 0, workspace: 0, session: 0 }), [items]);
    const select = (item) => {
        if (!ready || saving)
            return;
        setMemoryTab('items');
        setEditorOpen(true);
        const entry = draftOf(item);
        setCleanDraft(JSON.stringify(entry));
        setSelectedId(item.id);
        setDraft(entry);
        setDeleteRequested(false);
        setSaved(false);
        setError(null);
        setFocusRequest(current => current + 1);
    };
    const create = () => {
        const entry = emptyDraft(scopeFilter === 'all' ? 'global' : scopeFilter);
        setEditorOpen(true);
        setCleanDraft(JSON.stringify(entry));
        setSelectedId(undefined);
        setDraft(entry);
        setDeleteRequested(false);
        setSaved(false);
        setError(null);
        setFocusRequest(current => current + 1);
    };
    const saveConfig = (next) => {
        if (saving || !settingsSnapshot.writable)
            return;
        setSaving(true);
        setSaved(false);
        setError(null);
        void (async () => {
            try {
                if (!await settingsScope.set('enabled', next))
                    throw new Error('memory setting not accepted');
                if (mounted.current)
                    setSaved(true);
            }
            catch {
                if (mounted.current)
                    setError(t('settings.errorSave'));
            }
            finally {
                if (mounted.current)
                    setSaving(false);
            }
        })();
    };
    const mutate = (path, body, onSuccess, notice) => {
        if (!mayWrite)
            return;
        setSaving(true);
        setSaved(false);
        setError(null);
        void (async () => {
            try {
                const value = await postMemoryJson(path, body);
                if (!mounted.current)
                    return;
                onSuccess(value);
                load(notice);
            }
            catch (reason) {
                if (mounted.current)
                    setError(errorMessage(memoryRequestErrorCode(reason), t));
            }
            finally {
                if (mounted.current)
                    setSaving(false);
            }
        })();
    };
    const save = () => {
        const body = itemFromDraft(draft);
        if (body === undefined) {
            setError(t('settings.errorInvalid'));
            return;
        }
        mutate('/api/dsh-memory/items', body, value => {
            if (!isMemoryItem(value.item))
                throw new Error('invalid memory response');
            const next = draftOf(value.item);
            setSelectedId(value.item.id);
            setDraft(next);
            setCleanDraft(JSON.stringify(next));
            setSaved(true);
        });
    };
    const discardDraft = () => {
        setSelectedId(undefined);
        setDraft(emptyDraft());
        setCleanDraft(JSON.stringify(emptyDraft()));
        setDeleteRequested(false);
        setEditorOpen(!dock);
    };
    const remove = () => {
        if (!selectedId || !deleteRequested)
            return;
        mutate('/api/dsh-memory/items', { operation: 'remove', id: selectedId, expectedUpdatedAt: draft.expectedUpdatedAt }, discardDraft, 'settings.removed');
    };
    const clear = () => {
        if (!clearEntries)
            return;
        mutate('/api/dsh-memory/items', { operation: 'clear', entries: clearEntries.map(item => ({ id: item.id, updatedAt: item.updatedAt })) }, discardDraft, 'settings.removed');
    };
    const confirm = (entry) => {
        const replacement = items.find(item => item.id === replacements[entry.id]);
        mutate('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'confirm', ...(replacement ? { replaceId: replacement.id, expectedUpdatedAt: replacement.updatedAt } : {}) }, () => { }, 'settings.confirmed');
    };
    const reject = (entry) => {
        mutate('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'cancel' }, () => { }, 'settings.dismissed');
    };
    const requestReload = () => load('settings.refreshed');
    const activityStatus = saving ? 'settings.saving' : dirty ? 'settings.unsaved' : saved ? 'settings.saved' : undefined;
    const readStatus = catalog.status === 'loading'
        ? _jsx("p", { className: styles.muted, role: "status", children: t('settings.loading') })
        : catalog.status === 'error'
            ? _jsx("p", { className: styles.error, role: "alert", children: t('settings.errorLoad') })
            : null;
    return (_jsxs("section", { className: styles.card, "data-memory-card": "true", "data-dock-owner": "memory", "data-dock-dirty": dirty, children: [_jsxs("header", { className: styles.header, children: [_jsxs("div", { children: [_jsx("h3", { className: styles.title, children: t('settings.title') }), _jsx("p", { className: styles.description, children: t('settings.description') })] }), activityStatus && _jsx("span", { className: activityStatus === 'settings.saved' ? styles.badgeSaved : styles.badge, role: "status", children: t(activityStatus) })] }), saved && !dirty && selectedId && _jsxs("p", { className: styles.muted, children: [t('settings.savedTo'), " ", t(`settings.${draft.scope}`)] }), feedback && _jsx("p", { className: styles.muted, role: "status", children: t(feedback) }), settingsSnapshot.status !== 'loading' && !settingsSnapshot.writable && _jsx("p", { className: styles.notice, role: "status", children: t('settings.readonly') }), ready && settingsSnapshot.status === 'loading' && _jsx("p", { className: styles.muted, role: "status", children: t('settings.loading') }), error && _jsx("p", { className: styles.error, role: "alert", children: error }), _jsxs("div", { className: styles.enableRow, children: [_jsxs("label", { className: styles.toggle, children: [_jsx("input", { type: "checkbox", checked: liveConfig.enabled, disabled: !settingsSnapshot.writable || saving, onChange: event => saveConfig(event.target.checked) }), t('settings.enabled')] }), _jsx("p", { className: styles.muted, children: t('settings.ownerNotice') })] }), dock && _jsxs("div", { className: styles.tabs, role: "tablist", "aria-label": t('settings.title'), onKeyDown: event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                        return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? 'items' : event.key === 'End' ? 'pending' : memoryTab === 'items' ? 'pending' : 'items';
                    setMemoryTab(next);
                    event.currentTarget.querySelectorAll('button')[next === 'items' ? 0 : 1]?.focus();
                }, children: [_jsxs("button", { type: "button", id: panelId + '-items-tab', role: "tab", "aria-controls": panelId + '-items', tabIndex: memoryTab === 'items' ? 0 : -1, "aria-selected": memoryTab === 'items', onClick: () => setMemoryTab('items'), children: [t('settings.items'), ready && ` · ${items.length}`] }), _jsxs("button", { type: "button", id: panelId + '-pending-tab', role: "tab", "aria-controls": panelId + '-pending', tabIndex: memoryTab === 'pending' ? 0 : -1, "aria-selected": memoryTab === 'pending', onClick: () => setMemoryTab('pending'), children: [t('settings.pending'), ready && ` · ${pending.length}`] })] }), _jsxs("section", { className: styles.section, id: panelId + '-items', role: dock ? 'tabpanel' : undefined, "aria-labelledby": dock ? panelId + '-items-tab' : undefined, hidden: dock && memoryTab !== 'items', children: [_jsxs("header", { className: styles.sectionHeader, children: [!dock && _jsx("strong", { children: t('settings.items') }), ready && _jsxs("span", { role: "status", children: [filtering ? `${visibleItems.length} / ${items.length}` : items.length, " ", t('settings.count')] }), _jsx("button", { type: "button", className: styles.button, disabled: saving || catalog.status === 'loading', onClick: requestReload, children: t('settings.reload') }), _jsx("button", { type: "button", className: styles.primary, disabled: !mayWrite, onClick: create, children: t('settings.new') })] }), readStatus, ready && _jsxs("div", { className: styles.filterRow, children: [_jsx("input", { type: "search", value: filter, onChange: event => { setFilter(event.target.value); setClearEntries(null); }, placeholder: t('settings.searchPlaceholder'), "aria-label": t('settings.search') }), _jsx("select", { className: styles.scopeFilter, "aria-label": t('settings.scopeFilter'), value: scopeFilter, onChange: event => { setScopeFilter(event.target.value); setClearEntries(null); }, children: ['all', 'global', 'workspace', 'session'].map(scope => _jsxs("option", { value: scope, children: [t(`settings.${scope}`), " \u00B7 ", scope === 'all' ? items.length : scopeCounts[scope]] }, scope)) }), filtering && _jsx("button", { type: "button", className: styles.button, onClick: () => { setFilter(''); setScopeFilter('all'); setClearEntries(null); }, children: t('settings.resetFilter') })] }), ready && visibleItems.length === 0 && _jsx("p", { className: styles.empty, children: t(items.length === 0 ? 'settings.noItems' : 'settings.noResults') }), visibleItems.length > 0 && _jsx("ul", { className: styles.itemList, "aria-label": t('settings.items'), children: visibleItems.map(item => (_jsx("li", { children: _jsxs("button", { type: "button", disabled: saving, "aria-pressed": item.id === selectedId, className: item.id === selectedId ? styles.itemSelected : styles.item, onClick: () => select(item), children: [_jsx("span", { className: styles.itemContent, children: item.content }), _jsx("span", { className: styles.itemMeta, children: [t(`settings.${item.scope}`), item.workspaceId ?? item.sessionId, item.pinned ? t('settings.pinned') : undefined, item.source === 'confirmed-suggestion' ? t('settings.sourceSuggested') : undefined, item.expiresAt !== undefined && item.expiresAt <= Date.now() ? t('settings.expired') : undefined, ...item.tags].filter(Boolean).join(' · ') })] }) }, item.id))) }), ready && _jsx("div", { className: styles.actions, children: _jsx("button", { type: "button", className: styles.danger, disabled: !mayWrite || visibleItems.length === 0, onClick: () => { setDeleteRequested(false); setClearEntries([...visibleItems]); }, children: t('settings.clearVisible') }) }), clearEntries && _jsxs("div", { className: styles.notice, role: "alert", children: [_jsxs("p", { children: [t('settings.clearConfirm'), " ", clearEntries.length, " ", t('settings.count')] }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.button, onClick: () => setClearEntries(null), children: t('settings.cancelAction') }), _jsx("button", { type: "button", className: styles.danger, disabled: !mayWrite, onClick: clear, children: t('settings.confirmDelete') })] })] })] }), _jsxs("section", { className: styles.section, id: panelId + '-pending', role: dock ? 'tabpanel' : undefined, "aria-labelledby": dock ? panelId + '-pending-tab' : undefined, hidden: dock && memoryTab !== 'pending', children: [_jsxs("header", { className: styles.sectionHeader, children: [!dock && _jsx("strong", { children: t('settings.pending') }), !dock && ready && _jsxs("span", { children: [pending.length, " ", t('settings.count')] }), dock && _jsx("button", { type: "button", className: styles.button, disabled: saving || catalog.status === 'loading', onClick: requestReload, children: t('settings.reload') })] }), dock && readStatus, ready && pending.length === 0 && _jsx("p", { className: styles.empty, children: t('settings.noPending') }), ready && pending.length > 0 && _jsx("p", { className: styles.muted, children: t('settings.pendingHint') }), _jsx("div", { className: styles.pendingList, children: pending.map(entry => (_jsxs("article", { className: styles.pendingItem, children: [_jsx("p", { className: styles.pendingContent, children: entry.item.content }), _jsxs("p", { className: styles.notice, children: [t('settings.suggestion'), " ", t(('settings.' + entry.item.scope)), " \u00B7 ", new Date(entry.createdAt).toLocaleString()] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.replacement') }), _jsxs("select", { value: replacements[entry.id] ?? '', onChange: event => setReplacements(current => ({ ...current, [entry.id]: event.target.value })), children: [_jsx("option", { value: "", children: t('settings.newMemory') }), items.filter(item => item.scope === entry.item.scope && item.workspaceId === entry.item.workspaceId && item.sessionId === entry.item.sessionId).map(item => _jsxs("option", { value: item.id, children: [t('settings.replaceMemory'), ": ", item.content.slice(0, 80)] }, item.id))] })] }), replacements[entry.id] && _jsx("blockquote", { children: items.find(item => item.id === replacements[entry.id])?.content }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.primary, disabled: !mayWrite, onClick: () => confirm(entry), children: t('settings.confirm') }), _jsx("button", { type: "button", className: styles.button, disabled: !mayWrite, onClick: () => reject(entry), children: t('settings.reject') })] })] }, entry.id))) })] }), _jsxs("section", { className: styles.editor, hidden: !editorVisible, children: [selectedId && _jsxs("p", { className: styles.muted, children: [t('settings.updated'), " ", new Date(draft.expectedUpdatedAt ?? 0).toLocaleString()] }), _jsx("header", { className: styles.sectionHeader, children: _jsx("strong", { children: selectedId === undefined ? t('settings.newMemory') : t('settings.edit') }) }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.scope') }), _jsxs("select", { value: draft.scope, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, scope: event.target.value })), children: [_jsx("option", { value: "global", children: t('settings.global') }), _jsx("option", { value: "workspace", children: t('settings.workspace') }), _jsx("option", { value: "session", children: t('settings.session') })] })] }), draft.scope === 'workspace' && _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.workspaceId') }), _jsx("input", { value: draft.workspaceId, maxLength: 128, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, workspaceId: event.target.value })) })] }), draft.scope === 'session' && _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.sessionId') }), _jsx("input", { value: draft.sessionId, maxLength: 128, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, sessionId: event.target.value })) })] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.content') }), _jsx("textarea", { ref: content, value: draft.content, maxLength: MAX_MEMORY_CONTENT_LENGTH, placeholder: t('settings.contentPlaceholder'), disabled: !mayWrite, onChange: event => setDraft(current => ({ ...current, content: event.target.value })) }), _jsxs("span", { className: styles.counter, children: [draft.content.length, " / ", MAX_MEMORY_CONTENT_LENGTH] })] }), _jsxs("details", { className: styles.details, "data-memory-advanced": "true", children: [_jsx("summary", { children: t('settings.advanced') }), _jsx("p", { className: styles.muted, children: t('settings.targetHint') }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.tags') }), _jsx("input", { value: draft.tags, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, tags: event.target.value })) })] }), _jsxs("label", { className: styles.toggle, children: [_jsx("input", { type: "checkbox", checked: draft.pinned, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, pinned: event.target.checked })) }), t('settings.pinned')] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.expiresAt') }), _jsx("input", { value: draft.expiresAt, inputMode: "numeric", disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, expiresAt: event.target.value })) })] })] }), deleteRequested && _jsxs("div", { className: styles.notice, role: "alert", children: [_jsx("p", { children: t('settings.deleteConfirm') }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.button, disabled: saving, onClick: () => setDeleteRequested(false), children: t('settings.cancelAction') }), _jsx("button", { type: "button", className: styles.danger, disabled: !mayWrite, onClick: remove, children: t('settings.confirmDelete') })] })] }), _jsxs("footer", { className: styles.actions, "data-dock-save-bar": dock || undefined, children: [selectedId !== undefined && _jsx("button", { type: "button", className: styles.danger, disabled: !mayWrite || deleteRequested, onClick: () => { setClearEntries(null); setDeleteRequested(true); }, children: t('settings.delete') }), _jsx("button", { type: "button", className: styles.button, disabled: saving, onClick: discardDraft, children: t('settings.cancel') }), _jsx("button", { type: "button", className: styles.primary, "data-dock-save": "true", disabled: !mayWrite, onClick: save, children: saving ? t('settings.saving') : t('settings.save') })] })] }), _jsx(MemoryActivityPanel, { t: t, enabled: liveConfig.enabled, onEdit: select })] }));
}
