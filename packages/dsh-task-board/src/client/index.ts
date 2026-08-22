/**
 * Task-board client plugin: wires the framework-free core (controller,
 * execution service, store) to the real client runtime and mounts the two
 * DOM surfaces — the sidebar entry row and the board view in the center
 * column.
 *
 * Failure policy: DOM mounting problems are logged, never thrown — the web
 * shell fails the whole boot when a plugin apply throws, and an external
 * plugin must not take the GUI down.
 */
import type { ClientContext, SessionId, SettingsScope, SettingsScopeSpec, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and its
// LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { BoardController } from '../core/controller.ts'
import { ExecutionService } from '../core/execution.ts'
import { InMemoryEvidenceStore } from '../core/evidence.ts'
import { SchedulerService } from '../core/scheduler.ts'
import { LocalStorageTaskStore } from '../core/store.ts'
import type { TaskStore } from '../core/store.ts'
import { claimTaskboardApply, releaseTaskboardApply } from './apply-guard.ts'
import { isDesktopMigrationProbe } from './migration-probe.ts'
import { mountBoard } from './board-mount.tsx'
import { selectPreferredTaskStore } from './host-store.ts'
import { RemoteTaskStoreV3 } from './v3-host-store.ts'
import { RemoteWorktreeReviewClient } from './worktree-client.ts'
import { shouldRunTaskInClientScheduler } from './host-scheduler.ts'
import { notifyDesktopExecutionSettled, type DesktopNotificationBridge } from './desktop-notifications.ts'
import { EvidenceReviewService } from '../core/review.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { TaskBoardSettingsCard, TaskBoardSettingsCardController, type TaskBoardSettings } from './TaskBoardSettingsCard.tsx'
import { en, zh, type TaskBoardKey } from './locales.ts'

/** Locale namespace this plugin owns. */
const NS = 'task-board'

/** Settings namespace the settings card edits (the Host plugin registers it). */
const TASK_BOARD_NS = 'task-board'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task-board surface copy. */
    'task-board': TaskBoardKey
  }

  interface SlotMap {
    /**
     * The child slot the Web UI plugin group declares; this card registers
     * into the group instead of the top-level `settings.plugin.item` list.
     * Spelled here with the same shape so this package can register without
     * depending on the sibling UI package.
     */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Optional rc.6 compatibility binder provided by dsh-web-ui-settings;
     * absent when that group plugin is not installed, so callers fall back to
     * the official settings scope.
     */
    webUiSettings?: { bind<S>(spec: SettingsScopeSpec<S>): SettingsScope<S> }
  }
}


/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'sessions', 'workspaces', 'connection', 'settingsScope', 'locale', 'remote']

/**
 * Mount the task board.
 * @param ctx - client root context (services: sessions, workspaces).
 */
export function apply(ctx: ClientContext): void {
  // The Desktop migration bridge opens a hidden, same-origin document solely
  // to read the pre-Host v1 localStorage ledger.  It must not mount this
  // plugin, start a browser scheduler, or execute a due task while recovery
  // is still deciding whether to continue or roll back.
  if (isDesktopMigrationProbe()) return

  // A duplicated client injection (module factory executed twice in one page
  // lifetime) would otherwise mount a second sidebar entry and board view.
  // First application wins; later calls become no-ops (see apply-guard.ts).
  if (!claimTaskboardApply()) return

  // Release the claim when this fiber unloads (the loader supports plugin
  // unloads / hot-reloads), so a rebuilt bundle can claim again in the same
  // page instead of being silently dropped.
  ctx.effect(() => releaseTaskboardApply, 'task-board: apply claim')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-board: dictionaries')

  // Plugin configuration card: one staged form over the `task-board` settings
  // namespace, contributed to the Web UI plugin group.
  const binder = ctx.get('webUiSettings') ?? ctx.settingsScope
  const settingsScope = binder.bind<TaskBoardSettings>({ namespace: TASK_BOARD_NS })
  const settingsCard = new TaskBoardSettingsCardController(settingsScope)
  ctx.slots.inject('web-ui.plugin.item', () => ctx.slots.register({
    name: 'web-ui.plugin.item',
    id: 'task-board',
    order: 110,
    locale: NS,
    inject: () => settingsCard.inject(),
  }, TaskBoardSettingsCard))

  // The sidebar entry and board view mount once the settings scope settles;
  // while the scope is still loading, the composition default is unknown, so
  // nothing mounts yet. Only an unavailable scope (no settings surface served)
  // falls back to the composition default (enabled).
  let uiDisposer: (() => void) | undefined
  let mountPending = false
  let mountGeneration = 0
  let desiredEnabled = false
  const mountUi = (): void => {
    if (uiDisposer !== undefined || mountPending) return
    mountPending = true
    const generation = mountGeneration
    void (async () => {
      const sessions = ctx.sessions
      const workspaces = ctx.workspaces
      const connection = ctx.get('connection') as ConnectionHandle

      // HostTaskStore v3 is authoritative when reachable. Its Host half does
      // the copy-first v2 migration; the old v2/local path remains the safe
      // fallback for older DSH web hosts.
      const v3Store = new RemoteTaskStoreV3()
      let store: TaskStore
      let evidenceStore: InMemoryEvidenceStore | RemoteTaskStoreV3
      try {
        await v3Store.load()
        store = v3Store
        evidenceStore = v3Store
      } catch {
        store = await selectPreferredTaskStore({ local: new LocalStorageTaskStore() })
        evidenceStore = new InMemoryEvidenceStore()
      }
      const exec = new ExecutionService({
        sessions: {
          list: sessions.list,
          binding: id => sessions.binding(id as SessionId),
        },
        workspaces: {
          list: workspaces.list,
          connectWorkspace: id => workspaces.connectWorkspace(id as WorkspaceId),
        },
        history: {
          loadTail: async sessionId => {
            const response = await connection.api.sessions.history({
              sessionId: sessionId as SessionId,
              maxMessages: 20,
            })
            return response.result.ok
              ? { events: response.result.value.events.map(entry => entry.event) }
              : undefined
          },
        },
      })
      const controller = new BoardController({
        store,
        exec,
        evidenceStore,
        reviewService: store === v3Store ? new EvidenceReviewService({ store: v3Store, worktrees: new RemoteWorktreeReviewClient() }) : undefined,
        sessions: {
          list: sessions.list,
          open: id => sessions.open(id as SessionId),
        },
        onExecutionSettled: event => {
          const desktop = (window as typeof window & {
            dshDesktop?: DesktopNotificationBridge
          }).dshDesktop
          return notifyDesktopExecutionSettled(desktop, event)
        },
      })
      await controller.start()
      if (generation !== mountGeneration || !desiredEnabled) {
        controller.dispose()
        return
      }

      // The Host publishes an explicit ownership set for the subset its
      // Desktop runner can actually execute. Keep the browser ticker alive so
      // legacy/no-project, worktree, and transiently unsupported tasks still
      // run here; it yields only an individually Host-owned task.
      const scheduler = new SchedulerService({
        tasks: () => controller.getSnapshot().tasks,
        now: () => Date.now(),
        runTask: id => controller.runTask(id),
        applySchedule: (id, nextRunAt, lastTriggeredAt) =>
          controller.applyScheduleNextRun(id, nextRunAt, lastTriggeredAt),
        ready: () => sessions.list.getSnapshot().phase === 'ready',
        // Re-probe each task at admission. An unavailable, old, or malformed
        // status route deliberately yields browser ownership rather than
        // globally pausing scheduled work.
        canRunTask: task => shouldRunTaskInClientScheduler(task),
        environment: {
          addEventListener: (type, listener) => document.addEventListener(type, listener),
          removeEventListener: (type, listener) => document.removeEventListener(type, listener),
        },
      })
      scheduler.start()

      const disposers: Array<() => void> = []
      try {
        disposers.push(mountSidebarEntry(controller))
        disposers.push(mountBoard(controller))
        const desktop = (window as typeof window & {
          dshDesktop?: {
            onDeepLink?: (listener: (link: unknown) => void) => () => void
          }
        }).dshDesktop
        if (typeof desktop?.onDeepLink === 'function') {
          disposers.push(desktop.onDeepLink((raw) => {
            if (typeof raw !== 'object' || raw === null) return
            const link = raw as { kind?: unknown; id?: unknown }
            if (link.kind === 'task' && typeof link.id === 'string') {
              controller.openBoard()
              controller.openTask(link.id)
            } else if (link.kind === 'run' && typeof link.id === 'string') {
              controller.openRun(link.id)
            } else if (link.kind === 'session' && typeof link.id === 'string') {
              sessions.open(link.id as SessionId)
            }
          }))
        }
      } catch (error) {
        // DOM failures degrade the board, never the GUI.
        console.error('[dsh-task-board] mount failed:', error)
      }

      uiDisposer = () => {
        for (const dispose of disposers.splice(0)) dispose()
        scheduler.dispose()
        controller.dispose()
        uiDisposer = undefined
      }
    })().catch((error) => {
      console.error('[dsh-task-board] HostStore initialization failed:', error)
    }).finally(() => {
      mountPending = false
      if (desiredEnabled && uiDisposer === undefined) mountUi()
    })
  }
  const syncEnabled = (): void => {
    const snapshot = settingsScope.getSnapshot()
    const enabled = snapshot.status === 'ready'
      ? snapshot.value?.enabled ?? true
      : snapshot.status === 'unavailable'
    desiredEnabled = enabled
    if (enabled) mountUi()
    else {
      mountGeneration += 1
      uiDisposer?.()
    }
  }
  settingsScope.subscribe(syncEnabled)
  syncEnabled()
}
