import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'

const desktopRequire = createRequire(new URL('../package.json', import.meta.url))

test('official background subprocesses hide their console window on Windows', async () => {
  const dshManifest = desktopRequire.resolve('@deepseek-ai/dsh/package.json')
  const runtimeRequire = createRequire(dshManifest)
  const subprocessManifest = runtimeRequire.resolve('@deepseek-ai/dsh-subprocess-local/package.json')
  const source = await readFile(join(dirname(subprocessManifest), 'lib', 'index.js'), 'utf8')

  assert.match(source, /windowsHide:\s*platform === ["']win32["']/u)
  assert.match(source, /spawnSync\(["']taskkill["'][\s\S]*?windowsHide:\s*true/u)
})
