import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { windowsInstallerTestOptions } from './fixtures/installer-platform.mjs'
const exec = promisify(execFile)
const helper = join(import.meta.dirname, '../build/installer-upgrade-transaction.ps1')
test('fresh installation restoration failure can roll back its owned partial payload', windowsInstallerTestOptions(), async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-fresh-rollback-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const install = join(root, 'isolated-install'), temp = join(root, 'temp')
  await mkdir(temp)
  const run = mode => exec('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', helper, '-Mode', mode, '-InstallDirectory', install], { windowsHide: true, timeout: 30_000, env: { ...process.env, TEMP: temp, TMP: temp } })
  await writeFile(join(root, 'user-session.jsonl'), 'preserve-me')
  await run('Begin')
  await mkdir(join(install, 'resources'), { recursive: true })
  await writeFile(join(install, 'DeepSeek Harness Desktop.exe'), 'partial-app')
  await writeFile(join(install, 'resources/app.asar'), 'partial-runtime')
  await writeFile(join(install, 'resources/installer-upgrade-v3'), 'dsh-desktop-installer-upgrade=3\n')
  await run('Rollback')
  assert.equal(await access(install).then(() => true, () => false), false)
  assert.equal(await readFile(join(root, 'user-session.jsonl'), 'utf8'), 'preserve-me')
})
