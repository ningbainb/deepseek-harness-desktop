/** Desktop settings links and an independent companion display preference. */
import type { Context } from '@deepseek-ai/cordis';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { NS, type LocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'release-plugin-adapter': LocaleKey;
    }
}
interface DisplayPreference {
    getSnapshot(): boolean;
    subscribe(listener: () => void): () => void;
    set(value: boolean): boolean;
}
type PanelProps = PropsLocale<typeof NS> & {
    preference: DisplayPreference;
};
export declare function ReleasePluginsPanel({ t, preference }: PanelProps): import("react").JSX.Element;
export declare const inject: string[];
export declare function apply(ctx: Context): void;
export {};
