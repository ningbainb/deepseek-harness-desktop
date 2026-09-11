/**
 * AionUI right-panel system — browser half: mounts the explorer and preview
 * columns into the web shell's frame grid (through the layout controller),
 * binds the four stores to the live client runtime (the active session's cwd
 * is the project root), subscribes to the host change stream (fs + git), and
 * follows the shell's dark marker (body[data-ds-dark-theme]) via CSS only.
 *
 * Failure policy: every DOM/runtime wiring failure is logged, never thrown —
 * the web shell fails the whole boot when a plugin apply throws.
 *
 * AionUi right-panel design (Apache-2.0, iOfficeAI/AionUi) — re-implemented
 * from measured behavior and architecture, not copied code.
 * @module dsh-aionui-panel/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the input dock entry).
import type { ConversationController } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { PanelApi, subscribePanelEvents } from './api.ts'
import { PanelLayoutController } from './layout.ts'
import { createPanelStores, layoutSetRoot } from './store.ts'
import { mountPanels } from './mount.tsx'
import { NS, dictionaries, setLanguage, type AionUiPanelKey } from './locales.ts'
import { DragFileInlay, type DragFileInjected } from './drag/DragFileInlay.tsx'
import { insertPathIntoDraft } from './drag/file-drag.ts'
import { FileAttachmentQueue, uploadAttachment, checkAttachment } from './drag/attachments.ts'
import { observeNativeUploadEvents } from './drag/native-upload-events.ts'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { openNativePreview } from './native-preview.ts'
import { bindNativePanelOwnership, openNativePanel, registerNativePanels } from './native-panels.tsx'
import { openNativeBrowser, registerNativeBrowser, registerNativeSidebarReturn } from './native-browser.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Panel surface copy. */
    'aionui-panel': AionUiPanelKey
  }
}

/** Required services: sessions for the project root, locale for the copy. */
export const inject = ['sessions', 'locale']

interface DraftAttachment {
  id: unknown
}

interface DraftAttachmentConversation {
  createDrafts?: (sessionId: SessionId, files: readonly File[]) => readonly DraftAttachment[]
  releaseDraftAttachments?: (attachments: readonly DraftAttachment[]) => void
  fileUploads?: { getSnapshot?: unknown; subscribe?: unknown }
  retryFileUpload?: unknown
}

interface DraftAttachmentInput {
  addAttachments(attachmentIds: readonly never[]): boolean
}

/** Older image-only SDKs also expose createDrafts; require the file lifecycle. */
export function supportsNativeFileUploads(conversation: DraftAttachmentConversation): boolean {
  return typeof conversation.createDrafts === 'function'
    && typeof conversation.releaseDraftAttachments === 'function'
    && typeof conversation.retryFileUpload === 'function'
    && typeof conversation.fileUploads?.getSnapshot === 'function'
    && typeof conversation.fileUploads?.subscribe === 'function'
}

/** Route drafts through the official lifecycle; keep the image helper API compatible. */
export function attachDraftImages(
  conversation: DraftAttachmentConversation,
  input: DraftAttachmentInput,
  sessionId: SessionId,
  files: readonly File[],
): boolean {
  if (files.length === 0 || typeof conversation.createDrafts !== 'function') return false
  let attachments: readonly DraftAttachment[] = []
  try {
    attachments = conversation.createDrafts(sessionId, files)
    if (input.addAttachments(attachments.map(attachment => attachment.id as never))) return true
  } catch {
    // Rejected/throwing input must not orphan native uploads or image object URLs.
  }
  try { conversation.releaseDraftAttachments?.(attachments) } catch { /* Preserve admission failure. */ }
  return false
}

/** Apply the browser half. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-aionui-panel: dictionaries')
  let insertPathIntoCurrentDraft: (path: string) => boolean = () => false

  // The composer drop target for explorer file drags: mounted in the
  // official `conversation.input.dock` band (declared by the shipped
  // ui-conversation rc.6 shell), session-routed through the conversation
  // input facade. A missing session scope or conversation service degrades
  // to no-op — the panels themselves never depend on the dock entry.
  ctx.inject(['slots', 'conversation', 'sessions'], (scope: ClientContext) => {
    const sessions = scope.sessions
    const conversation = scope.conversation
    const nativeUploads = (conversation as Partial<ConversationController>).fileUploads
    if (nativeUploads && supportsNativeFileUploads(conversation as unknown as DraftAttachmentConversation)) {
      scope.effect(() => observeNativeUploadEvents(nativeUploads), 'aionui: native upload outcomes')
    }
    const fileQueues = new Map<string, FileAttachmentQueue>()
    scope.effect(() => () => { for (const queue of fileQueues.values()) queue.dispose(); fileQueues.clear() }, 'aionui: attachment queues')
    const fileQueue = (sessionId: SessionId | undefined): FileAttachmentQueue | undefined => {
      if (!sessionId) return undefined
      const actx = sessions.scope(sessionId)
      if (!actx || !conversation.input) return undefined
      let queue = fileQueues.get(sessionId)
      if (!queue) {
        const shell = conversation.input.for(actx)
        queue = new FileAttachmentQueue({
          read: () => shell.state.getSnapshot().draft,
          insert: reference => insertPath(sessionId, reference),
          remove: reference => shell.setDraft(shell.state.getSnapshot().draft.replace(reference, '')),
          subscribe: listener => shell.state.subscribe(listener),
        }, (file, signal) => uploadAttachment(sessionId, file, signal), path => checkAttachment(sessionId, path))
        fileQueues.set(sessionId, queue)
      }
      return queue
    }
    const insertPath = (sessionId: SessionId | undefined, path: string): boolean => {
      if (sessionId === undefined) return false
      const actx = sessions.scope(sessionId)
      if (actx === undefined) return false
      const input = conversation.input
      if (input === undefined) return false
      const shell = input.for(actx)
      const draft = shell.state.getSnapshot().draft
      const next = insertPathIntoDraft(draft, path)
      shell.setDraft(next)
      return shell.state.getSnapshot().draft === next
    }
    const addDraftImages = (sessionId: SessionId | undefined, files: readonly File[]): boolean => {
      if (sessionId === undefined || files.length === 0) return false
      const actx = sessions.scope(sessionId)
      if (actx === undefined) return false
      const input = conversation.input
      if (input === undefined) return false
      const shell = input.for(actx)
      return attachDraftImages(conversation as unknown as DraftAttachmentConversation, shell, sessionId, files)
    }
    insertPathIntoCurrentDraft = (path: string): boolean => {
      const sessionId = sessions.list.getSnapshot().current as SessionId | undefined
      return insertPath(sessionId, path)
    }
    scope.slots.inject('conversation.input.dock', () =>
      scope.slots.register({
        name: 'conversation.input.dock',
        id: 'aionui-drag-file',
        order: 90,
        locale: NS,
        inject: (sessionId: SessionId | undefined): DragFileInjected => ({
          fileQueue: fileQueue(sessionId),
          addFiles: supportsNativeFileUploads(conversation as unknown as DraftAttachmentConversation)
            ? (files: readonly File[]) => addDraftImages(sessionId, files)
            : undefined,
          insertPath: (path: string): boolean => {
            return insertPath(sessionId, path)
          },
          addImages: (files: readonly File[]): boolean => {
            return addDraftImages(sessionId, files)
          },
        }),
      }, DragFileInlay))
  })

  ctx.effect(() => {
    const api = new PanelApi()
    const stores = createPanelStores(api, (root, path) => {
      const snapshot = ctx.sessions.list.getSnapshot()
      const sessionId = snapshot.current
      return openNativePreview({
        sidebar: ctx.get('sidebarRight', false),
        registry: ctx.get('sidebarRightTabs', false),
        sessionId,
        currentRoot: sessionId ? snapshot.byId[sessionId]?.cwd : undefined,
      }, root, path)
    }, () => {
      layout.activateCompatibility()
      const sidebar = ctx.get('sidebarRight', false)
      // Switch the visible preview owner without closing native tabs or buffers.
      if (sidebar?.isExpanded()) sidebar.toggleExpanded()
    })
    const layout = new PanelLayoutController(stores.layout, () => {
      const sidebar = ctx.get('sidebarRight', false)
      if (sidebar?.isExpanded()) sidebar.toggleExpanded()
    })
    const disposers: Array<() => void> = []
    disposers.push(bindNativePanelOwnership(ctx, layout))
    disposers.push(registerNativeBrowser(ctx))
    disposers.push(registerNativeSidebarReturn(ctx))
    disposers.push(registerNativePanels(ctx, stores, (sessionId, path) => {
      if (ctx.sessions.list.getSnapshot().current !== sessionId) return false
      return insertPathIntoCurrentDraft(path)
    }))
    let disposeEvents: (() => void) | undefined
    let currentRoot = ''
    let lastPreviewOpen = false

    // The project root follows the active session's cwd; switching sessions
    // re-binds every store (widths, collapse, tree, tabs persist per root).
    const bindRoot = (): void => {
      const snapshot = ctx.sessions.list.getSnapshot()
      const sessionId = snapshot.current as SessionId | undefined
      const cwd = sessionId === undefined ? undefined : snapshot.byId[sessionId]?.cwd
      const root = typeof cwd === 'string' && cwd !== '' ? cwd : ''
      if (root === currentRoot) return
      currentRoot = root

      disposeEvents?.()
      disposeEvents = undefined
      const previewOpen = stores.preview.getSnapshot().open
      lastPreviewOpen = previewOpen
      layoutSetRoot(stores.layout, root, previewOpen)
      stores.explorer.setRoot(root)
      stores.scm.setRoot(root)
      stores.preview.setRoot(root)

      if (root === '') return
      disposeEvents = subscribePanelEvents(root, (event) => {
        if (event.kind === 'fs') {
          void stores.explorer.handleFsChange()
          void stores.preview.handleFsChange()
        }
        if (event.kind === 'git') {
          // The host status is the only truth; land it directly.
          stores.scm.update((prev) => (prev.root !== root ? prev : { ...prev, status: event.status, loading: false }))
          // The index/worktree moved: every open diff tab is stale by now.
          void stores.preview.handleGitChange(root)
        }
        if (event.kind === 'gitUnavailable') {
          // The host could not run git at all: land the friendly unavailable
          // state once instead of leaving the SCM tab on "not a repository".
          stores.scm.update((prev) => (prev.root !== root ? prev : { ...prev, status: null, loading: false, gitMissing: true }))
        }
      })
    }
    disposers.push(ctx.sessions.list.subscribe(bindRoot))
    bindRoot()

    // Mirror the preview open state into the layout store (single source: the
    // preview store), and play the enter animation when the region opens.
    const mirrorPreviewOpen = (): void => {
      const open = stores.preview.getSnapshot().open
      if (open === lastPreviewOpen) return
      lastPreviewOpen = open
      stores.layout.update((prev) => ({ ...prev, previewOpen: open }))
      if (open) {
        const col = document.querySelector<HTMLElement>('[data-aionui-preview-col]')
        col?.classList.add('aionui-preview-enter')
        setTimeout(() => col?.classList.remove('aionui-preview-enter'), 300)
      }
    }
    disposers.push(stores.preview.subscribe(mirrorPreviewOpen))

    // Language mirroring (the shell owns <html lang>; the dictionary follows).
    let langObserver: MutationObserver | undefined
    const syncLanguage = (): void => {
      setLanguage(document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en')
    }
    langObserver = new MutationObserver(syncLanguage)
    langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    syncLanguage()

    // Mount everything. DOM failures degrade the panels, never the GUI.
    try {
      layout.mount()
      disposers.push(mountPanels(
        stores,
        () => layout.toggleExplorer(),
        (path) => insertPathIntoCurrentDraft(path),
        section => openNativePanel(ctx, section),
        () => openNativeBrowser(ctx),
      ))
    } catch (error) {
      console.error('[dsh-aionui-panel] mount failed:', error)
    }

    // Debounced persists (explorer/scm/preview) may be pending when the page
    // hides; flush them so a close/background never drops the last 150ms.
    const flushOnHide = (): void => stores.flushNow()
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') flushOnHide()
    }
    window.addEventListener('pagehide', flushOnHide)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      flushOnHide()
      window.removeEventListener('pagehide', flushOnHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      disposeEvents?.()
      langObserver?.disconnect()
      for (const dispose of disposers) dispose()
      layout.dispose()
    }
  }, 'dsh-aionui-panel: wiring')
}
