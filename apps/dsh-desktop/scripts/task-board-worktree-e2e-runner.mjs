import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function git(cwd, ...argv) {
  const result = await execFileAsync(process.platform === 'win32' ? 'git.exe' : 'git', argv, {
    cwd,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  })
  return result.stdout.trim()
}

function packagedModule(appDir, executablePath, packageName) {
  const resourcesDirectory = executablePath
    ? join(dirname(resolve(executablePath)), 'resources')
    : resolve(appDir, 'dist', 'win-unpacked', 'resources')
  return resolve(
    resourcesDirectory,
    'app.asar.unpacked',
    'node_modules',
    '@linxin666',
    packageName,
    'lib',
    'index.js',
  )
}

/**
 * Load the exact modules shipped beside the packaged Electron app and prove a
 * real repository isolation/review lifecycle. No source-tree import is used.
 */
export async function runTaskBoardWorktreeE2E({ appDir = resolve('.'), executablePath } = {}) {
  const taskBoardPath = packagedModule(appDir, executablePath, 'dsh-client-ui-task-board')
  const gitGraphPath = packagedModule(appDir, executablePath, 'dsh-client-ui-git-graph')
  const taskBoard = await import(pathToFileURL(taskBoardPath).href)
  const gitGraph = await import(pathToFileURL(gitGraphPath).href)

  assert.equal(typeof taskBoard.WorktreeExecutionCoordinator, 'function', 'packaged Task Board must export Worktree execution')
  assert.equal(typeof taskBoard.EvidenceReviewService, 'function', 'packaged Task Board must export Evidence review')
  assert.equal(typeof gitGraph.WorktreeHostService, 'function', 'packaged Git Graph must export the Worktree Host service')

  const repoRoot = await mkdtemp(join(tmpdir(), 'dsh-packaged-worktree-repo-'))
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-packaged-worktree-home-'))
  try {
    await git(repoRoot, 'init', '-b', 'main')
    await git(repoRoot, 'config', 'user.email', 'packaged-e2e@example.invalid')
    await git(repoRoot, 'config', 'user.name', 'DSH Packaged E2E')
    await writeFile(join(repoRoot, 'README.md'), 'stable checkout\n')
    await git(repoRoot, 'add', 'README.md')
    await git(repoRoot, 'commit', '-m', 'stable base')
    const stableHead = await git(repoRoot, 'rev-parse', 'HEAD')

    const runner = {
      async run(argv, cwd) {
        try {
          const result = await execFileAsync(process.platform === 'win32' ? 'git.exe' : 'git', [...argv], {
            cwd,
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
          })
          return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
        } catch (error) {
          return {
            exitCode: typeof error?.code === 'number' ? error.code : 1,
            stdout: typeof error?.stdout === 'string' ? error.stdout : '',
            stderr: typeof error?.stderr === 'string' ? error.stderr : String(error),
          }
        }
      },
    }
    const registry = new gitGraph.WorktreeWorkspaceRegistry()
    const registration = await registry.register({ workspaceId: 'workspace-packaged', root: repoRoot })
    assert.equal(registration.ok, true)
    const worktrees = new gitGraph.WorktreeHostService({ runner, registry, dshHome })

    const listeners = new Set()
    let providerCwd
    let promptCount = 0
    const provider = {
      probe: () => ({
        providerId: 'packaged-e2e-provider',
        upstreamVersion: 'fixture',
        supportStatus: 'known-good',
        capabilities: [
          { id: 'workspace.register', status: 'available' },
          { id: 'session.create', status: 'available' },
          { id: 'session.observe', status: 'available' },
        ],
      }),
      registerWorkspace: async (specification) => {
        providerCwd = specification.cwd
        return { workspaceId: 'provider-workspace-packaged' }
      },
      createSession: async (specification) => ({
        sessionId: 'session-packaged',
        workspaceId: specification.workspaceId,
        cwd: specification.cwd,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        async prompt() {
          promptCount += 1
          await writeFile(join(specification.cwd, 'packaged-result.txt'), 'isolated result\n')
          queueMicrotask(() => {
            for (const listener of listeners) listener({ type: 'completed', resultStatus: 'succeeded' })
          })
          return { ok: true }
        },
        async cancel() {
          for (const listener of listeners) listener({ type: 'cancelled', resultStatus: 'cancelled' })
        },
      }),
    }

    const evidenceStore = new taskBoard.InMemoryEvidenceStore()
    const coordinator = new taskBoard.WorktreeExecutionCoordinator(provider, worktrees, evidenceStore)
    const project = taskBoard.createProject({
      id: 'project-packaged',
      name: 'Packaged E2E',
      workspaceId: 'workspace-packaged',
      defaultIsolation: 'git-worktree',
    })
    const execution = await coordinator.run({
      task: { id: 'task-packaged', title: 'Packaged Worktree lifecycle', prompt: 'write the deterministic fixture' },
      project,
      runId: 'run-packaged',
      startedAt: Date.now(),
    })

    assert.equal(execution.mode, 'git-worktree')
    assert.equal(execution.run.resultStatus, 'awaiting-review')
    assert.equal(promptCount, 1)
    assert.equal(execution.capabilityEvidence.sessionCwdVerified, true)
    assert.notEqual(resolve(providerCwd), resolve(repoRoot))
    assert.equal(await git(repoRoot, 'rev-parse', 'HEAD'), stableHead)
    assert.equal(await git(repoRoot, 'status', '--porcelain'), '')
    await assert.rejects(readFile(join(repoRoot, 'packaged-result.txt'), 'utf8'), /ENOENT/u)

    const evidence = evidenceStore.get(execution.evidenceId)
    assert.equal(evidence?.resultStatus, 'awaiting-review')
    assert.equal(evidence?.worktreeId, execution.run.worktreeId)
    assert.equal(evidence?.changedFiles.some(file => file.path === 'packaged-result.txt'), true)

    const review = new taskBoard.EvidenceReviewService({ store: evidenceStore, worktrees })
    const committed = await review.commit(execution.evidenceId, 'accept packaged result')
    assert.equal(committed.ok, true)
    assert.equal(committed.status, 'accepted')
    assert.equal(await git(repoRoot, 'rev-parse', 'HEAD'), stableHead, 'commit must not move main')

    const merged = await review.merge(execution.evidenceId, 'main')
    assert.equal(merged.ok, true)
    assert.equal(
      (await readFile(join(repoRoot, 'packaged-result.txt'), 'utf8')).replaceAll('\r\n', '\n'),
      'isolated result\n',
    )
    assert.equal(await git(repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main')

    assert.equal((await review.keep(execution.evidenceId)).ok, true)
    assert.equal((await review.discard(execution.evidenceId, true)).ok, true)
    const finalEvidence = evidenceStore.get(execution.evidenceId)
    assert.equal(finalEvidence?.resultStatus, 'discarded')
    assert.deepEqual(finalEvidence?.audit.map(entry => entry.action), ['commit', 'merge', 'keep', 'discard'])
    const remaining = await worktrees.listWorktrees('workspace-packaged')
    assert.equal(remaining.ok, true)
    assert.deepEqual(remaining.value, [])

    return {
      taskBoardPath,
      gitGraphPath,
      sessionCwdVerified: true,
      stableCheckoutCleanBeforeReview: true,
      reviewStatus: finalEvidence.resultStatus,
      auditActions: finalEvidence.audit.map(entry => entry.action),
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true })
    await rm(dshHome, { recursive: true, force: true })
  }
}
