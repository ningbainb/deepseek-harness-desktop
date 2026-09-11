/**
 * Host loader entry for the task-board plugin.
 *
 * The host half owns profile-isolated file persistence and a loopback,
 * same-origin route pair; it also announces the plugin to every agent.
 * The section registers while this plugin is in the host composition (mount /
 * DSH restart) and disappears when the plugin leaves it (unmount / restart),
 * so agents always know the board exists and how to cooperate with it. The
 * announcement can be turned off through the web settings plugin-configuration
 * surface (`announceToAgent`); the section then disappears live.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { HostTaskFileStore, resolveTaskBoardStatePath } from './host/file-store.ts'
import { makeTaskBoardRoutes } from './host/routes.ts'
import { makeTaskBoardV3Routes } from './host/v3-routes.ts'
import { HostTaskStoreV3, resolveTaskBoardV3StatePath } from './host/v3-file-store.ts'
import { HostDurableScheduler, type HostScheduledTaskRunner } from './host/durable-scheduler.ts'

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 200

export const inject = ['systemPrompt', 'webServer']

// Public 2.6 domain/Host seams. They are intentionally typed exports so the
// Desktop shell and Candidate fixture can compose them without reaching into
// unstable DSH Workspace or Session objects.
export * from './core/runs.ts'
export * from './core/store-v3.ts'
export * from './core/evidence.ts'
export * from './core/review.ts'
export * from './core/worktree-execution.ts'
export * from './host/v3-file-store.ts'
export * from './host/durable-scheduler.ts'
export * from './core/scheduler-authority.ts'

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const TASK_BOARD_GUIDANCE = '本机已安装 dsh-task-board 插件（DSH Web GUI 的任务看板）：侧边栏「任务看板」入口；在 dsh-web-ui 插件全家桶仓库（packages/dsh-task-board）统一维护，经聚合包 web-ui-all 一键安装。能力：多列看板管理任务；任务可真实执行（驱动 agent 会话）；任务支持 5 段 cron 定时执行（如 0 23 * * *）；Desktop 2.6 可记录 Project、Task Run 和派生 Evidence，并在 Runtime Provider 支持时使用受控 Git Worktree 审核。Desktop 2.7 在用户明确开启后台自动化且 Runtime Provider 提供 host-job adapter 时，可由 Host 以租约、时区 cron 和确定性 TaskRun 认领计划；否则保留浏览器调度回退，避免双执行。数据优先保存到当前 DSH profile 的 state/task-board/tasks-v3.json，Host 不可用时兼容旧 Host 与浏览器 localStorage v1；缺少 Worktree 能力会明确回退 shared-workspace，不伪造隔离状态。限制：应用完全退出后不承诺调度继续执行；执行消耗 API 额度。用户提到「任务看板 / 看板 / 定时任务」时即指本插件，请据此协作。'

/**
 * Settings namespace of the board's announcement capability — the section the
 * web settings surface edits. Spelled here rather than imported: the browser
 * half spells the same value and must not depend on a Host package.
 */
export const TASK_BOARD_SETTINGS_NAMESPACE = 'task-board'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /**
     * Optional Runtime Provider adapter. Desktop supplies it only after the
     * user has opted into background automation; ordinary dsh web leaves it
     * absent and keeps the legacy browser scheduler as the explicit fallback.
     */
    taskBoardHostScheduleRunner?: HostScheduledTaskRunner
  }
}

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /**
   * When true (default), a system-prompt section announces the board to every
   * agent. Set false to keep the board silent in prompts; agents then learn
   * about it only when the user mentions it.
   */
  announceToAgent?: boolean
  /** Master switch for the plugin (browser half + host announcement). */
  enabled?: boolean
  /** Profile whose state directory owns this ledger (defaults to DSH_PROFILE/web). */
  profileName?: string
}

export const Config: z<Config> = z.object({
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
  profileName: z.string().default(process.env.DSH_PROFILE ?? 'web'),
})

/** Schema default, re-read for hand-built test contexts (the loader applies them normally). */
const DEFAULT_ANNOUNCE = true

/**
 * Register the board's announcement section, gated on the composition entry's
 * `announceToAgent` (and the live settings value once the web settings
 * surface is served). The section is re-registered whenever the source
 * changes, so a settings edit takes effect without a restart.
 * @param ctx - the plugin context (systemPrompt injected).
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  const profileName = config?.profileName ?? process.env.DSH_PROFILE ?? 'web'
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  const fileStore = new HostTaskFileStore({
    path: resolveTaskBoardStatePath(dshHome, profileName),
  })
  ctx.effect(() => {
    const family = makeTaskBoardRoutes(fileStore)
    const disposers = family.routes.map(route => ctx.webServer.register(route))
    return () => {
      family.dispose()
      for (const dispose of disposers) dispose()
    }
  }, 'task-board: host file store')
  const v3Store = new HostTaskStoreV3({
    path: resolveTaskBoardV3StatePath(dshHome, profileName),
    v2Path: resolveTaskBoardStatePath(dshHome, profileName),
  })
  let hostScheduler: HostDurableScheduler | undefined
  const schedulerStatus = {
    status: () => hostScheduler?.status() ?? {
      available: false,
      mode: 'client-fallback' as const,
      provider: 'unavailable' as const,
      reason: 'Runtime Provider host-job capability is unavailable; browser scheduler remains active.',
    },
  }
  ctx.effect(() => {
    const family = makeTaskBoardV3Routes(v3Store, { scheduler: schedulerStatus })
    const disposers = family.routes.map(route => ctx.webServer.register(route))
    return () => {
      family.dispose()
      for (const dispose of disposers) dispose()
    }
  }, 'task-board: v3 Host file store')
  // This optional dependency is intentionally not part of the base `inject`
  // list: the browser-only runtime does not provide it. When a Desktop Runtime
  // Provider exposes a host-job adapter, the scheduler starts and the fixed
  // status route atomically flips clients to Host ownership.
  ctx.inject(['taskBoardHostScheduleRunner'], (schedulerCtx) => {
    const runner = schedulerCtx.taskBoardHostScheduleRunner
    if (runner === undefined || (config?.enabled ?? true) === false) return
    const scheduler = new HostDurableScheduler({
      store: v3Store,
      runner,
      ownerId: `task-board-${randomUUID()}`,
    })
    hostScheduler = scheduler
    scheduler.start()
    return () => {
      scheduler.dispose()
      if (hostScheduler === scheduler) hostScheduler = undefined
    }
  })

  // The live source the announcement reads: the settings section once the web
  // settings surface is served, the composition entry otherwise
  // (the settings service swaps it when the namespace registers).
  let current: () => Config = () => config ?? {}
  let disposeSection: (() => void) | undefined

  // Register (or drop) the announcement to match the current source. The
  // section is kept under one disposer: re-registering first tears the old
  // one down so a duplicate-name registration never throws.
  const sync = (): void => {
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if ((current().enabled ?? true) === false) return
    if ((current().announceToAgent ?? DEFAULT_ANNOUNCE) === false) return
    disposeSection = ctx.systemPrompt.section({
      name: 'plugin:task-board',
      order: SECTION_ORDER,
      text: TASK_BOARD_GUIDANCE,
    })
  }

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, TASK_BOARD_SETTINGS_NAMESPACE, Config, config ?? {}, {
      setSource: (source) => { current = source },
      onChange: sync,
    })
  })

  // Initial registration from the composition entry (covers deployments with
  // no settings service, whose section installation never fires its hooks).
  sync()
}
