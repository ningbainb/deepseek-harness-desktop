import { describe, expect, it, vi } from 'vitest'
import { mcpAppResourceUri, readMcpAppResource } from '../src/core/mcp-apps.ts'
import { buildMcpAppDocument, readMcpAppFrameMessage } from '../src/client/mcp-app-document.ts'
import { createMcpAppProtocol } from '../src/client/mcp-app-protocol.ts'

describe('MCP App resources', () => {
  it('accepts standard and legacy tool metadata while fencing the resource body and CSP', () => {
    const uri = 'ui://fixture/counter'
    expect(mcpAppResourceUri({ ui: { resourceUri: uri } })).toBe(uri)
    expect(mcpAppResourceUri({ 'ui/resourceUri': uri })).toBe(uri)
    expect(mcpAppResourceUri({ ui: { resourceUri: 'https://example.com' } })).toBeUndefined()
    const result = { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: '<h1>hello</h1>', _meta: { ui: { csp: {
      connectDomains: ['https://api.example.com', 'https://*.example.com', 'https://host.test/x', 'https://127.0.0.1', 'https://escape.test; script-src *'],
      resourceDomains: ['https://assets.example.com'],
    } } } }] }
    expect(readMcpAppResource(uri, result)).toEqual({ html: '<h1>hello</h1>', connectDomains: ['https://api.example.com'], resourceDomains: ['https://assets.example.com'] })
    expect(readMcpAppResource('ui://fixture/other', result)).toBeUndefined()
    expect(readMcpAppResource(uri, { contents: [{ uri, mimeType: 'text/html', text: 'a'.repeat(2 * 1024 * 1024 + 1) }] })).toBeUndefined()
    const encoded = Buffer.from('<p>计数器</p>', 'utf8').toString('base64')
    expect(readMcpAppResource(uri, { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', blob: encoded }] }))
      .toMatchObject({ html: '<p>计数器</p>' })
    expect(readMcpAppResource(uri, { contents: [{ uri, mimeType: 'text/html', blob: '/w==' }] })).toBeUndefined()
  })

  it('injects the first CSP before untrusted HTML and validates both the outer frame and its token', () => {
    const descriptor = { html: '<script>window.foo = 1</script>', connectDomains: ['https://api.example.com'], resourceDomains: ['https://assets.example.com'] }
    const blocked = buildMcpAppDocument(descriptor, '0123456789abcdef', false)
    const enabled = buildMcpAppDocument(descriptor, '0123456789abcdef', true)
    expect(blocked).toContain("connect-src 'none'")
    expect(blocked).not.toContain('https://api.example.com')
    expect(enabled).toContain('connect-src https://api.example.com')
    expect(enabled).toContain('asset')
    expect(blocked).not.toContain('<script>window.foo')
    const source = {} as Window
    const message = { jsonrpc: '2.0', method: 'ui/initialize', id: 1 }
    const event = { source, origin: 'null', data: { channel: 'dsh-mcp-app', token: 'abc', message } }
    expect(readMcpAppFrameMessage(event, source, 'abc')).toEqual(message)
    expect(readMcpAppFrameMessage(event, {} as Window, 'abc')).toBeUndefined()
    expect(readMcpAppFrameMessage(event, source, 'wrong')).toBeUndefined()
    expect(readMcpAppFrameMessage({ ...event, origin: 'https://untrusted.example' }, source, 'abc')).toBeUndefined()
  })
})

describe('MCP App protocol', () => {
  it('initializes once, orders arguments before result, suppresses duplicate requests and changes theme', async () => {
    const send = vi.fn()
    const call = vi.fn(async () => ({ content: [{ type: 'text', text: '1' }] }))
    const context = vi.fn(async () => ({}))
    const resize = vi.fn()
    const controller = createMcpAppProtocol({
      send, call, context, read: async () => ({ contents: [] }), resize,
      display: mode => mode, openLink: async () => ({}), message: async () => ({}),
      input: { count: 1 }, result: { content: [] }, hostContext: { theme: 'light' },
    })
    await controller.receive({ jsonrpc: '2.0', id: 1, method: 'ui/initialize', params: { protocolVersion: '2026-01-26' } })
    expect(send.mock.calls[0]?.[0]).toMatchObject({ id: 1, result: { protocolVersion: '2026-01-26', hostContext: { theme: 'light' } } })
    await controller.receive({ jsonrpc: '2.0', method: 'ui/notifications/initialized' })
    await controller.receive({ jsonrpc: '2.0', method: 'ui/notifications/initialized' })
    expect(send.mock.calls.slice(1).map(([notification]) => notification.method)).toEqual(['ui/notifications/tool-input', 'ui/notifications/tool-result'])
    const request = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'read_counter', arguments: { count: 1 } } }
    await Promise.all([controller.receive(request), controller.receive(request)])
    expect(call).toHaveBeenCalledExactlyOnceWith('read_counter', { count: 1 }, expect.any(AbortSignal))
    await controller.receive({ jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { height: 4000 } })
    expect(resize).toHaveBeenCalledExactlyOnceWith(3200)
    controller.setHostContext({ theme: 'dark' })
    expect(send).toHaveBeenLastCalledWith({ jsonrpc: '2.0', method: 'ui/notifications/host-context-changed', params: { theme: 'dark' } })
    controller.dispose()
  })

  it('routes bounded standard requests and waits for the teardown reply', async () => {
    const send = vi.fn()
    const call = vi.fn(async () => ({ content: [] }))
    const context = vi.fn(async () => ({}))
    const openLink = vi.fn(async () => ({}))
    const read = vi.fn(async () => ({ contents: [] }))
    const message = vi.fn(async () => ({}))
    const scriptFailed = vi.fn()
    const teardownRequested = vi.fn()
    const controller = createMcpAppProtocol({
      send, call, context, openLink, read, message, scriptFailed, teardownRequested, resize: vi.fn(),
      display: mode => mode, input: {}, result: { content: [] }, hostContext: { theme: 'dark', displayMode: 'inline' },
    })
    const request = (id: number, method: string, params?: unknown) => controller.receive({ jsonrpc: '2.0', id, method, params })
    await request(1, 'tools/call', { name: 'read_counter' })
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1, error: expect.objectContaining({ code: -32000 }) }))
    await request(2, 'ui/initialize', { protocolVersion: '2026-01-26', appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] } })
    await controller.receive({ jsonrpc: '2.0', method: 'ui/notifications/initialized' })
    await request(3, 'ping')
    expect(send).toHaveBeenLastCalledWith({ jsonrpc: '2.0', id: 3, result: {} })
    await request(4, 'resources/read', { uri: 'kb://fixture/item' })
    expect(read).toHaveBeenCalledExactlyOnceWith('kb://fixture/item', expect.any(AbortSignal))
    await request(5, 'ui/update-model-context', { structuredContent: { count: 3 } })
    expect(context).toHaveBeenCalledExactlyOnceWith({ structuredContent: { count: 3 } }, expect.any(AbortSignal))
    await request(6, 'ui/open-link', { url: 'https://example.test' })
    expect(openLink).toHaveBeenCalledExactlyOnceWith('https://example.test', expect.any(AbortSignal))
    const content = { role: 'user', content: { type: 'text', text: 'Read the selected item' } }
    await request(7, 'ui/message', content)
    expect(message).toHaveBeenCalledExactlyOnceWith(content, expect.any(AbortSignal))
    await request(8, 'ui/request-display-mode', { mode: 'pip' })
    expect(send).toHaveBeenLastCalledWith({ jsonrpc: '2.0', id: 8, result: { mode: 'inline' } })
    await request(9, 'ui/request-display-mode', { mode: 'fullscreen' })
    expect(send).toHaveBeenLastCalledWith({ jsonrpc: '2.0', id: 9, result: { mode: 'fullscreen' } })
    await request(10, 'tools/call', { name: 'read_counter', arguments: { data: 'x'.repeat(125_000) } })
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ id: 10, error: expect.objectContaining({ code: -32602 }) }))
    expect(call).not.toHaveBeenCalled()

    await controller.receive({ jsonrpc: '2.0', method: 'notifications/message',
      params: { level: 'error', logger: 'dsh-app-script', data: 'Fixture script failure' } })
    expect(scriptFailed).toHaveBeenCalledExactlyOnceWith('Fixture script failure')
    await controller.receive({ jsonrpc: '2.0', method: 'ui/notifications/request-teardown' })
    expect(teardownRequested).toHaveBeenCalledTimes(1)
    const disposed = controller.teardown('reload')
    expect(send).toHaveBeenLastCalledWith({ jsonrpc: '2.0', id: 'dsh-host:teardown', method: 'ui/resource-teardown', params: { reason: 'reload' } })
    await controller.receive({ jsonrpc: '2.0', id: 'dsh-host:teardown', result: {} })
    await expect(disposed).resolves.toBeUndefined()
    await request(11, 'tools/call', { name: 'read_counter' })
    expect(call).not.toHaveBeenCalled()
    controller.dispose()
  })
})
