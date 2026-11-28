import { normalizeMemoryConfig } from "../core/config.js";
import { MEMORY_SETTINGS_NAMESPACE } from "../core/schema.js";
import { MemorySettingsCard } from "./MemorySettingsCard.js";
import { QuickSearchDialog, openQuickSearch, toggleQuickSearch } from "./QuickSearchDialog.js";
import { FilesTreeKnowledgeButton, WorkspaceKnowledgeCount, WorkspaceKnowledgeSection } from "./WorkspaceKnowledgeSection.js";
import { en, zh } from "./locales.js";
export * from "./locales.js";
export { MemorySettingsCard } from "./MemorySettingsCard.js";
export { QuickSearchDialog, QuickSearchSidebarEntry, openQuickSearch, toggleQuickSearch } from "./QuickSearchDialog.js";
export { FilesTreeKnowledgeButton, WorkspaceKnowledgeCount, WorkspaceKnowledgeSection } from "./WorkspaceKnowledgeSection.js";
export const inject = ['slots', 'locale', 'configForms'];
function settingsBinder(ctx) {
    const compatibility = ctx.get('webUiSettings');
    if (compatibility !== undefined && typeof compatibility.bind === 'function') {
        return compatibility;
    }
    return { bind: (spec) => ctx.configForms.get(spec.namespace) };
}
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register('memory', { zh, en }), 'memory: dictionaries');
    const settingsScope = settingsBinder(ctx).bind({
        namespace: MEMORY_SETTINGS_NAMESPACE,
        decode: value => {
            try {
                return normalizeMemoryConfig(value);
            }
            catch {
                return undefined;
            }
        },
    });
    ctx.inject(['slots'], scope => {
        const openSession = (sessionId) => {
            const workspace = ctx.get('uiWorkspace', false);
            workspace?.openSession(sessionId);
        };
        scope.slots.inject('web-ui.plugin.item', () => scope.slots.register({
            name: 'web-ui.plugin.item',
            id: 'memory',
            order: 118,
            locale: 'memory',
            inject: () => ({
                config: normalizeMemoryConfig(settingsScope.getSnapshot().value),
                settingsScope,
                onOpenSession: ctx.get('uiWorkspace', false) ? openSession : undefined,
            }),
        }, MemorySettingsCard));
        scope.slots.inject('shell.overlay', () => scope.slots.register({
            name: 'shell.overlay',
            id: 'local-search-quick',
            locale: 'memory',
            inject: () => ({
                onOpenSession: ctx.get('uiWorkspace', false) ? openSession : undefined,
            }),
        }, QuickSearchDialog));
        scope.slots.inject('conversation.session.panel.section', () => scope.slots.register({
            name: 'conversation.session.panel.section',
            id: 'workspace-knowledge',
            order: 40,
            locale: 'memory',
            label: () => ctx.locale.bind('memory')('search.kbSectionTitle'),
        }, WorkspaceKnowledgeSection));
        scope.slots.inject('conversation.session.panel.section.actions', () => scope.slots.register({
            name: 'conversation.session.panel.section.actions',
            key: 'workspace-knowledge',
            locale: 'memory',
        }, WorkspaceKnowledgeCount));
        scope.slots.inject('sidebar.right.tab.files.actions', () => scope.slots.register({
            name: 'sidebar.right.tab.files.actions',
            id: 'memory-add-kb-source',
            order: 30,
            locale: 'memory',
        }, FilesTreeKnowledgeButton));
        // Memory management and activity stay in settings, not the conversation header.
    });
    ctx.inject(['commandUi'], scope => {
        const commands = scope.get?.('commandUi');
        if (!commands?.register)
            return;
        const t = ctx.locale.bind('memory');
        scope.effect(() => commands.register({
            name: 'search',
            label: () => t('search.quickOpen'),
            available: () => true,
            ui: { kind: 'action', run: () => openQuickSearch() },
        }));
    });
    if (typeof window !== 'undefined') {
        ctx.effect(() => {
            const onKeyDown = (event) => {
                if (event.defaultPrevented || event.altKey || event.shiftKey)
                    return;
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                    event.preventDefault();
                    toggleQuickSearch();
                }
            };
            window.addEventListener('keydown', onKeyDown);
            return () => window.removeEventListener('keydown', onKeyDown);
        }, 'memory: quick search shortcut');
    }
}
