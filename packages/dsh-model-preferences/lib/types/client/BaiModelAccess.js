import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import styles from './model-preferences.module.css';
export function BaiModelAccess({ t: translate, className, compact = true }) {
    const present = () => typeof document !== 'undefined' && document.querySelector('[data-dsh-relay-access-root]') !== null;
    const [available, setAvailable] = useState(present);
    useEffect(() => {
        const update = () => setAvailable(present());
        document.addEventListener('dsh-relay-access-changed', update);
        update();
        return () => document.removeEventListener('dsh-relay-access-changed', update);
    }, []);
    if (!available)
        return null;
    return _jsx("button", { type: "button", className: className ?? styles.smallButton, "data-dsh-relay-connect": "true", "aria-label": translate('action.bai'), title: translate('action.bai'), children: translate(compact ? 'action.baiCompact' : 'action.bai') });
}
