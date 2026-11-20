import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFile, copyFile, readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { classifyDesktopReleaseMetadata } from './desktop-release-metadata.mjs'
import { finalizeThreePlatformReceipts } from './finalize-three-platform-receipts.mjs'

const platforms = ['windows', 'macos', 'linux']
const combinedChecksumFile = 'SHA256SUMS.txt'
const manifestFile = 'release-manifest.json'
const readJson = async file => JSON.parse(await readFile(file, 'utf8'))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function validatePromotionSource({ run, jobs, repository, commit, runId, version }) {
  classifyDesktopReleaseMetadata({ version, eventName: 'push', ref: `refs/tags/desktop-v${version}` })
  assert.match(runId, /^[1-9]\d*$/u)
  assert.match(commit, /^[a-f0-9]{40}$/u)
  assert.equal(String(run.id), runId)
  assert.equal(run.path, '.github/workflows/desktop-three-platform-release.yml')
  assert.equal(run.head_repository.full_name, repository)
  assert.equal(run.head_branch, 'main')
  assert.equal(run.head_sha, commit, 'Preflight must match the existing release tag')
  assert.equal(run.event, 'workflow_dispatch')
  assert.equal(run.status, 'completed')
  assert.equal(run.conclusion, 'success')
  const attempt = run.run_attempt
  assert.ok(Number.isSafeInteger(attempt) && attempt > 0)
  for (const name of [...platforms, 'verify-artifacts']) {
    const matches = jobs.filter(job => job.name === name)
    assert.equal(matches.length, 1, `${name}: expected one preflight job`)
    const [job] = matches
    assert.equal(job.status, 'completed')
    assert.equal(job.conclusion, 'success', `${name}: preflight job must succeed`)
    assert.equal(job.run_id, run.id)
    assert.equal(job.run_attempt, attempt)
    assert.equal(job.head_sha, commit)
  }
  return { commit, attempt }
}

async function verifyReceiptBytes(directory, filename, receipt) {
  const bytes = await readFile(join(directory, filename))
  assert.equal(bytes.length, receipt.size, `${filename}: preflight size mismatch`)
  assert.equal(sha256(bytes), receipt.sha256, `${filename}: preflight checksum mismatch`)
  return bytes
}

export async function prepareVerifiedReleaseAssets({ nativeDirectory, qaDirectory, version, commit, runId, attempt }) {
  const receipt = await readJson(join(qaDirectory, 'preflight-receipt.json'))
  assert.equal(receipt.schemaVersion, 1)
  assert.equal(receipt.kind, 'desktop-three-platform-preflight')
  assert.equal(receipt.status, 'passed')
  assert.equal(receipt.version, version)
  assert.equal(receipt.sourceCommit, commit)
  assert.equal(receipt.runId, runId)
  assert.equal(receipt.runAttempt, String(attempt))
  assert.equal(receipt.eventName, 'workflow_dispatch')
  assert.equal(receipt.ref, 'refs/heads/main')
  assert.equal(receipt.publish, false)
  for (const platform of platforms) assert.equal(receipt.nativeJobs[platform], 'success')

  const setup = `DeepSeek-Harness-Desktop-Setup-${version}-x64.exe`
  const prefix = `DeepSeek-Harness-Desktop-${version}`
  const installers = [setup, `${prefix}-arm64.dmg`, `${prefix}-arm64.zip`, `${prefix}-amd64.deb`]
  const distributionReceipts = ['distribution-artifacts-macos-arm64.json', 'distribution-artifacts-linux-x64.json']
  const [windowsChecksumFile, macosChecksumFile, linuxChecksumFile] = ['SHA256SUMS-windows.txt', 'SHA256SUMS-macos.txt', 'SHA256SUMS-linux.txt']
  assert.deepEqual(receipt.files.map(entry => entry.file), installers)
  assert.deepEqual(receipt.nativeReceipts.map(entry => entry.file), [windowsChecksumFile, macosChecksumFile, linuxChecksumFile])
  assert.equal(receipt.combinedChecksums.file, combinedChecksumFile)
  assert.equal(receipt.releaseManifest.file, manifestFile)

  const entries = await readdir(nativeDirectory, { withFileTypes: true })
  assert.ok(entries.every(entry => entry.isFile()), 'Native artifacts must be regular files')
  assert.deepEqual(entries.map(entry => entry.name).sort(), [
    ...installers, `${setup}.blockmap`, 'latest.yml', manifestFile, combinedChecksumFile, macosChecksumFile, linuxChecksumFile,
    ...distributionReceipts,
  ].sort(), 'Native artifacts must match the release asset set')
  for (const entry of receipt.files) assert.equal((await stat(join(nativeDirectory, entry.file))).size, entry.size)
  await verifyReceiptBytes(nativeDirectory, combinedChecksumFile, receipt.nativeReceipts[0])
  await verifyReceiptBytes(nativeDirectory, macosChecksumFile, receipt.nativeReceipts[1])
  await verifyReceiptBytes(nativeDirectory, linuxChecksumFile, receipt.nativeReceipts[2])
  const combinedChecksums = await verifyReceiptBytes(qaDirectory, combinedChecksumFile, receipt.combinedChecksums)
  assert.equal(combinedChecksums.toString('utf8'), receipt.files.map(({ file, sha256: hash }) => `${hash}  ${file}\n`).join(''))

  for (const [index, filename] of distributionReceipts.entries()) {
    const distribution = await readJson(join(nativeDirectory, filename))
    assert.equal(distribution.sourceCommit, commit)
    assert.equal(distribution.version, version)
    assert.deepEqual(distribution.files.map(({ file, size, sha256: hash }) => ({ file, size, sha256: hash })),
      index === 0 ? receipt.files.slice(1, 3) : receipt.files.slice(3))
  }

  await copyFile(join(nativeDirectory, combinedChecksumFile), join(nativeDirectory, windowsChecksumFile))
  await copyFile(join(qaDirectory, combinedChecksumFile), join(nativeDirectory, combinedChecksumFile))
  await finalizeThreePlatformReceipts(nativeDirectory, version)
  await verifyReceiptBytes(nativeDirectory, manifestFile, receipt.releaseManifest)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [mode, first, second] = process.argv.slice(2)
  const { GITHUB_REPOSITORY: repository, GITHUB_OUTPUT: output, PREFLIGHT_RUN_ID: runId,
    PREFLIGHT_ATTEMPT: attempt, RELEASE_COMMIT: commit, RELEASE_VERSION: version } = process.env
  if (mode === 'source') {
    const run = await readJson(first)
    const { jobs } = await readJson(second)
    const source = validatePromotionSource({ run, jobs, repository, commit, runId, version })
    await appendFile(output, `commit=${source.commit}\nattempt=${source.attempt}\n`, 'utf8')
    console.log(`Selected successful preflight ${runId} attempt ${source.attempt} for ${source.commit}`)
  } else {
    assert.equal(mode, 'assets')
    await prepareVerifiedReleaseAssets({ nativeDirectory: first, qaDirectory: second, version, commit, runId, attempt })
    console.log(`Verified the complete release asset set against preflight ${runId} attempt ${attempt}`)
  }
}
