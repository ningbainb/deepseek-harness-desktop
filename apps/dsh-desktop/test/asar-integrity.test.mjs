import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { verifyAsarIntegrity } from '../scripts/verify-asar-integrity.mjs'

const require = createRequire(import.meta.url)
const asar = createRequire(require.resolve('electron-builder/package.json'))('@electron/asar')

test('package gate detects altered ASAR contents before launching the desktop', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-asar-integrity-'))
  try {
    const source = join(temporary, 'source')
    const archive = join(temporary, 'app.asar')
    await mkdir(source)
    await writeFile(join(source, 'main.mjs'), 'export const release = "3.3.0"\n')
    await asar.createPackage(source, archive)
    assert.equal(verifyAsarIntegrity(archive), 1)
    assert.equal(verifyAsarIntegrity(archive, { requiredFiles: ['main.mjs'] }), 1)
    assert.throws(() => verifyAsarIntegrity(archive, { requiredFiles: [join('src', 'runtime-shutdown-control.mjs')] }),
      /ASAR required packed file missing/)

    const contents = await readFile(archive)
    const { headerSize } = asar.getRawHeader(archive)
    const { offset } = asar.statFile(archive, 'main.mjs')
    contents[8 + headerSize + Number(offset)] ^= 1
    await writeFile(archive, contents)
    assert.throws(() => verifyAsarIntegrity(archive), /ASAR entry integrity mismatch: main.mjs/u)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
