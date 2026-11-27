import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@ningbainb/dsh-user-scope'
import { LocalSearchService, SearchAccessError } from './host/service.ts'
import type { EmbeddingConfig } from './host/embeddings.ts'
import { searchRoutes } from './host/routes.ts'
import { dshHomePath } from './host/sdk-adapter.ts'

export const name = 'local-search'
export const inject = ['userScope', 'sessionQuery', 'workspaceRegistry']
export type { SearchDocument, SearchHit, SearchReason } from './core/search.ts'
export type { EmbeddingConfig } from './host/embeddings.ts'
export { LocalSearchService } from './host/service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    localSearch: LocalSearchService
  }
}

function argumentsOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid knowledge request')
  return value as Record<string, unknown>
}

function registerTools(ctx: Context, service: LocalSearchService): () => void {
  const output: ToolDefinition['output'] = {
    schema: { type: 'object', additionalProperties: true },
    render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }],
  }
  const definitions: ToolDefinition[] = [
    {
      name: 'kb_search',
      description: 'Search user-selected sources in the current workspace with local keyword and optional semantic matching.',
      parameters: {
        type: 'object', additionalProperties: false, required: ['query'],
        properties: { query: { type: 'string', maxLength: 1200 }, limit: { type: 'integer', minimum: 1, maximum: 12 } },
      },
      output,
      async execute(payload, execution) {
        const { query, limit } = argumentsOf(payload)
        if (!execution.agent) throw new SearchAccessError()
        if (typeof query !== 'string' || !query.trim() || query.length > 1200) throw new TypeError('Knowledge search query is invalid')
        return { hits: await service.searchKnowledge(execution.agent, query, typeof limit === 'number' ? limit : undefined), sourceIsUntrusted: true }
      },
    },
    {
      name: 'kb_read_chunk',
      description: 'Read one kb_search chunk from the current workspace as source data.',
      parameters: {
        type: 'object', additionalProperties: false, required: ['id'],
        properties: { id: { type: 'string', pattern: '^[a-f0-9]{64}$' } },
      },
      output,
      execute(payload, execution) {
        const { id } = argumentsOf(payload)
        if (!execution.agent) throw new SearchAccessError()
        if (typeof id !== 'string' || !/^[a-f0-9]{64}$/u.test(id)) throw new TypeError('Knowledge chunk ID is invalid')
        return service.readKnowledge(execution.agent, id)
      },
    },
  ]
  const disposers = definitions.map(definition => ctx.tools.register(definition))
  return () => { for (const dispose of disposers.reverse()) dispose() }
}

export function apply(ctx: Context, config: { embedding?: EmbeddingConfig } = {}): void {
  const dependencies = [dshHomePath(), ctx.userScope, ctx.sessionQuery, ctx.workspaceRegistry] as const
  let service: LocalSearchService
  try {
    service = new LocalSearchService(...dependencies, config.embedding)
  } catch {
    service = new LocalSearchService(...dependencies)
  }
  ctx.provide('localSearch', service)
  ctx.effect(() => {
    void service.warmDesktop().catch(() => {})
    return () => service.dispose()
  }, 'local-search: background index')
  ctx.inject(['webServer'], scope => {
    const disposers = searchRoutes(service).map(route => scope.webServer.register(route))
    return () => { for (const dispose of disposers) dispose() }
  })
  ctx.inject(['tools'], scope => registerTools(scope, service))
  ctx.on('session/event', (session, event) => {
    if (!['turn/end', 'session/title'].includes(event.type)) return
    const scope = ctx.userScope.currentScope() ?? ctx.userScope.desktopScope()
    if (scope) setImmediate(() => { void service.updateSession(scope, session.id).catch(() => {}) })
  })
}
