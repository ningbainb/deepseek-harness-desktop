/**
 * Git-graph surface plugin, browser half: the git branch selector chip,
 * docked above the input card. Preferred seat is the input selector row's
 * context hole (`conversation.input.selector.context`, a session-maybe
 * list slot declared and rendered by newer shipped ui-conversation shells),
 * right beside the official workspace selector; the published npm SDK
 * (rc.6) and the current shipped shell dropped that hole, so the chip waits
 * on its declaration for {@link CONTEXT_FALLBACK_MS} and then falls back to
 * `conversation.input.dock` (the 0.1.9 seat). On the dock, BranchChip
 * indents by the shell's composer side clearance so it starts flush with
 * the input card below it in the active phase; in the hero (blank-session)
 * phase it lifts itself into the official hero chip row, immediately after
 * the agent-preset seat, so the branch chip sits right of the preset name.
 * All git facts arrive through the host /git routes (this package's own host
 * half); the inject face carries the business verbs, the components stay
 * pure props.
 *
 * The context hole is session-maybe: the chip stays mounted from cold start
 * through the active phase and hides itself when its data source is absent
 * (no session cwd, or not a git repository) — no workspace selector lives
 * here, the official selector chip docked above the input card owns that
 * surface. The dock fallback is session-scoped: the chip mounts once a
 * session is active and renders on the dock's own row above the composer
 * card, left-aligned with the input card. Revision 0be6546 moved the chip
 * back to the context hole without a fallback, so on rc.6 shells the inject
 * wait never resolved and the chip disappeared. The published npm SDK (rc.6)
 * dropped the hole's type, so it is spelled locally below.
 * @module dsh-git-graph/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { GitError } from '../core/types.ts'
import { GitApi, subscribeChanges } from './api.ts'
import { BranchChip, type GitGraphInjected } from './chips/BranchChip.tsx'
import { en, zh } from './locales.ts'

export type { GitGraphKey } from './locales.ts'
export { BranchChip } from './chips/BranchChip.tsx'

export type { InputSelectorContextOwnerProps } from './slot-contracts.ts'

/** Dictionary namespace owned by this plugin. */
const NS = 'git-graph'

/** Required services: slots for the selector-context entry, sessions for the cwd lookup, locale for the copy. */
export const inject = ['slots', 'sessions', 'connection', 'locale']

export type { GitGraphInjected } from './chips/BranchChip.tsx'

/** The session-cwd lookup failure shared by the injected verbs. */
const NO_WORKSPACE: GitError = { code: 'workspace-unknown', message: 'session has no workspace' }

/**
 * How long the chip waits for the selector-context declaration before
 * falling back to the input dock. The window covers the shell's first
 * render of the input selector row after the conversation service is up;
 * shells that never declare the hole (rc.6) land on the dock after it.
 */
export const CONTEXT_FALLBACK_MS = 2000

/**
 * Client plugin body: the branch chip entry with its git verbs, on the
 * selector-context hole with an input-dock fallback.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-git-graph: dictionaries')

  const git = new GitApi()

  // The context-fallback timer, armed once the conversation seam is up and
  // cleared when this fiber unloads (the slot inject waits die with the
  // fiber too, so no seat survives an unload).
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined
  ctx.effect(() => () => {
    if (fallbackTimer !== undefined) clearTimeout(fallbackTimer)
  }, 'dsh-git-graph: context fallback timer')

  // Conditional mount: the conversation service being up is the
  // registration-safe signal (the GoalDock/QueueDock seam). The chip then
  // prefers the selector-context hole and falls back to the input dock when
  // that declaration never arrives.
  ctx.inject(['slots', 'conversation', 'sessions'], (scope: ClientContext) => {
    const sessions = scope.sessions

    /** The session's workspace root, resolved at call time from the sessions baseline. */
    const cwdOf = (sessionId: SessionId | undefined): string | undefined =>
      sessionId === undefined ? undefined : sessions.list.getSnapshot().byId[sessionId]?.cwd

    /** The injected face shared by every seat this chip registers into. */
    const injected = (): GitGraphInjected => {
      /** Resolve the workspace root for one git call. */
      const pathOf = (sessionId: SessionId | undefined): { ok: true; path: string } | { ok: false; error: GitError } => {
        const cwd = cwdOf(sessionId)
        if (cwd === undefined || cwd === '') return { ok: false, error: NO_WORKSPACE }
        return { ok: true, path: cwd }
      }
      return {
        repoStatus: async (sessionId) => {
          const resolved = pathOf(sessionId)
          if (!resolved.ok) return null
          const result = await git.status(resolved.path)
          return result.ok ? result.value : null
        },
        branches: async (sessionId) => {
          const resolved = pathOf(sessionId)
          if (!resolved.ok) return null
          const result = await git.branches(resolved.path)
          return result.ok ? result.value : null
        },
        switchBranch: async (sessionId, branch) => {
          const resolved = pathOf(sessionId)
          if (!resolved.ok) return { ok: false, error: resolved.error }
          const result = await git.switchBranch(resolved.path, branch)
          return result.ok ? { ok: true, branch: result.value.branch } : result
        },
        createBranch: async (sessionId, name) => {
          const resolved = pathOf(sessionId)
          if (!resolved.ok) return { ok: false, error: resolved.error }
          const result = await git.createBranch(resolved.path, name)
          return result.ok ? { ok: true, branch: result.value.branch } : result
        },
        graph: async (sessionId, limit) => {
          const resolved = pathOf(sessionId)
          if (!resolved.ok) return null
          const result = await git.graph(resolved.path, limit)
          return result.ok ? result.value : null
        },
        subscribeChanges: (sessionId, onChange) => {
          const resolved = pathOf(sessionId)
          if (!resolved.ok) return () => {}
          return subscribeChanges(resolved.path, onChange)
        },
      }
    }

    // The entry shape shared by both seats; each register call spells the
    // seat's literal name so its own declaration is checked.
    const chipEntry = { id: 'git-graph', order: 100, locale: NS, inject: injected } as const

    // Declaration-aware with a fallback. A bare register() would throw on
    // shells that dropped the hole (SDK SlotCore.register rejects undeclared
    // slots), so both seats route through inject like the pet / remote-web-ui
    // entries. The preferred context wait resolves the moment the shell
    // declares the hole; when it never does (rc.6 and the current shipped
    // shell), the fallback disposes that wait and moves the chip to the
    // dock, whose row sits directly above the composer card. BranchChip
    // indents the dock copy by the shell's composer side clearance in the
    // active phase and joins the official hero chip row (right of the agent
    // preset) in the hero phase. Exactly one seat mounts: a context
    // declaration landing after the fallback finds the wait gone.
    let mounted = false
    const disposeContextWait = scope.slots.inject('conversation.input.selector.context', () => {
      mounted = true
      return scope.slots.register(
        { name: 'conversation.input.selector.context', ...chipEntry },
        BranchChip)
    })
    fallbackTimer = setTimeout(() => {
      if (mounted) return
      disposeContextWait()
      scope.slots.inject('conversation.input.dock', () =>
        scope.slots.register(
          { name: 'conversation.input.dock', ...chipEntry },
          BranchChip))
    }, CONTEXT_FALLBACK_MS)
  })
}
