import { asObject, normalizeMcpAppPolicy, type McpAppResource } from '../core/mcp-apps.ts'

const CHANNEL = 'dsh-mcp-app'

function contentPolicy(resource: McpAppResource, networkAllowed: boolean, proxy: boolean): string {
  const { connectDomains, resourceDomains } = normalizeMcpAppPolicy(resource)
  const connect = networkAllowed && connectDomains.length > 0 ? connectDomains.join(' ') : "'none'"
  const domains = networkAllowed && resourceDomains.length > 0 ? ' ' + resourceDomains.join(' ') : ''
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    "frame-src " + (proxy ? 'about:' : "'none'"),
    "connect-src " + connect,
    "script-src 'unsafe-inline'" + domains,
    "style-src 'unsafe-inline'" + domains,
    'img-src data:' + domains,
    'font-src data:' + domains,
    'media-src data:' + domains,
    "worker-src 'none'",
  ].join('; ')
}

function safeJsLiteral(value: string): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

const reportScriptErrors = [
  '<script>',
  '(() => {',
  '  const report = message => parent.postMessage({ jsonrpc: "2.0", method: "notifications/message",',
  '    params: { level: "error", logger: "dsh-app-script", data: message.slice(0, 600) } }, "*");',
  '  addEventListener("error", event => { if (event instanceof ErrorEvent) report(event.message); });',
  '  addEventListener("unhandledrejection", event => {',
  '    const reason = event.reason;',
  '    report(reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Unhandled promise rejection");',
  '  });',
  '})();',
  '</script>',
].join('\n')

export function buildMcpAppDocument(resource: McpAppResource, token: string, networkAllowed: boolean): string {
  const childCsp = contentPolicy(resource, networkAllowed, false)
  const outerCsp = contentPolicy(resource, networkAllowed, true)
  const html = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'
    + childCsp + '"><meta name="referrer" content="no-referrer">' + reportScriptErrors + resource.html
  const script = [
    'const token = ' + safeJsLiteral(token) + ';',
    'const channel = ' + safeJsLiteral(CHANNEL) + ';',
    'const inner = document.createElement("iframe");',
    'inner.setAttribute("sandbox", "allow-scripts");',
    'inner.setAttribute("data-mcp-app-view", "");',
    'inner.title = "MCP App";',
    'inner.referrerPolicy = "no-referrer";',
    'addEventListener("message", event => {',
    '  if (event.source === parent && event.data?.channel === channel && event.data?.token === token) {',
    '    inner.contentWindow?.postMessage(event.data.message, "*");',
    '  } else if (event.source === inner.contentWindow && event.origin === "null") {',
    '    parent.postMessage({ channel, token, message: event.data }, "*");',
    '  }',
    '});',
    'inner.srcdoc = ' + safeJsLiteral(html) + ';',
    'document.body.append(inner);',
  ].join('\n')
  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'
    + outerCsp + '"><meta name="referrer" content="no-referrer">'
    + '<style>html,body,iframe{width:100%;height:100%;border:0;margin:0;display:block}</style></head>'
    + '<body><script>' + script + '</script></body></html>'
}

export function readMcpAppFrameMessage(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, source: Window, token: string): unknown {
  if (event.origin !== 'null' || event.source !== source) return undefined
  const envelope = asObject(event.data)
  return envelope?.channel === CHANNEL && envelope.token === token ? envelope.message : undefined
}

export function sendMcpAppFrameMessage(source: Window | null | undefined, token: string, message: unknown): void {
  source?.postMessage({ channel: CHANNEL, token, message }, '*')
}
