import type {
  ModelDirectoryState,
} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import type {
  ModelSelection,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelCatalogModel } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import {
  flattenModelOptions,
  modelKeyFromOptionId,
  modelOptionId,
  normalizeModelPreferences,
  recordRecentModel,
  sameModelKey,
  selectionForModel,
  sortModelCatalog,
  type ModelCatalogSnapshot,
  type ModelKey,
  type ModelPreferencesConfig,
  type SortedModelCatalog,
  type SortedModelOption,
} from '../core/config.ts'

export { flattenModelOptions, modelKeyFromOptionId, modelOptionId, selectionForModel, sortModelCatalog }
export type { ModelCatalogSnapshot, ModelKey, ModelPreferencesConfig, SortedModelCatalog, SortedModelOption }

/** Use the official directory state as the sole catalog/current-model source. */
export function catalogFromDirectory(state: ModelDirectoryState): ModelCatalogSnapshot {
  return {
    current: state.current,
    groups: state.groups,
    failures: state.failures,
  }
}

/** Build the model selection represented by one option id. */
export function selectionFromOptionId(
  state: ModelDirectoryState,
  id: string,
  config: ModelPreferencesConfig,
): ModelSelection | undefined {
  const key = modelKeyFromOptionId(id)
  if (key === undefined) return undefined
  // This id comes back from an untrusted/stale popup row. Resolve it against
  // the same selectable projection used by the composer: a disabled provider
  // may remain visible only for the active route, never as a stale way to
  // select another provider's model.
  const catalog = sortModelCatalog(catalogFromDirectory(state), config)
  const option = flattenModelOptions(catalog).find(candidate => sameModelKey(
    { provider: candidate.provider, model: candidate.model.id },
    key,
  ))
  return option === undefined ? undefined : selectionForModel(option, state.current)
}

/** Shared persistence path used by both `/model` and the composer seat. */
export async function selectModelWithPreferences(
  directory: { select(selection: ModelSelection): Promise<void>; store: { getSnapshot(): ModelDirectoryState } },
  settingsScope: SettingsScope<ModelPreferencesConfig>,
  selection: ModelSelection,
): Promise<void> {
  await directory.select(selection)
  const current = normalizeModelPreferences(settingsScope.getSnapshot().value)
  const next = recordRecentModel(current, { provider: selection.provider, model: selection.model })
  try {
    await settingsScope.set('recentModels', next.recentModels)
  } catch {
    // The host selection already succeeded. A read-only or temporarily
    // unavailable settings mirror must not make a valid model switch appear
    // to have failed.
  }
}

/** Display label that remains useful for an advertised or stale current route. */
export function modelDisplayName(option: SortedModelOption | undefined, current: ModelSelection | null): string {
  if (option !== undefined) return option.model.name || option.model.id
  if (current !== null) return current.model
  return ''
}

/** Resolve one model from a provider group without comparing display names. */
export function findModel(
  groups: readonly { id: string; models: readonly ModelCatalogModel[] }[],
  key: ModelKey | undefined,
): ModelCatalogModel | undefined {
  if (key === undefined) return undefined
  return groups.find(group => group.id === key.provider)?.models.find(model => model.id === key.model)
}

/** Build `/model` rows from the same sorted projection rendered by the composer. */
export function commandOptions(
  state: ModelDirectoryState,
  config: ModelPreferencesConfig,
  translate: (key: string, params?: Record<string, unknown>) => string,
): SelectOption[] {
  const catalog = sortModelCatalog(catalogFromDirectory(state), config)
  const options = flattenModelOptions(catalog).map(option => ({
    id: modelOptionId({ provider: option.provider, model: option.model.id }),
    label: option.model.name || option.model.id,
    detail: `${option.providerName} / ${option.model.id}${option.providerDisabled ? ` — ${translate('status.providerDisabled')}` : ''}`,
    ...(option.current ? { active: true } : {}),
  }))
  for (const failure of catalog.failures) {
    options.push({
      id: `failure:${failure.id}`,
      label: failure.name || failure.id,
      detail: `${translate('error.load')} ${failure.message}`,
    })
  }
  return options
}
