/**
 * Browser half of model preferences. The official ModelDirectory remains the
 * state machine and Host transport; this package only supplies a preference
 * projection inside the official Models page and a preference-aware composer seat.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-ui-settings/client';
import { type ModelPreferencesLocaleKey } from './locales.ts';
export * from './locales.ts';
export { ModelPreferencesCard } from './ModelPreferencesCard.tsx';
export { ModelSelect } from './ModelSelect.tsx';
export * from './model-projection.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'model-preferences': ModelPreferencesLocaleKey;
    }
    interface SlotMap {
        /** Additive onboarding content rendered at the top of model preferences. */
        'model-preferences.onboarding': {
            kind: 'list';
            scope: 'root';
            owner: ModelPreferencesOnboardingOwnerProps;
        };
    }
}
export interface ModelPreferencesOnboardingOwnerProps {
    children?: never;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Optional compatibility binder supplied by dsh-web-ui-settings. */
        webUiSettings?: {
            bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S>;
        };
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map