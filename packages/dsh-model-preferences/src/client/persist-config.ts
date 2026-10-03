import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ModelPreferencesConfig } from '../core/config.ts'

export function persistModelPreferencesConfig(
  form: Pick<ConfigForm<ModelPreferencesConfig>, 'mutate'>,
  config: ModelPreferencesConfig,
  revision?: number,
): Promise<boolean> {
  return form.mutate([
    { op: 'set', path: ['pinnedModels'], value: config.pinnedModels.map(key => ({ ...key })) },
    { op: 'set', path: ['providerOrder'], value: config.providerOrder },
    { op: 'set', path: ['disabledProviders'], value: config.disabledProviders },
    { op: 'set', path: ['recentModels'], value: config.recentModels.map(key => ({ ...key })) },
  ], revision)
}
