import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { MemoryConfig } from '../core/config.ts';
import type { MemoryPublicItem } from '../core/schema.ts';
import type { MemoryLocaleKey } from './locales.ts';
type Props = {
    t: (key: MemoryLocaleKey) => string;
    enabled: boolean;
    sessionId?: string;
    onEdit?: (item: MemoryPublicItem) => void;
};
export declare function MemoryActivityPanel({ t, enabled, sessionId, onEdit }: Props): import("react").JSX.Element;
export declare function MemoryHeaderStatus(props: {
    sessionId: string;
    settingsScope: SettingsScope<MemoryConfig>;
    t: Props['t'];
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=MemoryActivityPanel.d.ts.map