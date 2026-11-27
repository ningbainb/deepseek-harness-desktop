import { appendFileSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const resource = {
  uri: 'ui://fixture/counter', name: 'MCP counter and table', mimeType: 'text/html;profile=mcp-app',
}
const html = readFileSync(new URL('./mcp-app-counter.html', import.meta.url), 'utf8')
const rows = [
  { item: 'Blue pencil', category: 'blue' },
  { item: 'Red notebook', category: 'red' },
  { item: 'Blue ruler', category: 'blue' },
]
const emptySchema = { type: 'object', properties: {}, additionalProperties: false }
const tools = [
  { name: 'show_counter', description: 'Open the counter and table view.', inputSchema: emptySchema,
    annotations: { readOnlyHint: true }, _meta: { ui: { resourceUri: resource.uri } } },
  { name: 'read_counter', description: 'Read the current fixture counter.', inputSchema: emptySchema,
    annotations: { readOnlyHint: true } },
  { name: 'filter_table', description: 'Read rows in the selected fixture category.',
    inputSchema: { type: 'object', properties: { category: { enum: ['blue', 'red'] } }, required: ['category'], additionalProperties: false },
    annotations: { readOnlyHint: true } },
  { name: 'save_note', description: 'Write a synthetic note.',
    inputSchema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'], additionalProperties: false },
    annotations: { readOnlyHint: false } },
]

function toolResult(description, structuredContent) {
  return { content: [{ type: 'text', text: description }], structuredContent }
}

function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return { protocolVersion: params.protocolVersion, capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'MCP Apps fixture', version: '1.0.0' } }
    case 'ping': return {}
    case 'tools/list': return { tools }
    case 'resources/list': return { resources: [resource] }
    case 'resources/read':
      if (params.uri === resource.uri) return { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: html }] }
      break
    case 'tools/call':
      switch (params.name) {
        case 'show_counter': return toolResult('Counter view opened.', { count: 2, rows })
        case 'read_counter': return toolResult('Current counter read.', { count: 7 })
        case 'filter_table': return toolResult('Filtered table read.', { rows: rows.filter(row => row.category === params.arguments.category) })
        case 'save_note':
          appendFileSync(process.argv[2], params.arguments.note + '\n', 'utf8')
          return toolResult('Saved fixture note.', { saved: true })
      }
      break
  }
  return undefined
}

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const { id, method, params } = JSON.parse(line)
  if (id == null) continue
  const result = dispatch(method, params)
  const body = result === undefined ? { error: { code: -32601, message: 'Unknown fixture method or argument' } } : { result }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...body }) + '\n')
}
