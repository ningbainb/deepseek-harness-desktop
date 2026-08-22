import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { runPackagedDesktop } from './packaged-smoke-runner.mjs'
import { runPresetDeepLinkE2E } from './preset-deep-link-runner.mjs'
import { runTaskBoardWorktreeE2E } from './task-board-worktree-e2e-runner.mjs'

const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join('dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const userData = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-'))

try {
  const result = await runPackagedDesktop({
    appPath,
    userData,
    dshHome: join(userData, 'dsh-home'),
  })
  const userDataEntries = await readdir(userData)
  assert.equal(userDataEntries.includes('free-mode-sessions'), false, 'healthy packaged startup created an isolated recovery session')
  assert.equal(userDataEntries.includes('runtime-bin'), true, 'healthy packaged startup did not create the stable runtime-bin')
  console.log(`packaged desktop smoke ${JSON.stringify({ elapsedMs: result.elapsedMs, ...result.timings })}`)
  await runPresetDeepLinkE2E({
    appDir: resolve('.'),
    executablePath: appPath,
    timeoutMs: 120_000,
  })
  const worktree = await runTaskBoardWorktreeE2E({ appDir: resolve('.'), executablePath: appPath })
  console.log(`packaged Task Board Worktree E2E ${JSON.stringify(worktree)}`)
} finally {
  await rm(userData, { recursive: true, force: true })
}
