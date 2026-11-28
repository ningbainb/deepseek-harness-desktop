import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchFastOpsState } from "./api.js";
import { zh } from "./locales.js";
import css from './FastOpsDockBadge.module.css';
const HOVER_CLOSE_DELAY_MS = 120;
const PROJECTION_REFRESH_MIN_MS = 2500;
const OPEN_REFRESH_MIN_MS = 1000;
const STATE_CHANGED_EVENT = 'dsh-fast-ops:state-changed';
const defaultTranslate = (key) => zh[key];
const noopProjection = () => undefined;
/** Format a token count with compact B/M/K suffixes matching the bottom stats row. */
export function formatCompactTokens(value) {
    if (!Number.isFinite(value) || value <= 0)
        return '0';
    if (value >= 1_000_000_000)
        return `${Math.round(value / 100_000_000) / 10}B`;
    if (value >= 1_000_000)
        return `${Math.round(value / 10_000) / 100}M`;
    if (value >= 1_000)
        return `${Math.round(value / 10) / 100}K`;
    return String(Math.round(value));
}
/** Derive compact badge copy and active emphasis state from fast-ops counters. */
export function summarizeFastOpsBadge(counters, t = defaultTranslate) {
    const denoise = Math.max(0, Number(counters?.denoiseTokensSaved ?? 0));
    const spill = Math.max(0, Number(counters?.spillTokensSaved ?? 0));
    const totalSaved = denoise + spill;
    const files = Math.max(0, Number(counters?.filesReadInBatches ?? 0));
    const ops = Math.max(0, Number(counters?.batchCalls ?? 0))
        + Math.max(0, Number(counters?.astCalls ?? 0))
        + Math.max(0, Number(counters?.cacheSpills ?? 0));
    if (totalSaved > 0) {
        return {
            active: true,
            totalSaved,
            label: `${t('dockSavedPrefix')} ~${formatCompactTokens(totalSaved)}`,
        };
    }
    if (files > 0) {
        return {
            active: true,
            totalSaved: 0,
            label: `nbfast ${t('dockBatchSuffix')} ${files} ${t('dockFilesUnit')}`,
        };
    }
    if (ops > 0) {
        return {
            active: true,
            totalSaved: 0,
            label: `${t('dockOpsPrefix')} ${ops} ${t('dockOpsUnit')}`,
        };
    }
    return {
        active: false,
        totalSaved: 0,
        label: t('dockReady'),
    };
}
/** Render the always-visible nbfast savings pill and breakdown popover in the composer dock. */
export const FastOpsDockBadge = memo(function FastOpsDockBadge({ t = defaultTranslate, useProjection = noopProjection, }) {
    const [state, setState] = useState(null);
    const [pinned, setPinned] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [popoverShiftX, setPopoverShiftX] = useState(0);
    const rootRef = useRef(null);
    const popoverRef = useRef(null);
    const shiftRef = useRef(0);
    const hoverCloseTimer = useRef(undefined);
    const lastFetchedAtRef = useRef(0);
    const mountedRef = useRef(true);
    const projection = useProjection('liveTokenUsage');
    const projectionActivityKey = projection
        ? `${projection.uncachedInputTokens ?? 0}:${projection.outputTokens ?? 0}:${projection.cacheReadTokens ?? 0}:${projection.cacheWriteTokens ?? 0}`
        : '';
    const loadState = useCallback(async (force = false) => {
        if (typeof fetch !== 'function')
            return;
        const now = Date.now();
        if (!force && now - lastFetchedAtRef.current < OPEN_REFRESH_MIN_MS)
            return;
        lastFetchedAtRef.current = now;
        try {
            const next = await fetchFastOpsState();
            if (mountedRef.current)
                setState(next);
        }
        catch {
            // Keep the dock quiet if fast-ops host routes are unavailable.
        }
    }, []);
    useEffect(() => {
        mountedRef.current = true;
        void loadState(true);
        return () => {
            mountedRef.current = false;
            if (hoverCloseTimer.current !== undefined)
                clearTimeout(hoverCloseTimer.current);
        };
    }, [loadState]);
    useEffect(() => {
        if (typeof window === 'undefined')
            return undefined;
        const onStateChanged = () => { void loadState(true); };
        window.addEventListener(STATE_CHANGED_EVENT, onStateChanged);
        return () => window.removeEventListener(STATE_CHANGED_EVENT, onStateChanged);
    }, [loadState]);
    useEffect(() => {
        if (!projectionActivityKey)
            return;
        if (Date.now() - lastFetchedAtRef.current < PROJECTION_REFRESH_MIN_MS)
            return;
        void loadState(true);
    }, [projectionActivityKey, loadState]);
    const isOpen = pinned || hovered;
    useEffect(() => {
        if (!isOpen)
            return;
        void loadState(false);
    }, [isOpen, loadState]);
    useLayoutEffect(() => {
        if (!isOpen || typeof window === 'undefined') {
            shiftRef.current = 0;
            setPopoverShiftX(0);
            return undefined;
        }
        const updateClamp = () => {
            const popoverEl = popoverRef.current;
            if (!popoverEl)
                return;
            const rect = popoverEl.getBoundingClientRect();
            const baseLeft = rect.left - shiftRef.current;
            const baseRight = rect.right - shiftRef.current;
            const paneRect = rootRef.current?.closest('[data-pane="conversation"], main')?.getBoundingClientRect();
            const minLeft = Math.max(12, (paneRect?.left ?? 0) + 12);
            const maxRight = Math.min(window.innerWidth - 12, (paneRect?.right ?? window.innerWidth) - 12);
            let delta = 0;
            if (baseLeft < minLeft) {
                delta = Math.min(minLeft - baseLeft, Math.max(0, maxRight - baseRight));
            }
            else if (baseRight > maxRight) {
                delta = maxRight - baseRight;
            }
            const rounded = Math.round(delta);
            if (rounded !== shiftRef.current) {
                shiftRef.current = rounded;
                setPopoverShiftX(rounded);
            }
        };
        updateClamp();
        window.addEventListener('resize', updateClamp);
        return () => window.removeEventListener('resize', updateClamp);
    }, [isOpen, state]);
    useEffect(() => {
        if (!pinned || typeof document === 'undefined')
            return undefined;
        const onPointerDown = (event) => {
            if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) {
                setPinned(false);
                setHovered(false);
            }
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setPinned(false);
                setHovered(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [pinned]);
    if (!state?.settings?.enabled)
        return null;
    const counters = state.counters;
    const denoiseSaved = Math.max(0, Number(counters?.denoiseTokensSaved ?? 0));
    const spillSaved = Math.max(0, Number(counters?.spillTokensSaved ?? 0));
    const filesRead = Math.max(0, Number(counters?.filesReadInBatches ?? 0));
    const batchCalls = Math.max(0, Number(counters?.batchCalls ?? 0));
    const cacheSpills = Math.max(0, Number(counters?.cacheSpills ?? 0));
    const astCalls = Math.max(0, Number(counters?.astCalls ?? 0));
    const toolsActivated = Math.max(0, Number(counters?.toolsActivated ?? 0));
    const summary = summarizeFastOpsBadge(counters, t);
    const handleMouseEnter = () => {
        if (hoverCloseTimer.current !== undefined) {
            clearTimeout(hoverCloseTimer.current);
            hoverCloseTimer.current = undefined;
        }
        setHovered(true);
    };
    const handleMouseLeave = () => {
        if (hoverCloseTimer.current !== undefined)
            clearTimeout(hoverCloseTimer.current);
        hoverCloseTimer.current = setTimeout(() => {
            hoverCloseTimer.current = undefined;
            setHovered(false);
        }, HOVER_CLOSE_DELAY_MS);
    };
    return (_jsxs("div", { ref: rootRef, className: css.root, "data-dsh-fast-ops-dock": "", "data-saved": summary.active ? 'true' : 'false', "data-open": isOpen ? 'true' : 'false', onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave, children: [_jsxs("button", { type: "button", className: css.pill, "aria-expanded": isOpen, "aria-haspopup": "dialog", onClick: () => setPinned(prev => !prev), children: [_jsx("svg", { className: css.icon, width: "12", height: "12", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: _jsx("path", { d: "M9.2 1.8L3.8 9h4.1l-1.1 5.2L12.2 7H8.1l1.1-5.2z" }) }), _jsx("span", { className: css.pillText, children: summary.label })] }), isOpen && (_jsxs("div", { ref: popoverRef, className: css.popover, role: "dialog", "aria-label": t('dockPopoverTitle'), style: popoverShiftX !== 0 ? { transform: `translateX(${popoverShiftX}px)` } : undefined, children: [_jsxs("div", { className: css.popoverHeader, children: [_jsxs("span", { className: css.popoverTitleWrap, children: [_jsx("svg", { width: "13", height: "13", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: _jsx("path", { d: "M9.2 1.8L3.8 9h4.1l-1.1 5.2L12.2 7H8.1l1.1-5.2z" }) }), _jsx("span", { children: t('dockPopoverTitle') })] }), _jsx("span", { className: css.statusBadge, children: t('dockPopoverActive') })] }), summary.totalSaved > 0 && (_jsxs("div", { className: css.heroSaved, children: [_jsx("span", { className: css.heroLabel, children: t('dockMetricTotalSaved') }), _jsx("span", { className: css.heroValue, children: `~${formatCompactTokens(summary.totalSaved)} tok` })] })), _jsxs("dl", { className: css.metrics, children: [_jsx("dt", { children: t('dockMetricDenoise') }), _jsx("dd", { children: denoiseSaved > 0 ? `~${formatCompactTokens(denoiseSaved)} tok` : '0' }), _jsx("dt", { children: t('dockMetricSpill') }), _jsx("dd", { children: spillSaved > 0 || cacheSpills > 0
                                    ? `${spillSaved > 0 ? `~${formatCompactTokens(spillSaved)} tok` : '0'} · ${cacheSpills} ${t('dockSpillCountSuffix')}`
                                    : '0' }), _jsx("dt", { children: t('dockMetricBatch') }), _jsx("dd", { children: filesRead > 0 || batchCalls > 0
                                    ? `${filesRead} ${t('dockFilesUnit')} · ${batchCalls} ${t('dockBatchCallsSuffix')}`
                                    : `0 ${t('dockFilesUnit')}` }), _jsx("dt", { children: t('dockMetricAst') }), _jsx("dd", { children: `${astCalls} ${t('dockOpsUnit')}` }), _jsx("dt", { children: t('dockMetricTools') }), _jsx("dd", { children: `${toolsActivated} ${t('dockOpsUnit')}` })] }), _jsx("p", { className: css.footnote, children: t('dockFootnote') })] }))] }));
});
