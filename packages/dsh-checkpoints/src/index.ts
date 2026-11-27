import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@ningbainb/dsh-user-scope'
import { ShadowGit } from './core/shadow-git.ts'
import { resolveCheckpointGit, validCheckpointWorkspace } from './host/git-path.ts'
import { checkpointRoute } from './host/routes.ts'
import { CheckpointAccessError, CheckpointHost, desktopApprovalKey } from './host/service.ts'
import { dshHomePath } from './host/sdk-adapter.ts'

export const name = 'checkpoints'
export const inject = ['userScope', 'workspaceRegistry', 'sessions']

export interface Config {
  enabled?: boolean
}

type AgentIdentity = { readonly id?: unknown; readonly session?: { readonly id?: unknown } }

export interface WorkspaceCheckpoints {
  beforeWorkspaceWrite(input: { agent: AgentIdentity; workspacePath: string; paths: string[]; tool: string }): Promise<void>
  beginWorkspaceMutation(input: { sessionId: string; workspacePath?: string; signal?: AbortSignal }): Promise<(() => Promise<void>) | undefined>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workspaceCheckpoints: WorkspaceCheckpoints
  }
}

const mutationTool = /^(?:run_code|(?:.*[_.-])?(?:bash|powershell|shell|terminal|apply[_-]patch|write(?:[_-]file)?|(?:str[_-]replace[_-])?editor?|edit(?:[_-]files?|[_-]batch)?|replace(?:[_-]across[_-]files)?|move[_-]file|delete[_-]file|create[_-]file|ast[_-]rewrite|exec(?:ute)?[_-]command)|mcp__.*)$/iu

function sessionId(agent: AgentIdentity | undefined): string {
  return String(agent?.session?.id ?? agent?.id ?? '')
}

function busy(error: unknown): boolean {
  return error instanceof CheckpointAccessError && error.code === 'busy'
}

export function apply(ctx: Context, options: Config = {}): void {
  const gitPath = options.enabled === false ? undefined : resolveCheckpointGit()
  const homePath = dshHomePath()
  const host = gitPath ? new CheckpointHost({
    store: new ShadowGit({ homePath, gitPath }), userScope: ctx.userScope, workspaces: ctx.workspaceRegistry,
    approvalKey: desktopApprovalKey(), vaultHome: homePath, executable: gitPath, validWorkspace: validCheckpointWorkspace,
  }) : undefined

  ctx.inject(['webServer'], scope => scope.webServer.register(checkpointRoute(host)))
  if (!host) return

  const reportFailure = (error: unknown) => {
    if (!(error instanceof CheckpointAccessError)) ctx.logger.warn('checkpoints: workspace snapshot unavailable')
  }
  const beginWorkspaceMutation: WorkspaceCheckpoints['beginWorkspaceMutation'] = async ({ sessionId, workspacePath, signal }) => {
    const budget = AbortSignal.timeout(15_000)
    try { return await host.beforeWorkspaceWrite(sessionId, workspacePath, signal ? AbortSignal.any([signal, budget]) : budget) }
    catch (error) {
      if (busy(error)) throw error
      reportFailure(error)
      return undefined
    }
  }
  const service: WorkspaceCheckpoints = {
    async beforeWorkspaceWrite({ agent, workspacePath }) {
      try { await host.captureBeforeWrite(sessionId(agent), workspacePath, AbortSignal.timeout(15_000)) }
      catch (error) {
        if (busy(error)) throw error
        reportFailure(error)
      }
    },
    beginWorkspaceMutation,
  }
  ctx.provide('workspaceCheckpoints', service)

  ctx.on('agent/pre-step', async ({ agent, turn, signal }, next) => {
    try { await host.beginTurn(sessionId(agent), turn, AbortSignal.any([signal, AbortSignal.timeout(15_000)])) }
    catch (error) {
      if (busy(error)) return { kind: 'reject' }
      reportFailure(error)
    }
    return next()
  })
  ctx.on('agent/turn-stopping', async ({ agent, turn, signal }) => {
    await host.endTurn(sessionId(agent), turn, AbortSignal.any([signal, AbortSignal.timeout(15_000)]), false).catch(reportFailure)
  })
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end') void host.endTurn(String(session.id), event.data.turn, AbortSignal.timeout(15_000)).catch(reportFailure)
  })
  ctx.on('session/disposed', session => host.abandonSession(String(session.id)))
  ctx.on('tools/execute', async (execution, next) => {
    if (!execution.agent || !mutationTool.test(execution.name)) return next()
    let finish: (() => Promise<void>) | undefined
    try {
      finish = await beginWorkspaceMutation({ sessionId: sessionId(execution.agent), signal: execution.signal })
    } catch (error) {
      if (!busy(error)) throw error
      const message = 'The workspace is being restored. Retry this tool when restoration has finished.'
      return { isError: true, error: { message, info: { name: 'CheckpointAccessError', code: 'CHECKPOINT_RESTORE_BUSY' } },
        content: [{ type: 'text', text: message }] }
    }
    try { return await next() }
    finally { await finish?.().catch(reportFailure) }
  })
}
