import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

test('actual installed published pet retains composer clearance, pointer interaction, roaming and bounded layout work', { timeout: 330_000 }, async t => {
  const require = createRequire(new URL('../../../packages/dsh-pet/package.json', import.meta.url))
  const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
  const config = fileURLToPath(new URL('./published-pet-clearance.vitest.config.mjs', import.meta.url))
  const env = { ...process.env, NO_COLOR: '1' }
  delete env.DSH_PET_CLEARANCE_PACKAGE_ROOT
  delete env.DSH_PET_CLEARANCE_COMPONENT_EMIT
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [vitest, 'run', '--config', config], {
      env, cwd: fileURLToPath(new URL('../../../', import.meta.url)),
      timeout: 300_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
    })
    t.diagnostic(stdout.trim())
    if (stderr.trim()) t.diagnostic(stderr.trim())
    assert.match(stdout, /\b14 passed\b/u, 'Run every component, scroll and display-commit regression against the actual installed package')
  } catch (error) {
    if (error.stdout) t.diagnostic(error.stdout)
    if (error.stderr) t.diagnostic(error.stderr)
    throw error
  }
})
