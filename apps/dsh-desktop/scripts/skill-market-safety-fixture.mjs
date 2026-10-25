import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function prepareSkillMarketMcpSentinel({ agentsHome }) {
  const directory = join(agentsHome, '.desktop-market-safety')
  const serverPath = join(directory, 'stdio.mjs')
  const sentinelPath = join(directory, 'started.jsonl')
  const mcpPath = join(agentsHome, 'mcp.json')
  await mkdir(directory, { recursive: true })
  await writeFile(serverPath, `
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

appendFileSync(process.argv[2], JSON.stringify({ event: 'started', pid: process.pid }) + '\\n')
if (process.argv[3] !== '--once') {
  const input = createInterface({ input: process.stdin })
  input.on('line', line => {
    const request = JSON.parse(line)
    if (request.id === undefined) return
    let result
    if (request.method === 'initialize') result = {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} }, serverInfo: { name: 'desktop-shared-agent-sentinel', version: '1.0.0' },
    }
    else if (request.method === 'tools/list') result = { tools: [{
      name: 'probe', description: 'Isolated shared Agent execution sentinel',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    }] }
    else if (request.method === 'tools/call') result = { content: [{ type: 'text', text: 'isolated shared Agent sentinel' }] }
    else if (request.method === 'ping') result = {}
    const response = result === undefined
      ? { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown fixture method' } }
      : { jsonrpc: '2.0', id: request.id, result }
    process.stdout.write(JSON.stringify(response) + '\\n')
  })
}
`, { flag: 'wx' })
  const bytes = Buffer.from(JSON.stringify({ mcpServers: {
    desktop_shared_guard: { type: 'stdio', command: process.execPath, args: [serverPath, sentinelPath] },
  } }, null, 2))
  await writeFile(mcpPath, bytes, { flag: 'wx' })
  return Object.freeze({ serverPath, sentinelPath, mcpPath, bytes })
}
