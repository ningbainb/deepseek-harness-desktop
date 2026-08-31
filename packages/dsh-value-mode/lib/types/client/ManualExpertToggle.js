import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import styles from './value-mode.module.css';
export const ManualExpertToggle = ({ armed = false, onToggle, }) => {
    const [isArmed, setIsArmed] = useState(armed);
    const handleClick = () => {
        const next = !isArmed;
        setIsArmed(next);
        onToggle?.(next);
    };
    return (_jsxs("button", { type: "button", className: `${styles.manualToggle} ${isArmed ? styles.manualToggleActive : ''}`, onClick: handleClick, title: isArmed ? '本次请求将优先使用专家分析（点击取消）' : '点击指示下一次请求使用专家分析', children: [_jsx("span", { style: { fontSize: 10 }, children: "\u2605" }), _jsx("span", { children: isArmed ? '本次使用专家分析' : '专家分析' })] }));
};
