import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { MAX_MEMORY_CONTENT_LENGTH, MAX_MEMORY_TAGS, } from "../core/schema.js";
import { normalizeMemoryConfig } from "../core/config.js";
import styles from './memory.module.css';
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
    const [enabled, setEnabled] = useState(liveConfig.enabled);
    const [items, setItems] = useState([]);
    const [pending, setPending] = useState([]);
    const [selectedId, setSelectedId] = useState();
    const [draft, setDraft] = useState(emptyDraft);
    const [filter, setFilter] = useState('');
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
                        getJson('/api/dsh-memory/items'),
                        getJson('/api/dsh-memory/pending'),
                    ]);
                    setItems(responseItems(itemValue));
                    setPending(responsePending(pendingValue));
                    setLoading(false);
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
        if (needle === '')
            return items;
        return items.filter(item => [item.content, ...item.tags].join(' ').toLocaleLowerCase().includes(needle));
    }, [filter, items]);
    const select = (item) => {
        setSelectedId(item.id);
        setDraft(draftOf(item));
        setSaved(false);
        setError(null);
    };
    const create = () => {
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
        void postJson('/api/dsh-memory/items', body).then(() => {
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
        void postJson('/api/dsh-memory/items', { operation: 'remove', id: selectedId }).then(() => {
            setSelectedId(undefined);
            setDraft(emptyDraft());
            setSaving(false);
            load();
        }, reason => {
            setError(errorMessage(reason instanceof Error ? reason.code : undefined, t));
            setSaving(false);
        });
    };
    const clear = () => {
        if (saving)
            return;
        setSaving(true);
        void postJson('/api/dsh-memory/items', { operation: 'clear' }).then(() => {
            setSelectedId(undefined);
            setDraft(emptyDraft());
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
        void postJson('/api/dsh-memory/pending/' + encodeURIComponent(entry.id), { operation: 'confirm' }).then(() => {
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
    return (_jsxs("section", { className: styles.card, "data-memory-card": "true", children: [_jsxs("header", { className: styles.header, children: [_jsxs("div", { children: [_jsx("h3", { className: styles.title, children: t('settings.title') }), _jsx("p", { className: styles.description, children: t('settings.description') })] }), _jsx("span", { className: saved ? styles.badgeSaved : styles.badge, children: saved ? t('settings.saved') : t('settings.unsaved') })] }), _jsx("p", { className: styles.notice, children: t('settings.ownerNotice') }), !settingsSnapshot.writable && _jsx("p", { className: styles.notice, role: "status", children: t('settings.readonly') }), settingsSnapshot.status === 'loading' && _jsx("p", { className: styles.muted, role: "status", children: t('settings.loading') }), error && _jsx("p", { className: styles.error, role: "alert", children: error }), _jsxs("label", { className: styles.toggle, children: [_jsx("input", { type: "checkbox", checked: enabled, disabled: !settingsSnapshot.writable || saving, onChange: event => saveConfig(event.target.checked) }), t('settings.enabled')] }), _jsxs("section", { className: styles.section, children: [_jsxs("header", { className: styles.sectionHeader, children: [_jsx("strong", { children: t('settings.items') }), _jsxs("span", { children: [visibleItems.length, " ", t('settings.count')] }), _jsx("button", { type: "button", className: styles.button, disabled: saving, onClick: load, children: t('settings.reload') })] }), _jsxs("div", { className: styles.filterRow, children: [_jsx("input", { value: filter, onChange: event => setFilter(event.target.value), placeholder: t('settings.searchPlaceholder'), "aria-label": t('settings.search') }), _jsx("button", { type: "button", className: styles.button, disabled: saving || !settingsSnapshot.writable, onClick: create, children: t('settings.new') }), _jsx("button", { type: "button", className: styles.danger, disabled: saving || items.length === 0 || !settingsSnapshot.writable, onClick: clear, children: t('settings.clear') })] }), loading && _jsx("p", { className: styles.muted, children: t('settings.loading') }), !loading && visibleItems.length === 0 && _jsx("p", { className: styles.muted, children: t('settings.noItems') }), _jsx("div", { className: styles.itemList, role: "list", children: visibleItems.map(item => (_jsxs("button", { type: "button", role: "listitem", className: item.id === selectedId ? styles.itemSelected : styles.item, onClick: () => select(item), children: [_jsx("span", { className: styles.itemContent, children: item.content }), _jsxs("span", { className: styles.itemMeta, children: [item.scope === 'global' ? t('settings.global') : item.scope === 'workspace' ? t('settings.workspace') : t('settings.session'), item.pinned ? ' · ★' : ''] })] }, item.id))) })] }), _jsxs("section", { className: styles.section, children: [_jsxs("header", { className: styles.sectionHeader, children: [_jsx("strong", { children: t('settings.pending') }), _jsxs("span", { children: [pending.length, " ", t('settings.count')] })] }), pending.length === 0 && _jsx("p", { className: styles.muted, children: t('settings.noPending') }), _jsx("div", { className: styles.pendingList, children: pending.map(entry => (_jsxs("article", { className: styles.pendingItem, children: [_jsx("p", { className: styles.pendingContent, children: entry.item.content }), _jsx("p", { className: styles.notice, children: t('settings.suggestion') }), _jsxs("div", { className: styles.actions, children: [_jsx("button", { type: "button", className: styles.primary, disabled: saving || !settingsSnapshot.writable, onClick: () => confirm(entry), children: t('settings.confirm') }), _jsx("button", { type: "button", className: styles.button, disabled: saving || !settingsSnapshot.writable, onClick: () => reject(entry), children: t('settings.reject') })] })] }, entry.id))) })] }), _jsxs("section", { className: styles.editor, children: [_jsx("header", { className: styles.sectionHeader, children: _jsx("strong", { children: selectedId === undefined ? t('settings.new') : selectedId }) }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.scope') }), _jsxs("select", { value: draft.scope, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, scope: event.target.value })), children: [_jsx("option", { value: "global", children: t('settings.global') }), _jsx("option", { value: "workspace", children: t('settings.workspace') }), _jsx("option", { value: "session", children: t('settings.session') })] })] }), draft.scope === 'workspace' && _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.workspaceId') }), _jsx("input", { value: draft.workspaceId, maxLength: 128, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, workspaceId: event.target.value })) })] }), draft.scope === 'session' && _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.sessionId') }), _jsx("input", { value: draft.sessionId, maxLength: 128, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, sessionId: event.target.value })) })] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.content') }), _jsx("textarea", { value: draft.content, maxLength: MAX_MEMORY_CONTENT_LENGTH, placeholder: t('settings.contentPlaceholder'), disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, content: event.target.value })) }), _jsxs("span", { className: styles.counter, children: [draft.content.length, " / ", MAX_MEMORY_CONTENT_LENGTH] })] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.tags') }), _jsx("input", { value: draft.tags, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, tags: event.target.value })) })] }), _jsxs("label", { className: styles.toggle, children: [_jsx("input", { type: "checkbox", checked: draft.pinned, disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, pinned: event.target.checked })) }), t('settings.pinned')] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.expiresAt') }), _jsx("input", { value: draft.expiresAt, inputMode: "numeric", disabled: saving || !settingsSnapshot.writable, onChange: event => setDraft(current => ({ ...current, expiresAt: event.target.value })) })] }), _jsxs("footer", { className: styles.actions, children: [selectedId !== undefined && _jsx("button", { type: "button", className: styles.danger, disabled: saving || !settingsSnapshot.writable, onClick: remove, children: t('settings.delete') }), _jsx("button", { type: "button", className: styles.button, disabled: saving, onClick: () => { setSelectedId(undefined); setDraft(emptyDraft()); }, children: t('settings.cancel') }), _jsx("button", { type: "button", className: styles.primary, disabled: saving || !settingsSnapshot.writable, onClick: save, children: saving ? t('settings.loading') : t('settings.save') })] })] })] }));
}
