import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { PRIMARY_PROVIDER_ID } from "../core/config.js";
import { catalogFromDirectory, modelDisplayName, selectionForModel, sortModelCatalog, } from "./model-projection.js";
import styles from './model-preferences.module.css';
import { installModelRefreshBridge } from "./model-refresh.js";
function sortAcpModels(models) {
    const isGemini = (m) => /gemini|orchestrator/iu.test(m.id) || /gemini|orchestrator/iu.test(m.name);
    return [...models].sort((a, b) => Number(isGemini(b)) - Number(isGemini(a)));
}
function errorText(reason, fallback) {
    return reason instanceof Error && reason.message.trim() ? reason.message.trim() : fallback;
}
/**
 * Preference-aware composer model seat. Its data projection is local to this
 * plugin, while its geometry and interaction model follow the official
 * model-selection seat so the desktop composer keeps its native appearance.
 */
export function ModelSelect(props) {
    const { locked, available, directory, load, modelSessionId, sessionCwd, getSessionCwd, select, settingsScope, t } = props;
    const [open, setOpen] = useState(false);
    const [pane, setPane] = useState('root');
    const [selecting, setSelecting] = useState(false);
    const [error, setError] = useState(null);
    const [acpModels, setAcpModels] = useState([]);
    const [acpSelection, setAcpSelection] = useState(null);
    const [relayAccessAvailable, setRelayAccessAvailable] = useState(() => typeof document !== 'undefined' && document.querySelector('[data-dsh-relay-access-root]') !== null);
    const lastActionRef = useRef('load');
    const loadRef = useRef(load);
    loadRef.current = load;
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const refreshBridgeRef = useRef(null);
    const id = useId();
    const activeAcp = acpSelection?.conversationId === modelSessionId ? acpSelection : null;
    const state = useSyncExternalStore(listener => directory.subscribe(listener), () => directory.getSnapshot(), () => directory.getSnapshot());
    const settingsSnapshot = useSyncExternalStore(listener => settingsScope.subscribe(listener), () => settingsScope.getSnapshot(), () => settingsScope.getSnapshot());
    const config = settingsSnapshot.value ?? {
        version: 1,
        pinnedModels: [],
        providerOrder: [],
        disabledProviders: [],
        recentModels: [],
    };
    const catalog = useMemo(() => sortModelCatalog(catalogFromDirectory(state), config), [config, state]);
    const options = useMemo(() => [...catalog.pinned, ...catalog.groups.flatMap(group => group.models)], [catalog]);
    const hasConfiguredRelay = options.some(option => option.provider === PRIMARY_PROVIDER_ID && option.model.id !== '__bai_login_required__');
    const currentOption = options.find(option => option.current);
    const reasoning = activeAcp ? undefined : currentOption?.model.reasoning;
    const thoughtOptions = activeAcp?.thoughtOption?.options;
    const effectiveEffort = activeAcp?.thoughtOption?.currentValue ?? state.current?.reasoningEffort ?? reasoning?.defaultEffort;
    const effortLabel = thoughtOptions?.length ? thoughtOptions.find(level => level.value === effectiveEffort)?.name ?? effectiveEffort
        : reasoning === undefined
            ? undefined
            : effectiveEffort === undefined
                ? t('effort.default')
                : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort;
    const effortChoices = useMemo(() => {
        if (thoughtOptions?.length)
            return thoughtOptions.map(option => ({ key: option.value, label: option.name ?? option.value, effort: option.value }));
        if (reasoning === undefined)
            return [];
        return [
            ...(reasoning.defaultEffort === undefined
                ? [{ key: 'provider-default', effort: undefined, label: t('effort.default') }]
                : []),
            ...reasoning.efforts.map(effort => ({
                key: `effort:${effort.id}`,
                effort: effort.id,
                label: effort.name,
                ...(effort.description === undefined ? {} : { description: effort.description }),
            })),
        ];
    }, [reasoning, t, thoughtOptions]);
    const busy = state.status === 'selecting' || selecting;
    const currentName = activeAcp ? acpModels.find(model => model.id === activeAcp.modelId)?.name ?? activeAcp.modelId
        : state.current?.provider === 'project-relay' && state.current.model === '__bai_login_required__'
            ? t('trigger.baiPending') : modelDisplayName(currentOption, state.current);
    const modelLabel = currentName || t('trigger.fallback');
    const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`;
    const reload = useCallback(() => {
        lastActionRef.current = 'load';
        loadRef.current();
    }, []);
    const openAcpModel = useCallback((modelId) => {
        document.dispatchEvent(new CustomEvent('dsh-antigravity-acp-open', {
            detail: { modelId, cwd: getSessionCwd?.() ?? sessionCwd, conversationId: modelSessionId },
        }));
    }, [getSessionCwd, modelSessionId, sessionCwd]);
    useEffect(() => {
        if (!available)
            return;
        const sync = (event) => setAcpSelection(event.detail);
        const pick = (event) => {
            const content = rootRef.current?.closest('[data-conversation-content]');
            const modelId = event.detail;
            if (typeof modelId === 'string' && content && content === content.closest('[data-slot="main.conversation"]')?.querySelector('[data-conversation-content]')) {
                openAcpModel(modelId);
            }
        };
        document.addEventListener('dsh-antigravity-acp-selection', sync);
        document.addEventListener('dsh-antigravity-acp-pick', pick);
        document.dispatchEvent(new Event('dsh-antigravity-acp-selection-request'));
        return () => {
            document.removeEventListener('dsh-antigravity-acp-selection', sync);
            document.removeEventListener('dsh-antigravity-acp-pick', pick);
        };
    }, [available, openAcpModel]);
    useEffect(() => {
        const update = () => setRelayAccessAvailable(typeof document !== 'undefined' && document.querySelector('[data-dsh-relay-access-root]') !== null);
        document.addEventListener('dsh-relay-access-changed', update);
        update();
        return () => document.removeEventListener('dsh-relay-access-changed', update);
    }, []);
    useEffect(() => {
        if (!available || typeof fetch !== 'function')
            return;
        let generation = 0;
        const refreshAcp = () => {
            const request = ++generation;
            void fetch('/api/dsh-antigravity-cli', { headers: { 'x-dsh-antigravity': '1' } })
                .then(res => (res.ok ? res.json() : null))
                .then((diag) => {
                if (request !== generation)
                    return;
                if (diag?.state === 'ready' && !diag.harnessLlmAllowed && Array.isArray(diag.models) && diag.models.length > 0) {
                    setAcpModels(sortAcpModels(diag.models.filter((m) => typeof m?.id === 'string' && typeof m?.name === 'string')));
                }
                else {
                    setAcpModels([]);
                }
            })
                .catch(() => { });
        };
        refreshAcp();
        window.addEventListener('dsh-antigravity-status-updated', refreshAcp);
        return () => {
            generation += 1;
            window.removeEventListener('dsh-antigravity-status-updated', refreshAcp);
        };
    }, [available]);
    useEffect(() => {
        if (!available)
            return;
        reload();
    }, [available, directory, modelSessionId, reload]);
    useEffect(() => {
        refreshBridgeRef.current?.dispose();
        refreshBridgeRef.current = null;
        if (!available)
            return;
        const bridge = installModelRefreshBridge({ sessionId: modelSessionId, refresh: reload });
        refreshBridgeRef.current = bridge;
        return () => {
            bridge.dispose();
            if (refreshBridgeRef.current === bridge)
                refreshBridgeRef.current = null;
        };
    }, [available, modelSessionId, reload]);
    useEffect(() => {
        if (!open)
            return;
        const closeOutside = (event) => {
            if (!rootRef.current?.contains(event.target))
                setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key !== 'Escape')
                return;
            event.preventDefault();
            if (pane !== 'root')
                setPane('root');
            else {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('pointerdown', closeOutside);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', closeOutside);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, pane]);
    if (!available)
        return null;
    const close = () => {
        setOpen(false);
        setPane('root');
        setError(null);
    };
    const chooseSelection = async (selection) => {
        if (busy)
            return;
        setSelecting(true);
        setError(null);
        lastActionRef.current = 'select';
        try {
            const accepted = await select(selection);
            if (accepted === undefined || !accepted.ok)
                throw new Error(t('error.select'));
            if (activeAcp)
                document.dispatchEvent(new CustomEvent('dsh-antigravity-acp-deactivate', { detail: modelSessionId }));
            refreshBridgeRef.current?.announce();
            close();
            triggerRef.current?.focus();
        }
        catch (reason) {
            setError(errorText(reason, t('error.select')));
        }
        finally {
            setSelecting(false);
        }
    };
    const chooseModel = (option) => {
        if (option.providerDisabled || busy)
            return;
        void chooseSelection(selectionForModel(option, state.current));
    };
    const chooseEffort = (effort) => {
        if (activeAcp) {
            document.dispatchEvent(new CustomEvent('dsh-antigravity-acp-effort', { detail: { conversationId: modelSessionId, value: effort } }));
            close();
            return;
        }
        if (state.current === null || busy)
            return;
        void chooseSelection({
            provider: state.current.provider,
            model: state.current.model,
            ...(effort === undefined ? {} : { reasoningEffort: effort }),
        });
    };
    const renderOption = (option) => (_jsxs("button", { type: "button", className: `${styles.option} ${option.current && !activeAcp ? styles.optionCurrent : ''}`, role: "menuitemradio", "aria-checked": option.current && !activeAcp, title: option.model.name || option.model.id, "data-dsh-relay-model-entry": "true", "data-dsh-relay-provider": option.provider, disabled: option.providerDisabled || busy, onClick: () => chooseModel(option), children: [_jsxs("span", { className: styles.optionCopy, children: [_jsx("span", { className: styles.modelName, children: option.model.name || option.model.id }), option.providerDisabled && _jsx("span", { className: styles.description, children: t('status.providerDisabled') })] }), _jsx("span", { className: styles.check, "aria-hidden": "true", children: option.current && !activeAcp && _jsx("span", { className: styles.checkmark }) })] }, `${option.provider}\u0000${option.model.id}`));
    const renderGroup = (label, groupOptions, key) => (_jsxs("section", { role: "group", "aria-label": label, className: `${styles.group} ${key === PRIMARY_PROVIDER_ID ? styles.primaryProviderGroup : ''}`, children: [_jsxs("div", { className: styles.groupTitle, children: [_jsx("span", { children: label }), key === PRIMARY_PROVIDER_ID && _jsx("span", { className: styles.recommendedBadge, children: t('menu.recommended') })] }), groupOptions.map(renderOption)] }, key));
    return (_jsxs("div", { className: styles.root, ref: rootRef, onKeyDown: event => {
            if (event.key !== 'Escape' || !open)
                return;
            event.preventDefault();
            if (pane !== 'root')
                setPane('root');
            else
                close();
        }, children: [_jsxs("button", { ref: triggerRef, type: "button", className: styles.trigger, "aria-haspopup": "menu", "aria-expanded": open, "aria-controls": open ? `${id}-menu` : undefined, "aria-label": currentName ? t('trigger.aria', { model: triggerLabel }) : t('trigger.fallback'), title: triggerLabel, "data-dsh-relay-model-entry": "true", "data-dsh-relay-provider": activeAcp ? 'antigravity-cli' : state.current?.provider, disabled: locked, onClick: () => {
                    if (open)
                        close();
                    else {
                        setOpen(true);
                        setPane('root');
                        setError(null);
                        // The mounted directory and the refresh bridge already keep this
                        // projection current. Opening the menu must not restart the same
                        // model request on every click.
                        if (state.status === 'idle' || state.status === 'error')
                            reload();
                    }
                }, children: [_jsx("span", { className: styles.triggerLabel, children: modelLabel }), effortLabel !== undefined && _jsx("span", { className: styles.triggerEffort, children: effortLabel }), _jsx("span", { "aria-hidden": "true", className: `${styles.chevron} ${open ? styles.chevronOpen : ''}` })] }), open && (_jsxs("div", { id: `${id}-menu`, className: styles.menu, role: "menu", "aria-label": t('menu.aria'), "aria-busy": state.status === 'loading' || busy, children: [pane === 'root' && (_jsxs(_Fragment, { children: [_jsxs("button", { type: "button", role: "menuitem", className: styles.cell, onClick: () => setPane('model'), children: [_jsx("span", { className: styles.cellLabel, children: t('menu.models') }), _jsx("span", { className: styles.cellValue, children: modelLabel }), _jsx("span", { "aria-hidden": "true", className: styles.cellChevron })] }), effortChoices.length > 0 && (_jsxs("button", { type: "button", role: "menuitem", className: styles.cell, onClick: () => setPane('effort'), children: [_jsx("span", { className: styles.cellLabel, children: t('menu.effort') }), _jsx("span", { className: styles.cellValue, children: effortLabel }), _jsx("span", { "aria-hidden": "true", className: styles.cellChevron })] }))] })), pane === 'model' && (_jsxs(_Fragment, { children: [state.status === 'loading' && _jsx("div", { className: styles.status, role: "status", children: t('status.loading') }), state.error !== null && lastActionRef.current === 'load' && (_jsxs("div", { className: styles.error, role: "alert", children: [_jsxs("span", { children: [t('error.load'), " ", state.error] }), _jsx("button", { type: "button", className: styles.retry, onClick: reload, children: t('action.reload') })] })), error !== null && _jsx("div", { className: styles.error, role: "alert", children: _jsx("span", { children: error }) }), catalog.failures.map(failure => (_jsxs("div", { className: styles.warning, role: "status", children: [_jsxs("span", { children: [failure.name || failure.id, ": ", failure.message] }), _jsx("button", { type: "button", className: styles.retry, onClick: reload, children: t('action.reload') })] }, failure.id))), _jsxs("div", { className: `${styles.groups} scrollable`, children: [catalog.pinned.length > 0 && renderGroup(t('menu.pinned'), catalog.pinned, 'pinned'), catalog.groups.map(group => renderGroup(group.name, group.models, group.id)), acpModels.length > 0 && (_jsxs("section", { role: "group", "aria-label": t('antigravity.group'), className: styles.group, "data-dsh-antigravity-group": "true", children: [_jsx("div", { className: styles.groupTitle, children: t('antigravity.group') }), acpModels.map(model => (_jsxs("button", { type: "button", role: "menuitemradio", "aria-checked": activeAcp?.modelId === model.id, className: styles.option, title: model.name, "data-dsh-antigravity-model": model.id, onClick: () => {
                                                    close();
                                                    openAcpModel(model.id);
                                                    triggerRef.current?.focus();
                                                }, children: [_jsx("span", { className: styles.optionCopy, children: _jsx("span", { className: styles.modelName, children: model.name }) }), _jsx("span", { className: styles.check, "aria-hidden": "true", children: activeAcp?.modelId === model.id && _jsx("span", { className: styles.checkmark }) })] }, model.id)))] })), relayAccessAvailable && !hasConfiguredRelay && (_jsxs("section", { role: "group", "aria-label": t('relayShowcase.group'), className: `${styles.group} ${styles.primaryProviderGroup}`, "data-dsh-relay-showcase": "true", children: [_jsxs("div", { className: styles.groupTitle, children: [_jsx("span", { children: t('relayShowcase.group') }), _jsx("span", { className: styles.recommendedBadge, children: t('relayShowcase.badge') })] }), ['claude', 'gpt', 'multi'].map(tier => (_jsxs("button", { type: "button", role: "menuitem", className: styles.option, onClick: () => {
                                                    close();
                                                    document.dispatchEvent(new CustomEvent('dsh-relay-sign-in-required', { detail: { source: 'model-picker', tier, autoConnect: false } }));
                                                }, children: [_jsxs("span", { className: styles.optionCopy, children: [_jsx("span", { className: styles.modelName, children: t(`relayShowcase.${tier}Name`) }), _jsx("span", { className: styles.description, children: t(`relayShowcase.${tier}Desc`) })] }), _jsx("span", { "aria-hidden": "true", className: styles.cellChevron })] }, tier)))] }))] }), state.status === 'ready' && options.length === 0 && acpModels.length === 0 && !(relayAccessAvailable && !hasConfiguredRelay) && (_jsx("div", { className: styles.empty, children: t('status.empty') }))] })), pane === 'effort' && (_jsxs(_Fragment, { children: [error !== null && _jsx("div", { className: styles.error, role: "alert", children: _jsx("span", { children: error }) }), effortChoices.length === 0 && _jsx("div", { className: styles.empty, children: t('status.empty') }), effortChoices.map(choice => (_jsxs("button", { type: "button", role: "menuitemradio", "aria-checked": effectiveEffort === choice.effort, className: `${styles.option} ${effectiveEffort === choice.effort ? styles.optionCurrent : ''}`, disabled: busy, onClick: () => chooseEffort(choice.effort), children: [_jsxs("span", { className: styles.optionCopy, children: [_jsx("span", { className: styles.modelName, children: choice.label }), choice.description !== undefined && _jsx("span", { className: styles.description, children: choice.description })] }), _jsx("span", { className: styles.check, "aria-hidden": "true", children: effectiveEffort === choice.effort && _jsx("span", { className: styles.checkmark }) })] }, choice.key)))] }))] }))] }));
}
