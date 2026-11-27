import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sanitizeStreamingHtml } from "../core/streaming.js";
import { validateArtifactHtml } from "../core/types.js";
import css from './artifact.module.css';
import { buildSafeArtifactDocument, canRunArtifactScripts, readArtifactFrameMessage, sendArtifactTheme, } from "./frame-document.js";
import { useArtifactTheme } from "./theme-bridge.js";
export { buildSafeArtifactDocument, SAFE_ARTIFACT_CSP } from "./frame-document.js";
const STREAM_INTERVAL = 120;
export const MIN_PREVIEW_HEIGHT = 72;
export const MAX_PREVIEW_HEIGHT = 3200;
function makeFrameToken() {
    if (typeof window === 'undefined' || window.self !== window.top)
        return;
    const native = window;
    if (!canRunArtifactScripts(window.location, native.__dshArtifactSandboxGuarded === true))
        return;
    try {
        const bytes = window.crypto.getRandomValues(new Uint8Array(16));
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    catch {
        return;
    }
}
export function SafeArtifactFrame({ html, title, height, expanded, unloadedLabel, mode = 'static', phase = 'settled', runNonce = 0, manualHeight, onAutoHeight, onDiagnostic, onAction, }) {
    const rootRef = useRef(null);
    const frameRef = useRef(null);
    const [mounted, setMounted] = useState(true);
    const [previewHtml, setPreviewHtml] = useState(html);
    const latestHtml = useRef(html);
    const [measured, setMeasured] = useState();
    const theme = useArtifactTheme(mounted);
    const themeRef = useRef(theme);
    const callbacks = useRef({ onAction, onDiagnostic });
    const streaming = phase === 'streaming';
    const source = streaming ? previewHtml : html;
    useLayoutEffect(() => {
        latestHtml.current = html;
        callbacks.current = { onAction, onDiagnostic };
    }, [html, onAction, onDiagnostic]);
    useEffect(() => {
        if (!streaming || !mounted)
            return;
        setPreviewHtml(latestHtml.current);
        const timer = setInterval(() => setPreviewHtml(latestHtml.current), STREAM_INTERVAL);
        return () => clearInterval(timer);
    }, [streaming, mounted]);
    const token = useMemo(() => !streaming && mounted ? makeFrameToken() : undefined, [mode, mounted, runNonce, source, streaming]);
    const frameHtml = useMemo(() => {
        if (!mounted)
            return '';
        if (token !== undefined)
            return validateArtifactHtml(source, mode).length === 0 ? source : undefined;
        if (streaming || mode === 'interactive')
            return sanitizeStreamingHtml(source) ?? '';
        return validateArtifactHtml(source).length === 0 ? source : '';
    }, [mode, mounted, source, streaming, token]);
    const bridgeToken = frameHtml !== undefined ? token : undefined;
    const interactive = mode === 'interactive' && bridgeToken !== undefined;
    // Bridged documents receive theme changes without reloading their contents.
    const documentTheme = bridgeToken === undefined ? theme : undefined;
    const srcDoc = useMemo(() => !mounted ? undefined : buildSafeArtifactDocument(frameHtml ?? '', {
        mode: interactive ? 'interactive' : 'static',
        theme: documentTheme ?? themeRef.current,
        token: bridgeToken,
    }), [bridgeToken, documentTheme, frameHtml, interactive, mounted]);
    useLayoutEffect(() => {
        themeRef.current = theme;
        if (bridgeToken !== undefined)
            sendArtifactTheme(frameRef.current?.contentWindow, bridgeToken, theme);
    }, [bridgeToken, theme]);
    useLayoutEffect(() => {
        if (bridgeToken === undefined)
            return;
        let remainingDiagnostics = 8;
        let lastAction = -Infinity;
        const seenDiagnostics = new Set();
        const receive = (event) => {
            const sourceWindow = frameRef.current?.contentWindow;
            if (!sourceWindow)
                return;
            const message = readArtifactFrameMessage(event, sourceWindow, bridgeToken);
            if (message?.type === 'resize') {
                const next = Math.max(MIN_PREVIEW_HEIGHT, Math.min(MAX_PREVIEW_HEIGHT, message.height));
                setMeasured(value => value?.token === bridgeToken && value.height === next ? value : { token: bridgeToken, height: next });
            }
            else if (interactive && message?.type === 'diagnostic' && remainingDiagnostics > 0) {
                const { message: text, line, column } = message;
                const key = JSON.stringify([text, line, column]);
                if (seenDiagnostics.has(key))
                    return;
                seenDiagnostics.add(key);
                remainingDiagnostics -= 1;
                callbacks.current.onDiagnostic?.({ message: text, line, column });
            }
            else if (interactive && message?.type === 'action') {
                const time = performance.now();
                if (time - lastAction < 1000)
                    return;
                lastAction = time;
                callbacks.current.onAction?.({ action: message.action, payload: message.payload });
            }
        };
        window.addEventListener('message', receive);
        return () => window.removeEventListener('message', receive);
    }, [bridgeToken, interactive]);
    useEffect(() => {
        const root = rootRef.current;
        if (root === null || typeof IntersectionObserver === 'undefined')
            return;
        let observer;
        try {
            observer = new IntersectionObserver((entries) => {
                const entry = entries[0];
                if (entry !== undefined)
                    setMounted(entry.isIntersecting || entry.intersectionRatio > 0);
            }, { rootMargin: '800px 0px' });
            observer.observe(root);
        }
        catch {
            setMounted(true);
        }
        return () => observer?.disconnect();
    }, []);
    const automatic = measured?.token === bridgeToken && measured !== undefined ? measured.height : height;
    useEffect(() => { onAutoHeight?.(automatic); }, [automatic, onAutoHeight]);
    const frameHeight = manualHeight !== undefined && Number.isFinite(manualHeight)
        ? Math.max(MIN_PREVIEW_HEIGHT, Math.min(MAX_PREVIEW_HEIGHT, manualHeight)) + 'px'
        : expanded && bridgeToken === undefined ? 'min(' + automatic + 'px, 82vh)' : automatic + 'px';
    return (_jsx("div", { ref: rootRef, className: css.frameViewport, style: { height: frameHeight }, children: mounted ? (_jsx("iframe", { ref: frameRef, className: css.frame, "data-artifact-frame-mode": interactive ? 'interactive' : 'static', "data-artifact-frame-sizing": bridgeToken === undefined ? 'fixed' : 'content', title: title, srcDoc: srcDoc, sandbox: interactive ? 'allow-scripts allow-forms' : bridgeToken !== undefined ? 'allow-scripts' : '', loading: "lazy", onLoad: () => {
                if (bridgeToken !== undefined)
                    sendArtifactTheme(frameRef.current?.contentWindow, bridgeToken, themeRef.current);
            }, referrerPolicy: "no-referrer" }, bridgeToken ?? runNonce)) : (_jsx("div", { className: css.unloaded, role: "status", children: unloadedLabel })) }));
}
