import { createElement, type ComponentType } from 'react'
import { openExternalUrl as openDesktopExternalUrl } from './open-external.ts'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
export type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
export type { PropsRenderSlots, RenderFactorySlot, SlotEntryDef, SlotSpec, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots'
export type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'

export const WORK_OFFICE_PRESET_ID = 'work-office'

export interface OfficeAppsIntegrationOptions<K extends string> {
  localeNamespace?: string
  zh: Record<K, string>
  en: Record<K, string>
  OfficeAppsComposerTrigger: ComponentType<{
    t: (key: K) => string
    locale: 'zh' | 'en'
    isBlankSession?: boolean
    onOpenExtensions: () => void
    onOpenExternalUrl: (url: string) => void
    onRunPrompt: (prompt?: string) => void
  }>
  OfficeStarterDock?: ComponentType<{
    t: (key: K) => string
    locale: 'zh' | 'en'
    isBlankSession: boolean
    onRunPrompt: (prompt?: string) => void
  }>
  onOpenExtensions: () => void
}

interface SessionsLike {
  list?: { getSnapshot(): { byId?: Record<string, { blank?: boolean }> } }
  current?(): string | undefined
}

interface WorkspacesLike {
  list?: { getSnapshot(): { items?: ReadonlyArray<{ workspaceId?: string; id?: string }> } }
}

export function ensureOfficeWorkSession(ctx: Context): void {
  const runtimeCtx = ctx as Context & {
    sessions?: SessionsLike
  }
  if (runtimeCtx.sessions?.current?.()) return
  startOfficeWorkSession(ctx)
}

export function startOfficeWorkSession(
  ctx: Context,
  prompt?: string,
): void {
  const runtimeCtx = ctx as Context & {
    uiWorkspace?: Pick<UiWorkspace, 'startSession'>
    workspaces?: WorkspacesLike
    get?(service: string): unknown
  }
  const workspace = (runtimeCtx.uiWorkspace ?? runtimeCtx.get?.('uiWorkspace')) as Pick<UiWorkspace, 'startSession'> | undefined
  const workspacesSvc = (runtimeCtx.workspaces ?? runtimeCtx.get?.('workspaces')) as WorkspacesLike | undefined
  const firstWs = workspacesSvc?.list?.getSnapshot().items?.[0]
  const workspaceId = (firstWs?.workspaceId ?? firstWs?.id) as Parameters<UiWorkspace['startSession']>[0]
  workspace?.startSession?.(workspaceId, {
    agentPreset: WORK_OFFICE_PRESET_ID,
    ...(prompt ? { prompt, whenDraftExists: 'append' as const } : {}),
  })
}

export function registerOfficeAppsIntegration<K extends string>(
  ctx: Context,
  options: OfficeAppsIntegrationOptions<K>,
): () => void {
  const ns = options.localeNamespace ?? 'work-mode'
  const runtimeCtx = ctx as Context & {
    locale?: {
      register(namespace: string, dict: Record<string, Record<string, string>>): () => void
      bind(namespace: string): (key: string) => string
      getSnapshot(): { active: string }
    }
    slots?: {
      inject(slotName: string, factory: () => () => void): () => void
      register(spec: Record<string, unknown>, component: ComponentType<any>): () => void
    }
    sessions?: SessionsLike
    get?(service: string): unknown
  }

  const locale = runtimeCtx.locale
  const slots = runtimeCtx.slots
  if (!locale || !slots) return () => {}

  const translate = locale.bind(ns) as (key: K) => string
  const currentLang = (): 'zh' | 'en' =>
    (locale.getSnapshot?.().active ?? 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh'
  const openExternalUrl = (url: string) => {
    openDesktopExternalUrl(url)
  }

  const disposers: Array<() => void> = []
  disposers.push(locale.register(ns, { zh: options.zh, en: options.en }))

  disposers.push(slots.inject('conversation.input.left', () => slots.register({
    name: 'conversation.input.left',
    id: 'office-apps-trigger',
    order: 20,
    locale: ns,
    inject: (sessionId?: string) => {
      const sessionsSvc = (runtimeCtx.sessions ?? runtimeCtx.get?.('sessions')) as SessionsLike | undefined
      const targetId = sessionId ?? sessionsSvc?.current?.()
      const summary = targetId ? sessionsSvc?.list?.getSnapshot().byId?.[targetId] : undefined
      const isBlankSession = summary ? Boolean(summary.blank) : true
      return {
        t: translate,
        locale: currentLang(),
        isBlankSession,
        onOpenExtensions: options.onOpenExtensions,
        onOpenExternalUrl: openExternalUrl,
        onRunPrompt: (prompt?: string) => startOfficeWorkSession(ctx, prompt),
      }
    },
  }, options.OfficeAppsComposerTrigger as ComponentType<any>)))

  return () => {
    for (const dispose of disposers.reverse()) {
      try { dispose() } catch {}
    }
  }
}
