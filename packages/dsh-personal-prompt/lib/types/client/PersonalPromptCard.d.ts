import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type PersonalPromptConfig } from '../core/config.ts';
export type PersonalPromptCardProps = PropsRuntime<'web-ui.plugin.item'> & PropsLocale<'personal-prompt'> & {
    config: PersonalPromptConfig;
    settingsScope: SettingsScope<PersonalPromptConfig>;
};
export declare function PersonalPromptCard(props: PersonalPromptCardProps): import("react").JSX.Element;
//# sourceMappingURL=PersonalPromptCard.d.ts.map