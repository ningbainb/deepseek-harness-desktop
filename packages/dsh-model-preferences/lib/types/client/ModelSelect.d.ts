import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type ModelPreferencesConfig } from './model-projection.ts';
export type ModelSelectProps = PropsRuntime<'conversation.input.model'> & PropsLocale<'model-preferences'> & ModelSelectInjected & {
    modelSessionId: string;
    settingsScope: import('@deepseek-ai/dsh-client-runtime/client').SettingsScope<ModelPreferencesConfig>;
};
/**
 * Preference-aware composer model seat. Its data projection is local to this
 * plugin, while its geometry and interaction model follow the official
 * model-selection seat so the desktop composer keeps its native appearance.
 */
export declare function ModelSelect(props: ModelSelectProps): import("react").JSX.Element | null;
//# sourceMappingURL=ModelSelect.d.ts.map