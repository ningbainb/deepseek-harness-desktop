import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const run = promisify(execFile)
const require = createRequire(new URL('../package.json', import.meta.url))
const packageRoot = dirname(require.resolve('dsh-agent-plugins-market/package.json'))

for (const scenario of ['state-failure', 'archive-swap-failure', 'url-update-failure', 'source-state-failure',
  'rollback-failure', 'archive-interrupted', 'archive-traversal', 'local-adopted-preserved', 'archive-success',
  'linked-destination', 'escaping-destination', 'hostile-journal', 'git-refresh-success',
  'git-refresh-foreign-origin', 'git-refresh-foreign-china', 'git-refresh-failure', 'archive-refresh-failure',
  'journal-unlink-after-restore', 'uncommitted-new-recovery']) {
  test(`actual market recovery: ${scenario}`, async () => {
    const root = await mkdtemp(join(tmpdir(), `dsh-market-recovery-${scenario}-`))
    try {
      const { stdout } = await run(process.execPath, [join(import.meta.dirname, 'fixtures', 'skill-market-recovery-fixture.mjs'), scenario, root, packageRoot], {
        windowsHide: true, timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
      })
      assert.match(stdout, new RegExp(`market recovery scenario passed: ${scenario}`, 'u'))
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 3 })
    }
  })
}

for (const [crash, recovery, exitCode] of [['crash-before-swap', 'recover-before-swap', 71], ['crash-after-state', 'recover-after-state', 72],
  ['crash-after-restore', 'recover-after-restore', 73]]) {
  test(`actual market restart recovery: ${crash}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-market-restart-'))
    const args = scenario => [join(import.meta.dirname, 'fixtures', 'skill-market-recovery-fixture.mjs'), scenario, root, packageRoot]
    const options = { windowsHide: true, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }
    try {
      await assert.rejects(run(process.execPath, args(crash), options), error => error.code === exitCode)
      const { stdout } = await run(process.execPath, args(recovery), options)
      assert.match(stdout, new RegExp(`market recovery scenario passed: ${recovery}`, 'u'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}
