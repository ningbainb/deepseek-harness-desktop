import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './value-mode.module.css';
import layout from './value-mode-polish.module.css';
import picker from './value-mode-picker.module.css';
function errorText(reason) {
    if (reason instanceof Error && reason.message.trim())
        return reason.message.trim();
    if (typeof reason === 'string' && reason.trim())
        return reason.trim();
    return '模型目录加载失败，请稍后重试。';
}
export const ModelPicker = ({ title, current, onSelect, onClose, fetchModels }) => {
    const [groups, setGroups] = useState([]);
    const [failures, setFailures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadToken, setReloadToken] = useState(0);
    const dialogRef = useRef(null);
    useEffect(() => {
        dialogRef.current?.querySelector('button:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
    }, []);
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(null);
        setGroups([]);
        setFailures([]);
        if (!fetchModels) {
            setError('模型目录服务未连接，请更新或重启 DeepSeek Harness 后重试。');
            setLoading(false);
            return () => { active = false; };
        }
        void fetchModels().then((result) => {
            if (!active)
                return;
            setGroups(result.groups ?? []);
            setFailures(result.failures ?? []);
            setLoading(false);
        }, (reason) => {
            if (!active)
                return;
            setError(errorText(reason));
            setLoading(false);
        });
        return () => { active = false; };
    }, [fetchModels, reloadToken]);
    const choiceCount = groups.reduce((count, group) => count + group.models.length, 0);
    const hasFailures = failures.length > 0;
    const pickerContent = (_jsx("div", { className: `${styles.modalBackdrop} ${layout.modalBackdrop}`, role: "presentation", "data-value-mode-model-picker": "true", onClick: onClose, children: _jsxs("div", { ref: dialogRef, className: `${styles.modalContent} ${layout.modalContent}`, role: "dialog", "aria-modal": "true", "aria-label": title, onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: styles.header, children: [_jsxs("div", { className: styles.titleArea, children: [_jsx("div", { className: styles.title, children: title }), _jsx("div", { className: `${styles.desc} ${picker.subtitle}`, children: "\u4EC5\u663E\u793A\u5DF2\u914D\u7F6E\u5E76\u53EF\u8BBF\u95EE\u7684\u4F9B\u5E94\u5546\u6A21\u578B\uFF0C\u4E0D\u4F1A\u8BFB\u53D6\u6216\u586B\u5199 API Key\u3002" })] }), _jsx("button", { type: "button", className: styles.button, "aria-label": "\u5173\u95ED\u6A21\u578B\u9009\u62E9\u5668", onClick: onClose, children: "\u00D7" })] }), loading && _jsx("div", { className: styles.desc, role: "status", children: "\u52A0\u8F7D\u5DF2\u914D\u7F6E\u6A21\u578B\u5217\u8868\u4E2D..." }), error && (_jsxs("div", { className: picker.errorPanel, role: "alert", children: [_jsx("div", { className: picker.errorMessage, children: error }), _jsx("button", { type: "button", className: styles.button, onClick: () => setReloadToken((value) => value + 1), children: "\u91CD\u8BD5" })] })), !loading && hasFailures && (_jsxs("div", { className: picker.failurePanel, role: "status", children: [_jsx("div", { className: picker.failureTitle, children: choiceCount > 0 ? '部分供应商暂时无法读取模型，已成功加载的模型仍可选择。' : '已配置供应商暂时无法读取模型。' }), failures.map((failure) => (_jsxs("div", { className: picker.failureItem, children: [_jsx("span", { className: picker.failureProvider, children: failure.name || failure.id }), _jsx("span", { children: failure.message.trim() || '模型列表读取失败。' })] }, `${failure.id}:${failure.message}`)))] })), !loading && groups.length === 0 && !error && !hasFailures && (_jsx("div", { className: styles.desc, role: "status", children: "\u6682\u65E0\u5DF2\u914D\u7F6E\u7684\u6A21\u578B\u3002\u8BF7\u5148\u5728 DeepSeek Harness \u8BBE\u7F6E\u4E2D\u6DFB\u52A0\u5E76\u542F\u7528\u4F9B\u5E94\u5546\u3002" })), _jsx("div", { className: `${styles.modelList} ${layout.modelList}`, children: groups.map((group) => (_jsxs("div", { children: [_jsxs("div", { className: `${styles.providerGroup} ${picker.providerLabel}`, children: [_jsx("span", { children: group.name || group.id }), _jsxs("span", { className: picker.providerCount, children: [group.models.length, " \u4E2A\u6A21\u578B"] })] }), group.models.map((model) => {
                                const selected = current?.provider === group.id && current?.model === model.id;
                                const reasoningDefault = model.reasoning?.defaultEffort;
                                return (_jsxs("button", { type: "button", className: `${styles.modelOption} ${picker.optionButton} ${selected ? styles.modelOptionSelected : ''}`, "aria-pressed": selected, "data-model-provider": group.id, "data-model-id": model.id, "data-testid": `value-mode-model-${model.id}`, onClick: () => {
                                        onSelect({
                                            provider: group.id,
                                            model: model.id,
                                            ...(reasoningDefault ? { reasoningEffort: reasoningDefault } : {}),
                                        });
                                        onClose();
                                    }, children: [_jsxs("span", { className: picker.modelLine, children: [_jsx("span", { className: picker.modelName, children: model.name || model.id }), selected && _jsx("span", { className: picker.selectedBadge, children: "\u5F53\u524D" })] }), _jsxs("span", { className: picker.modelId, children: [group.id, " / ", model.id] }), model.description && _jsx("span", { className: picker.modelDescription, children: model.description })] }, `${group.id}:${model.id}`));
                            })] }, group.id))) }), _jsxs("div", { className: picker.footer, children: [_jsx("span", { className: picker.footerHint, children: choiceCount > 0 ? `${choiceCount} 个可用模型` : '模型来自当前运行时目录' }), _jsx("button", { type: "button", className: styles.button, onClick: onClose, children: "\u5173\u95ED" })] })] }) }));
    return typeof document === 'undefined' ? pickerContent : createPortal(pickerContent, document.body);
};
