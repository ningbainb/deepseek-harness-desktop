import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { asObject, McpAppError, MCP_APP_API, MCP_APP_MIME, MCP_APP_TIMEOUT, MCP_APP_USER_REJECTED, readMcpAppPayload, } from "../core/mcp-apps.js";
import { canRunArtifactScripts } from "./frame-document.js";
import { buildMcpAppDocument, readMcpAppFrameMessage, sendMcpAppFrameMessage } from "./mcp-app-document.js";
import { createMcpAppProtocol } from "./mcp-app-protocol.js";
import { useArtifactTheme } from "./theme-bridge.js";
import css from './artifact.module.css';
const headers = { 'x-dsh-mcp-apps': '1', 'content-type': 'application/json' };
const rejectByUser = () => new McpAppError(MCP_APP_USER_REJECTED, 'USER_REJECTED');
function themeVariables(theme) {
    const variables = {
        '--color-background-primary': theme.tokens['--ui-bg'],
        '--color-background-secondary': theme.tokens['--ui-surface'],
        '--color-text-primary': theme.tokens['--ui-text'],
        '--color-text-secondary': theme.tokens['--ui-text-muted'],
        '--color-border-primary': theme.tokens['--ui-border'],
        '--color-ring-primary': theme.tokens['--ui-accent'],
        '--font-sans': window.getComputedStyle(document.body).fontFamily,
        '--border-radius-md': theme.tokens['--ui-radius'],
    };
    // SEP-1865 lets hosts omit variables they do not provide.
    return variables;
}
class NativeAppApprovalNeeded extends McpAppError {
    challengeId;
    constructor(challengeId) {
        super(-32002, 'Native approval required');
        this.challengeId = challengeId;
    }
}
async function appRequest(path, init, signal) {
    const response = await fetch(MCP_APP_API + path, { ...init, signal, headers, credentials: 'same-origin', cache: 'no-store' });
    const data = asObject(await response.json());
    if (!response.ok) {
        const error = asObject(data?.error);
        if (response.status === 409 && error?.code === -32002 && typeof data?.challengeId === 'string') {
            throw new NativeAppApprovalNeeded(data.challengeId);
        }
        throw new McpAppError(typeof error?.code === 'number' ? error.code : -32000, typeof error?.message === 'string' ? error.message : 'App request failed');
    }
    return data?.result;
}
const useDesktopSandbox = () => typeof window !== 'undefined' && window.self === window.top
    && window.location.protocol === 'dsh-runtime:'
    && canRunArtifactScripts(window.location, window.__dshArtifactSandboxGuarded === true);
export function McpAppCard({ app, t, inputActions }) {
    const dialog = useRef(null);
    const teardown = useRef();
    const [fullscreen, setFullscreen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [visible, setVisible] = useState(true);
    const [network, setNetwork] = useState(false);
    const [revision, setRevision] = useState(0);
    const [resource, setResource] = useState();
    const [loadError, setLoadError] = useState(false);
    const canMount = useDesktopSandbox();
    const afterTeardown = useCallback((reason, change) => {
        const current = teardown.current;
        if (current)
            void current(reason).then(change);
        else
            change();
    }, []);
    const reload = useCallback(() => {
        setResource(undefined);
        setRevision(value => value + 1);
    }, []);
    useEffect(() => {
        if (!canMount || !visible || collapsed)
            return;
        const abort = new AbortController();
        setLoadError(false);
        setResource(undefined);
        const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(MCP_APP_TIMEOUT)]);
        const path = '/resource/' + app.handle + '?sessionId=' + encodeURIComponent(app.sessionId);
        void appRequest(path, {}, signal).then(value => {
            if (abort.signal.aborted)
                return;
            const payload = readMcpAppPayload(value);
            if (!payload)
                throw new Error('Invalid MCP App resource');
            setResource(payload);
        }).catch(() => { if (!abort.signal.aborted)
            setLoadError(true); });
        return () => abort.abort();
    }, [app.handle, app.sessionId, canMount, collapsed, revision, visible]);
    useEffect(() => {
        if (!dialog.current || typeof IntersectionObserver !== 'function')
            return;
        let disposed = false;
        let inRange = true;
        let draining = false;
        const observer = new IntersectionObserver(entries => {
            if (!entries[0])
                return;
            inRange = entries[0].isIntersecting;
            if (draining)
                return;
            if (inRange)
                setVisible(true);
            else {
                draining = true;
                afterTeardown('offscreen', () => {
                    draining = false;
                    if (disposed)
                        return;
                    setVisible(inRange);
                    if (inRange)
                        reload();
                    else
                        setResource(undefined);
                });
            }
        }, { rootMargin: '800px 0px' });
        observer.observe(dialog.current);
        return () => { disposed = true; observer.disconnect(); };
    }, [afterTeardown, reload]);
    useLayoutEffect(() => {
        const node = dialog.current;
        if (!node)
            return;
        if (fullscreen && !node.open)
            node.showModal();
        else if (!fullscreen && node.open)
            node.close();
    }, [fullscreen]);
    const domains = resource ? [...new Set([...resource.connectDomains, ...resource.resourceDomains])] : [];
    const unavailable = !canMount || loadError;
    return _jsxs("dialog", { ref: dialog, className: css.mcpAppCard, "data-mcp-app-card": "", "data-mcp-app-server": app.server, "aria-label": app.title, onClose: () => setFullscreen(false), onCancel: () => setFullscreen(false), children: [_jsxs("header", { className: css.mcpAppHeader, children: [_jsxs("div", { children: [_jsx("span", { className: css.mcpAppBadge, children: "MCP App" }), _jsx("strong", { children: app.title }), _jsx("span", { className: css.mcpAppServer, children: app.server })] }), _jsxs("div", { children: [_jsx("button", { type: "button", className: css.actionButton, onClick: () => afterTeardown('reload', reload), children: t('mcp.reload') }), _jsx("button", { type: "button", className: css.actionButton, onClick: () => setFullscreen(value => !value), children: t(fullscreen ? 'card.close' : 'card.fullscreen') }), _jsx("button", { type: "button", className: css.actionButton, "aria-expanded": !collapsed, onClick: () => afterTeardown('collapse', () => {
                                    if (!collapsed)
                                        setResource(undefined);
                                    setCollapsed(!collapsed);
                                }), children: t(collapsed ? 'card.expand' : 'card.collapse') })] })] }), !collapsed && _jsxs(_Fragment, { children: [domains.length > 0 && _jsxs("div", { className: css.mcpAppStatus, children: [_jsx("span", { children: t(network ? 'mcp.networkAllowed' : 'mcp.networkBlocked') }), _jsx("span", { className: css.mcpAppDomains, children: domains.join(', ') }), _jsx("button", { type: "button", className: css.actionButton, onClick: () => afterTeardown('network-policy', () => setNetwork(!network)), children: t(network ? 'mcp.revokeNetwork' : 'mcp.allowNetwork') })] }), visible && resource && !unavailable
                        ? _jsx(McpAppView, { app: app, resource: resource, inputActions: inputActions, network: network, fullscreen: fullscreen, setFullscreen: setFullscreen, setCollapsed: setCollapsed, teardown: teardown, t: t }, app.handle + ':' + revision + ':' + network)
                        : _jsx("p", { className: css.mcpAppStatus, role: "status", children: unavailable ? t('mcp.unavailable') : !visible ? t('card.frameUnloaded') : t('mcp.loading') }), _jsxs("details", { className: css.mcpAppRaw, children: [_jsx("summary", { children: t('mcp.rawResult') }), _jsx("pre", { children: _jsx("code", { children: app.resultPreview }) })] })] })] });
}
function McpAppView({ app, resource, network, fullscreen, setFullscreen, setCollapsed, teardown, t, inputActions }) {
    const frame = useRef(null);
    const bridge = useRef();
    const [status, setStatus] = useState('loading');
    const [diagnostic, setDiagnostic] = useState('');
    const [height, setHeight] = useState(420);
    const [pending, setPending] = useState();
    const currentApproval = useRef();
    const theme = useArtifactTheme(true);
    const token = useMemo(() => window.crypto.randomUUID(), []);
    const source = useMemo(() => buildMcpAppDocument(resource, token, network), [network, resource, token]);
    const context = {
        theme: theme.scheme, platform: 'desktop', locale: document.documentElement.lang || navigator.language, displayMode: fullscreen ? 'fullscreen' : 'inline',
        availableDisplayModes: ['inline', 'fullscreen'],
        styles: { variables: themeVariables(theme) },
        containerDimensions: { maxHeight: 3200 },
    };
    const hostContext = useRef(context);
    hostContext.current = context;
    const input = useRef(inputActions);
    input.current = inputActions;
    const translate = useRef(t);
    translate.current = t;
    const fullscreenRef = useRef(fullscreen);
    fullscreenRef.current = fullscreen;
    useLayoutEffect(() => {
        let heightTimer;
        let readyTimer;
        const appScope = { handle: app.handle, sessionId: app.sessionId };
        const post = (route, data, signal) => appRequest(route, { method: 'POST', body: JSON.stringify({ ...appScope, ...data }) }, signal);
        const callTool = async (name, args, signal) => {
            const request = { name, arguments: args };
            try {
                return await post('/call-tool', request, signal);
            }
            catch (error) {
                if (!(error instanceof NativeAppApprovalNeeded))
                    throw error;
                const native = window;
                const approvalProof = await native.dshDesktop?.confirmMcpAppTool?.(error.challengeId);
                signal.throwIfAborted();
                if (!approvalProof)
                    throw rejectByUser();
                return post('/call-tool', { ...request, challengeId: error.challengeId, approvalProof }, signal);
            }
        };
        const ask = (name, signal) => {
            if (currentApproval.current || signal.aborted)
                return Promise.resolve(false);
            return new Promise((resolve) => {
                const abort = () => finish(false);
                const finish = (allowed) => {
                    signal.removeEventListener('abort', abort);
                    if (currentApproval.current?.finish === finish) {
                        currentApproval.current = undefined;
                        setPending(undefined);
                    }
                    resolve(allowed);
                };
                signal.addEventListener('abort', abort, { once: true });
                currentApproval.current = { name, finish };
                setPending(currentApproval.current);
            });
        };
        const session = createMcpAppProtocol({
            send: message => sendMcpAppFrameMessage(frame.current?.contentWindow, token, message),
            input: resource.input, result: resource.result, hostContext: hostContext.current,
            network: network ? { connectDomains: resource.connectDomains, resourceDomains: resource.resourceDomains } : undefined,
            initialized: () => { clearTimeout(readyTimer); setStatus('ready'); },
            scriptFailed(message) {
                clearTimeout(readyTimer);
                setDiagnostic(message);
                setStatus('script-error');
                void session.teardown('script-error').then(() => session.dispose());
            },
            teardownRequested() { void session.teardown('app-request').then(() => setCollapsed(true)); },
            resize(next) {
                clearTimeout(heightTimer);
                heightTimer = setTimeout(() => setHeight(next), 80);
            },
            display(mode) {
                if (mode === 'pip')
                    return fullscreenRef.current ? 'fullscreen' : 'inline';
                setFullscreen(mode === 'fullscreen');
                return mode;
            },
            async call(name, args, signal) {
                try {
                    if (!resource.readOnlyTools.includes(name) && !await ask(name, signal))
                        throw rejectByUser();
                    const result = await callTool(name, args, signal);
                    setStatus('ready');
                    return result;
                }
                catch (error) {
                    if (error instanceof McpAppError && error.code === MCP_APP_USER_REJECTED)
                        setStatus('rejected');
                    throw error;
                }
            },
            context: (params, signal) => post('/context', { context: params }, signal),
            async openLink(raw, signal) {
                let url;
                try {
                    url = new URL(raw);
                }
                catch {
                    throw new McpAppError(-32602, 'Invalid URL');
                }
                if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
                    throw new McpAppError(-32602, 'Invalid URL');
                if (!await ask(url.origin, signal))
                    throw rejectByUser();
                const state = window;
                if (!state.dshDesktop)
                    throw new McpAppError(-32000, 'Link opening is unavailable');
                await state.dshDesktop.openExternalUrl(url.href);
                return {};
            },
            async message(params, signal) {
                const content = Array.isArray(params.content) ? params.content : [params.content];
                const text = content.slice(0, 32).flatMap(item => {
                    const block = asObject(item);
                    return block?.type === 'text' && typeof block.text === 'string' ? [block.text] : [];
                }).join('\n').slice(0, 8000);
                const actions = input.current;
                if (!actions || params.role !== 'user' || !text.trim())
                    throw new McpAppError(-32602, 'Invalid message');
                if (!await ask(translate.current('mcp.insertMessage'), signal))
                    throw rejectByUser();
                if (!actions.insertText('\n' + text + '\n', actions.captureInsertion()))
                    throw new McpAppError(-32000, 'Composer unavailable');
                return {};
            },
            async read(uri, signal) {
                if (uri === app.resourceUri)
                    return { contents: [{ uri, mimeType: MCP_APP_MIME, text: resource.html }] };
                return post('/read-resource', { uri }, signal);
            },
        });
        bridge.current = session;
        teardown.current = reason => session.teardown(reason);
        readyTimer = setTimeout(() => setStatus('error'), MCP_APP_TIMEOUT);
        const receive = (event) => {
            const sourceWindow = frame.current?.contentWindow;
            if (!sourceWindow)
                return;
            const message = readMcpAppFrameMessage(event, sourceWindow, token);
            if (message !== undefined)
                void session.receive(message);
        };
        window.addEventListener('message', receive);
        return () => {
            void session.teardown('unmount');
            window.removeEventListener('message', receive);
            clearTimeout(heightTimer);
            clearTimeout(readyTimer);
            session.dispose();
            currentApproval.current?.finish(false);
            bridge.current = undefined;
            teardown.current = undefined;
        };
    }, [app.handle, app.resourceUri, app.sessionId, network, resource, setCollapsed, setFullscreen, teardown, token]);
    useEffect(() => { bridge.current?.setHostContext(hostContext.current); }, [context.locale, fullscreen, theme]);
    return _jsxs(_Fragment, { children: [pending && _jsxs("div", { role: "alert", className: css.mcpAppStatus, "data-mcp-app-approval": "", children: [_jsx("span", { children: t('mcp.approval', { action: pending.name }) }), _jsx("button", { type: "button", className: css.actionButton, "data-mcp-app-continue": "", onClick: () => pending.finish(true), children: t('mcp.continue') }), _jsx("button", { type: "button", className: css.actionButton, "data-mcp-app-deny": "", onClick: () => pending.finish(false), children: t('mcp.deny') })] }), status !== 'ready' && status !== 'script-error' && _jsx("p", { role: "status", className: css.mcpAppStatus, children: t({
                    loading: 'mcp.loading', error: 'mcp.timeout', rejected: 'mcp.rejected',
                }[status]) }), status === 'script-error' && _jsxs("details", { className: css.mcpAppRaw, children: [_jsx("summary", { children: t('mcp.scriptFailed') }), _jsx("pre", { children: diagnostic })] }), _jsx("iframe", { ref: frame, className: css.mcpAppFrame, "data-mcp-app-sandbox": "", title: app.title, sandbox: "allow-scripts", referrerPolicy: "no-referrer", srcDoc: source, style: { height }, hidden: status === 'error' || status === 'script-error' })] });
}
