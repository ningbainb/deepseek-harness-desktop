import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { resolveNsisCompiler } from '../scripts/nsis-compiler.mjs'

const exec = promisify(execFile)
const desktop = resolve(import.meta.dirname, '..')

test('NSIS compiles hooks with warnings as errors when the executable constant is defined after the custom include', {
  skip: process.platform !== 'win32', timeout: 60_000,
}, async () => {
  const compiler = await resolveNsisCompiler()
  const root = await mkdtemp(join(tmpdir(), 'dsh-nsis-include-order-'))
  const payload = join(root, 'payload.txt')
  const output = join(root, 'fixture.exe')
  try {
    await mkdir(join(root, 'install'))
    await writeFile(payload, 'isolated compiler payload')
    const { stdout, stderr } = await exec(compiler.path, [
      '/WX', '/V2', `/DBUILD_RESOURCES_DIR=${join(desktop, 'build')}`,
      `/DTEST_OUTPUT=${output}`, `/DTEST_DEFAULT_INSTALL=${join(root, 'install')}`,
      `/DTEST_PAYLOAD=${payload}`, '/DTEST_REGISTRY=Software\\DeepSeekHarnessDesktopTests\\include-order',
      '/DTEST_UNINSTALL_FAILURE', join(desktop, 'test', 'fixtures', 'installer-lifecycle.nsi'),
    ], { windowsHide: true, timeout: 30_000, env: compiler.env })
    assert.doesNotMatch(`${stdout}\n${stderr}`, /warning|unknown variable\/constant/iu)
    assert.ok((await stat(output)).size > 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
