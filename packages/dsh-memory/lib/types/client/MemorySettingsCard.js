import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_MEMORY_CONTENT_LENGTH, MAX_MEMORY_TAGS, } from "../core/schema.js";
import { normalizeMemoryConfig } from "../core/config.js";
import styles from './memory.module.css';
import { MemoryActivityPanel } from "./MemoryActivityPanel.js";
function emptyDraft() {
    return {
        scope: 'global',
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
async function responseJson(response) {
    const value = await response.json();
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('invalid memory response');
    return value;
}
function requestError(value) {
    const code = typeof value.code === 'string' ? value.code : 'request-failed';
    const error = new Error(code);
    error.code = code;
    return error;
}
async function getJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    const value = await responseJson(response);
    if (!response.ok || value.ok !== true)
        throw requestError(value);
    return value;
}
function errorCode(reason) {
    return reason instanceof Error ? reason.code : undefined;
}
function retryableLoadError(reason) {
    return errorCode(reason) === 'scope-unavailable' || errorCode(reason) === 'store-unavailable';
}
async function waitBeforeReload(attempt) {
    await new Promise(resolve => setTimeout(resolve, Math.min(1_000, 150 * 2 ** attempt)));
}
function responseItems(value) {
    if (!value.ok || !Array.isArray(value.items))
        return [];
    return value.items.filter(item => typeof item === 'object' && item !== null);
}
function responsePending(value) {
    if (!value.ok || !Array.isArray(value.items))
        return [];
    return value.items.filter(item => typeof item === 'object' && item !== null);
}
async function postJson(path, body) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body),
    });
    const value = await responseJson(response);
    if (!response.ok || value.ok !== true)
        throw requestError(value);
    return value;
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
    const [enabled, setEnabled] = useState(liveConfig.enabled);
    const [items, setItems] = useState([]);
    const [pending, setPending] = useState([]);
    const [selectedId, setSelectedId] = useState();
    const [draft, setDraft] = useState(emptyDraft);
    const [filter, setFilter] = useState('');
    const [scopeFilter, setScopeFilter] = useState('all');
    const [clearEntries, setClearEntries] = useState(null);
    const [replacements, setReplacements] = useState({});
    const [feedback, setFeedback] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [saved, setSaved] = useState(false);
    const lastRevision = useRef(settingsSnapshot.revision);
    useEffect(() => {
        if (lastRevision.current !== settingsSnapshot.revision) {
            if (saving)
                setError(t('settings.errorConflict'));
            lastRevision.current = settingsSnapshot.revision;
        }
    }, [saving, settingsSnapshot.revision, t]);
    useEffect(() => {
        if (!saving)
            setEnabled(liveConfig.enabled);
    }, [liveConfig.enabled, saving]);
    const load = () => {
        setLoading(true);
        setError(null);
        void (async () => {
            let failure;
            for (let attempt = 0; attempt < 8; attempt += 1) {
                try {
                    const [itemValue, pendingValue] = await Promise.all([
                        getJson('/api/dsh-memory/items?view=manage&refresh=1'),
                        getJson('/api/dsh-memory/pending'),
                    ]);
                    setItems(responseItems(itemValue));
                    setPending(responsePending(pendingValue));
                    setLoading(false);
                    setFeedback(t('settings.refreshed'));
                    return;
                }
                catch (reason) {
                    failure = reason;
                    if (!retryableLoadError(reason) || attempt === 7)
                        break;
                    await waitBeforeReload(attempt);
                }
            }
            setItems([]);
            setPending([]);
            setLoading(false);
            setError(t('settings.errorLoad'));
            void failure;
        })();
    };
    useEffect(() => { load(); }, []);
    const visibleItems = useMemo(() => {
        const needle = filter.trim().toLocaleLowerCase();
        const scoped = items.filter(item => scopeFilter === 'all' || item.scope === scopeFilter);
        if (needle === '')
            return scoped;
        return scoped.filter(item => [item.content, ...item.tags].join(' ').toLocaleLowerCase().includes(needle));
    }, [filter, items, scopeFilter]);
    const select = (item) => {
        setEditorOpen(true);
        setCleanDraft(JSON.stringify(draftOf(item)));
        setSelectedId(item.id);
        setDraft(draftOf(item));
        setSaved(false);
        setError(null);
    };
    const create = () => {
        setEditorOpen(true);
        setCleanDraft(JSON.stringify(emptyDraft()));
        setSelectedId(undefined);
        setDraft(emptyDraft());
        setSaved(false);
        setError(null);
    };
    const saveConfig = (next) => {
        setEnabled(next);
        setSaved(false);
        void settingsScope.set('enabled', next).then(() => setSaved(true), () => setError(t('settings.errorSave')));
    };
    const save = () => {
        const body = itemFromDraft(draft);
        if (body === undefined || !settingsSnapshot.writable || saving) {
            setError(t('settings.errorInvalid'));
            return;
        }
        setSaving(true);
        setError(null);
        void postJson('/api/dsh-memory/items', body).then(value => {
            const item = value.item;
            setSelectedId(item.id);
            setDraft(draftOf(item));
            setCleanDraft(JSON.stringify(draftOf(item)));
            setFeedback(t('settings.savedTo') + ' ' + t(('settings.' + item.scope)));
            setSaved(true);
            setSaving(false);
            load();
        }, reason => {
            const code = reason instanceof Error ? reason.code : undefined;
            setError(errorMessage(code, t));
            setSaving(false);
        });
    };
    const remove = () => {
        if (selectedId === undefined || saving)
            return;
        setSaving(true);
        void postJson('/api/dsh-memory/items', { operation: 'remove', id: selectedId, expectedUpdatedAt: draft.expectedUpdatedAt }).then(() => {
            setSelectedId(undefined);
            setDraft(emptyDraft());
            setCleanDraft(JSON.stringify(emptyDraft()));
            setEditorOpen(!dock);
            setSaving(false);
            load();
        }, reason => {
            setError(errorMessage(reason instanceof Error ? reason.code : undefined, t));
            setSaving(false);
        });
    };
    const clear = () => {
        if (saving || !clearEntries)
            return;
        setSaving(true);
        void postJson('/api/dsh-memory/items', { operation: 'clear', entries: clearEntries.map(item => ({ id: item.id, updatedAt: item.updatedAt })) }).then(() => {
            setClearEntries(null);
            setSelectedId(undefined);
            setDraft(emptyDraft());
            setCleanDraft(JSON.stringify(emptyDraft()));
            setEditorOpen(!dock);
            setSaving(false);
            load();
        }, reason => {
            setError(errorMessage(reason instanceof Error ? reason.code : undefined, t));
            setSaving(false);
        });
    };
    const confirm = (entry) => {
        if (saving)
            return;
        setSaving(true);
        const replacement = items.find(item => item.id === replacements[entry.id]);
        void postJson('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'confirm', ...(replacement ? { replaceId: replacement.id, expectedUpdatedAt: replacement.updatedAt } : {}) }).then(() => {
            setSaving(false);
            load();
        }, reason => {
            setError(errorMessage(reason instanceof Error ? reason.code : undefined, t));
            setSaving(false);
        });
    };
    const reject = (entry) => {
        if (saving)
            return;
        setSaving(true);
        void postJson('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'cancel' }).then(() => {
            setSaving(false);
            load();
        }, reason => {
            setError(errorMessage(reason instanceof Error ? reason.code : undefined, t));
            setSaving(false);
        });
    };
    return (_jsxs("section", { className: styles.card, "data-memory-card": "true", "data-dock-owner": "memory", "data-dock-dirty": editorOpen && JSON.stringify(draft) !== cleanDraft, children: [_jsxs("header", { className: styles.header, children: [_jsxs("div", { children: [_jsx("h3", { className: styles.title, children: t('settings.title') }), _jsx("p", { className: styles.description, children: t('settings.description') })] }), _jsx("span", { className: saved ? styles.badgeSaved : styles.badge, children: saving ? t('settings.saving') : saved ? t('settings.saved') : editorOpen && JSON.stringify(draft) !== cleanDraft ? t('settings.unsaved') : t('settings.ready') })] }), saved && selectedId && _jsxs("p", { className: styles.muted, role: "status", children: [t('settings.savedTo'), " ", t(('settings.' + draft.scope)), draft.workspaceId || draft.sessionId ? ' · ' + (draft.workspaceId || draft.sessionId) : ''] }), !settingsSnapshot.writable && _jsx("p", { className: styles.notice, role: "status", children: t('settings.readonly') }), settingsSnapshot.status === 'loading' && _jsx("p", { className: styles.muted, role: "status", children: t('settings.loading') }), error && _jsx("p", { className: styles.error, role: "alert", children: error }), _jsxs("div", { className: styles.enableRow, children: [_jsxs("label", { className: styles.toggle, children: [_jsx("input", { type: "checkbox", checked: enabled, disabled: !settingsSnapshot.writable || saving, onChange: event => saveConfig(event.target.checked) }), t('settings.enabled')] }), _jsx("p", { className: styles.muted, children: t('settings.ownerNotice') })] }), dock && _jsxs("div", { className: styles.tabs, role: "tablist", "aria-label": t('settings.title'), onKeyDown: event => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                        return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? 'items' : event.key === 'End' ? 'pending' : memoryTab === 'items' ? 'pending' : 'items';
                    setMemoryTab(next);
                    event.currentTarget.querySelectorAll('button')[next === 'items' ? 0 : 1]?.focus();
                }, children: [_jsxs("button", { type: "button", role: "tab", tabIndex: memoryTab === 'items' ? 0 : -1, "aria-selected": memoryTab === 'items', onClick: () => setMemoryTab('items'), children: [t('settings.items'), " \u00B7 ", items.length] }), _jsxs("button", { type: "button", role: "tab", tabIndex: memoryTab === 'pending' ? 0 : -1, "aria-selected": memoryTab === 'pending', onClick: () => setMemoryTab('pending'), children: [t('settings.pending'), " \u00B7 ", pending.length] })] }), _jsxs("section", { className: styles.section, hidden: dock && memoryTab !== 'items', children: [_jsxs("header", { className: styles.sectionHeader, children: [_jsx("strong", { children: t('settings.items') }), _jsxs("span", { children: [visibleItems.length, " ", t('settings.count')] }), feedback && _jsx("small", { className: styles.muted, role: "status", children: feedback }), _jsx("button", { type: "button", className: styles.button, disabled: saving, onClick: load, children: t('settings.reload') })] }), _jsxs("label", { className: styles.scopeFilter, children: [_jsx("span", { children: t('settings.scopeFilter') }), _jsx("select", { "aria-label": t('settings.scopeFilter'), value: scopeFilter, onChange: event => { setScopeFilter(event.target.value); setClearEntries(null); }, children: ['all', 'global', 'workspace', 'session'].map(scope => _jsxs("option", { value: scope, children: [t(('settings.' + scope)), " \u00B7 ", scope === 'all' ? items.length : items.filter(item => item.scope === scope).length] }, scope)) })] }), _jsxs("div", { className: styles.filterRow, children: [_jsx("input", { value: filter, onChange: event => { setFilter(event.target.value); setClearEntries(null); }, placeholder: t('settings.searchPlaceholder'), "aria-label": t('settings.search') }), _jsx("button", { type: "button", className: styles.button, disabled: saving || !settingsSnapshot.writable, onClick: create, children: t('settings.new') }), _jsx("button", { type: "button", className: styles.danger, disabled: saving || visibleItems.length === 0 || !settingsSnapshot.writable, onClick: () => setClearEntries([...visibleItems]), children: t('settings.clearVisible') })] }), clearEntries && _jsxs("div", { className: styles.notice, role: "alert", children: [_jsxs("p", { children: [t('settings.clearConfirm'), " ", clearEntries.length, " ", t('settings.count')] }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.button, onClick: () => setClearEntries(null), children: t('settings.cancelAction') }), _jsx("button", { type: "button", className: styles.danger, disabled: saving, onClick: clear, children: t('settings.confirmDelete') })] })] }), loading && _jsx("p", { className: styles.muted, children: t('settings.loading') }), !loading && visibleItems.length === 0 && _jsx("p", { className: styles.empty, children: t('settings.noItems') }), _jsx("div", { className: styles.itemList, role: "list", children: visibleItems.map(item => (_jsxs("button", { type: "button", role: "listitem", className: item.id === selectedId ? styles.itemSelected : styles.item, onClick: () => select(item), children: [_jsx("span", { className: styles.itemContent, children: item.content }), _jsxs("span", { className: styles.itemMeta, children: [item.scope === 'global' ? t('settings.global') : item.scope === 'workspace' ? t('settings.workspace') : t('settings.session'), item.workspaceId || item.sessionId ? ' · ' + (item.workspaceId ?? item.sessionId) : '', item.pinned ? ` · ${t('settings.pinned')}` : '', item.expiresAt !== undefined && item.expiresAt <= Date.now() ? ' · ' + t('settings.expired') : ''] })] }, item.id))) })] }), _jsxs("section", { className: styles.section, hidden: dock && memoryTab !== 'pending', children: [_jsxs("header", { className: styles.sectionHeader, children: [_jsx("strong", { children: t('settings.pending') }), _jsxs("span", { children: [pending.length, " ", t('settings.count')] })] }), pending.length === 0 && _jsx("p", { className: styles.muted, children: t('settings.noPending') }), _jsx("p", { className: styles.muted, children: t('settings.pendingHint') }), _jsx("div", { className: styles.pendingList, children: pending.map(entry => (_jsxs("article", { className: styles.pendingItem, children: [_jsx("p", { className: styles.pendingContent, children: entry.item.content }), _jsxs("p", { className: styles.notice, children: [t('settings.suggestion'), " ", t(('settings.' + entry.item.scope)), " \u00B7 ", new Date(entry.createdAt).toLocaleString()] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.replacement') }), _jsxs("select", { value: replacements[entry.id] ?? '', onChange: event => setReplacements(current => ({ ...current, [entry.id]: event.target.value })), children: [_jsx("option", { value: "", children: t('settings.newMemory') }), items.filter(item => item.scope === entry.item.scope && item.workspaceId === entry.item.workspaceId && item.sessionId === entry.item.sessionId).map(item => _jsxs("option", { value: item.id, children: [t('settings.replaceMemory'), ": ", item.content.slice(0, 80)] }, item.id))] })] }), replacements[entry.id] && _jsx("blockquote", { children: items.find(item => item.id === replacements[entry.id])?.content }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.primary, disabled: saving || !settingsSnapshot.writable, onClick: () => confirm(entry), children: t('settings.confirm') }), _jsx("button", { type: "button", className: styles.button, disabled: saving || !settingsSnapshot.writable, onClick: () => reject(entry), children: t('settings.reject') })] })] }, entry.id))) })] }), _jsxs("section", { className: styles.editor, hidden: dock && !editorOpen, children: [selectedId && _jsxs("p", { className: styles.muted, children: [t('settings.updated'), " ", new Date(draft.expectedUpdatedAt ?? 0).toLocaleString()] }), _jsx("header", { className: styles.sectionHeader, children: _jsx("strong", { children: selectedId === undefined ? t('settings.newMemory') : t('settings.edit') }) }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.scope') }), _jsxs("select", { value: draft.scope, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, scope: event.target.value })), children: [_jsx("option", { value: "global", children: t('settings.global') }), _jsx("option", { value: "workspace", children: t('settings.workspace') }), _jsx("option", { value: "session", children: t('settings.session') })] })] }), draft.scope === 'workspace' && _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.workspaceId') }), _jsx("input", { value: draft.workspaceId, maxLength: 128, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, workspaceId: event.target.value })) })] }), draft.scope === 'session' && _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.sessionId') }), _jsx("input", { value: draft.sessionId, maxLength: 128, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, sessionId: event.target.value })) })] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.content') }), _jsx("textarea", { value: draft.content, maxLength: MAX_MEMORY_CONTENT_LENGTH, placeholder: t('settings.contentPlaceholder'), disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, content: event.target.value })) }), _jsxs("span", { className: styles.counter, children: [draft.content.length, " / ", MAX_MEMORY_CONTENT_LENGTH] })] }), _jsxs("details", { className: styles.details, "data-memory-advanced": "true", children: [_jsx("summary", { children: t('settings.advanced') }), _jsx("p", { className: styles.muted, children: t('settings.targetHint') }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.tags') }), _jsx("input", { value: draft.tags, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, tags: event.target.value })) })] }), _jsxs("label", { className: styles.toggle, children: [_jsx("input", { type: "checkbox", checked: draft.pinned, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, pinned: event.target.checked })) }), t('settings.pinned')] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.expiresAt') }), _jsx("input", { value: draft.expiresAt, inputMode: "numeric", disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, expiresAt: event.target.value })) })] })] }), _jsxs("footer", { className: styles.actions, "data-dock-save-bar": dock || undefined, children: [selectedId !== undefined && _jsx("button", { type: "button", className: styles.danger, disabled: saving || !settingsSnapshot.writable, onClick: remove, children: t('settings.delete') }), _jsx("button", { type: "button", className: styles.button, disabled: saving, onClick: () => { setSelectedId(undefined); setDraft(emptyDraft()); setCleanDraft(JSON.stringify(emptyDraft())); setEditorOpen(!dock); }, children: t('settings.cancel') }), _jsx("button", { type: "button", className: styles.primary, "data-dock-save": "true", disabled: saving || !settingsSnapshot.writable, onClick: save, children: saving ? t('settings.saving') : t('settings.save') })] })] }), _jsx(MemoryActivityPanel, { t: t, enabled: enabled, onEdit: select })] }));
}
