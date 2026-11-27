import { generateKeyPairSync, sign } from 'node:crypto'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AccessScope, UserScopeService } from '@ningbainb/dsh-user-scope'
import type { CheckpointFile, Checkpoint } from '../src/core/shadow-git.ts'
import type { RestoreCheckpoints } from '../src/core/types.ts'

const owner = { principalId: 'owner', source: 'desktop' } as AccessScope
const workspace = { id: 'workspace-1', path: resolve('project'), sessionIds: ['first', 'second'] }
const files: CheckpointFile[] = [{ path: 'tracked.txt', status: 'deleted', insertions: 0, deletions: 1, binary: false }]
const first: Checkpoint = {
  checkpointId: 'checkpoint-1', sessionId: 'first', turnId: '1', commitHash: 'commit-1', treeHash: 'tree-1',
  timestamp: 1700000000000, source: 'post-turn', skippedLargeFiles: [], stats: { filesChanged: 1, insertions: 1, deletions: 0 },
}
const second: Checkpoint = { ...first, checkpointId: 'checkpoint-2', sessionId: 'second' }

async function setup() {
  const { CheckpointHost } = await import('../src/host/service.ts')
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  let scope: AccessScope | undefined
  const denied = new Set<string>()
  const capture = vi.fn(async (): Promise<Checkpoint | undefined> => undefined)
  const restore = vi.fn(async (_root: string, _request: RestoreCheckpoints, _signal?: AbortSignal) => ({
    checkpoint: first, undoCheckpoint: first, files,
  }))
  const previewRestore = vi.fn(async () => ({ token: 'test-token', checkpointId: first.checkpointId, files }))
  const store = {
    capture, restore, previewRestore,
    list: async (_root: string, sessionId?: string) => [first, second].filter(item => !sessionId || item.sessionId === sessionId),
    diff: async () => ({ patch: 'change', files }),
  }
  const now = () => 1700000000000
  const userScope = {
    desktopScope: () => owner, currentScope: () => scope,
    canAccess: (_: AccessScope, resource: Parameters<UserScopeService['canAccess']>[1]): ReturnType<UserScopeService['canAccess']> => {
      const id = resource.kind === 'session' ? resource.sessionId : resource.kind === 'workspace' ? resource.workspaceId : ''
      return denied.has(id)
        ? { allowed: false, reason: 'missing-workspace-grant' }
        : { allowed: true, reason: 'allowed' }
    },
  }
  const host = new CheckpointHost({ store, userScope, workspaces: { list: () => [workspace] }, approvalKey: publicKey, now })
  const proof = (challengeId: string, kind = 'checkpoint-restore-approval') => {
    const payload = Buffer.from(JSON.stringify({ kind, challengeId, issuedAt: now() }))
    return payload.toString('base64url') + '.' + sign(null, payload, privateKey).toString('base64url')
  }
  return { host, denied, capture, restore, previewRestore, proof, setScope: (next: AccessScope) => { scope = next } }
}

describe('checkpoint workspace authority', () => {
  it('scopes checkpoint reads to the owning session, including two sessions on one workspace', async () => {
    const { host, denied } = await setup()
    expect(await host.list('first')).toEqual([first])
    await expect(host.diff('first', second.checkpointId, {})).rejects.toMatchObject({ code: 'not-found' })
    denied.add(workspace.id)
    await expect(host.list('first')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('rejects a remote request before obtaining workspace snapshots', async () => {
    const { host, setScope } = await setup()
    setScope({ principalId: 'other', source: 'remote' } as AccessScope)
    await expect(host.list('first')).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('binds restoration to reviewed files, consumes one signed proof, and denies other domains', async () => {
    const { host, proof, restore } = await setup()
    const preview = await host.prepare('first', first.checkpointId, ['tracked.txt'])
    expect(preview.files).toEqual(files)
    expect(await host.describeApproval(preview.challengeId!)).toMatchObject({ files: 1, deleteCount: 1 })
    await expect(host.restore('first', preview.challengeId!, proof(preview.challengeId!, 'mcp-app-tool-approval')))
      .rejects.toMatchObject({ code: 'approval-required' })
    await expect(host.restore('first', preview.challengeId!, proof(preview.challengeId!))).resolves.toHaveProperty('undoCheckpoint')
    await expect(host.restore('first', preview.challengeId!, proof(preview.challengeId!))).rejects.toMatchObject({ code: 'approval-required' })
    expect(restore).toHaveBeenCalledExactlyOnceWith(workspace.path, expect.objectContaining({
      checkpointId: first.checkpointId, token: 'test-token', paths: ['tracked.txt'], sessionId: 'first',
    }), undefined)
  })

  it('rejects signed approval after workspace grant revocation', async () => {
    const { host, denied, proof, restore } = await setup()
    const preview = await host.prepare('first', first.checkpointId, ['tracked.txt'])
    denied.add(workspace.id)
    await expect(host.describeApproval(preview.challengeId!)).rejects.toMatchObject({ code: 'forbidden' })
    await expect(host.restore('first', preview.challengeId!, proof(preview.challengeId!))).rejects.toMatchObject({ code: 'forbidden' })
    expect(restore).not.toHaveBeenCalled()
  })

  it('revalidates workspace access under the engine lock before a restore writes', async () => {
    const { host, denied, proof, restore } = await setup()
    const preview = await host.prepare('first', first.checkpointId)
    restore.mockImplementationOnce(async (_root, options) => {
      denied.add(workspace.id)
      options.beforeApply?.()
      return { checkpoint: first, undoCheckpoint: first, files }
    })
    await expect(host.restore('first', preview.challengeId!, proof(preview.challengeId!)))
      .rejects.toMatchObject({ code: 'forbidden' })
  })

  it('captures the admitted turn before work and makes restore wait for the workspace to be idle', async () => {
    const { host, capture } = await setup()
    await host.beginTurn('first', 2)
    await expect(host.prepare('first', first.checkpointId)).rejects.toMatchObject({ code: 'busy' })
    await host.endTurn('first', 2)
    expect(capture.mock.calls).toEqual([
      [workspace.path, expect.objectContaining({ sessionId: 'first', turnId: '2', source: 'pre-turn' }), undefined],
      [workspace.path, expect.objectContaining({ sessionId: 'first', turnId: '2', source: 'post-turn' }), undefined],
    ])
    await expect(host.prepare('first', first.checkpointId)).resolves.toHaveProperty('challengeId')
  })
})
