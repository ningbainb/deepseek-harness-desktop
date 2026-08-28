import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ExternalSourceDiscoveryService } from '../../src/conversation-import/discovery.mjs'

test('Security: assertSafePath rejects path traversal attempts escaping allowed roots', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'sec-test-'))
  try {
    const allowedDir = join(tempDir, 'allowed-root')
    await mkdir(allowedDir, { recursive: true })

    const discovery = new ExternalSourceDiscoveryService({
      allowedRoots: [allowedDir],
    })

    const escapingPath = join(tempDir, 'outside', 'secret.txt')

    await assert.rejects(
      async () => {
        await discovery.assertSafePath(escapingPath)
      },
      /escape detected/iu,
    )
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
})
