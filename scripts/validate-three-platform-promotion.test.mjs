import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { validatePromotionSource, prepareVerifiedReleaseAssets } from './validate-three-platform-promotion.mjs'

const repository = 'ningbainb/deepseek-harness-desktop'
const commit = 'c0711f974b159ad930cc7d1a6da0826fca3c6d2f'
const runId = '44649325773'
const version = '5.3.5'
const platformJobs = ['windows', 'macos', 'linux']

function sourceFixture() {
  return {
    repository, commit, runId, version,
    run: { id: Number(runId), head_sha: commit, head_branch: 'main', head_repository: { full_name: repository },
      path: '.github/workflows/desktop-three-platform-release.yml', event: 'workflow_dispatch',
      status: 'completed', conclusion: 'success', run_attempt: 1 },
    jobs: [...platformJobs, 'verify-artifacts'].map(name => ({ name, status: 'completed', conclusion: 'success',
      run_id: Number(runId), run_attempt: 1, head_sha: commit })),
  }
}

test('promotion selects only the completed native preflight for the exact release tag', () => {
  assert.deepEqual(validatePromotionSource(sourceFixture()), { commit, attempt: 1 })
  for (const mutate of [
    fixture => { fixture.run.path = '.github/workflows/ci.yml' },
    fixture => { fixture.run.head_repository.full_name = 'fork/desktop' },
    fixture => { fixture.run.head_sha = 'a'.repeat(40) },
    fixture => { fixture.run.conclusion = 'failure' },
    fixture => { fixture.jobs[1].run_attempt = 2 },
    fixture => { fixture.jobs[2].conclusion = 'skipped' },
    fixture => { fixture.jobs.pop() },
  ]) {
    const fixture = sourceFixture()
    mutate(fixture)
    assert.throws(() => validatePromotionSource(fixture))
  }
})

const describe = (file, data) => ({ file, size: Buffer.byteLength(data), sha256: createHash('sha256').update(data).digest('hex') })

async function assetFixture(context) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-promotion-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const nativeDirectory = join(directory, 'native')
  const qaDirectory = join(directory, 'qa')
  await Promise.all([mkdir(nativeDirectory), mkdir(qaDirectory)])
  const setup = `DeepSeek-Harness-Desktop-Setup-${version}-x64.exe`
  const installerNames = [setup, `DeepSeek-Harness-Desktop-${version}-arm64.dmg`,
    `DeepSeek-Harness-Desktop-${version}-arm64.zip`, `DeepSeek-Harness-Desktop-${version}-amd64.deb`]
  const files = installerNames.map(file => describe(file, file))
  const rows = files.map(({ file, sha256 }) => `${sha256}  ${file}\n`)
  const checksum = 'SHA256SUMS.txt'
  const nativeReceipts = [describe('SHA256SUMS-windows.txt', rows[0]), describe('SHA256SUMS-macos.txt', rows.slice(1, 3).join('')),
    describe('SHA256SUMS-linux.txt', rows[3])]
  const manifest = { schemaVersion: 1, version, channel: 'stable', files: [files[0], describe(checksum, rows[0])] }
  const nativeManifest = JSON.stringify(manifest, null, 2) + '\n'
  manifest.files[1] = describe(checksum, rows.join(''))
  const combinedManifest = JSON.stringify(manifest, null, 2) + '\n'
  const receipt = { schemaVersion: 1, kind: 'desktop-three-platform-preflight', status: 'passed', version,
    sourceCommit: commit, runId, runAttempt: '1', eventName: 'workflow_dispatch', ref: 'refs/heads/main', publish: false,
    nativeJobs: Object.fromEntries(platformJobs.map(name => [name, 'success'])), files, nativeReceipts,
    combinedChecksums: describe(checksum, rows.join('')), releaseManifest: describe('release-manifest.json', combinedManifest) }
  await Promise.all([
    ...installerNames.map(file => writeFile(join(nativeDirectory, file), file)),
    writeFile(join(nativeDirectory, 'latest.yml'), `version: ${version}\n`),
    writeFile(join(nativeDirectory, `${setup}.blockmap`), 'blockmap'),
    writeFile(join(nativeDirectory, checksum), rows[0]),
    writeFile(join(nativeDirectory, nativeReceipts[1].file), rows.slice(1, 3).join('')),
    writeFile(join(nativeDirectory, nativeReceipts[2].file), rows[3]),
    writeFile(join(nativeDirectory, 'release-manifest.json'), nativeManifest),
    writeFile(join(nativeDirectory, 'distribution-artifacts-macos-arm64.json'), JSON.stringify({ sourceCommit: commit, version, files: files.slice(1, 3) })),
    writeFile(join(nativeDirectory, 'distribution-artifacts-linux-x64.json'), JSON.stringify({ sourceCommit: commit, version, files: files.slice(3) })),
    writeFile(join(qaDirectory, checksum), rows.join('')),
    writeFile(join(qaDirectory, 'preflight-receipt.json'), JSON.stringify(receipt)),
  ])
  return { nativeDirectory, qaDirectory, installerNames, version, commit, runId, attempt: 1, rows }
}

test('promotion verifies exact preflight bytes and preserves original checksums', async context => {
  const fixture = await assetFixture(context)
  await prepareVerifiedReleaseAssets(fixture)
  assert.equal(await readFile(join(fixture.nativeDirectory, 'SHA256SUMS-windows.txt'), 'utf8'), fixture.rows[0])
  assert.equal(await readFile(join(fixture.nativeDirectory, 'SHA256SUMS.txt'), 'utf8'), fixture.rows.join(''))
})

for (const mutation of ['wrong commit', 'other attempt', 'tampered installer', 'tampered native checksum', 'unexpected asset']) {
  test(`promotion rejects ${mutation}`, async context => {
    const fixture = await assetFixture(context)
    if (mutation === 'wrong commit') fixture.commit = 'a'.repeat(40)
    if (mutation === 'other attempt') fixture.attempt = 2
    if (mutation === 'tampered installer') await writeFile(join(fixture.nativeDirectory, fixture.installerNames[1]), 'wrong')
    if (mutation === 'tampered native checksum') await writeFile(join(fixture.nativeDirectory, 'SHA256SUMS-linux.txt'), 'wrong')
    if (mutation === 'unexpected asset') await writeFile(join(fixture.nativeDirectory, 'extra.zip'), 'unexpected')
    await assert.rejects(prepareVerifiedReleaseAssets(fixture))
  })
}
