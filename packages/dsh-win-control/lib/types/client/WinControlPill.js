import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { fetchWinControlState, setSessionWinControlGrant } from "./api.js";
import css from './WinControl.module.css';
const GRANT_CHANGED_EVENT = 'dsh:win-control-grant-changed';
export function shouldShowWinControlPill(state) {
    return Boolean(state && state.bridgedToolCount > 0 && state.sessionGranted === true);
}
export function shouldShowWinControlMenuOption(state) {
    return Boolean(state && state.bridgedToolCount > 0);
}
function useWinControlGrant(sessionId) {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        const load = () => {
            void fetchWinControlState(sessionId)
                .then((res) => { if (active)
                setState(res); })
                .catch(() => { });
        };
        load();
        const onChanged = (event) => {
            if (!(event instanceof CustomEvent))
                return;
            const detail = event.detail;
            if (!sessionId || detail?.sessionId !== sessionId || typeof detail.sessionGranted !== 'boolean')
                return;
            const granted = detail.sessionGranted;
            setState(prev => (prev ? { ...prev, sessionGranted: granted } : prev));
        };
        window.addEventListener(GRANT_CHANGED_EVENT, onChanged);
        return () => {
            active = false;
            window.removeEventListener(GRANT_CHANGED_EVENT, onChanged);
        };
    }, [sessionId]);
    const granted = Boolean(state?.sessionGranted);
    const disabled = busy || !sessionId;
    async function toggle() {
        if (disabled || !sessionId || !state)
            return;
        const next = !granted;
        setBusy(true);
        try {
            await setSessionWinControlGrant(sessionId, next);
            setState(prev => (prev ? { ...prev, sessionGranted: next } : prev));
            window.dispatchEvent(new CustomEvent(GRANT_CHANGED_EVENT, { detail: { sessionId, sessionGranted: next } }));
        }
        catch {
            // Non-fatal: pill preserves previous state.
        }
        finally {
            setBusy(false);
        }
    }
    return { state, granted, disabled, toggle };
}
export function WinControlPill({ sessionId, t }) {
    const { state, granted, disabled, toggle } = useWinControlGrant(sessionId);
    // Keep the composer bar uncluttered when desktop control is not armed for this session.
    if (!state || !shouldShowWinControlPill(state)) {
        return null;
    }
    const stateLabel = t('pillOn');
    return (_jsxs("button", { type: "button", className: css.pill, "data-active": "true", "aria-pressed": "true", "aria-label": stateLabel, disabled: disabled, title: `${stateLabel} — ${t('pillTooltip')}`, onClick: () => void toggle(), children: [_jsx("span", { className: css.dot, "aria-hidden": "true" }), _jsx("span", { children: t('pillLabel') }), _jsx("span", { className: css.countBadge, children: state.bridgedToolCount })] }));
}
export function WinControlMenuOption({ sessionId, locked, t }) {
    const { state, granted, disabled, toggle } = useWinControlGrant(sessionId);
    if (!state || !shouldShowWinControlMenuOption(state)) {
        return null;
    }
    return (_jsxs("button", { type: "button", role: "switch", className: css.menuSwitch, "aria-checked": granted, disabled: disabled || Boolean(locked), "data-dsh-win-control-option": "true", onClick: () => void toggle(), children: [_jsxs("span", { className: css.menuSwitchLabel, children: [_jsx("span", { children: t('menuToggle') }), _jsxs("span", { className: css.menuSwitchCount, children: [state.bridgedToolCount, " ", t('menuToggleHint')] })] }), _jsx("span", { className: css.menuSwitchTrack, "data-checked": granted ? 'true' : 'false', "aria-hidden": "true" })] }));
}
