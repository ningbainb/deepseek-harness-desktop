import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { sanitizeStreamingHtml } from "../core/streaming.js";
import { SafeArtifactFrame } from "./SafeArtifactFrame.js";
import css from './artifact.module.css';
export function ArtifactFenceEnhancer({ code, streaming, lang, children, t }) {
    const [opened, setOpened] = useState(false);
    const completeDocument = /^\s*(?:<!doctype\s+html[^>]*>\s*)?<html\b[\s\S]*<\/html>\s*$/iu.test(code);
    if (streaming || (lang !== 'html-live' && !completeDocument))
        return _jsx(_Fragment, { children: children });
    const fragment = opened ? sanitizeStreamingHtml(code) : undefined;
    return _jsxs("div", { className: css.fence, "data-artifact-fence": lang, children: [_jsx("button", { type: "button", className: css.actionButton, "aria-expanded": opened, onClick: () => setOpened(value => !value), children: t(opened ? 'card.hidePreview' : 'card.showPreview') }), opened ? (fragment ? _jsx(SafeArtifactFrame, { html: fragment, title: t('card.preview'), height: 320, expanded: false, unloadedLabel: t('card.frameUnloaded') }) : _jsx("p", { role: "status", children: t('card.invalid') })) : children] });
}
