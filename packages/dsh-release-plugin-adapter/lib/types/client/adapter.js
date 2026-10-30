import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useSyncExternalStore } from 'react';
import { NS, zh, en } from "./locales.js";
import { VISIBILITY_KEY, readVisible, writeVisible, installVisibility, companionVisibleInDocument, notifyCompanionLifecycle } from "./visibility.js";
import { openPluginSettings } from "./settings-navigation.js";
import { installDafeiyuClearance } from "./dafeiyu-clearance.js";
import css from './adapter.module.css';
/** The existing suggestion marker controls CSS visibility within this session. */
function PredictionShortcut({ t }) {
    return _jsx("span", { className: css.predictionHint, "data-dsh-prompt-shortcut": "", role: "note", children: t('predictionShortcut') });
}
export function ReleasePluginsPanel({ t, preference }) {
    const visible = useSyncExternalStore(preference.subscribe, preference.getSnapshot);
    const [savingError, setSavingError] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const open = async (owner) => {
        try {
            await openPluginSettings(owner, window);
            setUnavailable(false);
        }
        catch {
            setUnavailable(true);
        }
    };
    return _jsxs("div", { className: css.panel, children: [_jsxs("div", { className: css.actions, children: [_jsx("button", { type: "button", onClick: () => { void open('@local/dsh-prompt-pilot'); }, children: t('prompt') }), _jsx("button", { type: "button", onClick: () => { void open('dsh-builtin-browser'); }, children: t('browser') })] }), _jsx("p", { className: css.notice, children: t('predictionHelp') }), unavailable && _jsx("p", { role: "alert", children: t('unavailable') }), _jsxs("section", { className: css.section, children: [_jsx("h3", { children: t('fish') }), _jsxs("label", { className: css.control, children: [_jsx("input", { type: "checkbox", checked: visible, onChange: event => setSavingError(!preference.set(event.currentTarget.checked)) }), t('visible')] }), _jsx("p", { className: css.notice, children: t('displayHelp') }), _jsx("p", { className: css.notice, children: t('hiddenHelp') }), savingError && _jsx("p", { role: "alert", children: t('storageError') })] })] });
}
export const inject = ['slots', 'locale'];
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'release plugins: dictionaries');
    ctx.effect(() => installDafeiyuClearance(window, document), 'release plugins: companion composer clearance');
    const storage = {
        getItem: (key) => window.localStorage.getItem(key),
        setItem: (key, value) => window.localStorage.setItem(key, value),
    };
    let visible = readVisible(storage);
    const display = installVisibility(document.documentElement, companionVisibleInDocument(visible, window.location.search));
    notifyCompanionLifecycle(window, companionVisibleInDocument(visible, window.location.search));
    const listeners = new Set();
    const update = (next) => {
        visible = next;
        const active = companionVisibleInDocument(next, window.location.search);
        display.set(active);
        notifyCompanionLifecycle(window, active);
        for (const listener of listeners)
            listener();
    };
    const preference = {
        getSnapshot: () => visible,
        subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
        set(next) { update(next); return writeVisible(storage, next); },
    };
    ctx.effect(() => {
        const onStorage = (event) => { if (event.key === VISIBILITY_KEY || event.key === null)
            update(readVisible(storage)); };
        window.addEventListener('storage', onStorage);
        return () => { window.removeEventListener('storage', onStorage); notifyCompanionLifecycle(window, false); display.dispose(); listeners.clear(); };
    }, 'release plugins: companion display');
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'release-plugin-adapter', order: 63, locale: NS,
        label: () => ctx.locale.bind(NS)('title'), inject: () => ({ preference }),
    }, ReleasePluginsPanel));
    ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock', id: 'release-prediction-shortcut', order: 90, locale: NS,
    }, PredictionShortcut));
}
