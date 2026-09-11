import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type MemoryLocaleKey } from './locales.ts';
export * from './locales.ts';
export { MemorySettingsCard } from './MemorySettingsCard.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        memory: MemoryLocaleKey;
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
export type { PropsLocale, PropsRuntime };
//# sourceMappingURL=index.d.ts.map