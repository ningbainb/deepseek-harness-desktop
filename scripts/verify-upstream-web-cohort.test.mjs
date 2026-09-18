import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  COHORT_DIRECTORY,
  missingAdvertisedEntrypoints,
  verifyUpstreamWebCohort,
} from './verify-upstream-web-cohort.mjs'

test('upstream cohort rejects an advertised host or client entrypoint absent from a tarball', () => {
  const manifest = {
    main: 'lib/index.js',
    types: 'lib/types/index.d.ts',
    exports: {
      '.': { default: './lib/index.js', types: './lib/types/index.d.ts' },
      './client': './lib/client.js',
      './src/*': './src/*',
    },
  }
  const members = new Set(['package/lib/index.js', 'package/lib/types/index.d.ts'])
  assert.deepEqual(missingAdvertisedEntrypoints(manifest, members), ['package/lib/client.js'])
})

test('pinned upstream alpha source cohort has exact package and patch bytes', async () => {
  const result = await verifyUpstreamWebCohort()
  assert.equal(result.version, '0.3.23')
  assert.equal(result.count, 21)
  assert.ok(result.totalBytes > 10_000_000)
})

test('upstream cohort rejects provenance drift and modified tarballs', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-upstream-cohort-tamper-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await cp(COHORT_DIRECTORY, root, { recursive: true })
  const manifestPath = join(root, 'provenance.json')
  const originalManifest = await readFile(manifestPath)
  const changedManifest = JSON.parse(originalManifest.toString('utf8'))
  changedManifest.upstream.commit = '0'.repeat(40)
  await writeFile(manifestPath, `${JSON.stringify(changedManifest)}\n`)
  await assert.rejects(verifyUpstreamWebCohort({ directory: root }), /not the reviewed alpha/u)

  await writeFile(manifestPath, originalManifest)
  const artifact = join(root, 'linxin666-dsh-web-all-0.3.23.tgz')
  await writeFile(artifact, Buffer.concat([await readFile(artifact), Buffer.from('tampered')]))
  await assert.rejects(verifyUpstreamWebCohort({ directory: root }), /digest mismatch/u)
})
