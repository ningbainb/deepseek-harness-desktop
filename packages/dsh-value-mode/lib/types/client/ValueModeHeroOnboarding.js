import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { isCompleteModelRoute, resolveResolvedConfig } from "../core/config.js";
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
function errorText(reason, fallback) {
    if (reason instanceof Error && reason.message.trim())
        return reason.message.trim();
    if (typeof reason === 'string' && reason.trim())
        return reason.trim();
    return fallback;
}
/**
 * Configuration guide for the blank-session hero. The official agent-preset
 * selector is a single root slot, so this guide is mounted as an additive
 * document-level surface rather than replacing the host selector.
 */
export const ValueModeHeroOnboarding = ({ config, settingsScope, defaultModelScope, onChange, fetchModels, onClose, initialError = null, }) => {
    const liveConfig = useValueModeConfig(settingsScope, config);
    const defaultExpert = useSettingsValue(defaultModelScope, undefined);
    const resolved = resolveResolvedConfig(liveConfig, defaultExpert);
    const [draft, setDraft] = useState(() => ({
        executor: { ...resolved.executor },
        expert: { ...resolved.expert },
        strategy: resolved.strategy,
    }));
    const [pickingTarget, setPickingTarget] = useState(null);
    const [error, setError] = useState(initialError);
    const [saving, setSaving] = useState(false);
    const dialogRef = useRef(null);
    const completedRef = useRef(false);
    const closeWithDismiss = () => {
        if (!completedRef.current)
            reportValueModeTelemetry({ kind: 'onboarding', outcome: 'dismissed', surface: 'hero' });
        onClose();
    };
    const defaultExpertKey = `${defaultExpert?.provider ?? ''}:${defaultExpert?.model ?? ''}:${defaultExpert?.reasoningEffort ?? ''}`;
    useEffect(() => {
        setDraft((current) => ({
            ...current,
            expert: isCompleteModelRoute(current.expert) ? current.expert : { ...resolved.expert },
        }));
    }, [defaultExpertKey, resolved.expert.provider, resolved.expert.model, resolved.expert.reasoningEffort]);
    useEffect(() => {
        setError(initialError ?? null);
    }, [initialError]);
    const loadModels = async () => {
        const catalog = await fetchModels();
        if (isCompleteModelRoute(defaultExpert)) {
            const defaultExists = catalog.groups.some((group) => (group.id === defaultExpert.provider && group.models.some((model) => model.id === defaultExpert.model)));
            if (!defaultExists) {
                throw new Error(`当前默认模型 ${formatModel(defaultExpert)} 不在可用模型目录中，请先在模型设置中选择可用模型。`);
            }
        }
        return catalog;
    };
    useEffect(() => {
        dialogRef.current?.querySelector('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
        const handleClickOutside = (event) => {
            const target = event.target;
            if (dialogRef.current?.contains(target))
                return;
            if (pickingTarget)
                return;
            closeWithDismiss();
        };
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape')
                return;
            if (pickingTarget) {
                setPickingTarget(null);
                return;
            }
            closeWithDismiss();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose, pickingTarget]);
    const handleModelSelect = (selection) => {
        if (!pickingTarget)
            return;
        setDraft((current) => ({ ...current, [pickingTarget]: selection }));
        setPickingTarget(null);
    };
    const handleComplete = async () => {
        if (!isCompleteModelRoute(draft.expert) || !isCompleteModelRoute(draft.executor)) {
            setError('请先选择专家主控模型和副模型 / 子代理执行模型。');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            // Model roles and strategy must be durable before the final enabled write.
            await onChange({
                expert: draft.expert,
                executor: draft.executor,
            });
            await onChange({ strategy: draft.strategy });
            await onChange({ enabled: true });
            completedRef.current = true;
            reportValueModeTelemetry({ kind: 'onboarding', outcome: 'completed', surface: 'hero' });
            reportValueModeTelemetry({ kind: 'state', state: 'enabled', source: 'onboarding' });
            onClose();
        }
        catch (reason) {
            reportValueModeTelemetry({ kind: 'onboarding', outcome: 'failed', surface: 'hero' });
            setError(errorText(reason, '配置写入失败，请重试。'));
        }
        finally {
            setSaving(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { ref: dialogRef, className: `${styles.popover} ${headerStyles.popover} ${headerStyles.onboardingPopover} ${headerStyles.heroOnboardingPopover}`, role: "dialog", "aria-modal": "false", "aria-label": "\u6027\u4EF7\u6BD4\u6A21\u5F0F\u914D\u7F6E\u5F15\u5BFC", "data-value-mode-onboarding": "true", "data-value-mode-hero-onboarding": "true", children: [_jsxs("div", { className: headerStyles.setupHeader, children: [_jsxs("div", { children: [_jsx("div", { className: headerStyles.setupEyebrow, children: "\u65B0\u4F1A\u8BDD\u8BBE\u7F6E \u00B7 \u7EA6 30 \u79D2" }), _jsx("h2", { className: headerStyles.setupTitle, children: "\u6027\u4EF7\u6BD4\u6A21\u5F0F" })] }), _jsx("button", { type: "button", className: headerStyles.setupClose, "aria-label": "\u5173\u95ED\u6027\u4EF7\u6BD4\u6A21\u5F0F\u5F15\u5BFC", onClick: closeWithDismiss, children: "\u00D7" })] }), _jsx("p", { className: headerStyles.setupLead, children: "\u4E13\u5BB6\u6A21\u578B\u8D1F\u8D23\u4E3B\u63A7\u3001\u62C6\u89E3\u548C\u6700\u7EC8\u4EA4\u4ED8\uFF0C\u526F\u6A21\u578B\u53EA\u6267\u884C\u4E3B\u63A7\u6D3E\u53D1\u7684\u5B50\u4EFB\u52A1\u3002\u5148\u786E\u8BA4\u4E24\u79CD\u89D2\u8272\uFF0C\u5B8C\u6210\u540E\u5373\u53EF\u5F00\u542F\u3002" }), _jsxs("div", { className: headerStyles.setupSteps, children: [_jsxs("div", { className: `${headerStyles.setupStep} ${isCompleteModelRoute(draft.expert) ? headerStyles.setupStepReady : ''}`, children: [_jsx("span", { className: headerStyles.setupStepNumber, children: "01" }), _jsxs("div", { className: headerStyles.setupStepBody, children: [_jsx("div", { className: headerStyles.setupStepHeading, children: "\u4E13\u5BB6\u4E3B\u63A7\u6A21\u578B" }), _jsx("div", { className: headerStyles.setupStepValue, children: formatModel(draft.expert) }), !isCompleteModelRoute(liveConfig.expert) && isCompleteModelRoute(defaultExpert) && (_jsx("div", { className: headerStyles.setupDefaultNote, children: "\u5DF2\u9884\u9009\u5F53\u524D\u9ED8\u8BA4\u6A21\u578B\uFF0C\u786E\u8BA4\u540E\u4F1A\u4FDD\u5B58\u5230\u6027\u4EF7\u6BD4\u6A21\u5F0F" }))] }), _jsx("button", { type: "button", className: `${styles.button} ${headerStyles.setupModelButton}`, onClick: () => setPickingTarget('expert'), children: isCompleteModelRoute(draft.expert) ? '更换' : '选择' })] }), _jsxs("div", { className: `${headerStyles.setupStep} ${isCompleteModelRoute(draft.executor) ? headerStyles.setupStepReady : ''}`, children: [_jsx("span", { className: headerStyles.setupStepNumber, children: "02" }), _jsxs("div", { className: headerStyles.setupStepBody, children: [_jsx("div", { className: headerStyles.setupStepHeading, children: "\u526F\u6A21\u578B / \u5B50\u4EE3\u7406\u6267\u884C\u6A21\u578B" }), _jsx("div", { className: headerStyles.setupStepValue, children: formatModel(draft.executor) }), _jsx("div", { className: headerStyles.setupDefaultNote, children: "\u7528\u4E8E\u5E76\u884C\u8C03\u67E5\u3001\u5C40\u90E8\u5B9E\u73B0\u548C\u91CD\u590D\u6027\u5DE5\u4F5C" })] }), _jsx("button", { type: "button", className: `${styles.button} ${headerStyles.setupModelButton}`, onClick: () => setPickingTarget('executor'), children: isCompleteModelRoute(draft.executor) ? '更换' : '选择' })] })] }), _jsxs("div", { className: headerStyles.setupStrategy, children: [_jsx("div", { className: headerStyles.setupStrategyLabel, children: "03 \u00B7 \u8FD0\u884C\u7B56\u7565" }), _jsx("div", { className: styles.strategyGroup, children: ['saver', 'balanced', 'powerful'].map((strategy) => (_jsxs("button", { type: "button", "aria-pressed": draft.strategy === strategy, className: `${styles.strategyItem} ${draft.strategy === strategy ? styles.strategyItemSelected : ''}`, onClick: () => {
                                        setDraft((current) => ({ ...current, strategy }));
                                        reportValueModeTelemetry({ kind: 'strategy', strategy });
                                    }, children: [_jsx("span", { className: styles.strategyTitle, children: strategy === 'saver' ? '更省' : strategy === 'powerful' ? '更强' : '平衡' }), _jsx("span", { className: styles.strategyDesc, children: strategy === 'saver' ? '少派发，控制调用量' : strategy === 'powerful' ? '积极并行，优先质量' : '按任务复杂度派发' })] }, strategy))) })] }), error && _jsx("div", { className: headerStyles.setupError, role: "alert", children: error }), _jsxs("div", { className: headerStyles.setupFooter, children: [_jsx("span", { className: headerStyles.setupHint, children: "\u914D\u7F6E\u4FDD\u5B58\u5728\u5168\u5C40\u9ED8\u8BA4\u4E2D\uFF0C\u53EF\u5728\u5B8C\u6574\u8BBE\u7F6E\u91CC\u8C03\u6574" }), _jsx("button", { type: "button", className: `${styles.button} ${styles.buttonPrimary} ${headerStyles.setupSubmit}`, disabled: saving || !isCompleteModelRoute(draft.expert) || !isCompleteModelRoute(draft.executor), onClick: () => void handleComplete(), children: saving ? '保存并开启中…' : '完成配置并开启' })] })] }), pickingTarget && (_jsx(ModelPicker, { title: pickingTarget === 'executor' ? '选择副模型 / 子代理执行模型' : '选择专家主控模型', current: draft[pickingTarget], onSelect: handleModelSelect, onClose: () => setPickingTarget(null), fetchModels: loadModels }))] }));
};
