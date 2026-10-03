import assert from 'node:assert/strict'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { resolvePackageRoot } from '../src/profile.mjs'

test('Packaged resolution starts at the physical SDK tree rather than a virtual ASAR identity', async () => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'dsh-profile-asar-resolution-')))
  try {
    const root = join(home, 'resources', 'app.asar.unpacked', 'node_modules', 'desktop-test-package')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'desktop-test-package', version: '1.0.0' }))
    const anchor = join(home, 'resources', 'app.asar', 'src', 'profile.mjs')
    assert.equal(resolvePackageRoot('desktop-test-package', [pathToFileURL(anchor)]), root)
    assert.equal(resolvePackageRoot('desktop-test-package', [anchor]), root)
    assert.equal(resolvePackageRoot('missing-test-package', [anchor]), undefined)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
