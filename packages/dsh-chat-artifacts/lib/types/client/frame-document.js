import { ARTIFACT_DEFAULT_THEME_CSS, artifactThemeCss } from "./theme-bridge.js";
const CHANNEL = 'dsh-artifact';
const ACTION_NAME = /^[a-z][a-z0-9._-]{0,63}$/i;
const MAX_ACTION_BYTES = 8192;
const MAX_DIAGNOSTIC_LENGTH = 500;
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
    ':root { --artifact-bg: var(--ui-bg); --artifact-fg: var(--ui-text); --artifact-muted: var(--ui-text-muted); }',
    '*, *::before, *::after { box-sizing: border-box; }',
    'html, body { margin: 0; }',
    'body { padding: 16px; color: var(--artifact-fg); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; line-height: 1.5; }',
    'a { color: inherit; }',
    ':where(svg, img, video, canvas) { max-inline-size: 100%; }',
    ':where(svg[viewBox], img, video, canvas) { block-size: auto; }',
    ':where(th, td) { overflow-wrap: anywhere; }',
].join('\n');
// All bridge code is host-authored. Per-frame data stays in attributes and theme messages.
const BRIDGE_OPEN = String.raw `(() => {
  const { token, offset } = document.currentScript.dataset;
  document.currentScript.remove();
  const owner = window.parent;
  const post = owner.postMessage.bind(owner);
  const channel = 'dsh-artifact';
  const send = (type, fields) => post({ ...fields, channel, token, type }, '*');
`;
const INTERACTIVE_BRIDGE = String.raw `
  function memoryStorage() {
    const values = new Map();
    let size = 0;
    return Object.freeze({
      get length() { return values.size; },
      getItem(key) { return values.get(String(key)) ?? null; },
      setItem(key, value) {
        key = String(key);
        value = String(value);
        const previous = values.get(key);
        const next = size + value.length + (previous === undefined ? key.length : -previous.length);
        if (next > 262144 || (previous === undefined && values.size >= 512)) {
          throw new DOMException('Artifact storage is full', 'QuotaExceededError');
        }
        values.set(key, value);
        size = next;
      },
      removeItem(key) {
        key = String(key);
        const value = values.get(key);
        if (values.delete(key)) size -= key.length + value.length;
      },
      clear() { values.clear(); size = 0; },
      key(index) { return Array.from(values.keys())[index >>> 0] ?? null; },
    });
  }

  Object.defineProperties(window, {
    localStorage: { value: memoryStorage(), configurable: false, writable: false },
    sessionStorage: { value: memoryStorage(), configurable: false, writable: false },
    RTCPeerConnection: { value: undefined, configurable: false, writable: false },
    webkitRTCPeerConnection: { value: undefined, configurable: false, writable: false },
  });

  let lastAction = -Infinity;
  Object.defineProperty(window, 'dshUi', { value: Object.freeze({
    sendAction(action, payload) {
      const time = performance.now();
      if (!navigator.userActivation?.isActive || time - lastAction < 1000
          || typeof action !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/i.test(action)) return false;
      lastAction = time;
      try {
        const json = JSON.stringify(payload === undefined ? null : payload);
        if (json === undefined || new TextEncoder().encode(json).length > 8192) return false;
        send('action', { action, payload: json });
        return true;
      } catch {
        return false;
      }
    },
  }) });

  let remainingDiagnostics = 8;
  function report(message, line, column) {
    if (!remainingDiagnostics || typeof message !== 'string' || !message.trim()) return;
    remainingDiagnostics -= 1;
    send('diagnostic', { message: message.slice(0, 500), line, column });
  }
  window.addEventListener('error', event => {
    const line = event.lineno > Number(offset) ? event.lineno - Number(offset) : undefined;
    report(event.message, line, event.colno);
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    report(reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'Unhandled promise rejection');
  });
`;
const BRIDGE_CLOSE = String.raw `
  window.addEventListener('message', event => {
    const { data } = event;
    if (event.source !== owner || data?.channel !== channel || data.token !== token || data.type !== 'theme') return;
    const { scheme, tokens } = data.theme;
    const root = document.documentElement;
    root.style.colorScheme = scheme;
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
  });

  document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    let scheduled = false;
    let previous = -1;
    const measure = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const height = Math.ceil(Math.max(body.getBoundingClientRect().height, body.scrollHeight));
        if (height === previous) return;
        previous = height;
        send('resize', { height });
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    const mutations = new MutationObserver(measure);
    mutations.observe(body, { attributes: true, characterData: true, childList: true, subtree: true });
    document.addEventListener('load', measure, true);
    measure();
  }, { once: true });
})();`;
/** Build the frame document for validated HTML. The default also serves standalone exports. */
export function buildSafeArtifactDocument(html, options = {}) {
    const token = /^[a-f0-9]{32}$/.test(options.token ?? '') ? options.token : undefined;
    const interactive = options.mode === 'interactive';
    const csp = token === undefined ? SAFE_ARTIFACT_CSP : SAFE_ARTIFACT_CSP.replace("script-src 'none'", interactive ? "script-src 'unsafe-inline'" : "script-src 'nonce-" + token + "'");
    const theme = options.theme === undefined ? ARTIFACT_DEFAULT_THEME_CSS : artifactThemeCss(options.theme);
    const layout = token === undefined
        ? 'html, body { min-height: 100%; } body { overflow: auto; background: var(--artifact-bg); }'
        : 'body { display: flow-root; padding: 4px 0; }';
    const head = '<!doctype html><html><head><meta charset="utf-8">'
        + '<meta http-equiv="Content-Security-Policy" content="' + csp + '">'
        + '<meta name="referrer" content="no-referrer"><meta http-equiv="x-dns-prefetch-control" content="off">'
        + '<style>' + theme + '\n' + FRAME_CSS + '\n' + layout + '</style>';
    const body = '</head><body>\n';
    const script = BRIDGE_OPEN + (interactive ? INTERACTIVE_BRIDGE : '') + BRIDGE_CLOSE;
    const offset = (head + script + body).split('\n').length - 1;
    const bridge = token === undefined ? '' : '<script' + (interactive ? '' : ' nonce="' + token + '"')
        + ' data-token="' + token + '" data-offset="' + offset + '">' + script + '</script>';
    return head + bridge + body + html + '</body></html>';
}
export function canRunArtifactScripts(location, guarded) {
    return guarded && location.protocol === 'dsh-runtime:' && location.hostname === 'app' && location.port === '';
}
function readPosition(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
export function readArtifactFrameMessage(event, source, token) {
    if (event.source !== source || event.origin !== 'null' || typeof event.data !== 'object' || event.data === null)
        return;
    const data = event.data;
    if (data.channel !== CHANNEL || data.token !== token)
        return;
    if (data.type === 'resize' && typeof data.height === 'number' && Number.isSafeInteger(data.height) && data.height >= 0) {
        return { type: 'resize', height: data.height };
    }
    if (data.type === 'diagnostic' && typeof data.message === 'string') {
        const message = data.message.slice(0, MAX_DIAGNOSTIC_LENGTH).trim();
        if (message.length === 0)
            return;
        const line = readPosition(data.line);
        const column = readPosition(data.column);
        return { type: 'diagnostic', message, ...(line === undefined ? {} : { line }), ...(column === undefined ? {} : { column }) };
    }
    if (data.type === 'action' && typeof data.action === 'string' && ACTION_NAME.test(data.action)
        && typeof data.payload === 'string' && data.payload.length <= MAX_ACTION_BYTES
        && new TextEncoder().encode(data.payload).length <= MAX_ACTION_BYTES) {
        try {
            return { type: 'action', action: data.action, payload: JSON.parse(data.payload) };
        }
        catch {
            return;
        }
    }
}
export function sendArtifactTheme(frame, token, theme) {
    frame?.postMessage({ channel: CHANNEL, token, type: 'theme', theme }, '*');
}
