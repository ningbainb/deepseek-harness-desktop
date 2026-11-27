import type { Context } from '@deepseek-ai/cordis'
import { WORK_OFFICE_PRESET_ID } from './types.ts'

interface PresetRegistryLike {
  register(definition: {
    id: string
    name: string
    description?: string
    order?: number
    plugins: Array<{ id: string; name: string; group?: boolean; isolate?: Record<string, boolean>; config?: unknown }>
  }): Promise<() => Promise<void>>
}

const WORK_OFFICE_PLUGINS = [
  {
    id: 'persona',
    name: '@deepseek-ai/dsh-persona',
    config: {
      prefix: 'You are an office productivity assistant in DeepSeek Harness Desktop Work Mode. Discover connected office services on demand, protect sensitive enterprise data, and ask for confirmation before sending messages, sharing externally, or deleting records.',
    },
  },
  {
    id: 'agent-instructions',
    name: '@deepseek-ai/dsh-agent-instructions',
    config: { maxBytes: 65536 },
  },
  { id: 'tool-office', name: '@deepseek-ai/dsh-tool-office' },
  { id: 'skill-office', name: '@deepseek-ai/dsh-skill-office' },
  { id: 'doc-ingest', name: '@ningbainb/dsh-doc-ingest', config: { tools: true } },
  { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash', config: { timeoutMs: 300000 } },
  { id: 'tool-str-replace-editor', name: '@deepseek-ai/dsh-tool-str-replace-editor', config: { maxOutputChars: 16000 } },
  { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
  { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
  { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
  { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
  { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } },
  { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user' },
  { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: false, searchTimeoutMs: 60000 } },
  {
    id: 'compaction',
    name: 'cordis:group',
    group: true,
    isolate: { compaction: true, toolResultPruner: true },
    config: [
      { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      { id: 'tool-result-pruner', name: '@deepseek-ai/dsh-compaction-tool-result-pruner', config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 } },
    ],
  },
]

export function registerWorkOfficePreset(ctx: Context): void {
  let closed = false
  let pending: Promise<void> | undefined
  let release: (() => Promise<void>) | undefined

  const start = (): void => {
    if (closed || pending) return
    const registry = (ctx as { get?: (key: string) => unknown }).get?.('agentPresets') as PresetRegistryLike | undefined
    if (!registry?.register) return
    pending = registry.register({
      id: WORK_OFFICE_PRESET_ID,
      name: '工作模式',
      description: '面向日常办公、文档协作与会议整理，按需调用已连接的办公生态服务。',
      order: 5,
      plugins: WORK_OFFICE_PLUGINS,
    }).then((dispose) => {
      if (closed) return dispose()
      release = dispose
      return undefined
    }).catch((error) => {
      ctx.logger?.warn?.(`dsh-desktop-compat: work-office preset declaration failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  ctx.inject(['agentPresets'] as never, start)
  ctx.effect(() => {
    start()
    return async () => {
      closed = true
      await pending
      await release?.()
    }
  }, 'dsh-desktop-compat: work-office preset')
}
