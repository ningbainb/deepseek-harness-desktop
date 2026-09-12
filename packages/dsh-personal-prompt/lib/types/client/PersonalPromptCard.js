import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_PERSONAL_PROMPT, MAX_PROMPT_CONTENT_LENGTH, normalizePersonalPrompt, removePromptProfile, renderPromptProfile, setActivePromptProfile, upsertPromptProfile, } from "../core/config.js";
import styles from './personal-prompt.module.css';
function workspaceIdOf(item) {
    return item.workspaceId ?? item.id;
}
function toDraft(profile) {
    return {
        id: profile.id,
        name: profile.name,
        content: profile.content,
        enabled: profile.enabled,
        scope: profile.scope,
        workspaceId: profile.workspaceId ?? '',
        sessionId: profile.sessionId ?? '',
        updatedAt: profile.updatedAt,
    };
}
function newProfile() {
    const random = globalThis.crypto?.randomUUID?.();
    return {
        id: `prompt-${random ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
        name: '',
        content: '',
        enabled: true,
        scope: 'global',
        workspaceId: '',
        sessionId: '',
        updatedAt: Date.now(),
    };
}
function profileFromDraft(draft) {
    return {
        id: draft.id.trim(),
        name: draft.name,
        content: draft.content,
        enabled: draft.enabled,
        scope: draft.scope,
        ...(draft.scope === 'workspace' ? { workspaceId: draft.workspaceId.trim() } : {}),
        ...(draft.scope === 'session' ? { sessionId: draft.sessionId.trim() } : {}),
        updatedAt: Date.now(),
    };
}
function errorText(_reason, fallback) {
    // Backend messages may contain profile names, IDs or user-provided prompt
    // text. Keep the renderer on a bounded, localized error surface instead of
    // echoing an arbitrary exception into the settings UI.
    return fallback;
}
function editableProfiles(config) {
    return config.profiles.filter(profile => profile.scope !== 'session');
}
export function PersonalPromptCard(props) {
    const { config, settingsScope, t } = props;
    const dock = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('desktop-dock-setting');
    const [editorOpen, setEditorOpen] = useState(!dock);
    const settingsSnapshot = useSyncExternalStore(listener => settingsScope.subscribe(listener), () => settingsScope.getSnapshot(), () => settingsScope.getSnapshot());
    const liveConfig = useMemo(() => {
        try {
            return normalizePersonalPrompt(settingsSnapshot.value ?? config);
        }
        catch {
            return { ...DEFAULT_PERSONAL_PROMPT, profiles: [] };
        }
    }, [config, settingsSnapshot.value]);
    const [draftConfig, setDraftConfig] = useState(liveConfig);
    const initialProfile = liveConfig.profiles.find(profile => profile.scope !== 'session');
    const [selectedId, setSelectedId] = useState(initialProfile?.id);
    const [editor, setEditor] = useState(() => initialProfile === undefined ? undefined : toDraft(initialProfile));
    const [editorDirty, setEditorDirty] = useState(false);
    const [configDirty, setConfigDirty] = useState(false);
    const [conflict, setConflict] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState(null);
    const contentRef = useRef(null);
    const [editorFocusRequest, requestEditorFocus] = useState(0);
    const lastRevision = useRef(settingsSnapshot.revision);
    const useWorkspaces = props.useWorkspaces;
    // The official standard kit exposes a selector hook, not a zero-argument
    // snapshot reader. Passing the identity selector is also important at
    // runtime: the renderer's hook rejects an undefined selector.
    const workspaceState = useWorkspaces === undefined
        ? { items: [] }
        : useWorkspaces(state => state);
    const workspaceItems = workspaceState.items;
    const visibleProfiles = useMemo(() => editableProfiles(draftConfig), [draftConfig]);
    useEffect(() => {
        if (editorFocusRequest === 0)
            return;
        contentRef.current?.focus({ preventScroll: true });
        contentRef.current?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    }, [editorFocusRequest]);
    useEffect(() => {
        if (lastRevision.current !== settingsSnapshot.revision) {
            if (editorDirty || configDirty)
                setConflict(true);
            lastRevision.current = settingsSnapshot.revision;
        }
    }, [configDirty, editorDirty, settingsSnapshot.revision]);
    useEffect(() => {
        if (editorDirty || configDirty)
            return;
        setDraftConfig(liveConfig);
        const next = selectedId === undefined ? visibleProfiles[0] : visibleProfiles.find(profile => profile.id === selectedId);
        if (next === undefined) {
            setSelectedId(visibleProfiles[0]?.id);
            setEditor(visibleProfiles[0] === undefined ? undefined : toDraft(visibleProfiles[0]));
        }
        else {
            setEditor(toDraft(next));
        }
    }, [configDirty, editorDirty, liveConfig, selectedId, visibleProfiles]);
    const listedProfiles = useMemo(() => {
        if (editor === undefined || editor.scope === 'session' || visibleProfiles.some(profile => profile.id === editor.id))
            return visibleProfiles;
        return [...visibleProfiles, profileFromDraft(editor)];
    }, [editor, visibleProfiles]);
    const selectProfile = (id) => {
        setEditorOpen(true);
        const profile = visibleProfiles.find(item => item.id === id);
        if (profile === undefined)
            return;
        setSelectedId(id);
        setEditor(toDraft(profile));
        setEditorDirty(false);
        setError(null);
        requestEditorFocus(current => current + 1);
    };
    const editEditor = (patch) => {
        setEditor(current => current === undefined ? current : { ...current, ...patch });
        setEditorDirty(true);
        setSaved(false);
        setError(null);
    };
    const persist = async (next) => {
        if (!settingsSnapshot.writable || saving)
            return false;
        setSaving(true);
        setSaved(false);
        setError(null);
        try {
            await settingsScope.set('profiles', next.profiles);
            await settingsScope.set('enabled', next.enabled);
            if (next.activeProfileId === undefined)
                await settingsScope.unset('activeProfileId');
            else
                await settingsScope.set('activeProfileId', next.activeProfileId);
            setDraftConfig(next);
            setConfigDirty(false);
            setEditorDirty(false);
            setConflict(false);
            setSaved(true);
            return true;
        }
        catch (reason) {
            setError(errorText(reason, t('error.save')));
            return false;
        }
        finally {
            setSaving(false);
        }
    };
    const save = () => {
        if (editor === undefined && !configDirty)
            return;
        try {
            const next = editorDirty && editor !== undefined
                ? upsertPromptProfile(draftConfig, profileFromDraft(editor))
                : draftConfig;
            void persist(next);
        }
        catch (reason) {
            setError(errorText(reason, t('error.invalid')));
        }
    };
    const create = () => {
        setEditorOpen(true);
        const next = newProfile();
        setSelectedId(next.id);
        setEditor(next);
        setEditorDirty(true);
        setError(null);
        setSaved(false);
        requestEditorFocus(current => current + 1);
    };
    const remove = () => {
        if (selectedId === undefined)
            return;
        const exists = draftConfig.profiles.some(profile => profile.id === selectedId);
        if (!exists) {
            setSelectedId(visibleProfiles[0]?.id);
            setEditor(visibleProfiles[0] === undefined ? undefined : toDraft(visibleProfiles[0]));
            setEditorDirty(false);
            return;
        }
        const next = removePromptProfile(draftConfig, selectedId);
        const nextVisible = editableProfiles(next);
        setSelectedId(nextVisible[0]?.id);
        setEditor(nextVisible[0] === undefined ? undefined : toDraft(nextVisible[0]));
        setDraftConfig(next);
        setConfigDirty(true);
        setEditorDirty(false);
        setSaved(false);
    };
    const reload = () => {
        setDraftConfig(liveConfig);
        const next = liveConfig.profiles.find(profile => profile.scope !== 'session');
        setSelectedId(next?.id);
        setEditor(next === undefined ? undefined : toDraft(next));
        setEditorDirty(false);
        setConfigDirty(false);
        setConflict(false);
        setError(null);
    };
    const activeProfile = editor === undefined ? undefined : (() => {
        try {
            return profileFromDraft(editor);
        }
        catch {
            return undefined;
        }
    })();
    const preview = draftConfig.enabled && activeProfile?.enabled === true ? renderPromptProfile(activeProfile) : '';
    const dirty = editorDirty || configDirty;
    const readOnlySession = editor?.scope === 'session';
    return (_jsxs("section", { className: styles.card, "data-personal-prompt-card": "true", "data-dock-dirty": dirty, "data-dock-owner": "personal-prompt", children: [_jsxs("header", { className: styles.header, children: [_jsxs("div", { children: [_jsx("h3", { className: styles.title, children: t('settings.title') }), _jsx("p", { className: styles.description, children: t('settings.description') })] }), _jsx("span", { className: dirty ? styles.dirty : styles.badge, children: dirty ? t('settings.unsaved') : saved ? t('settings.saved') : t('settings.ready') })] }), !settingsSnapshot.writable && _jsx("p", { className: styles.notice, role: "status", children: t('settings.readonly') }), settingsSnapshot.status === 'loading' && _jsx("p", { className: styles.muted, role: "status", children: t('settings.loading') }), conflict && _jsx("p", { className: styles.error, role: "alert", children: t('settings.conflict') }), error && _jsx("p", { className: styles.error, role: "alert", children: error }), _jsxs("div", { className: styles.toolbar, children: [_jsxs("label", { className: styles.toggle, children: [_jsx("input", { type: "checkbox", checked: draftConfig.enabled, disabled: !settingsSnapshot.writable, onChange: event => { setDraftConfig(current => ({ ...current, enabled: event.target.checked })); setConfigDirty(true); setSaved(false); } }), t('settings.enabled')] }), _jsx("span", { className: styles.muted, children: t('settings.ownerNotice') })] }), _jsxs("section", { children: [_jsxs("div", { className: styles.profileHeader, children: [_jsx("strong", { children: t('settings.profiles') }), _jsx("button", { type: "button", className: styles.button, disabled: !settingsSnapshot.writable || saving, onClick: create, children: t('settings.new') })] }), listedProfiles.length === 0 && _jsx("p", { className: styles.empty, children: t('settings.noProfiles') }), _jsx("div", { className: styles.profileList, role: "list", children: listedProfiles.map(profile => (_jsxs("button", { type: "button", role: "listitem", className: `${styles.profileButton} ${profile.id === selectedId ? styles.profileSelected : ''}`, onClick: () => selectProfile(profile.id), children: [_jsxs("span", { className: styles.profileMain, children: [_jsx("span", { className: styles.profileName, children: profile.name || t('settings.untitled') }), _jsx("span", { className: styles.profileMeta, children: profile.scope === 'global' ? t('settings.global') : profile.scope === 'workspace' ? `${t('settings.workspace')} · ${workspaceItems.find(item => workspaceIdOf(item) === profile.workspaceId)?.title ?? profile.workspaceId}` : t('settings.session') })] }), _jsx("span", { className: styles.profileState, children: profile.enabled ? t('settings.enable') : t('settings.disable') })] }, profile.id))) })] }), editor !== undefined && editor.scope !== 'session' && editorOpen && (_jsxs("section", { className: styles.editor, "aria-label": t('settings.title'), children: [_jsxs("label", { className: styles.field, children: [_jsx("span", { className: styles.fieldLabel, children: t('settings.profileName') }), _jsx("input", { value: editor.name, maxLength: 128, disabled: readOnlySession, placeholder: t('settings.profileNamePlaceholder'), onChange: event => editEditor({ name: event.target.value }) })] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { className: styles.fieldLabel, children: t('settings.scope') }), _jsxs("select", { value: editor.scope, disabled: readOnlySession, onChange: event => { const scope = event.target.value; editEditor({ scope, workspaceId: scope === 'workspace' ? editor.workspaceId : '', sessionId: scope === 'session' ? editor.sessionId : '' }); }, children: [_jsx("option", { value: "global", children: t('settings.global') }), _jsx("option", { value: "workspace", children: t('settings.workspace') }), _jsx("option", { value: "session", disabled: true, children: t('settings.session') })] })] }), editor.scope === 'workspace' && _jsxs("label", { className: styles.field, children: [_jsx("span", { className: styles.fieldLabel, children: t('settings.workspaceId') }), _jsx("input", { list: "personal-prompt-workspaces", value: editor.workspaceId, maxLength: 128, disabled: readOnlySession, placeholder: t('settings.workspaceIdPlaceholder'), onChange: event => editEditor({ workspaceId: event.target.value }) }), _jsx("datalist", { id: "personal-prompt-workspaces", children: workspaceItems.map(item => { const id = workspaceIdOf(item); return id === undefined ? null : _jsx("option", { value: id, children: item.title ?? item.path ?? id }, id); }) })] }), readOnlySession && _jsx("p", { className: styles.notice, children: t('settings.sessionReadonly') }), _jsxs("label", { className: styles.toggle, children: [_jsx("input", { type: "checkbox", checked: editor.enabled, disabled: readOnlySession, onChange: event => editEditor({ enabled: event.target.checked }) }), editor.enabled ? t('settings.enable') : t('settings.disable')] }), _jsxs("label", { className: styles.field, children: [_jsx("span", { className: styles.fieldLabel, children: t('settings.content') }), _jsx("textarea", { ref: contentRef, value: editor.content, maxLength: MAX_PROMPT_CONTENT_LENGTH, disabled: readOnlySession, placeholder: t('settings.contentPlaceholder'), onChange: event => editEditor({ content: event.target.value }) }), _jsxs("span", { className: styles.counter, children: [editor.content.length, " / ", MAX_PROMPT_CONTENT_LENGTH] })] }), _jsxs("details", { className: styles.details, "data-preference-preview": "true", children: [_jsx("summary", { children: t('settings.preview') }), preview ? _jsx("pre", { className: styles.preview, children: preview }) : _jsx("p", { className: styles.muted, children: t('settings.previewEmpty') })] })] })), _jsxs("details", { className: styles.details, "data-preference-advanced": "true", children: [_jsx("summary", { children: t('settings.advanced') }), _jsx("p", { className: styles.muted, children: t('settings.advancedHint') }), _jsxs("label", { className: styles.field, children: [_jsx("span", { children: t('settings.active') }), _jsxs("select", { value: draftConfig.activeProfileId ?? '', disabled: !settingsSnapshot.writable || saving, onChange: event => { const next = setActivePromptProfile(draftConfig, event.target.value || undefined); setDraftConfig(next); setConfigDirty(true); setSaved(false); }, children: [_jsx("option", { value: "", children: t('settings.none') }), visibleProfiles.map(profile => _jsx("option", { value: profile.id, children: profile.name }, profile.id))] })] })] }), _jsxs("footer", { className: styles.actions, "data-dock-save-bar": dock || undefined, children: [editorOpen && editor !== undefined && _jsx("button", { type: "button", className: styles.danger, disabled: !settingsSnapshot.writable || saving, onClick: remove, children: t('settings.delete') }), dirty && _jsx("button", { type: "button", className: styles.button, disabled: saving, onClick: reload, children: t('settings.discard') }), _jsx("button", { type: "button", className: styles.button, disabled: saving, onClick: reload, children: t('settings.reload') }), _jsx("button", { type: "button", className: styles.primary, "data-dock-save": "true", disabled: !dirty || saving || !settingsSnapshot.writable, onClick: save, children: saving ? t('settings.saving') : t('settings.save') })] })] }));
}
