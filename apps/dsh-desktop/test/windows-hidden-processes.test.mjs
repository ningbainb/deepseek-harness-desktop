import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))

test('official background subprocess paths hide their console window on Windows', async () => {
  const dshManifest = desktopRequire.resolve('@deepseek-ai/dsh/package.json')
  const runtimeRequire = createRequire(dshManifest)
  const baseManifest = runtimeRequire.resolve('@deepseek-ai/dsh-base/package.json')
  const baseRequire = createRequire(baseManifest)
  const subprocessManifest = baseRequire.resolve('@deepseek-ai/dsh-subprocess-local/package.json')
  const libDirectory = join(dirname(subprocessManifest), 'lib')
  const runtimeFiles = (await readdir(libDirectory)).filter((name) => name.endsWith('.js'))
  const source = (await Promise.all(
    runtimeFiles.map((name) => readFile(join(libDirectory, name), 'utf8')),
  )).join('\n')

  assert.match(source, /function launchWindowsJob[\s\S]*?windowsHide:\s*true/u)
  assert.match(source, /windowsHide:\s*platform === ["']win32["']/u)
  assert.match(source, /spawnSync\(["']taskkill["'][\s\S]*?windowsHide:\s*true/u)
  assert.match(source, /function probeWindowsJob[\s\S]*?loadWin32ProcessBindings/u)
})
