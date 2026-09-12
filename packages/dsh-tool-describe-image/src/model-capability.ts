/** Live image-input verdict from official Host model metadata. */
import type { apply as applyHost } from './index.ts'

type HostContext = Parameters<typeof applyHost>[0]
type Agent = NonNullable<ReturnType<HostContext['agents']['get']>>
type LlmResolvedModelInfo = Awaited<ReturnType<HostContext['llm']['resolveModelInfo']>>

interface ModelRoute { provider: string; model: string }
export interface ImageCapability { acceptsImages: boolean; known: boolean }

const UNKNOWN: ImageCapability = { acceptsImages: false, known: false }

/** Narrow only complete provider-owned model routes; names alone are ambiguous. */
function routeOf(value: unknown): ModelRoute | undefined {
  const route = value as Partial<ModelRoute> | null
  return typeof route?.provider === 'string' && route.provider !== ''
    && typeof route.model === 'string' && route.model !== ''
    ? { provider: route.provider, model: route.model } : undefined
}

/**
 * The ModelDirectory catalog does not expose modalities in DSH 0.1.5.
 * Match the official Session controller's next-selection precedence on Host:
 * pending durable selection, last request, then the live default.
 */
export function createImageCapabilityProbe(ctx: HostContext): (sessionId: string) => Promise<ImageCapability> {
  const service = (name: string): unknown => (ctx.get as (name: string) => unknown).call(ctx, name)
  return async sessionId => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const agents = service('agents') as { get(id: string): Agent | undefined } | undefined
      const agent = agents?.get(sessionId)
      if (agent === undefined) return UNKNOWN
      const projections = service('sessionProjections') as {
        stateOf(session: Agent['session'], key: 'modelSelection'): { pending?: unknown } | undefined
      } | undefined
      const defaults = service('agentDefaultModel') as { currentSelection(): unknown } | undefined
      const route = routeOf(projections?.stateOf(agent.session, 'modelSelection')?.pending)
        ?? routeOf(agent.session.requestHeader()?.config)
        ?? routeOf(defaults?.currentSelection())
      const llm = service('llm') as {
        resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>
      } | undefined
      if (route === undefined || llm === undefined) return UNKNOWN
      const metadata = await Promise.race([
        llm.resolveModelInfo(route.provider, route.model, controller.signal),
        new Promise<undefined>(resolve => {
          timer = setTimeout(() => { controller.abort(); resolve(undefined) }, 1200)
        }),
      ])
      const modalities = metadata?.inputModalities
      return modalities === undefined ? UNKNOWN : { acceptsImages: modalities.includes('image'), known: true }
    } catch {
      return UNKNOWN
    } finally {
      clearTimeout(timer)
    }
  }
}
