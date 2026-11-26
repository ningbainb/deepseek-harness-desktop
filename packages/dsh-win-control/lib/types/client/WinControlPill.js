import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { fetchWinControlState, setSessionWinControlGrant } from "./api.js";
import css from './WinControl.module.css';
export function WinControlPill({ sessionId, t }) {
    const [state, setState] = useState(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        let active = true;
        void fetchWinControlState(sessionId)
            .then((res) => { if (active)
            setState(res); })
            .catch(() => { });
        return () => { active = false; };
    }, [sessionId]);
    if (!state)
        return null;
    if (state.platform !== 'win32' && state.bridgedToolCount === 0 && state.installedVersions.length === 0) {
        return null;
    }
    const hasBridge = state.bridgedToolCount > 0 || state.installedVersions.length > 0;
    const granted = state.sessionGranted;
    const disabled = busy || !sessionId || !hasBridge;
    async function toggle() {
        if (disabled || !sessionId)
            return;
        setBusy(true);
        try {
            await setSessionWinControlGrant(sessionId, !granted);
            setState(prev => (prev ? { ...prev, sessionGranted: !granted } : prev));
        }
        catch {
            // Non-fatal: pill preserves previous state.
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("button", { type: "button", className: css.pill, "data-active": granted ? 'true' : 'false', "aria-pressed": granted, disabled: disabled, title: hasBridge ? t('pillTooltip') : t('pillUnavailable'), onClick: () => void toggle(), children: [_jsx("span", { className: css.dot, "aria-hidden": "true" }), _jsx("span", { children: granted ? t('pillOn') : t('pillOff') }), state.bridgedToolCount > 0 && _jsx("span", { className: css.countBadge, children: state.bridgedToolCount })] }));
}
