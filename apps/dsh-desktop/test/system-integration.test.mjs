import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('packaging registers the bounded dsh protocol and .dshpreset association', async () => {
  const config = await readFile(join(root, 'electron-builder.yml'), 'utf8')
  assert.match(config, /protocols:[\s\S]*schemes:[\s\S]*- dsh/u)
  assert.match(config, /fileAssociations:[\s\S]*ext: dshpreset/u)
  assert.match(config, /name: DeepSeek Harness Desktop Preset/u)
})

test('file association ingress previews presets internally without exposing their path to a renderer', async () => {
  const main = await readFile(join(root, 'src', 'electron-app.mjs'), 'utf8')
  const ingress = await readFile(join(root, 'src', 'desktop-ingress.mjs'), 'utf8')
  assert.match(ingress, /presetFileFrom\(commandLine\)/u)
  assert.match(main, /presetService\.previewFile\(path\)/u)
  assert.match(main, /webContents\.send\('extensions:preset-preview', plan\)/u)
  assert.doesNotMatch(main, /webContents\.send\('extensions:preset-preview',\s*path\)/u)
})
