import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { runPackagedDesktop } from './packaged-smoke-runner.mjs'

const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join('dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-profile-reset-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'cleared-dsh-home')

try {
  // Reproduce `rmdir /s /q %USERPROFILE%\.dsh`: the Desktop AppData
  // preference remains, but the entire DSH home/profile is absent.
  const preferencePath = join(userData, 'desktop-preferences.json')
  await mkdir(dirname(preferencePath), { recursive: true })
  await writeFile(preferencePath, `${JSON.stringify({ closeBehavior: 'quit' })}\n`, 'utf8')

  const result = await runPackagedDesktop({ appPath, userData, dshHome })
  assert.doesNotMatch(result.runtimeLog, /pre-bootstrap migration repair required; bootstrap blocked/u)
  assert.ok(result.timings['runtime-ready'] >= 0)
  assert.ok(result.timings['renderer-loaded'] >= 0)
  console.log(`verified cleared-profile rebuild ${JSON.stringify(result.timings)}`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
