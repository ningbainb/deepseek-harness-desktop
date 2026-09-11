/** Native page seats reuse the desktop stores and editor buffers, not a second workspace model. */
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { ExplorerPanel } from './components/ExplorerPanel.tsx'
import { useStore } from './hooks/useStore.ts'
import { NS, t } from './locales.ts'
import type { PanelStores } from './store.ts'
import type { PanelLayoutController } from './layout.ts'

export const NATIVE_FILE_TOOLS = 'dsh-file-tools'
export const NATIVE_GIT_CHANGES = 'dsh-git-changes'

/** Optional service lifetime selects the default surface; never force-open a session tab. */
export function bindNativePanelOwnership(ctx: Context, layout: Pick<PanelLayoutController, 'setNativeAvailable'>): () => void {
  const fork = ctx.inject(['sidebarRight', 'sidebarRightTabs'], scope => {
    scope.effect(() => {
      layout.setNativeAvailable(true)
      return () => layout.setNativeAvailable(false)
    }, 'aionui: native default surface')
  })
  return () => { void fork.dispose() }
}

export const nativePanelDefinitions: readonly SidebarRightTabDefinition[] = [
  {
    id: '@linxin666/dsh-client-ui-aionui-panel/files', kind: NATIVE_FILE_TOOLS,
    title: () => t('native.files'),
    guide: [{ order: 20, title: () => t('native.files'), description: () => t('native.filesHint') }],
  },
  {
    id: '@linxin666/dsh-client-ui-aionui-panel/changes', kind: NATIVE_GIT_CHANGES,
    title: () => t('native.changes'),
    guide: [{ order: 30, title: () => t('native.changes'), description: () => t('native.changesHint') }],
  },
]

export type NativePanelProps = PropsRuntime<'sidebar.right.pane.tab'> & {
  stores: PanelStores
  section: 'files' | 'changes'
  insertPath: (sessionId: string, path: string) => boolean
}

/** A hidden or non-current session must never expose actions on the shared current-workspace stores. */
export function NativePanelBody({ stores, section, insertPath, sessionId, useSessions, useTabInfo }: NativePanelProps) {
  const current = useSessions(snapshot => snapshot.current)
  const root = useSessions(snapshot => snapshot.byId[sessionId]?.cwd)
  const explorer = useStore(stores.explorer)
  const scm = useStore(stores.scm)
  const info = useTabInfo()
  if (!info.tab.visible || info.tab.signal.aborted) return null
  if (current !== sessionId || !root || explorer.root !== root || scm.root !== root) {
    return <div className="aionui-root" role="status">{t('native.inactive')}</div>
  }
  return <div data-aionui-native-panel={section} style={{ height: '100%', minHeight: 0 }}>
    <ExplorerPanel
      key={`${sessionId}:${root}`}
      stores={stores}
      section={section}
      onToggleCollapse={() => info.tab.actions.close()}
      onAddToConversation={path => insertPath(sessionId, path)}
    />
  </div>
}

/** Optional SDK services: old hosts keep the existing columns; no official kind is overridden. */
export function registerNativePanels(ctx: Context, stores: PanelStores, insertPath: NativePanelProps['insertPath']): () => void {
  const fork = ctx.inject(['slots', 'sidebarRightTabs'], scope => {
    for (const definition of nativePanelDefinitions) {
      scope.effect(() => scope.sidebarRightTabs.register(definition), `aionui: ${definition.kind} type`)
      scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
        name: 'sidebar.right.pane.tab', key: definition.id, locale: NS,
      }, props => <NativePanelBody {...props} stores={stores} insertPath={insertPath}
        section={definition.kind === NATIVE_FILE_TOOLS ? 'files' : 'changes'} />)), `aionui: ${definition.kind} body`)
    }
  })
  return () => { void fork.dispose() }
}

/** Toolbar navigation may run before the native seat is bound; failure retains the working legacy UI. */
export function openNativePanel(ctx: Context, section: 'files' | 'changes'): boolean {
  const kind = section === 'files' ? 'files' : NATIVE_GIT_CHANGES
  const snapshot = ctx.sessions.list.getSnapshot()
  if (!snapshot.current || !snapshot.byId[snapshot.current]?.cwd) return false
  const sidebar = ctx.get('sidebarRight', false)
  const registry = ctx.get('sidebarRightTabs', false)
  if (!sidebar || !registry?.get(kind)) return false
  try { sidebar.openTab(kind); return true } catch { return false }
}
