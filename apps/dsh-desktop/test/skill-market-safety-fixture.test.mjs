import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import { prepareSkillMarketMcpSentinel } from '../scripts/skill-market-safety-fixture.mjs'
import { installMarketTranslationProbe } from '../scripts/skill-market-translation-probe.mjs'

test('shared Agent sentinel uses a real valid public-package declaration and answers the MCP stdio protocol', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-safety-'))
  try {
    const fixture = await prepareSkillMarketMcpSentinel({ agentsHome: home })
    const require = createRequire(import.meta.url)
    const root = dirname(require.resolve('dsh-agent-plugins-market/package.json'))
    const { loadUserMcpSuite } = await import(pathToFileURL(join(root, 'lib/packages/market-mcp/src/application/mcp/mcp-direct-config.js')).href)
    const suite = await loadUserMcpSuite(home)
    assert.deepEqual(suite.errors, [])
    assert.equal(suite.mcp.servers.desktop_shared_guard.command, process.execPath)
    assert.deepEqual(suite.mcp.servers.desktop_shared_guard.args, [fixture.serverPath, fixture.sentinelPath])
    await assert.rejects(readFile(fixture.sentinelPath), { code: 'ENOENT' })
    const stdout = await new Promise((resolve, reject) => {
      const child = execFile(process.execPath, [fixture.serverPath, fixture.sentinelPath],
        { windowsHide: true, timeout: 10_000 }, (error, stdout) => error ? reject(error) : resolve(stdout))
      child.stdin.end([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'probe', arguments: {} } },
      ].map(request => JSON.stringify(request)).join('\n') + '\n')
    })
    const messages = stdout.trim().split('\n').map(line => JSON.parse(line))
    assert.equal(messages.find(message => message.id === 1).result.protocolVersion, '2024-11-05')
    assert.equal(messages.find(message => message.id === 2).result.tools[0].name, 'probe')
    assert.equal(messages.find(message => message.id === 3).result.content[0].text, 'isolated shared Agent sentinel')
    const executions = (await readFile(fixture.sentinelPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
    assert.equal(executions.length, 1)
    assert.equal(executions[0].event, 'started')
    assert.ok(Number.isSafeInteger(executions[0].pid))
    assert.deepEqual(await readFile(fixture.mcpPath), fixture.bytes)
  } finally {
    await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})

test('preparing a sentinel refuses to overwrite an existing shared Agent declaration', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-market-safety-existing-'))
  try {
    const mcpPath = join(home, 'mcp.json')
    const bytes = Buffer.from('{"mcpServers":{"existing":{"command":"preserve-me"}}}\n')
    await writeFile(mcpPath, bytes)
    await assert.rejects(prepareSkillMarketMcpSentinel({ agentsHome: home }), { code: 'EEXIST' })
    assert.deepEqual(await readFile(mcpPath), bytes)
  } finally {
    await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})

test('isolated translation interception exercises both installed machine providers and restores fetch', async () => {
  const original = globalThis.fetch
  const require = createRequire(import.meta.url)
  const root = dirname(require.resolve('dsh-agent-plugins-market/package.json'))
  const { createTranslationProviders } = await import(pathToFileURL(join(root,
    'lib/packages/market-translation/src/runtime/host/translation-providers.js')).href)
  const probe = installMarketTranslationProbe()
  const request = { texts: ['Desktop isolated skill market fixture'], locale: 'zh', signal: new AbortController().signal }
  try {
    const providers = createTranslationProviders({})
    await assert.rejects(providers[0].translate(request), /Controlled Google failure/u)
    assert.deepEqual(await providers[1].translate(request), ['隔离供应商翻译结果。'])
    assert.deepEqual(probe.requests.map(entry => entry.provider), ['google', 'microsoft'])
    assert.deepEqual(probe.requests[0].body[0][0], request.texts)
    assert.deepEqual(probe.requests[1].body, request.texts)
    const documentRequest = { ...request, texts: ['⟪d0⟫Read user notes and return a concise summary.⟪d1⟫'] }
    assert.deepEqual(await providers[1].translate(documentRequest), ['⟪d0⟫隔离供应商翻译结果。⟪d1⟫'])
  } finally {
    probe.dispose()
    assert.equal(globalThis.fetch, original)
  }
})
