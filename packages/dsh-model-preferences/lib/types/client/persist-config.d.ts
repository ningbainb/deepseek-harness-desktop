import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ModelPreferencesConfig } from '../core/config.ts';
export declare function persistModelPreferencesConfig(form: Pick<ConfigForm<ModelPreferencesConfig>, 'mutate'>, config: ModelPreferencesConfig, revision?: number): Promise<boolean>;
//# sourceMappingURL=persist-config.d.ts.map