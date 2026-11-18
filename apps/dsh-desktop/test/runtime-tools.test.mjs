import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import { boundedManagedGitInspection, ensurePnpmCommandShim } from '../src/electron-app.mjs'

test('bundled pnpm is exposed to in-process plugin stores without a system install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-tools-'))
  try {
    const directory = await ensurePnpmCommandShim({
      directory: join(root, 'bin'),
      executable: 'C:\\Program Files\\DeepSeek Harness Desktop\\app.exe',
      pnpmCli: 'C:\\Program Files\\DeepSeek Harness Desktop\\resources\\pnpm.mjs',
    })
    const name = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const command = await readFile(join(directory, name), 'utf8')
    assert.match(command, /ELECTRON_RUN_AS_NODE=1/u)
    assert.match(command, /pnpm\.mjs/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('bundled pnpm starts from a Unicode Windows install for a legacy command code page', { skip: process.platform !== 'win32' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-tools-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const install = join(root, "程序 100% ' test")
  await mkdir(install)
  const cli = join(install, 'pnpm.mjs')
  await writeFile(cli, 'console.log(JSON.stringify(process.argv.slice(2))); process.exitCode = 7\n')
  const directory = await ensurePnpmCommandShim({ directory: join(root, 'runtime-bin'), executable: process.execPath, pnpmCli: cli })
  // Use ASCII commands in a fresh shell, matching a Runtime with an OEM code page.
  const { stdout } = await promisify(execFile)(process.env.ComSpec || 'cmd.exe', ['/d', '/c',
    'chcp 437 >nul & pnpm.cmd view "fixture package" --json'], { cwd: directory, windowsHide: true }).then(
    () => assert.fail('pnpm exit status was lost'),
    error => { assert.equal(error.code, 7, error.stderr); return error },
  )
  assert.deepEqual(JSON.parse(stdout), ['view', 'fixture package', '--json'])
})

test('optional Git discovery cannot hold Desktop startup indefinitely', async () => {
  const never = new Promise(() => {})
  await assert.rejects(
    boundedManagedGitInspection(() => never, ['C:\\runtime-bin'], { timeoutMs: 25 }),
    error => error?.code === 'MANAGED_GIT_STARTUP_TIMEOUT',
  )
})

test('optional Git discovery returns verified PATH entries before its deadline', async () => {
  const result = { source: 'system', pathEntries: ['C:\\runtime-bin'] }
  assert.equal(
    await boundedManagedGitInspection(async () => result, ['C:\\runtime-bin'], { timeoutMs: 100 }),
    result,
  )
})
