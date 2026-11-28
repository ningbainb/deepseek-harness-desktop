import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConfigForm as SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
type SettingsScopeSpec<T> = {
    namespace: string;
    decode?: (section: unknown) => T | undefined;
};
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type MemoryLocaleKey } from './locales.ts';
export * from './locales.ts';
export { MemorySettingsCard } from './MemorySettingsCard.tsx';
export { QuickSearchDialog, QuickSearchSidebarEntry, openQuickSearch, toggleQuickSearch } from './QuickSearchDialog.tsx';
export { FilesTreeKnowledgeButton, WorkspaceKnowledgeCount, WorkspaceKnowledgeSection } from './WorkspaceKnowledgeSection.tsx';
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
        'shell.overlay': {
            kind: 'list';
            scope: 'root';
            owner: {
                children?: never;
            };
        };
        'conversation.session.panel.section': {
            kind: 'list';
            scope: 'session';
            owner: {
                readonly presentation: 'docked' | 'overlay';
                readonly dismissOverlay: () => void;
            };
        };
        'conversation.session.panel.section.actions': {
            kind: 'keyed';
            scope: 'session';
        };
        'sidebar.right.tab.files.actions': {
            kind: 'list';
            scope: 'session';
            owner: {
                readonly absolutePath: string;
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