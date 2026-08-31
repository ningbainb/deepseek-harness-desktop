/**
 * @module @linxin666/dsh-value-mode
 * Value Mode (性价比模式) DSH Plugin
 *
 * Balances coding performance and model cost by using the expert model as the
 * top-level controller and the configured executor model for delegated child
 * agents.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-agent'
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm'

import {
  VALUE_MODE_SETTINGS_NAMESPACE,
  isConfigured,
  isEffectivelyActive,
  isCompleteModelRoute,
  resolveEffectiveConfig,
  resolveResolvedConfig,
  resolveSessionConfig,
  type ValueModeConfig,
  type DefaultModelSelection,
  type ValueModeStrategy,
  type SessionOverrideConfig,
} from './core/config.ts'
import { Config } from './core/schema.ts'
import {
  buildSystemPromptGuidance,
  VALUE_MODE_SECTION_NAME,
  VALUE_MODE_SECTION_ORDER,
} from './core/policy.ts'
import { createConsultExpertTool } from './core/expert.ts'
import { valueModeState } from './core/state.ts'
import { assessValueModeHealth } from './core/model-selection.ts'
import { emitValueModeRuntimeTelemetry } from './core/runtime-telemetry.ts'
import { dshHome } from './dsh-home.ts'
import { syncPresetTrees } from './sync.ts'

export const name = 'value-mode'
export const inject = ['tools', 'systemPrompt', 'settings', 'llm', 'agentDefaultModel']

export * from './core/config.ts'
export * from './core/schema.ts'
export * from './core/policy.ts'
export * from './core/expert.ts'
export * from './core/state.ts'
export * from './core/model-selection.ts'
export * from './core/runtime-telemetry.ts'
export { dshHome } from './dsh-home.ts'

/** Absolute path of the bundled Value Mode agent-preset tree. */
export function bundledPresetsRoot(): string {
  return fileURLToPath(new URL('../presets/', import.meta.url))
}

type DefaultModelService = {
  currentSelection?: () => DefaultModelSelection
}

function readDefaultExpert(ctx: Context): DefaultModelSelection | undefined {
  const service = (ctx as unknown as { agentDefaultModel?: DefaultModelService }).agentDefaultModel
  try {
    const selection = service?.currentSelection?.()
    return isCompleteModelRoute(selection) ? { ...selection } : undefined
  } catch {
    return undefined
  }
}

/**
 * Copy the bundled preset into the DSH discovery root. The preset must be
 * available even when the settings switch is off: users need to be able to
 * select Value Mode in the conversation header before configuring its models.
 */
function syncBundledPreset(ctx: Context): void {
  const targetRoot = join(dshHome(), '.agent-presets')
  try {
    mkdirSync(targetRoot, { recursive: true })
    const result = syncPresetTrees(bundledPresetsRoot(), targetRoot)
    for (const { id, error } of result.failed) {
      ctx.logger?.warn?.(`dsh-value-mode: preset ${id} sync failed: ${error}`)
    }
    if (result.synced.length > 0) {
      ctx.logger?.info?.(`dsh-value-mode: presets synced into ${targetRoot}: ${result.synced.join(', ')}`)
    }
  } catch (error) {
    ctx.logger?.warn?.(`dsh-value-mode: preset sync failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Apply the Value Mode host plugin to Cordis context.
 */
export function apply(ctx: Context, initialConfig: ValueModeConfig = {}): void {
  let currentConfig: ValueModeConfig = initialConfig
  let currentSource: () => ValueModeConfig = () => currentConfig
  const routedRequestAttempts = new Map<string, number>()

  const requestKey = (payload: unknown): string | undefined => {
    const value = payload as {
      agent?: { id?: unknown }
      turn?: unknown
      step?: unknown
    }
    if (
      typeof value?.agent?.id !== 'string'
      || !Number.isSafeInteger(value.turn)
      || !Number.isSafeInteger(value.step)
    ) return undefined
    return `${value.agent.id}:${value.turn}:${value.step}`
  }

  const pruneRoutedRequestAttempts = (now: number): void => {
    for (const [key, timestamp] of routedRequestAttempts) {
      if (now - timestamp > 10 * 60_000) routedRequestAttempts.delete(key)
    }
    while (routedRequestAttempts.size > 2_048) {
      const oldest = routedRequestAttempts.keys().next().value
      if (typeof oldest !== 'string') break
      routedRequestAttempts.delete(oldest)
    }
  }

  // Register the named agent preset independently of the settings switch so
  // it appears beside the other modes in dsh-mode-switcher immediately after
  // startup. Routing below remains session-scoped to this preset.
  syncBundledPreset(ctx)

  // Install settings section with canonical optional-settings consumer wiring
  installSettingsSection(ctx, settingsNamespace(VALUE_MODE_SETTINGS_NAMESPACE), Config, initialConfig, {
    setSource: (source) => {
      currentSource = source
      currentConfig = source()
    },
    onChange: () => {
      currentConfig = currentSource()
    },
    validate: (value) => {
      const effective = resolveEffectiveConfig(value, readDefaultExpert(ctx))
      if (value.enabled && !isCompleteModelRoute(effective.executor)) {
        throw new Error('副模型/子代理执行模型未选择具体模型')
      }
      if (value.enabled && !isCompleteModelRoute(effective.expert)) {
        throw new Error('专家主控模型未选择具体模型')
      }
    },
  })

  // Register the consult_expert tool
  ctx.tools.register(createConsultExpertTool(ctx, () => currentSource()))

  // Inject concise role-specific guidance for the controller and child agents.
  ctx.systemPrompt.section({
    name: VALUE_MODE_SECTION_NAME,
    order: VALUE_MODE_SECTION_ORDER,
    text: (assembly) => {
      if (assembly.agent?.session.header?.agentPreset !== 'value-mode') {
        return ''
      }
      const config = resolveEffectiveConfig(currentSource(), readDefaultExpert(ctx))
      if (!isEffectivelyActive(config)) {
        return ''
      }
      const role = assembly.agent?.session.header?.origin === 'subagent' ? 'subagent' : 'controller'
      return buildSystemPromptGuidance(config, { role })
    },
  })

  // Route top-level controller turns to the expert model and delegated child
  // sessions to the cheaper executor model.
  ctx.on('agent/request', async (payload, next) => {
    const resolved = await next()
    if (payload.agent.session?.header?.agentPreset !== 'value-mode') {
      return resolved
    }
    const globalConfig = currentSource()
    const sessionId = payload.agent?.id || 'default'
    const effectiveConfig = resolveEffectiveConfig(
      resolveSessionConfig(globalConfig, valueModeState.getSessionOverride(sessionId)),
      readDefaultExpert(ctx),
    )

    if (!isEffectivelyActive(effectiveConfig)) {
      return resolved
    }

    const health = await assessValueModeHealth(effectiveConfig, ctx.llm)
    if (health.status !== 'active') {
      // Degraded or unconfigured: fall back safely to ordinary DSH model selection
      return resolved
    }

    const isSubagent = payload.agent.session?.header?.origin === 'subagent'

    // A direct consult_expert stream is already in flight; preserve its
    // original request rather than recursively overriding the same session.
    if (!isSubagent && valueModeState.getDepth(sessionId) > 0) {
      return resolved
    }

    const route = isSubagent ? effectiveConfig.executor : effectiveConfig.expert
    if (!isCompleteModelRoute(route)) {
      return resolved
    }

    if (isSubagent) valueModeState.recordSubagentCall(sessionId)
    else valueModeState.recordControllerCall(sessionId)
    const key = requestKey(payload)
    if (key !== undefined) {
      const now = Date.now()
      pruneRoutedRequestAttempts(now)
      routedRequestAttempts.set(key, now)
    }
    emitValueModeRuntimeTelemetry({
      event: 'call',
      outcome: 'started',
      role: isSubagent ? 'subagent' : 'controller',
    })

    return {
      ...resolved,
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort ? { reasoningEffort: route.reasoningEffort as LlmCallConfig['reasoningEffort'] } : {}),
    }
  })

  ctx.on('agent/request-error', async (payload, next) => {
    const result = await next()
    const key = requestKey(payload)
    if (key === undefined || !routedRequestAttempts.has(key)) return result
    routedRequestAttempts.delete(key)
    const value = payload as { agent?: { session?: { header?: { origin?: string } } } }
    emitValueModeRuntimeTelemetry({
      event: 'call',
      outcome: 'failed',
      role: value.agent?.session?.header?.origin === 'subagent' ? 'subagent' : 'controller',
    })
    return result
  })
}
