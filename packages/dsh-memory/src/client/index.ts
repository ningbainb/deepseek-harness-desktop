import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConfigForm as SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
type SettingsScopeSpec<T> = { namespace: string; decode?: (section: unknown) => T | undefined }
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { normalizeMemoryConfig, type MemoryConfig } from '../core/config.ts'
import { MEMORY_SETTINGS_NAMESPACE } from '../core/schema.ts'
import { MemorySettingsCard } from './MemorySettingsCard.tsx'
import { QuickSearchSidebarEntry, openQuickSearch, toggleQuickSearch } from './QuickSearchDialog.tsx'
import { FilesTreeKnowledgeButton, WorkspaceKnowledgeCount, WorkspaceKnowledgeSection } from './WorkspaceKnowledgeSection.tsx'
import { en, zh, type MemoryLocaleKey } from './locales.ts'

export * from './locales.ts'
export { MemorySettingsCard } from './MemorySettingsCard.tsx'
export { QuickSearchDialog, QuickSearchSidebarEntry, openQuickSearch, toggleQuickSearch } from './QuickSearchDialog.tsx'
export { FilesTreeKnowledgeButton, WorkspaceKnowledgeCount, WorkspaceKnowledgeSection } from './WorkspaceKnowledgeSection.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    memory: MemoryLocaleKey
  }

  interface SlotMap {
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
    'sidebar.footer.action': { kind: 'list'; scope: 'root'; owner: { wide: boolean } }
    'conversation.session.panel.section': {
      kind: 'list'
      scope: 'session'
      owner: { readonly presentation: 'docked' | 'overlay'; readonly dismissOverlay: () => void }
    }
    'conversation.session.panel.section.actions': { kind: 'keyed'; scope: 'session' }
    'sidebar.right.tab.files.actions': { kind: 'list'; scope: 'session'; owner: { readonly absolutePath: string } }
  }
}

interface SearchCommandMenu {
  register(action: {
    name: string
    label(): string
    available(): boolean
    ui: { kind: 'action'; run(): void }
  }): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webUiSettings?: { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
}

export const inject = ['slots', 'locale', 'configForms']

function settingsBinder(ctx: ClientContext): { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> } {
  const compatibility = ctx.get('webUiSettings') as { bind?: unknown } | undefined
  if (compatibility !== undefined && typeof compatibility.bind === 'function') {
    return compatibility as { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
  return { bind: <S>(spec: SettingsScopeSpec<S>) => ctx.configForms.get<S>(spec.namespace) }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('memory', { zh, en }), 'memory: dictionaries')
  const settingsScope = settingsBinder(ctx).bind<MemoryConfig>({
    namespace: MEMORY_SETTINGS_NAMESPACE,
    decode: value => {
      try { return normalizeMemoryConfig(value) } catch { return undefined }
    },
  })
  ctx.inject(['slots'], scope => {
    const openSession = (sessionId: string): void => {
      const workspace = ctx.get('uiWorkspace' as never, false) as { openSession(id: string): void } | undefined
      workspace?.openSession(sessionId)
    }
    scope.slots.inject('web-ui.plugin.item', () => scope.slots.register({
      name: 'web-ui.plugin.item',
      id: 'memory',
      order: 118,
      locale: 'memory',
      inject: () => ({
        config: normalizeMemoryConfig(settingsScope.getSnapshot().value),
        settingsScope,
        onOpenSession: ctx.get('uiWorkspace' as never, false) ? openSession : undefined,
      }),
    }, MemorySettingsCard))
    scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
      name: 'sidebar.footer.action',
      id: 'local-search-quick',
      order: 15,
      locale: 'memory',
      inject: () => ({
        onOpenSession: ctx.get('uiWorkspace' as never, false) ? openSession : undefined,
      }),
    }, QuickSearchSidebarEntry))
    scope.slots.inject('conversation.session.panel.section', () => scope.slots.register({
      name: 'conversation.session.panel.section',
      id: 'workspace-knowledge',
      order: 40,
      locale: 'memory',
      label: () => ctx.locale.bind('memory')('search.kbSectionTitle'),
    }, WorkspaceKnowledgeSection as never))
    scope.slots.inject('conversation.session.panel.section.actions', () => scope.slots.register({
      name: 'conversation.session.panel.section.actions',
      key: 'workspace-knowledge',
      locale: 'memory',
    }, WorkspaceKnowledgeCount as never))
    scope.slots.inject('sidebar.right.tab.files.actions', () => scope.slots.register({
      name: 'sidebar.right.tab.files.actions',
      id: 'memory-add-kb-source',
      order: 30,
      locale: 'memory',
    }, FilesTreeKnowledgeButton as never))
    // Memory management and activity stay in settings, not the conversation header.
  })
  ctx.inject(['commandUi' as never], scope => {
    const commands = (scope as { get?: (key: string) => unknown }).get?.('commandUi') as SearchCommandMenu | undefined
    if (!commands?.register) return
    const t = ctx.locale.bind('memory')
    scope.effect(() => commands.register({
      name: 'search',
      label: () => t('search.quickOpen'),
      available: () => true,
      ui: { kind: 'action', run: () => openQuickSearch() },
    }))
  })
  if (typeof window !== 'undefined') {
    ctx.effect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.altKey || event.shiftKey) return
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          toggleQuickSearch()
        }
      }
      window.addEventListener('keydown', onKeyDown)
      return () => window.removeEventListener('keydown', onKeyDown)
    }, 'memory: quick search shortcut')
  }
}

export type { PropsLocale, PropsRuntime }

