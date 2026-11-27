import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './artifact.module.css';
export function ArtifactFullscreenModal({ title, open, onClose, t, children }) {
    const [viewport, setViewport] = useState('desktop');
    return _jsxs(Modal, { headless: true, open: open, title: title, onClose: onClose, className: css.modal, children: [_jsxs("header", { className: css.modalHeader, children: [_jsx("strong", { children: title }), _jsx("div", { className: css.segments, role: "group", "aria-label": t('card.viewport'), children: ['desktop', 'tablet', 'phone'].map(size => _jsx("button", { type: "button", "aria-pressed": viewport === size, onClick: () => setViewport(size), children: t(`viewport.${size}`) }, size)) }), _jsx("button", { type: "button", className: css.actionButton, onClick: onClose, "aria-label": t('card.close'), children: t('card.close') })] }), _jsx("div", { "data-artifact-viewport": viewport, className: css.modalCanvas, children: children })] });
}
