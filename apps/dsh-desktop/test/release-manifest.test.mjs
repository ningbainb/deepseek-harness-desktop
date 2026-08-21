import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  assertSigningConfiguration,
  collectWindowsExecutablePaths,
  createReleaseManifest,
  defaultReleaseMetadata,
  releaseSigningConfiguration,
  verifyReleaseManifest,
  verifyWindowsExecutableSignatures,
  verifyWindowsSignature,
} from '../src/release-manifest.mjs'

const metadata = {
  version: '3.0.0',
  channel: 'stable',
  runtime: { version: '0.1.0-rc.7', integrity: 'sha512-runtime' },
  provider: 'dsh-cli-provider-v1',
  desktopApi: '1.2.0',
  presetSchema: 'dshpreset-v1',
  taskSchema: 3,
  matrixArtifact: 'apps/dsh-desktop/runtime-support/supported-runtimes.json',
}

function updaterSha512(content) {
  return createHash('sha512').update(content).digest('base64')
}

async function writeReleaseFiles(directory, {
  version = '3.0.0',
  updateMetadataFile = 'latest.yml',
  installerContent = 'installer bytes',
} = {}) {
  const installer = `DeepSeek-Harness-Desktop-Setup-${version}-x64.exe`
  await writeFile(join(directory, installer), installerContent)
  await writeFile(join(directory, `${installer}.blockmap`), 'blockmap bytes')
  await writeFile(join(directory, updateMetadataFile), [
    `version: ${version}`,
    `path: ${installer}`,
    `sha512: ${updaterSha512(installerContent)}`,
    '',
  ].join('\n'))
  return installer
}

const validSignature = async () => ({
  status: 'valid',
  signer: 'CN=DeepSeek Harness Desktop Test',
  timestamp: 'CN=Test Timestamp Authority',
})

test('release manifest hashes every publishable artifact and retains release compatibility evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-manifest-'))
  try {
    const installer = await writeReleaseFiles(directory)
    const manifest = await createReleaseManifest({ directory, metadata, signatureVerifier: validSignature })
    await writeFile(
      join(directory, 'SHA256SUMS.txt'),
      `${manifest.files.find((entry) => entry.file === installer).sha256}  ${installer}\n`,
    )
    const finalManifest = await createReleaseManifest({ directory, metadata, signatureVerifier: validSignature })

    assert.equal(finalManifest.schemaVersion, 1)
    assert.equal(finalManifest.version, '3.0.0')
    assert.equal(finalManifest.channel, 'stable')
    assert.equal(finalManifest.runtime.version, '0.1.0-rc.7')
    assert.equal(finalManifest.provider, 'dsh-cli-provider-v1')
    assert.equal(finalManifest.files.length, 4)
    assert.deepEqual(finalManifest.files.find((entry) => entry.file === installer).signature, {
      status: 'valid',
      signer: 'CN=DeepSeek Harness Desktop Test',
      timestamp: 'CN=Test Timestamp Authority',
    })

    await verifyReleaseManifest({
      directory,
      manifest: finalManifest,
      requireSigning: true,
      signatureVerifier: validSignature,
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('release manifest verification rejects a changed artifact and a required unsigned build', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-manifest-tamper-'))
  try {
    const installer = await writeReleaseFiles(directory)
    const manifest = await createReleaseManifest({ directory, metadata, signatureVerifier: validSignature })
    await writeFile(join(directory, 'SHA256SUMS.txt'), `${manifest.files.find((entry) => entry.file === installer).sha256}  ${installer}\n`)
    const finalManifest = await createReleaseManifest({ directory, metadata, signatureVerifier: validSignature })
    await writeFile(join(directory, installer), 'xnstaller bytes')
    await assert.rejects(
      verifyReleaseManifest({ directory, manifest: finalManifest, signatureVerifier: validSignature }),
      /sha256 mismatch/u,
    )
    await writeFile(join(directory, installer), 'installer bytes')
    await assert.rejects(
      verifyReleaseManifest({
        directory,
        manifest: finalManifest,
        requireSigning: true,
        signatureVerifier: async () => ({ status: 'unsigned' }),
      }),
      /signature verification failed/u,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('release manifest verification rejects a stale but syntactically valid updater SHA-512', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-manifest-updater-tamper-'))
  try {
    const installer = await writeReleaseFiles(directory)
    const initialManifest = await createReleaseManifest({ directory, metadata, signatureVerifier: validSignature })
    await writeFile(join(directory, 'SHA256SUMS.txt'), `${initialManifest.files.find((entry) => entry.file === installer).sha256}  ${installer}\n`)
    await writeFile(join(directory, 'latest.yml'), [
      'version: 3.0.0',
      `path: ${installer}`,
      `sha512: ${updaterSha512('other installer bytes')}`,
      '',
    ].join('\n'))
    const manifest = await createReleaseManifest({ directory, metadata, signatureVerifier: validSignature })

    await assert.rejects(
      verifyReleaseManifest({ directory, manifest, signatureVerifier: validSignature }),
      /sha512 does not match/u,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('beta release manifests require beta updater metadata rather than stable metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-manifest-beta-'))
  try {
    const betaMetadata = { ...metadata, version: '3.1.0-beta.1', channel: 'beta' }
    const installer = await writeReleaseFiles(directory, {
      version: betaMetadata.version,
      updateMetadataFile: 'beta.yml',
    })
    const initialManifest = await createReleaseManifest({ directory, metadata: betaMetadata, signatureVerifier: validSignature })
    await writeFile(join(directory, 'SHA256SUMS.txt'), `${initialManifest.files.find((entry) => entry.file === installer).sha256}  ${installer}\n`)
    const manifest = await createReleaseManifest({ directory, metadata: betaMetadata, signatureVerifier: validSignature })

    assert.ok(manifest.files.some((entry) => entry.file === 'beta.yml'))
    assert.ok(!manifest.files.some((entry) => entry.file === 'latest.yml'))
    await verifyReleaseManifest({ directory, manifest, signatureVerifier: validSignature })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('signing configuration permits unsigned development but requires a certificate when requested', () => {
  assert.deepEqual(releaseSigningConfiguration({}), {
    required: false,
    configured: false,
    source: undefined,
  })
  assert.doesNotThrow(() => assertSigningConfiguration({}))
  assert.deepEqual(releaseSigningConfiguration({ REQUIRE_SIGNING: 'true', CSC_LINK: 'base64-certificate' }), {
    required: true,
    configured: true,
    source: 'CSC_LINK',
  })
  assert.throws(
    () => assertSigningConfiguration({ REQUIRE_SIGNING: 'true' }),
    /REQUIRE_SIGNING=true/u,
  )
})

test('official Desktop tag releases always require signed timestamped Windows executables', async () => {
  const workflow = await readFile(
    join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'desktop-release.yml'),
    'utf8',
  )
  assert.equal((workflow.match(/REQUIRE_SIGNING: 'true'/gu) ?? []).length, 4)
  assert.doesNotMatch(workflow, /REQUIRE_SIGNING: \$\{\{/u)
  for (const releaseGate of [
    'test:directory-picker:e2e',
    'test:terminal:e2e',
    'test:window-chrome:e2e',
    'test:profile-reset:e2e',
    'test:update-shutdown:e2e',
    'test:migration-matrix:e2e',
  ]) {
    assert.equal(workflow.includes(releaseGate), true, `release workflow is missing ${releaseGate}`)
  }
})

test('default release metadata uses the packaged runtime support matrix reference', async () => {
  const resolved = await defaultReleaseMetadata({ channel: 'beta' })

  assert.equal(resolved.channel, 'beta')
  assert.equal(resolved.matrixArtifact, 'runtime-support/supported-runtimes.json')
  assert.match(resolved.runtime.integrity, /^sha512-/u)
  assert.equal(resolved.provider, 'dsh-cli-provider-v1')
})

test('Windows signature verification is injectable and requires signer plus timestamp for signed artifacts', async () => {
  const verified = await verifyWindowsSignature('C:\\release\\desktop.exe', {
    runPowerShell: async () => JSON.stringify({
      status: 'Valid',
      signer: 'CN=DeepSeek Harness Desktop',
      timestamp: 'CN=Timestamp Authority',
    }),
  })
  assert.deepEqual(verified, {
    status: 'valid',
    signer: 'CN=DeepSeek Harness Desktop',
    timestamp: 'CN=Timestamp Authority',
  })
  await assert.rejects(
    verifyWindowsSignature('C:\\release\\desktop.exe', {
      requireTimestamp: true,
      runPowerShell: async () => JSON.stringify({ status: 'Valid', signer: 'CN=Desktop' }),
    }),
    /timestamp/u,
  )
})

test('release signing verification includes the installer and unpacked Windows application executable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-release-signatures-'))
  try {
    const installer = await writeReleaseFiles(directory)
    await assert.rejects(
      verifyWindowsExecutableSignatures({ directory, requireSigning: true, signatureVerifier: validSignature }),
      /unpacked Windows application executable/u,
    )

    await mkdir(join(directory, 'win-unpacked'))
    await writeFile(join(directory, 'win-unpacked', 'DeepSeek Harness Desktop.exe'), 'desktop executable bytes')
    const executables = await collectWindowsExecutablePaths(directory)
    assert.deepEqual(executables.map((entry) => entry.file), [
      installer,
      'win-unpacked/DeepSeek Harness Desktop.exe',
    ])

    const calls = []
    const signatures = await verifyWindowsExecutableSignatures({
      directory,
      requireSigning: true,
      signatureVerifier: async (path) => {
        calls.push(path)
        return validSignature()
      },
    })
    assert.deepEqual(signatures.map((entry) => entry.file), [
      installer,
      'win-unpacked/DeepSeek Harness Desktop.exe',
    ])
    assert.equal(calls.length, 2)
    await assert.rejects(
      verifyWindowsExecutableSignatures({
        directory,
        requireSigning: true,
        signatureVerifier: async (path) => (
          path.includes('win-unpacked') ? { status: 'unsigned' } : validSignature()
        ),
      }),
      /valid timestamped signatures/u,
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
