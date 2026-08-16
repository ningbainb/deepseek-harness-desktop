import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const desktopRoot = join(import.meta.dirname, '..')

test('NSIS preflight cleans only stale processes owned by the previous install', async () => {
  const config = await readFile(join(desktopRoot, 'electron-builder.yml'), 'utf8')
  const include = await readFile(join(desktopRoot, 'build', 'installer.nsh'), 'utf8')
  const cleanup = await readFile(join(desktopRoot, 'build', 'cleanup-stale-processes.ps1'), 'utf8')

  assert.match(config, /include: build\/installer\.nsh/u)
  assert.match(include, /customInit/u)
  assert.match(include, /cleanup-stale-processes\.ps1/u)
  assert.match(cleanup, /DeepSeek Harness Desktop\.exe/u)
  assert.match(cleanup, /StartsWith\(\$resourcePrefix, \$comparison\)/u)
  assert.match(cleanup, /GetCimInstance|Get-CimInstance/u)
  assert.doesNotMatch(cleanup, /taskkill|\/IM\s|ProcessName/u)
})
