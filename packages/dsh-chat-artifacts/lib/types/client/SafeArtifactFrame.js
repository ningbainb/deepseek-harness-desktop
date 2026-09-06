import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import css from './artifact.module.css';
/** Defense-in-depth policy for the isolated artifact document. */
export const SAFE_ARTIFACT_CSP = [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    'media-src data: blob:',
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "navigate-to 'none'",
].join('; ');
const FRAME_CSS = [
    ':root { color-scheme: light dark; --artifact-bg: #ffffff; --artifact-fg: #1f2329; --artifact-muted: #667085; }',
    '@media (prefers-color-scheme: dark) { :root { --artifact-bg: #17191d; --artifact-fg: #f2f4f7; --artifact-muted: #98a2b3; } }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'html, body { margin: 0; min-height: 100%; }',
    'body { padding: 16px; overflow: auto; background: var(--artifact-bg); color: var(--artifact-fg); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; line-height: 1.5; }',
    'a { color: inherit; }',
    'svg { max-width: 100%; }',
].join('\n');
/** Wrap a validated fragment in a document with a restrictive CSP and theme tokens. */
export function buildSafeArtifactDocument(html) {
    const csp = SAFE_ARTIFACT_CSP.replaceAll('"', '&quot;');
    return '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="' + csp + '"><style>' + FRAME_CSS + '</style></head><body>' + html + '</body></html>';
}
/**
 * Render an artifact in a sandbox without allow-scripts. Far-away frames are
 * removed to keep long conversations cheap; the document is deterministic, so
 * remounting has no application state to lose.
 */
export function SafeArtifactFrame({ html, title, height, expanded, unloadedLabel, }) {
    const rootRef = useRef(null);
    const [mounted, setMounted] = useState(true);
    const srcDoc = useMemo(() => buildSafeArtifactDocument(html), [html]);
    const collapsedHeight = Math.min(height, 420);
    const frameHeight = expanded ? 'min(' + height + 'px, 90vh)' : collapsedHeight + 'px';
    useEffect(() => {
        const root = rootRef.current;
        if (root === null || typeof IntersectionObserver === 'undefined')
            return;
        let observer;
        try {
            observer = new IntersectionObserver((entries) => {
                const entry = entries[0];
                if (entry !== undefined) {
                    setMounted(entry.isIntersecting || entry.intersectionRatio > 0);
                }
            }, { rootMargin: '800px 0px' });
            observer.observe(root);
        }
        catch {
            setMounted(true);
        }
        return () => observer?.disconnect();
    }, []);
    return (_jsx("div", { ref: rootRef, className: css.frameViewport, style: { height: frameHeight }, children: mounted ? (_jsx("iframe", { className: css.frame, title: title, srcDoc: srcDoc, sandbox: "", loading: "lazy", referrerPolicy: "no-referrer" })) : (_jsx("div", { className: css.unloaded, role: "status", children: unloadedLabel })) }));
}
