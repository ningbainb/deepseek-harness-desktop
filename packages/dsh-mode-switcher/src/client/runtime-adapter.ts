import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ModeSwitcherDeps } from './mode-controller.ts'

/** Use the public Remote and session domain, never their private write stores. */
export function modeSwitcherDependencies(ctx: Context): ModeSwitcherDeps {
  const presets = ctx.get('remote.agentPresets') as Context['remote']['agentPresets'] | undefined
  const session = ctx.get('remote.session') as Context['remote']['session'] | undefined
  if (presets && typeof presets.list === 'function'
    && typeof presets.select === 'function' && session && typeof session.create === 'function') {
    return {
      sessions: {
        list: ctx.sessions.list,
        open: id => ctx.sessions.open(id as Parameters<typeof ctx.sessions.open>[0]),
        clear: () => ctx.sessions.clear(),
        refresh: () => ctx.sessions.refresh(),
      },
      workspaces: ctx.workspaces,
      api: {
        sessions: {
          create: async request => ({ result: await session.create({
            ...request,
            workspaceId: request.workspaceId as Parameters<typeof session.create>[0]['workspaceId'],
          }) }),
        },
        agentPresets: {
          list: async () => ({ result: await presets.list() }),
          select: async ({ sessionId, agentPreset }) => {
            const result = await presets.select(
              sessionId as Parameters<typeof presets.select>[0], agentPreset)
            return { result: result.ok ? { ok: true, value: { agentPreset: result.value } } : result }
          },
        },
        // Native preset seats follow sessions.list. Do not mutate the user's
        // global default just to refresh a label in this modern branch.
      },
    }
  }

  // Old hosts have no typed Remote face. Keep this boundary explicit instead
  // of casting the entire modern dependency object to never.
  const connection = ctx.get('connection') as unknown as { api?: ModeSwitcherDeps['api'] }
  const sessions = ctx.sessions as unknown as ModeSwitcherDeps['sessions']
  const api = connection?.api
  if (!api || typeof api.sessions?.create !== 'function'
    || typeof api.agentPresets?.list !== 'function' || typeof api.agentPresets?.select !== 'function'
    || typeof sessions.noteAgentPreset !== 'function') {
    throw new Error('mode switcher requires a supported session and agent-preset API')
  }
  return { sessions, workspaces: ctx.workspaces, api }
}
