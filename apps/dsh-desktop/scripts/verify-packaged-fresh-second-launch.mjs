import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { runPackagedDesktop } from './packaged-smoke-runner.mjs'

const appPath = resolve(process.env.DSH_DESKTOP_E2E_EXECUTABLE
  ?? join('dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe'))
const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-fresh-second-launch-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')

async function doesNotExist(path) {
  try {
    await access(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return true
    throw error
  }
  return false
}

try {
  const first = await runPackagedDesktop({
    appPath,
    userData,
    dshHome,
    requireStartupTimings: false,
  })
  assert.match(first.runtimeLog, /\[startup\] direct-state=ready-full/u)

  const manifest = JSON.parse(await readFile(join(dshHome, 'profiles', 'desktop', 'package.json'), 'utf8'))
  assert.equal(Object.hasOwn(manifest, 'version'), false)
  assert.equal(Object.hasOwn(manifest, 'desktopVersion'), false)
  assert.equal(await doesNotExist(join(userData, 'migration-assistant', 'completion.json')), true)

  const second = await runPackagedDesktop({
    appPath,
    userData,
    dshHome,
    requireStartupTimings: false,
  })
  const states = [...second.runtimeLog.matchAll(/\[startup\] direct-state=([^\r\n]+)/gu)]
    .map((match) => match[1])
  assert.equal(states.filter((state) => state === 'ready-full').length, 2)
  assert.doesNotMatch(
    second.runtimeLog,
    /unknown-version|pre-bootstrap migration repair required|startup recovery shell|free-mode session/iu,
  )
  assert.equal(await doesNotExist(join(userData, 'free-mode-sessions')), true)

  console.log('verified fresh unversioned Desktop Home reaches ready-full on first and second packaged launches')
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
