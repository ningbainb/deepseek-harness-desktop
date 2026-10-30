import type { LlmCallConfig, LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { ModelRouteSelection } from './config.ts'

/** Reapply source reasoning controls only when the exact destination supports them. */
export async function routedCallConfig(
  source: LlmCallConfig,
  route: ModelRouteSelection & { provider: string; model: string },
  llm: LlmRuntime,
  signal?: AbortSignal,
): Promise<LlmCallConfig> {
  signal?.throwIfAborted()
  const result = { ...source, provider: route.provider, model: route.model }
  if (route.reasoningEffort) {
    result.reasoningEffort = route.reasoningEffort as LlmCallConfig['reasoningEffort']
    return result
  }
  if (source.reasoningEffort === undefined
    || (source.provider === route.provider && source.model === route.model)) return result

  delete result.reasoningEffort
  try {
    const info = await llm.resolveModelInfo(route.provider, route.model, signal)
    signal?.throwIfAborted()
    if (info.reasoning?.efforts.some(effort => effort.id === source.reasoningEffort)) {
      result.reasoningEffort = source.reasoningEffort
    }
  } catch {
    // Missing/advisory catalog metadata must not reintroduce a source-model effort.
    // Explicit destination effort is retained above for normal SDK validation.
    signal?.throwIfAborted()
  }
  return result
}
