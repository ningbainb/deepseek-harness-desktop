import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { PersonalPromptConfig } from '../core/config.ts';
export declare function persistPersonalPromptConfig(form: Pick<ConfigForm<PersonalPromptConfig>, 'mutate'>, config: PersonalPromptConfig, revision?: number): Promise<boolean>;
//# sourceMappingURL=persist-config.d.ts.map