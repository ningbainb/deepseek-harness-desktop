import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type MemoryConfig } from '../core/config.ts';
export type MemorySettingsCardProps = PropsRuntime<'web-ui.plugin.item'> & PropsLocale<'memory'> & {
    config: MemoryConfig;
    settingsScope: SettingsScope<MemoryConfig>;
};
export declare function MemorySettingsCard(props: MemorySettingsCardProps): import("react").JSX.Element;
//# sourceMappingURL=MemorySettingsCard.d.ts.map