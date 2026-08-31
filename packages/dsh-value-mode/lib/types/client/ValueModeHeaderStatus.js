import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { hasExplicitModelRoutes, isCompleteModelRoute, isConfigured, resolveResolvedConfig, resolveSessionConfig, } from "../core/config.js";
import { ModelPicker } from "./ModelPicker.js";
import { useSettingsValue, useValueModeConfig } from "./useValueModeConfig.js";
import styles from './value-mode.module.css';
import headerStyles from './value-mode-header.module.css';
import { reportValueModeTelemetry } from "./telemetry.js";
function formatModel(route) {
    if (!isCompleteModelRoute(route))
        return '未配置';
    return `${route.provider} / ${route.model}`;
}
function renderPortal(node) {
    return typeof document === 'undefined' ? node : createPortal(node, document.body);
}
export const ValueModeHeaderStatus = ({ config, sessionId, useSessions, settingsScope, defaultModelScope, sessionMetrics, sessionOverride, onChange, onSessionOverrideChange, fetchModels, onOpenSettings, }) => {
    const [open, setOpen] = useState(false);
    const [onboarding, setOnboarding] = useState(false);
    const [pickingTarget, setPickingTarget] = useState(null);
    const [scope, setScope] = useState('global');
    const [showHistory, setShowHistory] = useState(false);
    const [setupDraft, setSetupDraft] = useState({
        executor: {},
        expert: {},
        strategy: 'balanced',
    });
    const [setupError, setSetupError] = useState(null);
    const [saving, setSaving] = useState(false);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const triggerRef = useRef(null);
    const handledEntryRef = useRef(null);
    const activePreset = useSessions((state) => state.byId[sessionId]?.agentPreset);
    const liveConfig = useValueModeConfig(settingsScope, config);
    const defaultExpert = useSettingsValue(defaultModelScope, undefined);
    const activeConfig = resolveSessionConfig(liveConfig, sessionOverride);
    const resolved = resolveResolvedConfig(activeConfig, defaultExpert);
    const configured = isConfigured(activeConfig, defaultExpert);
    const explicitlyConfigured = hasExplicitModelRoutes(activeConfig);
    const strategyLabels = {
        saver: '更省',
        balanced: '平衡',
        powerful: '更强',
    };
    const label = !configured
        ? '性价比 · 待配置'
        : !resolved.enabled
            ? '性价比 · 已关闭'
            : `性价比 · ${strategyLabels[resolved.strategy] || '平衡'}`;
    const startOnboarding = () => {
        setSetupDraft({
            executor: { ...resolved.executor },
            expert: { ...resolved.expert },
            strategy: resolved.strategy,
        });
        setScope('global');
        setSetupError(null);
        setOnboarding(true);
        setOpen(true);
        reportValueModeTelemetry({ kind: 'onboarding', outcome: 'shown', surface: 'header' }, `value-mode-onboarding-shown:header:${sessionId}`);
    };
    const dismissOnboarding = () => {
        if (onboarding)
            reportValueModeTelemetry({ kind: 'onboarding', outcome: 'dismissed', surface: 'header' });
        setOpen(false);
        setOnboarding(false);
    };
    const reportSetupError = (reason, fallback) => {
        setSetupError(reason instanceof Error ? reason.message : fallback);
        setOpen(true);
    };
    const persistGlobalPatch = (patch, fallback) => {
        void Promise.resolve()
            .then(() => onChange(patch))
            .catch((reason) => reportSetupError(reason, fallback));
    };
    const enableCurrentScope = async (source = 'manual') => {
        try {
            if (scope === 'session' && onSessionOverrideChange) {
                onSessionOverrideChange({ ...sessionOverride, enabled: true });
            }
            else {
                await onChange({ enabled: true });
            }
            reportValueModeTelemetry({ kind: 'state', state: 'enabled', source });
        }
        catch (reason) {
            reportValueModeTelemetry({ kind: 'state', state: 'failed', source });
            reportSetupError(reason, '性价比模式开启失败，请重试。');
        }
    };
    useEffect(() => {
        if (activePreset !== 'value-mode') {
            setOpen(false);
            setOnboarding(false);
            setPickingTarget(null);
            setShowHistory(false);
            handledEntryRef.current = null;
            return;
        }
        const entryKey = `${sessionId}:value-mode`;
        if (handledEntryRef.current === entryKey)
            return;
        handledEntryRef.current = entryKey;
        reportValueModeTelemetry({ kind: 'entry', configured: explicitlyConfigured }, 'value-mode-entry');
        if (explicitlyConfigured) {
            if (!resolved.enabled)
                void enableCurrentScope('auto');
        }
        else {
            startOnboarding();
        }
    }, [activePreset, sessionId, explicitlyConfigured]);
    // The default-model service may finish hydrating after the session header
    // mounts. Fill only an unconfigured draft so a deliberate expert choice is
    // never overwritten while the guide is open.
    useEffect(() => {
        if (!onboarding)
            return;
        setSetupDraft((draft) => ({
            ...draft,
            expert: isCompleteModelRoute(draft.expert) ? draft.expert : { ...resolved.expert },
        }));
    }, [onboarding, defaultExpert?.provider, defaultExpert?.model, defaultExpert?.reasoningEffort, resolved.expert.provider, resolved.expert.model, resolved.expert.reasoningEffort]);
    useEffect(() => {
        if (!open)
            return;
        const handleClickOutside = (event) => {
            const target = event.target;
            if (rootRef.current?.contains(target) || panelRef.current?.contains(target))
                return;
            // The model picker is portaled separately. Let its own backdrop handle
            // outside clicks while it is open instead of closing the setup panel on
            // the picker's initial mousedown.
            if (pickingTarget)
                return;
            dismissOnboarding();
        };
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                if (pickingTarget) {
                    setPickingTarget(null);
                    return;
                }
                dismissOnboarding();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, onboarding, pickingTarget]);
    useEffect(() => {
        if (!open) {
            triggerRef.current?.focus();
            return;
        }
        const dialog = pickingTarget
            ? document.querySelector('[data-value-mode-model-picker="true"] [role="dialog"]')
            : panelRef.current;
        dialog?.querySelector('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
    }, [open, onboarding, pickingTarget]);
    const handleStrategyChange = (nextStrategy) => {
        if (onboarding) {
            setSetupDraft((draft) => ({ ...draft, strategy: nextStrategy }));
            reportValueModeTelemetry({ kind: 'strategy', strategy: nextStrategy });
            return;
        }
        if (scope === 'session' && onSessionOverrideChange) {
            onSessionOverrideChange({ ...sessionOverride, strategy: nextStrategy });
        }
        else {
            persistGlobalPatch({ strategy: nextStrategy }, '策略保存失败，请重试。');
        }
        reportValueModeTelemetry({ kind: 'strategy', strategy: nextStrategy });
    };
    const handleModelSelect = (selection) => {
        if (onboarding) {
            setSetupDraft((draft) => ({ ...draft, [pickingTarget]: selection }));
        }
        else if (pickingTarget === 'executor') {
            persistGlobalPatch({ executor: selection }, '副模型保存失败，请重试。');
        }
        else if (pickingTarget === 'expert') {
            if (scope === 'session' && onSessionOverrideChange) {
                onSessionOverrideChange({ ...sessionOverride, expert: selection });
            }
            else {
                persistGlobalPatch({ expert: selection }, '专家主控模型保存失败，请重试。');
            }
        }
        setPickingTarget(null);
    };
    const handleCompleteSetup = async () => {
        if (!isCompleteModelRoute(setupDraft.expert) || !isCompleteModelRoute(setupDraft.executor)) {
            setSetupError('请先选择专家主控模型和副模型 / 子代理执行模型。');
            return;
        }
        setSaving(true);
        setSetupError(null);
        try {
            // Keep enabled as a separate last write so a partial configuration can
            // never become active.
            await onChange({
                expert: setupDraft.expert,
                executor: setupDraft.executor,
            });
            await onChange({ strategy: setupDraft.strategy });
            await onChange({ enabled: true });
            setOnboarding(false);
            setOpen(false);
            reportValueModeTelemetry({ kind: 'onboarding', outcome: 'completed', surface: 'header' });
            reportValueModeTelemetry({ kind: 'state', state: 'enabled', source: 'onboarding' });
        }
        catch (reason) {
            reportValueModeTelemetry({ kind: 'onboarding', outcome: 'failed', surface: 'header' });
            setSetupError(reason instanceof Error ? reason.message : '配置写入失败，请重试。');
        }
        finally {
            setSaving(false);
        }
    };
    const handleToggle = async () => {
        const nextEnabled = !resolved.enabled;
        try {
            if (scope === 'session' && onSessionOverrideChange) {
                onSessionOverrideChange({ ...sessionOverride, enabled: nextEnabled });
            }
            else {
                await onChange({ enabled: nextEnabled });
            }
            reportValueModeTelemetry({ kind: 'state', state: nextEnabled ? 'enabled' : 'disabled', source: 'manual' });
        }
        catch (reason) {
            reportValueModeTelemetry({ kind: 'state', state: 'failed', source: 'manual' });
            reportSetupError(reason, nextEnabled ? '性价比模式开启失败，请重试。' : '性价比模式关闭失败，请重试。');
        }
    };
    if (activePreset !== 'value-mode')
        return null;
    const controllerCalls = sessionMetrics?.controllerCalls ?? sessionMetrics?.expertCalls ?? 0;
    const subagentCalls = sessionMetrics?.subagentCalls ?? sessionMetrics?.executorCalls ?? 0;
    const statusClass = !configured
        ? styles.badgeDegraded
        : resolved.enabled
            ? styles.badgeActive
            : styles.badgeInactive;
    const quickPopover = (_jsxs(_Fragment, { children: [_jsxs("div", { className: headerStyles.popoverHeader, children: [_jsx("span", { className: styles.title, children: "\u6027\u4EF7\u6BD4\u6A21\u5F0F" }), _jsx("span", { className: `${styles.badge} ${statusClass}`, children: resolved.enabled ? configured ? '已开启' : '配置不完整' : configured ? '已关闭' : '待配置' })] }), setupError && _jsx("div", { className: headerStyles.setupError, role: "alert", children: setupError }), onSessionOverrideChange && (_jsxs("div", { className: styles.scopeSwitcher, role: "group", "aria-label": "\u751F\u6548\u8303\u56F4", children: [_jsx("button", { type: "button", className: `${styles.scopeButton} ${scope === 'global' ? styles.scopeButtonActive : ''}`, onClick: () => setScope('global'), children: "\u5168\u5C40\u9ED8\u8BA4" }), _jsxs("button", { type: "button", className: `${styles.scopeButton} ${scope === 'session' ? styles.scopeButtonActive : ''}`, onClick: () => setScope('session'), children: ["\u4EC5\u672C\u4F1A\u8BDD ", sessionOverride ? '(已覆写)' : ''] })] })), _jsxs("div", { className: styles.roleSummary, children: [_jsxs("div", { className: styles.popoverItem, children: [_jsx("span", { className: styles.popoverItemLabel, children: "\u4E13\u5BB6\u4E3B\u63A7:" }), _jsx("span", { className: styles.popoverItemValue, children: formatModel(resolved.expert) })] }), _jsxs("div", { className: styles.popoverItem, children: [_jsx("span", { className: styles.popoverItemLabel, children: "\u526F\u6A21\u578B\u5B50\u4EE3\u7406:" }), _jsx("span", { className: styles.popoverItemValue, children: formatModel(resolved.executor) })] }), _jsxs("div", { className: styles.popoverItem, children: [_jsx("span", { className: styles.popoverItemLabel, children: "\u5F53\u524D\u7B56\u7565:" }), _jsx("span", { className: styles.popoverItemValue, children: resolved.strategy === 'saver' ? '更省' : resolved.strategy === 'powerful' ? '更强' : '智能平衡' })] })] }), _jsxs("div", { className: styles.statsCard, children: [_jsxs("div", { className: styles.statItem, children: [_jsx("span", { className: styles.statItemLabel, children: "\u4E13\u5BB6\u4E3B\u63A7\u8C03\u7528" }), _jsxs("span", { className: styles.statItemValue, children: [controllerCalls, " \u6B21"] })] }), _jsxs("div", { className: styles.statItem, children: [_jsx("span", { className: styles.statItemLabel, children: "\u526F\u6A21\u578B\u5B50\u4EE3\u7406\u8C03\u7528" }), _jsxs("span", { className: styles.statItemValue, children: [subagentCalls, " \u6B21"] })] }), _jsxs("div", { className: styles.statSavingsHighlight, children: [_jsx("span", { children: "\u526F\u6A21\u578B\u8C03\u7528\u5360\u6BD4" }), _jsxs("span", { className: headerStyles.savingsValue, children: [sessionMetrics?.estimatedSavingsPercent ?? 0, "%"] })] })] }), sessionMetrics?.consultations && sessionMetrics.consultations.length > 0 && (_jsxs("div", { children: [_jsxs("button", { type: "button", className: headerStyles.historyToggle, "aria-expanded": showHistory, onClick: () => setShowHistory((value) => !value), children: [_jsxs("span", { children: ["\u5386\u53F2\u4E13\u5BB6\u54A8\u8BE2 (", sessionMetrics.consultations.length, ")"] }), _jsx("span", { children: showHistory ? '收起' : '展开' })] }), showHistory && (_jsx("div", { className: styles.historyBox, children: sessionMetrics.consultations.map((item) => (_jsxs("div", { className: styles.historyItem, children: [_jsxs("div", { className: styles.historyHeader, children: [_jsx("span", { children: item.purpose }), _jsx("span", { className: headerStyles.historyTime, children: new Date(item.timestamp).toLocaleTimeString() })] }), _jsx("div", { className: styles.historySummary, children: item.question || item.summary })] }, item.id))) }))] })), _jsxs("div", { className: headerStyles.actionStack, children: [_jsxs("div", { className: headerStyles.actionRow, children: [_jsx("button", { type: "button", className: `${styles.button} ${headerStyles.actionButton}`, onClick: () => setPickingTarget('executor'), children: "\u6362\u526F\u6A21\u578B" }), _jsx("button", { type: "button", className: `${styles.button} ${headerStyles.actionButton}`, onClick: () => setPickingTarget('expert'), children: "\u6362\u4E13\u5BB6\u4E3B\u63A7" }), _jsx("button", { type: "button", className: `${styles.button} ${headerStyles.actionButton}`, onClick: () => {
                                    const nextStrategy = resolved.strategy === 'saver' ? 'balanced' : resolved.strategy === 'balanced' ? 'powerful' : 'saver';
                                    handleStrategyChange(nextStrategy);
                                }, children: "\u5207\u7B56\u7565" })] }), _jsxs("div", { className: headerStyles.actionRow, children: [_jsx("button", { type: "button", className: `${styles.button} ${headerStyles.actionButton} ${resolved.enabled ? '' : styles.buttonPrimary}`, disabled: !configured && !resolved.enabled, onClick: () => void handleToggle(), children: resolved.enabled ? '关闭模式' : '开启模式' }), onOpenSettings && (_jsx("button", { type: "button", className: `${styles.button} ${headerStyles.actionButton}`, onClick: () => { setOpen(false); onOpenSettings(); }, children: "\u5B8C\u6574\u8BBE\u7F6E" }))] })] })] }));
    const onboardingPopover = (_jsxs(_Fragment, { children: [_jsxs("div", { className: headerStyles.setupHeader, children: [_jsxs("div", { children: [_jsx("div", { className: headerStyles.setupEyebrow, children: "\u9996\u6B21\u8BBE\u7F6E \u00B7 \u7EA6 30 \u79D2" }), _jsx("h2", { className: headerStyles.setupTitle, children: "\u6027\u4EF7\u6BD4\u6A21\u5F0F" })] }), _jsx("button", { type: "button", className: headerStyles.setupClose, "aria-label": "\u5173\u95ED\u6027\u4EF7\u6BD4\u6A21\u5F0F\u5F15\u5BFC", onClick: dismissOnboarding, children: "\u00D7" })] }), _jsx("p", { className: headerStyles.setupLead, children: "\u4E13\u5BB6\u6A21\u578B\u8D1F\u8D23\u4E3B\u63A7\u548C\u6700\u7EC8\u4EA4\u4ED8\uFF0C\u526F\u6A21\u578B\u53EA\u6267\u884C\u4E3B\u63A7\u6D3E\u53D1\u7684\u5B50\u4EFB\u52A1\u3002\u5148\u786E\u8BA4\u4E24\u79CD\u89D2\u8272\uFF0C\u5B8C\u6210\u540E\u5373\u53EF\u5F00\u542F\u3002" }), _jsxs("div", { className: headerStyles.setupSteps, children: [_jsxs("div", { className: `${headerStyles.setupStep} ${isCompleteModelRoute(setupDraft.expert) ? headerStyles.setupStepReady : ''}`, children: [_jsx("span", { className: headerStyles.setupStepNumber, children: "01" }), _jsxs("div", { className: headerStyles.setupStepBody, children: [_jsx("div", { className: headerStyles.setupStepHeading, children: "\u4E13\u5BB6\u4E3B\u63A7\u6A21\u578B" }), _jsx("div", { className: headerStyles.setupStepValue, children: formatModel(setupDraft.expert) }), !isCompleteModelRoute(liveConfig.expert) && isCompleteModelRoute(defaultExpert) && (_jsx("div", { className: headerStyles.setupDefaultNote, children: "\u5DF2\u9884\u9009\u5F53\u524D\u9ED8\u8BA4\u6A21\u578B\uFF0C\u786E\u8BA4\u540E\u4F1A\u4FDD\u5B58\u5230\u6027\u4EF7\u6BD4\u6A21\u5F0F" }))] }), _jsx("button", { type: "button", className: `${styles.button} ${headerStyles.setupModelButton}`, onClick: () => setPickingTarget('expert'), children: isCompleteModelRoute(setupDraft.expert) ? '更换' : '选择' })] }), _jsxs("div", { className: `${headerStyles.setupStep} ${isCompleteModelRoute(setupDraft.executor) ? headerStyles.setupStepReady : ''}`, children: [_jsx("span", { className: headerStyles.setupStepNumber, children: "02" }), _jsxs("div", { className: headerStyles.setupStepBody, children: [_jsx("div", { className: headerStyles.setupStepHeading, children: "\u526F\u6A21\u578B / \u5B50\u4EE3\u7406\u6267\u884C\u6A21\u578B" }), _jsx("div", { className: headerStyles.setupStepValue, children: formatModel(setupDraft.executor) }), _jsx("div", { className: headerStyles.setupDefaultNote, children: "\u7528\u4E8E\u5E76\u884C\u8C03\u67E5\u3001\u5C40\u90E8\u5B9E\u73B0\u548C\u91CD\u590D\u6027\u5DE5\u4F5C" })] }), _jsx("button", { type: "button", className: `${styles.button} ${headerStyles.setupModelButton}`, onClick: () => setPickingTarget('executor'), children: isCompleteModelRoute(setupDraft.executor) ? '更换' : '选择' })] })] }), _jsxs("div", { className: headerStyles.setupStrategy, children: [_jsx("div", { className: headerStyles.setupStrategyLabel, children: "\u8FD0\u884C\u7B56\u7565" }), _jsx("div", { className: styles.strategyGroup, children: ['saver', 'balanced', 'powerful'].map((strategy) => (_jsxs("button", { type: "button", "aria-pressed": setupDraft.strategy === strategy, className: `${styles.strategyItem} ${setupDraft.strategy === strategy ? styles.strategyItemSelected : ''}`, onClick: () => handleStrategyChange(strategy), children: [_jsx("span", { className: styles.strategyTitle, children: strategy === 'saver' ? '更省' : strategy === 'powerful' ? '更强' : '平衡' }), _jsx("span", { className: styles.strategyDesc, children: strategy === 'saver' ? '少派发，控制调用量' : strategy === 'powerful' ? '积极并行，优先质量' : '按任务复杂度派发' })] }, strategy))) })] }), setupError && _jsx("div", { className: headerStyles.setupError, role: "alert", children: setupError }), _jsxs("div", { className: headerStyles.setupFooter, children: [_jsx("span", { className: headerStyles.setupHint, children: "\u914D\u7F6E\u4FDD\u5B58\u5728\u5168\u5C40\u9ED8\u8BA4\u4E2D\uFF0C\u53EF\u5728\u5B8C\u6574\u8BBE\u7F6E\u91CC\u8C03\u6574" }), _jsx("button", { type: "button", className: `${styles.button} ${styles.buttonPrimary} ${headerStyles.setupSubmit}`, disabled: saving || !isCompleteModelRoute(setupDraft.expert) || !isCompleteModelRoute(setupDraft.executor), onClick: () => void handleCompleteSetup(), children: saving ? '保存并开启中…' : '完成配置并开启' })] })] }));
    const popover = (_jsx("div", { ref: panelRef, className: `${styles.popover} ${headerStyles.popover} ${onboarding ? headerStyles.onboardingPopover : ''}`, role: "dialog", "aria-modal": "false", "aria-label": onboarding ? '性价比模式配置引导' : '性价比模式快捷设置', "data-value-mode-onboarding": onboarding ? 'true' : 'false', children: onboarding ? onboardingPopover : quickPopover }));
    return (_jsxs("div", { className: headerStyles.root, ref: rootRef, children: [_jsxs("button", { type: "button", ref: triggerRef, className: `${styles.headerChip} ${!resolved.enabled ? styles.headerChipDisabled : ''}`, "aria-expanded": open, "aria-label": "\u6027\u4EF7\u6BD4\u6A21\u5F0F\u72B6\u6001", onClick: () => {
                    if (!open && !explicitlyConfigured)
                        startOnboarding();
                    else
                        setOpen((value) => !value);
                }, title: "\u6027\u4EF7\u6BD4\u6A21\u5F0F\u72B6\u6001\u4E0E\u5FEB\u6377\u8BBE\u7F6E", children: [_jsx("span", { "aria-hidden": "true", children: "V" }), _jsx("span", { children: label })] }), open && renderPortal(popover), pickingTarget && (_jsx(ModelPicker, { title: pickingTarget === 'executor' ? '选择副模型 / 子代理执行模型' : '选择专家主控模型', current: onboarding ? setupDraft[pickingTarget] : pickingTarget === 'executor' ? resolved.executor : resolved.expert, onSelect: handleModelSelect, onClose: () => setPickingTarget(null), fetchModels: fetchModels }))] }));
};
