import { LlmAdapter, type LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, LlmResolvedModelInfo, ReasoningEffortId, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm/types'
import { efforts, isHarnessLlmAllowed, namespace, type AuthMode, type Diagnostic, type Settings } from './config.ts'
import { CliRunner, findCli, installHint, modelSlug } from './core/cli-runner.ts'
import { acp, errorFinish, headless } from './core/transport.ts'
import { formatPrompt, ToolBridge } from './core/tool-bridge.ts'

export const providerId = 'antigravity-cli'
const displayName = 'Antigravity CLI (Gemini)'

export class AntigravityAdapter extends LlmAdapter {
  private cache?: { path: string; expires: number; probe: Promise<Diagnostic>; result?: Diagnostic }

  constructor(
    private readonly cli: CliRunner,
    private readonly settings: () => Settings,
    private readonly catalogUpdated: () => void = () => {},
    private readonly verifyHarnessAuth: (mode: AuthMode) => boolean = () => false,
  ) { super() }

  providerInfo(provider: string) { return { id: provider, name: displayName } }

  private canUseHarness(authMode: AuthMode): boolean {
    return isHarnessLlmAllowed(authMode) && this.verifyHarnessAuth(authMode)
  }

  async status(refresh = false): Promise<Diagnostic> {
    const settings = this.settings()
    const harnessLlmAllowed = this.canUseHarness(settings.authMode)
    if (!settings.enabled) return { state: 'disabled', authMode: settings.authMode, harnessLlmAllowed, models: [] }
    const path = settings.cliPath
    const now = Date.now()
    if (this.cache?.path !== path || (now >= this.cache.expires) || (refresh && this.cache.expires !== Infinity)) {
      const entry = {
        path, expires: Infinity, probe: this.cli.probe(path),
        result: this.cache?.path === path ? this.cache.result : undefined,
      }
      this.cache = entry
      void entry.probe.then(
        state => {
          entry.expires = Date.now() + (state.state === 'ready' ? 300_000 : 15_000)
          const changed = JSON.stringify(entry.result?.models) !== JSON.stringify(state.models)
          entry.result = state
          if (changed && this.cache === entry) this.catalogUpdated()
        },
        () => { entry.expires = 0 },
      )
    }
    const result = await this.cache.probe
    const models = result.state === 'ready' ? this.models(result, settings.extraModels) : result.models
    if (refresh && result.state === 'ready' && harnessLlmAllowed) {
      this.catalogUpdated()
    }
    return { ...result, authMode: settings.authMode, harnessLlmAllowed, models }
  }

  private models(result: Diagnostic | undefined, extras: string) {
    if (result?.state !== 'ready') return []
    const known = new Map(result.models.map(model => [model.id, model]))
    for (const id of extras.split(/[\s,]+/)) {
      if (modelSlug.test(id) && !known.has(id)) known.set(id, { id, name: id })
    }
    return [...known.values()]
  }

  async listModels(provider: string) {
    const settings = this.settings()
    if (!settings.enabled || !this.canUseHarness(settings.authMode)) return []
    // The SDK reads provider catalogs during renderer initialization. Refresh
    // outside that request, then notify model selectors to read the new view.
    void this.status().catch(() => {})
    return this.models(this.cache?.result, settings.extraModels)
      .map(model => ({ provider, ...model, inputModalities: ['text' as const] }))
  }

  async resolveModel(provider: string, id: string): Promise<LlmResolvedModelInfo> {
    const { effort } = this.settings()
    return {
      provider, id, name: id, inputModalities: ['text'],
      reasoning: {
        efforts: efforts.map(value => ({ id: value as ReasoningEffortId, name: value })),
        ...(effort === 'auto' ? {} : { defaultEffort: effort as ReasoningEffortId }),
      },
    }
  }

  async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    let index = 0
    let current: Extract<ContentBlock, { type: 'text' | 'reasoning' }> | undefined
    function* end(): Generator<StreamChunk> {
      if (!current) return
      yield { type: 'block-end', index: index++, block: current }
      current = undefined
    }
    function* delta(type: 'text' | 'reasoning', text: string): Generator<StreamChunk> {
      if (!text) return
      if (current?.type === type) current.text += text
      else {
        yield* end()
        current = { type, text }
        yield { type: 'block-start', index, blockType: type }
      }
      yield { type: type === 'text' ? 'text-delta' : 'reasoning-delta', index, text }
    }
    let calls = false
    function* emit(part: string | Extract<ContentBlock, { type: 'tool-call' }>): Generator<StreamChunk> {
      if (typeof part === 'string') {
        yield* delta('text', part)
        return
      }
      yield* end()
      calls = true
      yield { type: 'block-start', index, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index, name: part.name, id: part.id, argumentsDelta: part.arguments }
      yield { type: 'block-end', index: index++, block: part }
    }
    const { signal } = options
    try {
      signal?.throwIfAborted()
      const settings = this.settings()
      if (!settings.enabled) throw new Error('Antigravity CLI is disabled in DSH settings.')
      if (!this.canUseHarness(settings.authMode)) {
        throw new Error(
          'Antigravity harness access requires verified API-billed authentication because the CLI can reuse a saved OAuth login. Google Antigravity Terms Section 6 restricts OAuth to interactive use.',
        )
      }
      if (!modelSlug.test(options.model)) throw new Error('Invalid Antigravity CLI model ID.')
      const path = await findCli(settings.cliPath)
      if (!path) throw new Error(installHint)
      const effort = options.reasoningEffort ?? settings.effort
      const run = settings.transport === 'acp' ? acp : headless
      const bridge = new ToolBridge(new Set(options.tools?.map(tool => tool.name)))
      let usage: TokenUsage | undefined
      let reason: 'stop' | 'max-tokens' = 'stop'
      for await (const item of run(this.cli, {
        path, prompt: formatPrompt(options), model: options.model, signal,
        effort: efforts.find(candidate => candidate === effort), timeout: settings.timeoutSeconds * 1_000,
      })) {
        if (item.type === 'text') {
          for (const part of bridge.push(item.text)) yield* emit(part)
        } else if (item.type === 'reasoning') yield* delta('reasoning', item.text)
        else if (item.type === 'usage') usage = item.usage
        else reason = item.kind
      }
      signal?.throwIfAborted()
      for (const part of bridge.push('', true)) yield* emit(part)
      yield* end()
      if (usage) yield { type: 'usage', usage }
      yield { type: 'finish', reason: { kind: calls ? 'tool-calls' : reason } }
    } catch (error) {
      yield* end()
      yield { type: 'finish', reason: errorFinish(error, signal) }
    }
  }
}

export function registerProvider(runtime: LlmRuntime, adapter: AntigravityAdapter) {
  const unregister = runtime.registerAdapter([providerId], adapter)
  try {
    const removeDirectory = runtime.registerConfigurableProviders([{
      provider: providerId, displayName, settingsNs: namespace, settingsPath: [],
      declared: false, nativeAuth: { env: [], oauth: true },
    }])
    return () => { removeDirectory(); unregister() }
  } catch (error) {
    unregister()
    throw error
  }
}
