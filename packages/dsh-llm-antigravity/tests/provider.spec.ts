import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm/types'
import { describe, expect, it } from 'vitest'
import { AntigravityAdapter, providerId, registerProvider } from '../src/provider.ts'
import { CliRunner, findCli, parseModels } from '../src/core/cli-runner.ts'
import { defaults, type Diagnostic } from '../src/config.ts'
import { ToolBridge } from '../src/core/tool-bridge.ts'

const mock = fileURLToPath(new URL('./mock-agy.mjs', import.meta.url))
const spawnMock: typeof spawn = ((_: string, args: string[], options: object) =>
  spawn(process.execPath, [mock, ...args], options)) as typeof spawn
const options: GenerateOptions = {
  provider: providerId, model: 'gemini-test',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
}
const runner = () => new CliRunner(spawnMock)
const config = { enabled: true, cliPath: process.execPath, transport: 'stream-json' as const,
  authMode: 'gemini-api-key' as const, effort: 'auto' as const, timeoutSeconds: 5, extraModels: '' }
const collect = async (adapter: Pick<AntigravityAdapter, 'stream'>, request = options) =>
  Array.fromAsync(adapter.stream(request))

describe('Antigravity CLI provider', () => {
  it('resolves absolute, PATH and Windows fallback paths and rejects relative overrides', async () => {
    expect(await findCli(process.execPath)).toBe(process.execPath)
    expect(await findCli('agy')).toBeUndefined()
    const binary = process.platform === 'win32' ? 'agy.exe' : 'agy'
    const location = join(process.cwd(), 'tests')
    const executable = join(location, binary)
    expect(await findCli('', { PATH: location }, async path => path === executable)).toBe(executable)
    expect(await findCli('', {}, async () => false)).toBeUndefined()
    if (process.platform === 'win32') {
      const fallback = join(location, 'agy', 'bin', binary)
      expect(await findCli('', { LOCALAPPDATA: location }, async path => path === fallback)).toBe(fallback)
    }
  })

  it('reports uninstalled and signed-out states and parses model slugs and names', async () => {
    expect((await runner().probe(join(process.cwd(), 'missing.exe'))).state).toBe('not-installed')
    const signedOut = new CliRunner(((...args: Parameters<typeof spawnMock>) =>
      spawnMock(args[0], ['signed-out'], args[2])) as typeof spawn)
    expect((await signedOut.probe(process.execPath)).state).toBe('not-authenticated')
    expect(parseModels('Fetching available models...\ngemini-test\tGemini Test\n')).toEqual([{ id: 'gemini-test', name: 'Gemini Test' }])
  })

  for (const transport of ['stream-json', 'acp'] as const) {
    it(`streams reasoning and text through ${transport}`, async () => {
      const adapter = new AntigravityAdapter(runner(), () => ({ ...config, transport }), undefined, () => true)
      expect(await collect(adapter)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'reasoning-delta', text: 'thinking' }),
        expect.objectContaining({ type: 'text-delta', text: 'hello back' }),
        { type: 'finish', reason: { kind: 'stop' } },
      ]))
    })
  }

  it.each(['stream-json', 'acp'] as const)('refuses a native tool event in %s', async transport => {
    const adapter = new AntigravityAdapter(runner(), () => ({ ...config, transport }), undefined, () => true)
    const chunks = await collect(adapter, { ...options,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'attempt-native-tool' }] }],
    })
    expect(chunks).toEqual([expect.objectContaining({ type: 'finish',
      reason: { kind: 'error', failure: expect.objectContaining({ message: expect.stringContaining('native tool call') }) },
    })])
  })

  it('returns declared calls as DSH blocks and preserves their arguments', async () => {
    const adapter = new AntigravityAdapter(runner(), () => config, undefined, () => true)
    const chunks = await collect(adapter, { ...options, tools: [
      { name: 'lookup', description: 'Find an entry', parameters: { type: 'object' } },
    ] })
    expect(chunks).toContainEqual(expect.objectContaining({ type: 'block-end',
      block: expect.objectContaining({ type: 'tool-call', name: 'lookup', arguments: '{"key":"value"}' }),
    }))
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('handles split tool frames and rejects undeclared tools', () => {
    const bridge = new ToolBridge(new Set(['lookup']))
    expect([...bridge.push('hello <dsh-too')]).toEqual(['hello '])
    expect([...bridge.push('l-call>{"name":"lookup","arguments":{"key":')]).toEqual([])
    expect([...bridge.push('"value"}}</dsh-tool-call>')]).toMatchObject([
      { type: 'tool-call', name: 'lookup', arguments: '{"key":"value"}' },
    ])
    expect([...bridge.push('<dsh-tool-call>{"name":"lookup","arguments":{"marker":"</dsh-tool-call>"}}</dsh-tool-call>')])
      .toMatchObject([{ type: 'tool-call', arguments: '{"marker":"</dsh-tool-call>"}' }])
    expect(() => [...bridge.push('<dsh-tool-call>{"name":"other","arguments":{}}</dsh-tool-call>')]).toThrow('undeclared')
  })

  it('lists cached models without waiting for the CLI probe', async () => {
    const cli = runner()
    const delayed = Promise.withResolvers<Diagnostic>()
    cli.probe = () => delayed.promise
    const changed = Promise.withResolvers<void>()
    const adapter = new AntigravityAdapter(cli, () => config, changed.resolve, () => true)
    const listed = adapter.listModels(providerId)
    try {
      expect(await Promise.race([listed, new Promise(resolve => setTimeout(() => resolve('blocked'), 100))])).toEqual([])
    } finally {
      delayed.resolve({ state: 'ready', path: process.execPath, models: [{ id: 'gemini-test', name: 'Gemini Test' }] })
    }
    await changed.promise
    expect((await adapter.listModels(providerId)).map(model => model.id)).toEqual(['gemini-test'])
  })

  it('refreshes the cached model catalog only when requested', async () => {
    const cli = runner()
    let probes = 0
    const probe = cli.probe.bind(cli)
    cli.probe = (...args) => { probes++; return probe(...args) }
    const adapter = new AntigravityAdapter(cli, () => config)
    await Promise.all([adapter.status(), adapter.status()])
    expect(probes).toBe(1)
    await adapter.status(true)
    expect(probes).toBe(2)
  })

  it('terminates a subprocess that exceeds its timeout', async () => {
    const wait = ((_: string, args: string[], settings: object) =>
      spawnMock(_, ['wait', ...args], settings)) as typeof spawn
    const adapter = new AntigravityAdapter(new CliRunner(wait), () => ({ ...config, timeoutSeconds: 0.1 }), undefined, () => true)
    expect((await collect(adapter)).at(-1)).toMatchObject({ type: 'finish', reason: {
      kind: 'error', failure: { message: 'Antigravity CLI request timed out.' },
    } })
  })

  it('terminates the subprocess on cancellation', async () => {
    const controller = new AbortController()
    let exited: Promise<unknown> | undefined
    const spawnWaiting = ((_: string, args: string[], settings: object) => {
      const process = spawnMock(_, ['wait', ...args], settings)
      exited = new Promise(resolve => process.once('close', resolve))
      controller.abort()
      return process
    }) as typeof spawn
    const adapter = new AntigravityAdapter(new CliRunner(spawnWaiting), () => config, undefined, () => true)
    const chunks = await collect(adapter, { ...options, signal: controller.signal })
    expect(exited).toBeDefined()
    await exited
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'aborted' } })
  })

  it('exposes the route, model catalog and stream through LlmRuntime', async () => {
    const ctx = new Context()
    const runtime = new LlmRuntime(ctx)
    const adapter = new AntigravityAdapter(runner(), () => ({ ...config, extraModels: 'gemini-local' }), undefined, () => true)
    const registration = registerProvider(runtime, adapter)
    try {
      expect(runtime.listProviders()).toContainEqual({ id: providerId, name: 'Antigravity CLI (Gemini)' })
      expect(runtime.listConfigurableProviders()).toContainEqual(expect.objectContaining({ provider: providerId, nativeAuth: { env: [], oauth: true } }))
      await adapter.status()
      expect((await runtime.listModels(providerId)).map(model => model.id)).toEqual(['gemini-test', 'gemini-local'])
      expect((await collect(runtime)).at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    } finally { registration() }
  })

  it('defaults to disabled OAuth over ACP and blocks all unverified harness credentials', async () => {
    expect(defaults.enabled).toBe(false)
    expect(defaults.authMode).toBe('oauth-personal')
    expect(defaults.transport).toBe('acp')

    for (const authMode of ['oauth-personal', 'oauth-business', 'gemini-api-key', 'agent-platform'] as const) {
      let spawned = false
      const trackingSpawn = ((...args: Parameters<typeof spawnMock>) => {
        spawned = true
        return spawnMock(...args)
      }) as typeof spawn
      const adapter = new AntigravityAdapter(new CliRunner(trackingSpawn), () => ({ ...config, authMode }))
      expect(await adapter.listModels(providerId)).toEqual([])
      const status = await adapter.status()
      expect(status).toMatchObject({ state: 'ready', authMode, harnessLlmAllowed: false })

      spawned = false
      const chunks = await collect(adapter)
      expect(spawned).toBe(false)
      expect(chunks).toEqual([
        expect.objectContaining({
          type: 'finish',
          reason: {
            kind: 'error',
            failure: expect.objectContaining({ message: expect.stringContaining('Terms Section 6') }),
          },
        }),
      ])
    }
  })
})
