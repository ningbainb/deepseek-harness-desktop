import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConfigForm as SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
type SettingsScopeSpec<T> = {
    namespace: string;
    decode?: (section: unknown) => T | undefined;
};
import { type PersonalPromptLocaleKey } from './locales.ts';
export * from './locales.ts';
export { PersonalPromptCard } from './PersonalPromptCard.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'personal-prompt': PersonalPromptLocaleKey;
    }
    interface SlotMap {
        'web-ui.plugin.item': {
            kind: 'list';
            scope: 'root';
            owner: {
                children?: never;
            };
        };
    }
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        webUiSettings?: {
            bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S>;
        };
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map