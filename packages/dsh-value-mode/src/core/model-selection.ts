import type { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { ModelRouteSelection, ValueModeConfig } from './config.ts'
import { isConfigured, resolveResolvedConfig } from './config.ts'

export type ModelHealthStatus = 'ready' | 'unconfigured' | 'unavailable'

export interface ValueModeHealth {
  status: 'active' | 'disabled' | 'unconfigured' | 'degraded'
  executorHealth: ModelHealthStatus
  expertHealth: ModelHealthStatus
  reason?: string
}

export function isRouteConfigured(route?: ModelRouteSelection): boolean {
  return (
    typeof route?.provider === 'string' &&
    route.provider.trim().length > 0 &&
    typeof route?.model === 'string' &&
    route.model.trim().length > 0
  )
}

export async function checkRouteAvailability(
  llm: LlmRuntime | undefined,
  route?: ModelRouteSelection,
): Promise<ModelHealthStatus> {
  if (!isRouteConfigured(route)) {
    return 'unconfigured'
  }
  if (!llm) {
    // If LLM runtime is not available yet, assume ready if configured
    return 'ready'
  }
  try {
    const providers = llm.listProviders()
    const providerExists = providers.some((p) => p.id === route!.provider)
    if (!providerExists) {
      return 'unavailable'
    }
    // Catalog is advisory, but if adapter is present, resolveModelInfo can verify
    return 'ready'
  } catch {
    return 'unavailable'
  }
}

export async function assessValueModeHealth(
  config: ValueModeConfig | undefined,
  llm: LlmRuntime | undefined,
): Promise<ValueModeHealth> {
  if (!config || !config.enabled) {
    const configured = isConfigured(config)
    return {
      status: 'disabled',
      executorHealth: isRouteConfigured(config?.executor) ? 'ready' : 'unconfigured',
      expertHealth: isRouteConfigured(config?.expert) ? 'ready' : 'unconfigured',
      reason: configured ? undefined : 'Models not yet configured',
    }
  }

  const executorHealth = await checkRouteAvailability(llm, config.executor)
  const expertHealth = await checkRouteAvailability(llm, config.expert)

  if (executorHealth === 'unconfigured' || expertHealth === 'unconfigured') {
    return {
      status: 'unconfigured',
      executorHealth,
      expertHealth,
      reason: 'Configuration incomplete',
    }
  }

  if (executorHealth === 'unavailable' || expertHealth === 'unavailable') {
    return {
      status: 'degraded',
      executorHealth,
      expertHealth,
      reason: executorHealth === 'unavailable' ? 'Executor model provider unavailable' : 'Expert model provider unavailable',
    }
  }

  return {
    status: 'active',
    executorHealth: 'ready',
    expertHealth: 'ready',
  }
}
