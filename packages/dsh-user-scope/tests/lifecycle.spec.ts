import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId as DshSessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  apply,
  asSessionId,
  asWorkspaceId,
  UserScopeService,
  type AccessScope,
} from '../src/index.ts'

interface WorkspaceRow {
  id: string
  sessionIds: readonly string[]
}

interface Fixture {
  ctx: Context
  service: UserScopeService
  workspaces: WorkspaceRow[]
}

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-user-scope-lifecycle-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function fixture(): Promise<Fixture> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const workspaces: WorkspaceRow[] = []
  ctx.provide('workspaceRegistry', {
    list: () => workspaces,
  } as unknown as WorkspaceRegistry)
  apply(ctx, { rootDir: root, now: () => 100 })
  const service = ctx.get('userScope')
  if (!(service instanceof UserScopeService)) throw new Error('user-scope service is missing')
  await service.ready()
  return { ctx, service, workspaces }
}

async function eventually(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) return
    await new Promise<void>(resolve => setTimeout(resolve, 5))
  }
  throw new Error('ownership was not persisted')
}

describe('user-scope session lifecycle', () => {
  it('registers sessions that were already live when the authority mounts', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(DshSessionId('session-before-scope'), { meta: { createdAt: 7 } })
    const workspaces: WorkspaceRow[] = [{ id: 'workspace-before-scope', sessionIds: [String(session.id)] }]
    ctx.provide('workspaceRegistry', { list: () => workspaces } as unknown as WorkspaceRegistry)
    apply(ctx, { rootDir: root, now: () => 100 })
    const service = ctx.get('userScope')
    if (!(service instanceof UserScopeService)) throw new Error('user-scope service is missing')
    await service.ready()

    await eventually(() => service.snapshot().sessions.some(item => String(item.sessionId) === String(session.id)))
    expect(service.snapshot().sessions).toContainEqual(expect.objectContaining({
      sessionId: asSessionId('session-before-scope'),
      workspaceId: asWorkspaceId('workspace-before-scope'),
      createdByPrincipalId: service.localPrincipal().id,
      createdAt: 7,
    }))
  })

  it('records a remote-created session under the current paired principal and workspace', async () => {
    const { ctx, service, workspaces } = await fixture()
    const bound = await service.bindDevice('device-lifecycle')
    await service.grantWorkspace(bound.principalId, 'workspace-remote')
    const sessionId = asSessionId('session-remote-lifecycle')!
    workspaces.push({ id: 'workspace-remote', sessionIds: [String(sessionId)] })
    const scope: AccessScope = { principalId: bound.principalId, deviceId: bound.deviceId, source: 'remote' }

    service.run(scope, () => {
      ctx.sessions.create(DshSessionId(String(sessionId)), { meta: { createdAt: 9 } })
    })

    await eventually(() => service.snapshot().sessions.some(item => item.sessionId === sessionId))
    expect(service.snapshot().sessions).toContainEqual(expect.objectContaining({
      sessionId,
      workspaceId: asWorkspaceId('workspace-remote'),
      createdByPrincipalId: bound.principalId,
      createdAt: 9,
    }))
  })

  it('does not create an unscoped remote ownership record when workspace resolution is absent', async () => {
    const { ctx, service } = await fixture()
    const bound = await service.bindDevice('device-without-workspace')
    const scope: AccessScope = { principalId: bound.principalId, deviceId: bound.deviceId, source: 'remote' }
    const sessionId = asSessionId('session-without-workspace')!

    service.run(scope, () => { ctx.sessions.create(DshSessionId(String(sessionId))) })
    await new Promise<void>(resolve => setTimeout(resolve, 25))

    expect(service.snapshot().sessions.some(item => item.sessionId === sessionId)).toBe(false)
  })
})
