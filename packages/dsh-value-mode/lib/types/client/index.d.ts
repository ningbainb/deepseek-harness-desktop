/**
 * @module @linxin666/dsh-value-mode/client
 * Browser half of the Value Mode (性价比模式) plugin.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type ValueModeLocaleKey } from './locales.ts';
export { ValueModeSettingsCard } from './ValueModeSettingsCard.tsx';
export { ValueModeHeaderStatus } from './ValueModeHeaderStatus.tsx';
export { ValueModeHeroOnboarding } from './ValueModeHeroOnboarding.tsx';
export { ManualExpertToggle } from './ManualExpertToggle.tsx';
export { ModelPicker } from './ModelPicker.tsx';
export * from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'value-mode': ValueModeLocaleKey;
    }
    interface SlotMap {
        'web-ui.plugin.item': {
            kind: 'list';
            scope: 'root';
            owner: SettingsPluginItemOwnerProps;
        };
    }
}
export interface SettingsPluginItemOwnerProps {
    children?: never;
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map