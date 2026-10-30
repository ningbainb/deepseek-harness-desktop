import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { parseWorktreeList, strictWorktreeBranch, WorktreeHostService, WorktreeWorkspaceRegistry } from '../src/host/worktree-service.ts'
import type { GitRunner } from '../src/host/git-service.ts'
import { rendererWorktreeRecord, rendererWorktreeStatus } from '../src/host/worktree-routes.ts'

const runFile = promisify(execFile)
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

const runner: GitRunner = {
  async run(argv, cwd) {
    try {
      const result = await runFile(process.platform === 'win32' ? 'git.exe' : 'git', [...argv], { cwd, windowsHide: true, maxBuffer: 2 * 1024 * 1024 })
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
    } catch (error) {
      const value = error as { code?: number | string; stdout?: string; stderr?: string }
      if (process.env.DSH_GIT_GRAPH_TEST_DIAGNOSTICS === '1') {
        console.error('fixture git invocation failed', JSON.stringify({ argv, code: value.code, stderr: value.stderr }))
      }
      return { exitCode: typeof value.code === 'number' ? value.code : 1, stdout: value.stdout ?? '', stderr: value.stderr ?? '' }
    }
  },
}

async function git(cwd: string, ...argv: string[]) {
  const result = await runner.run(argv, cwd)
  if (result.exitCode !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

async function repoFixture(prefix = 'dsh-worktree-') {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-worktree-home-'))
  roots.push(root, dshHome)
  await git(root, 'init', '-b', 'main')
  await git(root, 'config', 'user.email', 'test@example.invalid')
  await git(root, 'config', 'user.name', 'DSH Test')
  await writeFile(join(root, 'README.md'), 'base\n')
  await git(root, 'add', 'README.md')
  await git(root, 'commit', '-m', 'base')
  const registry = new WorktreeWorkspaceRegistry()
  expect((await registry.register({ workspaceId: 'workspace-1', root })).ok).toBe(true)
  return { root, dshHome, registry, service: new WorktreeHostService({ runner, registry, dshHome }) }
}

describe('WorktreeHostService', () => {
  it('keeps main workspace untouched and protects dirty removal', async () => {
    const { root, dshHome, service } = await repoFixture()
    const created = await service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task-unsafe', runId: 'run-1' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.path.startsWith(dshHome)).toBe(true)
    expect((await service.listWorktrees('workspace-1')).ok).toBe(true)
    expect(strictWorktreeBranch('task/unsafe', 'run-1')).toMatch(/^dsh\/task\/[a-z0-9-]+-[a-z0-9-]+$/u)
    await writeFile(`${created.value.path}/README.md`, 'isolated\n')
    expect(await readFile(`${root}/README.md`, 'utf8')).toBe('base\n')
    const status = await service.getWorktreeStatus(created.value.worktreeId)
    expect(status.ok && status.value.dirty).toBe(true)
    expect(status.ok && status.value.changedFiles[0]?.path).toBe('README.md')
    expect(status.ok && status.value.additions).toBe(1)
    const diff = await service.diffWorktree(created.value.worktreeId, { maxPreviewBytes: 16 })
    expect(diff.ok && diff.value.finalRevision).toBe('WORKTREE')
    expect(diff.ok && Buffer.byteLength(diff.value.preview, 'utf8')).toBeLessThanOrEqual(16)
    expect(diff.ok && diff.value.previewTruncated, JSON.stringify(diff)).toBe(true)
    const blocked = await service.removeWorktree({ worktreeId: created.value.worktreeId })
    expect(!blocked.ok && blocked.error.code).toBe('worktree-dirty')
    const mergeBlocked = await service.mergeWorktree(created.value.worktreeId, 'main')
    expect(!mergeBlocked.ok && mergeBlocked.error.code).toBe('conflicts-present')
    const committed = await service.commitWorktree(created.value.worktreeId, 'isolated change')
    expect(committed.ok).toBe(true)
    const removed = await service.removeWorktree({ worktreeId: created.value.worktreeId })
    expect(removed.ok && removed.value.branchPreserved).toBe(true)
    expect(await git(root, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  it('rejects non-Git, bare, conflicted, active-operation, and occupied-branch repositories', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-worktree-home-'))
    const plain = await mkdtemp(join(tmpdir(), 'dsh-worktree-plain-'))
    const bare = await mkdtemp(join(tmpdir(), 'dsh-worktree-bare-'))
    roots.push(dshHome, plain, bare)
    const registry = new WorktreeWorkspaceRegistry()
    await registry.register({ workspaceId: 'plain', root: plain })
    await git(bare, 'init', '--bare', '.')
    await registry.register({ workspaceId: 'bare', root: bare })
    const service = new WorktreeHostService({ runner, registry, dshHome })
    const plainResult = await service.createWorktree({ workspaceId: 'plain', taskId: 'task', runId: 'run-plain' })
    expect(!plainResult.ok && plainResult.error.code).toBe('not-a-git-repository')
    const bareResult = await service.createWorktree({ workspaceId: 'bare', taskId: 'task', runId: 'run-bare' })
    expect(!bareResult.ok && bareResult.error.code).toBe('bare-repository')

    const operation = await repoFixture('dsh-worktree-operation-')
    await writeFile(join(operation.root, '.git', 'MERGE_HEAD'), `${await git(operation.root, 'rev-parse', 'HEAD')}\n`)
    const operationResult = await operation.service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task', runId: 'run-operation' })
    expect(!operationResult.ok && operationResult.error.code).toBe('operation-in-progress')

    const occupied = await repoFixture('dsh-worktree-occupied-')
    const branch = strictWorktreeBranch('task', 'run-occupied')
    await git(occupied.root, 'branch', branch)
    const occupiedResult = await occupied.service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task', runId: 'run-occupied' })
    expect(!occupiedResult.ok && occupiedResult.error.code).toBe('branch-already-exists')

    const conflicted = await repoFixture('dsh-worktree-conflict-preflight-')
    await git(conflicted.root, 'checkout', '-b', 'conflict-side')
    await writeFile(join(conflicted.root, 'README.md'), 'side\n')
    await git(conflicted.root, 'commit', '-am', 'side')
    await git(conflicted.root, 'checkout', 'main')
    await writeFile(join(conflicted.root, 'README.md'), 'main\n')
    await git(conflicted.root, 'commit', '-am', 'main')
    expect((await runner.run(['merge', 'conflict-side'], conflicted.root)).exitCode).not.toBe(0)
    const conflictResult = await conflicted.service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task', runId: 'run-conflict' })
    expect(!conflictResult.ok && conflictResult.error.code).toBe('conflicts-present')
  })

  it('reconciles an externally removed Worktree as orphaned', async () => {
    const { root, service } = await repoFixture('dsh-worktree-reconcile-')
    const created = await service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task', runId: 'run-reconcile' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    await git(root, 'worktree', 'remove', '--force', created.value.path)
    const reconciled = await service.reconcile()
    expect(reconciled.find(row => row.worktreeId === created.value.worktreeId)?.state).toBe('orphaned')
  })

  it('requires literal discard confirmation before dirty removal and deletes only the generated branch', async () => {
    const { root, service } = await repoFixture('dsh-worktree-discard-')
    const created = await service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task', runId: 'run-discard' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    await writeFile(join(created.value.path, 'discard.txt'), 'discard me\n')
    const blocked = await service.removeWorktree({ worktreeId: created.value.worktreeId, preserveBranch: false, force: true })
    expect(!blocked.ok && blocked.error.code).toBe('worktree-dirty')
    expect((await runner.run(['show-ref', '--verify', `refs/heads/${created.value.branch}`], root)).exitCode).toBe(0)
    const discarded = await service.removeWorktree({ worktreeId: created.value.worktreeId, preserveBranch: false, force: true, confirmDiscard: 'DISCARD' })
    expect(discarded.ok && discarded.value.branchPreserved).toBe(false)
    expect((await runner.run(['show-ref', '--verify', `refs/heads/${created.value.branch}`], root)).exitCode).not.toBe(0)
    expect(await git(root, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  it('blocks creation when controlled Worktree storage has insufficient capacity', async () => {
    const { dshHome, registry } = await repoFixture('dsh-worktree-disk-')
    const service = new WorktreeHostService({
      runner,
      registry,
      dshHome,
      fs: { statfs: async () => ({ bavail: 1, bsize: 1 }) as never },
    })
    const result = await service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task', runId: 'run-disk' })
    expect(!result.ok && result.error.code).toBe('disk-space')
  })

  it('persists removal even when Git safely refuses to delete an unmerged task branch', async () => {
    const { root, dshHome, registry, service } = await repoFixture('dsh-worktree-remove-recovery-')
    const created = await service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task', runId: 'run-remove-recovery' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    await writeFile(join(created.value.path, 'change.txt'), 'branch-only\n')
    expect((await service.commitWorktree(created.value.worktreeId, 'branch-only change')).ok).toBe(true)
    const removed = await service.removeWorktree({ worktreeId: created.value.worktreeId, preserveBranch: false })
    expect(!removed.ok && removed.error.code).toBe('internal')
    expect((await runner.run(['show-ref', '--verify', `refs/heads/${created.value.branch}`], root)).exitCode).toBe(0)
    const restarted = new WorktreeHostService({ runner, registry, dshHome })
    const listed = await restarted.listWorktrees('workspace-1')
    expect(listed.ok && listed.value).toEqual([])
    expect(await git(root, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')
  })

  it('stops a conflicting merge before changing the main workspace', async () => {
    const { root, service } = await repoFixture('dsh-worktree-merge-conflict-')
    const created = await service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task', runId: 'run-merge-conflict' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    await writeFile(join(created.value.path, 'README.md'), 'task branch\n')
    expect((await service.commitWorktree(created.value.worktreeId, 'task change')).ok).toBe(true)
    await writeFile(join(root, 'README.md'), 'main branch\n')
    await git(root, 'commit', '-am', 'main change')
    const mainBefore = await git(root, 'rev-parse', 'HEAD')
    const merge = await service.mergeWorktree(created.value.worktreeId, 'main')
    expect(!merge.ok && merge.error.code).toBe('merge-conflict')
    expect(await git(root, 'rev-parse', 'HEAD')).toBe(mainBefore)
    expect(await git(root, 'status', '--porcelain')).toBe('')
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('main branch\n')
  })

  it('projects Host records and status to Renderer-safe DTOs', async () => {
    const { service } = await repoFixture('dsh-worktree-renderer-dto-')
    const created = await service.createWorktree({ workspaceId: 'workspace-1', taskId: 'task', runId: 'run-dto' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const record = rendererWorktreeRecord(created.value) as unknown as Record<string, unknown>
    expect(record.path).toBeUndefined()
    expect(record.repoRoot).toBeUndefined()
    const statusResult = await service.getWorktreeStatus(created.value.worktreeId)
    expect(statusResult.ok).toBe(true)
    if (!statusResult.ok) return
    const status = rendererWorktreeStatus(statusResult.value) as unknown as Record<string, unknown>
    expect(status.path).toBeUndefined()
    expect(status.worktreeId).toBe(created.value.worktreeId)
  })

  it('parses registry worktrees and rejects unsafe home escapes', () => {
    expect(parseWorktreeList('worktree C:/repo\nHEAD abc\nbranch refs/heads/main\n\nworktree C:/wt\nHEAD def\nbranch refs/heads/dsh/task/x\n')).toEqual([
      { path: 'C:/repo', head: 'abc', branch: 'main' },
      { path: 'C:/wt', head: 'def', branch: 'dsh/task/x' },
    ])
    expect(() => strictWorktreeBranch('x'.repeat(2_000), 'run')).not.toThrow()
  })
})
