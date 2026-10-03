import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function verifyBrandingAssets(appDirectory, { resources } = {}) {
  const buildDirectory = join(appDirectory, 'build')
  const manifest = JSON.parse(await readFile(join(buildDirectory, 'branding-assets.json'), 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.deepEqual(Object.keys(manifest.files).sort(), ['icon-source-v2.png', 'icon.icns', 'icon.ico', 'icon.png'])
  for (const [filename, expected] of Object.entries(manifest.files)) {
    assert.match(expected, /^[0-9a-f]{64}$/u, filename)
    const bytes = await readFile(join(buildDirectory, filename))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected,
      `Desktop branding asset drift: ${filename}`)
  }
  if (resources) {
    const packaged = await readFile(join(resources, 'app-icon.png'))
    assert.equal(createHash('sha256').update(packaged).digest('hex'), manifest.files['icon.png'],
      'Packaged Desktop icon must match the pinned branding artwork')
  }
  return manifest
}
