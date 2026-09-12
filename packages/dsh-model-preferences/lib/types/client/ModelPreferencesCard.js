import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_MODEL_PREFERENCES, MAX_PINNED_MODELS, PRIMARY_PROVIDER_ID, moveProvider, normalizeModelPreferences, providerIdsInOrder, sameModelKey, } from "../core/config.js";
import styles from './model-preferences.module.css';
const EMPTY_CATALOG = { groups: [], failures: [] };
function modelLabel(key) {
    return `${key.provider} / ${key.model}`;
}
function replacePinned(config, pinnedModels) {
    return normalizeModelPreferences({ ...config, pinnedModels });
}
/** Settings card for the durable model preference projection. */
export function ModelPreferencesCard(props) {
    const { config, settingsScope, loadCatalog, renderSlot, t } = props;
    const settingsSnapshot = useSyncExternalStore(listener => settingsScope.subscribe(listener), () => settingsScope.getSnapshot(), () => settingsScope.getSnapshot());
    const liveConfig = useMemo(() => normalizeModelPreferences(settingsSnapshot.value ?? config), [config, settingsSnapshot.value]);
    const [draft, setDraft] = useState(liveConfig);
    const [dirty, setDirty] = useState(false);
    const [conflict, setConflict] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [saved, setSaved] = useState(false);
    const [catalog, setCatalog] = useState(EMPTY_CATALOG);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogError, setCatalogError] = useState(false);
    const [manualProvider, setManualProvider] = useState('');
    const [manualModel, setManualModel] = useState('');
    const lastRevision = useRef(settingsSnapshot.revision);
    useEffect(() => {
        if (!dirty)
            setDraft(liveConfig);
        if (lastRevision.current !== settingsSnapshot.revision) {
            if (dirty)
                setConflict(true);
            lastRevision.current = settingsSnapshot.revision;
        }
    }, [dirty, liveConfig, settingsSnapshot.revision]);
    const readCatalog = () => {
        setCatalogLoading(true);
        setCatalogError(false);
        void loadCatalog().then((value) => {
            setCatalog(value);
            setCatalogLoading(false);
        }, () => {
            setCatalog(EMPTY_CATALOG);
            setCatalogError(true);
            setCatalogLoading(false);
        });
    };
    useEffect(() => {
        readCatalog();
        // The settings card owns one initial catalog read. The reload button is
        // the explicit second read, so a changed callback identity does not reset
        // the user's in-progress form.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const knownProviders = useMemo(() => catalog.groups.map(group => group.id), [catalog.groups]);
    const orderedProviders = useMemo(() => providerIdsInOrder(catalog.groups, draft), [catalog.groups, draft]);
    const providerById = useMemo(() => new Map(catalog.groups.map(group => [group.id, group])), [catalog.groups]);
    const edit = (next) => {
        setDraft(normalizeModelPreferences(next));
        setDirty(true);
        setSaved(false);
        setSaveError(null);
    };
    const persist = async (next) => {
        if (!settingsSnapshot.writable || saving)
            return;
        setSaving(true);
        setSaved(false);
        setSaveError(null);
        try {
            // SettingsScope exposes field-level writes and serializes them with the
            // Host revision fence. Keep the order deterministic and do not write
            // provider credentials or any official model setting here.
            await settingsScope.set('pinnedModels', next.pinnedModels);
            await settingsScope.set('providerOrder', next.providerOrder);
            await settingsScope.set('disabledProviders', next.disabledProviders);
            await settingsScope.set('recentModels', next.recentModels);
            setDraft(normalizeModelPreferences(next));
            setDirty(false);
            setConflict(false);
            setSaved(true);
        }
        catch (reason) {
            setSaveError(reason instanceof Error ? reason.message : t('settings.conflict'));
        }
        finally {
            setSaving(false);
        }
    };
    const pin = (key) => {
        if (draft.pinnedModels.some(candidate => sameModelKey(candidate, key)))
            return;
        if (draft.pinnedModels.length >= MAX_PINNED_MODELS)
            return;
        edit(replacePinned(draft, [...draft.pinnedModels, key]));
    };
    const unpin = (key) => {
        edit(replacePinned(draft, draft.pinnedModels.filter(candidate => !sameModelKey(candidate, key))));
    };
    const swapPinned = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= draft.pinnedModels.length)
            return;
        const pinned = [...draft.pinnedModels];
        const [item] = pinned.splice(index, 1);
        pinned.splice(target, 0, item);
        edit(replacePinned(draft, pinned));
    };
    const addManualPin = () => {
        const provider = manualProvider.trim();
        const model = manualModel.trim();
        if (!provider || !model || draft.pinnedModels.length >= MAX_PINNED_MODELS)
            return;
        pin({ provider, model });
        setManualProvider('');
        setManualModel('');
    };
    const disabled = new Set(draft.disabledProviders);
    return (_jsxs("section", { className: styles.card, "data-model-preferences-card": "true", children: [renderSlot('model-preferences.onboarding', {}), _jsxs("header", { className: styles.cardHeader, children: [_jsxs("div", { children: [_jsx("h3", { className: styles.title, children: t('settings.title') }), _jsx("p", { className: styles.description, children: t('settings.description') })] }), _jsx("span", { className: dirty ? styles.badgeDirty : styles.badge, children: dirty ? t('settings.unsaved') : saved ? t('settings.saved') : 'OK' })] }), !settingsSnapshot.writable && _jsx("p", { className: styles.notice, role: "status", children: t('settings.readonly') }), conflict && _jsx("p", { className: styles.error, role: "alert", children: t('settings.conflict') }), saveError && _jsx("p", { className: styles.error, role: "alert", children: saveError }), _jsxs("section", { className: styles.section, "aria-labelledby": "model-preferences-pinned-title", children: [_jsxs("div", { className: styles.sectionHeader, children: [_jsx("h4", { id: "model-preferences-pinned-title", children: t('settings.pinned') }), _jsxs("span", { children: [draft.pinnedModels.length, " / ", MAX_PINNED_MODELS] })] }), draft.pinnedModels.length === 0 && _jsx("p", { className: styles.muted, children: t('settings.pinnedEmpty') }), _jsx("div", { className: styles.pinnedList, children: draft.pinnedModels.map((key, index) => (_jsxs("div", { className: styles.pinnedRow, children: [_jsx("span", { className: styles.pinnedIndex, children: index + 1 }), _jsx("span", { className: styles.modelText, children: modelLabel(key) }), _jsx("button", { type: "button", className: styles.smallButton, disabled: index === 0, onClick: () => swapPinned(index, -1), "aria-label": t('settings.swapUp'), children: t('settings.swapUp') }), _jsx("button", { type: "button", className: styles.smallButton, disabled: index === draft.pinnedModels.length - 1, onClick: () => swapPinned(index, 1), "aria-label": t('settings.swapDown'), children: t('settings.swapDown') }), _jsx("button", { type: "button", className: styles.smallButton, onClick: () => unpin(key), children: t('settings.unpin') })] }, `${key.provider}\u0000${key.model}`))) }), _jsxs("div", { className: styles.manualPin, children: [_jsx("span", { className: styles.manualLabel, children: t('settings.manualPin') }), _jsx("input", { value: manualProvider, onChange: event => setManualProvider(event.target.value), placeholder: t('settings.modelInputProvider'), "aria-label": t('settings.modelInputProvider'), maxLength: 128 }), _jsx("input", { value: manualModel, onChange: event => setManualModel(event.target.value), placeholder: t('settings.modelInputName'), "aria-label": t('settings.modelInputName'), maxLength: 128 }), _jsx("button", { type: "button", className: styles.smallButton, disabled: draft.pinnedModels.length >= MAX_PINNED_MODELS, onClick: addManualPin, children: t('settings.add') })] })] }), _jsxs("section", { className: styles.section, "aria-labelledby": "model-preferences-providers-title", children: [_jsxs("div", { className: styles.sectionHeader, children: [_jsx("h4", { id: "model-preferences-providers-title", children: t('settings.providers') }), _jsx("button", { type: "button", className: styles.smallButton, onClick: readCatalog, disabled: catalogLoading, children: t('settings.reload') })] }), catalogLoading && _jsx("p", { className: styles.muted, role: "status", children: t('settings.loading') }), catalogError && _jsx("p", { className: styles.error, role: "alert", children: t('settings.catalogError') }), !catalogLoading && orderedProviders.length === 0 && _jsx("p", { className: styles.muted, children: t('settings.noProviders') }), _jsx("div", { className: styles.providerList, children: orderedProviders.map((provider, index) => {
                            const group = providerById.get(provider);
                            return (_jsxs("div", { className: styles.providerRow, children: [_jsxs("div", { className: styles.providerMain, children: [_jsx("span", { className: styles.providerName, children: group?.name || provider }), _jsx("code", { children: provider })] }), _jsxs("div", { className: styles.providerActions, children: [_jsx("button", { type: "button", className: styles.smallButton, disabled: index === 0 || (orderedProviders[0] === PRIMARY_PROVIDER_ID && index === 1), onClick: () => edit(moveProvider(draft, provider, -1, knownProviders)), "aria-label": t('settings.swapUp'), children: t('settings.swapUp') }), _jsx("button", { type: "button", className: styles.smallButton, disabled: provider === PRIMARY_PROVIDER_ID || index === orderedProviders.length - 1, onClick: () => edit(moveProvider(draft, provider, 1, knownProviders)), "aria-label": t('settings.swapDown'), children: t('settings.swapDown') }), _jsx("button", { type: "button", className: styles.toggleButton, "aria-pressed": !disabled.has(provider), onClick: () => edit({ ...draft, disabledProviders: disabled.has(provider) ? draft.disabledProviders.filter(id => id !== provider) : [...draft.disabledProviders, provider] }), children: disabled.has(provider) ? t('settings.enable') : t('settings.disable') })] }), group && _jsx("div", { className: styles.providerModels, children: group.models.map(model => {
                                            const key = { provider, model: model.id };
                                            const isPinned = draft.pinnedModels.some(candidate => sameModelKey(candidate, key));
                                            return (_jsxs("div", { className: styles.modelRow, children: [_jsx("span", { title: model.description, children: model.name || model.id }), _jsx("code", { children: model.id }), _jsx("button", { type: "button", className: styles.smallButton, disabled: !isPinned && draft.pinnedModels.length >= MAX_PINNED_MODELS, onClick: () => isPinned ? unpin(key) : pin(key), children: isPinned ? t('settings.unpin') : t('settings.pin') })] }, model.id));
                                        }) })] }, provider));
                        }) })] }), _jsxs("footer", { className: styles.footer, children: [_jsx("button", { type: "button", className: styles.secondaryButton, disabled: saving, onClick: () => { const next = { ...DEFAULT_MODEL_PREFERENCES }; edit(next); void persist(next); }, children: t('settings.reset') }), _jsx("button", { type: "button", className: styles.primaryButton, disabled: !dirty || saving || !settingsSnapshot.writable, onClick: () => void persist(draft), children: saving ? t('status.selecting') : t('settings.save') })] })] }));
}
