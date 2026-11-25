import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import YAML from 'yaml'

const workflowPath = join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'desktop-three-platform-release.yml')

test('Windows CI prepares confined native storage in its own step before verification', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const steps = workflow.jobs['windows-build'].steps
  const prepare = steps.findIndex(step => step.run?.trim() === 'node apps/dsh-desktop/scripts/prepare-native-fixture-storage.mjs')
  const verify = steps.findIndex(step => step.run?.trim() === 'pnpm verify')
  assert.ok(prepare >= 0 && prepare < verify, 'GITHUB_ENV must be prepared in a preceding step')
  assert.equal(steps[prepare].shell, 'pwsh')
  for (const jobName of ['windows-setup-upgrade', 'windows-e2e']) {
    const jobSteps = workflow.jobs[jobName].steps
    const jobPrepare = jobSteps.findIndex(step => step.run?.trim() === 'node apps/dsh-desktop/scripts/prepare-native-fixture-storage.mjs')
    assert.ok(jobPrepare >= 0, `${jobName} must prepare confined native storage before running Windows binaries`)
    assert.equal(jobSteps[jobPrepare].shell, 'pwsh')
  }
})

test('native installer cancellation runs after confined storage and before complete verification', async () => {
  const steps = YAML.parse(await readFile(workflowPath, 'utf8')).jobs['windows-build'].steps
  const prepare = steps.findIndex(step => step.run?.trim() === 'node apps/dsh-desktop/scripts/prepare-native-fixture-storage.mjs')
  const installer = steps.findIndex(step => step.run?.trim() === 'node --test apps/dsh-desktop/test/installer-hardening-native.test.mjs')
  const verify = steps.findIndex(step => step.run?.trim() === 'pnpm verify')
  assert.ok(prepare >= 0 && installer > prepare && verify > installer)
})

test('native QA uploads only result directories and preserves existing acceptance evidence', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const step = workflow.jobs['windows-e2e'].steps.find(step => step.with?.name === 'desktop-native-qa-${{ needs.metadata.outputs.version }}-windows-x64-shard-${{ matrix.shard }}')
  assert.ok(step, 'native source and companion evidence needs its own artifact')
  assert.equal(step.if, 'always()')
  assert.equal(step.with['include-hidden-files'], true)
  assert.deepEqual(step.with.path.trim().split(/\r?\n/u), [
    '${{ runner.temp }}/dsh-native-fixtures/dsh-release-plugins-results/**',
    '${{ runner.temp }}/dsh-native-fixtures/dsh-sidebar-footer-results/**',
    '${{ runner.temp }}/dsh-native-fixtures/dsh-pet-clearance-results-*/**',
    '${{ runner.temp }}/dsh-native-fixtures/dsh-packaged-release-browser-results/**',
    '${{ runner.temp }}/dsh-native-fixtures/dsh-dafeiyu-clearance-results-*/**',
  ])
  assert.ok(workflow.jobs['windows-e2e'].steps.some(step => step.with?.name === 'desktop-qa-${{ needs.metadata.outputs.version }}-windows-x64-shard-${{ matrix.shard }}'))
})

test('all Windows-only geometry fixtures use the shared storage boundary before writing output', async () => {
  for (const [name, outputCall] of [
    ['verify-release-plugins.mjs', 'await mkdir(output'],
    ['verify-sidebar-footer.mjs', 'await mkdir(output'],
    ['pet-composer-clearance-fixture.mjs', 'await mkdtemp'],
  ]) {
    const source = await readFile(join(import.meta.dirname, '..', 'scripts', name), 'utf8')
    assert.match(source, /import \{ assertNativeFixtureStorage \} from '\.\/native-fixture-storage\.mjs'/u)
    assert.ok(source.indexOf('await assertNativeFixtureStorage(') < source.indexOf(outputCall), `${name} must validate storage before making output`)
    assert.doesNotMatch(source, /assert\.equal\(resolve\(tmpdir\(\)\)\.slice|assert\.match\(tmpdir\(\),/u)
  }
})

test('three-platform release delegates the stable updater channel to the Windows packer once', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /^\s*- run: pnpm --filter @linxin666\/dsh-desktop pack:win\s*$/mu)
  assert.doesNotMatch(workflow, /pack:win[^\n]*--config\.publish\.channel/u)
  assert.match(workflow, /DSH_DESKTOP_UPDATE_CHANNEL: stable/u)
})

test('packaged Windows regression stops when any native validation command fails', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const regression = workflow.jobs['windows-e2e'].steps.find(step => step.name === 'Run packaged Windows regression')?.run ?? ''

  assert.match(regression, /\$ErrorActionPreference = 'Stop'/u)
  assert.match(regression, /\$PSNativeCommandUseErrorActionPreference = \$true/u)
  assert.match(regression, /test:regression:e2e:full/u)
})

test('publication verifies each native checksum receipt before generating the combined receipt', async () => {
  const workflow = await readFile(workflowPath, 'utf8')
  const publication = workflow.slice(workflow.lastIndexOf('  publish:'))
  const combined = publication.indexOf(' > SHA256SUMS.txt')

  assert.ok(combined > 0)
  for (const receipt of ['SHA256SUMS.txt', 'SHA256SUMS-macos.txt', 'SHA256SUMS-linux.txt']) {
    const verification = publication.indexOf(`sha256sum -c ${receipt}`)
    assert.ok(verification >= 0 && verification < combined, `${receipt} must be verified before rewriting checksums`)
  }
  assert.match(publication, /needs: \[metadata, windows, macos, linux, verify-artifacts\]/u)
  assert.match(publication, /overwrite_files: false/u)
  assert.match(publication, /cp SHA256SUMS\.txt SHA256SUMS-windows\.txt/u)
  assert.ok(publication.indexOf('finalize-three-platform-receipts.mjs') > combined)
})

test('Windows release runs physical Setup acceptance and a checksum-pinned previous stable upgrade', async () => {
  const parsed = YAML.parse(await readFile(workflowPath, 'utf8'))
  const setupJob = parsed.jobs['windows-setup-upgrade']
  assert.ok(setupJob.needs.includes('windows-build'), 'windows-setup-upgrade must run after windows-build')
  assert.ok(parsed.jobs['windows-build'].steps.some(step => step.run?.includes('pack:win')))
  const setupRun = setupJob.steps.find(step => step.name === 'Verify production Setup on the disposable Windows Runner')?.run ?? ''
  assert.match(setupRun, /gh release download desktop-v5\.3\.5[^\n]*--pattern SHA256SUMS\.txt/u)
  assert.match(setupRun, /node apps\/dsh-desktop\/scripts\/verify-release-installer\.mjs/u)
})

test('failed Windows candidates retain diagnostics without entering the publication artifact set', async () => {
  const workflow = await readFile(workflowPath, 'utf8')
  const diagnostics = workflow.slice(workflow.indexOf('      - name: Preserve failed Windows candidate diagnostics'), workflow.indexOf('  windows-setup-upgrade:'))
  assert.match(diagnostics, /if: failure\(\)/u)
  assert.match(diagnostics, /include-hidden-files: true/u)
  assert.match(diagnostics, /name: desktop-debug-\$\{\{ needs\.metadata\.outputs\.version \}\}-windows-x64/u)
  assert.match(diagnostics, /\.tmp\/release-qa\/\*\*/u)
  assert.match(diagnostics, /DeepSeek-Harness-Desktop-Setup-\*\.exe/u)
  const publication = workflow.slice(workflow.lastIndexOf('  publish:'))
  assert.match(publication, /pattern: desktop-\$\{\{ needs\.metadata\.outputs\.version \}\}-\*/u)
  assert.doesNotMatch(publication, /desktop-debug/u)
})

test('Windows release tests one clean install and upgrade from the latest previous stable installer', async () => {
  const workflow = await readFile(workflowPath, 'utf8')
  const setup = workflow.slice(workflow.indexOf('- name: Verify production Setup on the disposable Windows Runner'), workflow.indexOf('- name: Preserve Windows setup acceptance evidence'))
  assert.ok(setup.includes(`$env:DSH_DESKTOP_PREVIOUS_RELEASE_VERSION = '5.3.5'`))
  assert.ok(setup.includes(`gh release download desktop-v5.3.5 --repo ningbainb/deepseek-harness-desktop --pattern 'DeepSeek-Harness-Desktop-Setup-5.3.5-x64.exe' --pattern SHA256SUMS.txt`))
  assert.ok(setup.includes('setup-from-5.3.5.json'))
  assert.equal(setup.match(/^ +node apps\/dsh-desktop\/scripts\/verify-release-installer\.mjs\s*$/gmu)?.length, 1)
})

test('Windows acceptance receipts survive successful runs and remain separate from public assets', async () => {
  const workflow = await readFile(workflowPath, 'utf8')
  const start = workflow.indexOf('      - name: Preserve Windows acceptance evidence')
  assert.ok(start > 0)
  const evidence = workflow.slice(start, workflow.indexOf('      - name: Preserve native source and companion evidence', start))
  assert.match(evidence, /if: always\(\)/u)
  assert.match(evidence, /name: desktop-qa-\$\{\{ needs\.metadata\.outputs\.version \}\}-windows-x64-shard-\$\{\{ matrix\.shard \}\}/u)
  assert.match(evidence, /include-hidden-files: true/u)
  assert.match(evidence, /\.tmp\/release-qa\/\*\*/u)
  const publication = workflow.slice(workflow.lastIndexOf('  publish:'))
  assert.match(publication, /pattern: desktop-\$\{\{ needs\.metadata\.outputs\.version \}\}-\*/u)
  assert.doesNotMatch(publication, /desktop-qa/u)
})

test('workflow metadata uses the functional classifier and Windows regression fans out across 4 packaged shards', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const metadata = workflow.jobs.metadata.steps.find(step => step.id === 'meta')
  assert.equal(metadata.run.trim(), 'node scripts/desktop-release-metadata.mjs')
  assert.equal(workflow.jobs['windows-build'].steps.some(step => step.run?.startsWith('pnpm desktop:regression:e2e')), false)
  const candidate = workflow.jobs['windows-build'].steps.find(step => step.name === 'Upload built Windows candidate for parallel verification')
  assert.equal(candidate.with['include-hidden-files'], true, 'unpacked Runtime dependencies include dotfiles')
  assert.deepEqual(workflow.jobs['windows-e2e'].strategy.matrix.shard, [1, 2, 3, 4])
  const regression = workflow.jobs['windows-e2e'].steps.find(step => step.name === 'Run packaged Windows regression')
  assert.match(regression?.run ?? '', /test:regression:e2e:full\s+--shard=\$\{\{ matrix\.shard \}\}\/4\s+--retry-flaky=1\s+--collect-failures/u)
  assert.deepEqual(workflow.jobs.windows.needs, ['metadata', 'windows-build', 'windows-setup-upgrade', 'windows-e2e'])
})

test('native artifact verification runs on dispatch and publication depends on its success', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const verification = workflow.jobs['verify-artifacts']
  assert.ok(verification, 'nonpublishing candidates must also verify the complete native artifact set')
  assert.deepEqual(verification.needs, ['metadata', 'windows', 'macos', 'linux'])
  assert.equal(verification.if, undefined, 'artifact verification must not depend on publish=true')
  assert.equal(verification.permissions.contents, 'read')
  assert.equal(workflow.permissions.contents, 'read')
  const download = verification.steps.find(step => step.uses === 'actions/download-artifact@v4')
  assert.equal(download.with.pattern, 'desktop-${{ needs.metadata.outputs.version }}-*')
  assert.equal(download.with['merge-multiple'], true)
  const upload = verification.steps.find(step => step.uses === 'actions/upload-artifact@v4')
  assert.equal(upload.with.name, 'desktop-qa-${{ needs.metadata.outputs.version }}-three-platform')
  assert.equal(upload.with['if-no-files-found'], 'error')
  for (const file of ['preflight-receipt.json', 'SHA256SUMS-windows.txt', 'SHA256SUMS-macos.txt', 'SHA256SUMS-linux.txt', 'SHA256SUMS.txt', 'release-manifest.json']) {
    assert.ok(upload.with.path.split('\n').includes(`preflight-assets/${file}`), `${file} must survive as QA evidence`)
  }
  const publication = workflow.jobs.publish
  assert.deepEqual(publication.needs, ['metadata', 'windows', 'macos', 'linux', 'verify-artifacts'])
  assert.match(publication.if, /github\.event_name == 'push'/u)
  assert.match(publication.if, /needs\.metadata\.outputs\.publish == 'true'/u)
  assert.match(publication.if, /needs\.verify-artifacts\.result == 'success'/u)
  assert.equal(publication.permissions.contents, 'write')
})

test('verified promotion downloads the exact preflight assets and publishes the tagged notes after verification', async () => {
  const { jobs, on } = YAML.parse(await readFile(workflowPath, 'utf8'))
  assert.equal(on.workflow_dispatch.inputs.verified_run.type, 'string')
  for (const platform of ['windows', 'macos', 'linux']) {
    assert.equal(jobs[platform].if, "github.event_name != 'workflow_dispatch' || inputs.verified_run == ''")
  }
  const promotion = jobs['promote-verified']
  assert.match(promotion.if, /github\.ref == 'refs\/heads\/main' && inputs\.verified_run != ''/u)
  const selection = promotion.steps.findIndex(step => step.id === 'preflight')
  const downloads = promotion.steps.filter(step => step.uses === 'actions/download-artifact@v4')
  assert.equal(downloads.length, 2)
  assert.ok(downloads.every(step => promotion.steps.indexOf(step) > selection && step.with['run-id'] === '${{ inputs.verified_run }}'))
  const verification = promotion.steps.findIndex(step => step.run?.includes('validate-three-platform-promotion.mjs assets'))
  const publication = promotion.steps.find(step => step.uses === 'softprops/action-gh-release@v2')
  assert.ok(verification > promotion.steps.indexOf(downloads[1]) && verification < promotion.steps.indexOf(publication))
  assert.equal(publication.with.body_path, 'verified-release-source/docs/launch/release-notes.md')
  assert.equal(publication.with.overwrite_files, false)
})

const artifactNames = [
  'DeepSeek-Harness-Desktop-Setup-5.2.0-x64.exe',
  'DeepSeek-Harness-Desktop-5.2.0-arm64.dmg',
  'DeepSeek-Harness-Desktop-5.2.0-arm64.zip',
  'DeepSeek-Harness-Desktop-5.2.0-amd64.deb',
]
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function preflightFixture(context) {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const verification = workflow.jobs['verify-artifacts']
  assert.ok(verification, 'dispatch must execute real native artifact verification')
  const step = verification.steps.find(step => step.name === 'Verify native artifacts and write QA receipt')
  assert.ok(step, 'native artifact verification must emit its own QA receipt')
  const source = /^node --input-type=module <<'NODE'\n([\s\S]+)\nNODE\s*$/u.exec(step.run)
  assert.ok(source, 'the artifact verifier must be executable as a pure Node program')
  const root = await mkdtemp(join(tmpdir(), 'workflow-native-artifacts-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const directory = join(root, 'preflight-assets')
  await mkdir(directory)
  await mkdir(join(root, 'scripts'))
  await copyFile(join(import.meta.dirname, '..', '..', '..', 'scripts', 'finalize-three-platform-receipts.mjs'), join(root, 'scripts', 'finalize-three-platform-receipts.mjs'))
  const files = artifactNames.map((file, index) => ({ file, bytes: Buffer.from(`synthetic installation asset ${index}\n`) }))
  for (const { file, bytes } of files) await writeFile(join(directory, file), bytes)
  const sums = rows => rows.map(({ file, bytes }) => `${digest(bytes)}  ${file}\n`).join('')
  const receipts = {
    'SHA256SUMS.txt': sums(files.slice(0, 1)),
    'SHA256SUMS-macos.txt': sums(files.slice(1, 3)),
    'SHA256SUMS-linux.txt': sums(files.slice(3, 5)),
  }
  for (const [file, content] of Object.entries(receipts)) await writeFile(join(directory, file), content)
  const manifest = { schemaVersion: 1, version: '5.2.0', channel: 'stable', files: [
    { file: files[0].file, size: files[0].bytes.length, sha256: digest(files[0].bytes), signature: { status: 'unsigned' } },
    { file: 'SHA256SUMS.txt', size: Buffer.byteLength(receipts['SHA256SUMS.txt']), sha256: digest(receipts['SHA256SUMS.txt']), signature: { status: 'not-applicable' } },
  ] }
  await writeFile(join(directory, 'release-manifest.json'), JSON.stringify(manifest))
  const env = {
    ...process.env,
    DSH_DESKTOP_VERSION: '5.2.0', DSH_DESKTOP_PUBLISH: 'false',
    DSH_DESKTOP_NATIVE_RESULTS: JSON.stringify({ windows: { result: 'success' }, macos: { result: 'success' }, linux: { result: 'success' } }),
    GITHUB_SHA: '1234567890123456789012345678901234567890', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/tags/desktop-v5.2.0', GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2',
  }
  return { directory, files, receipts, manifest, env,
    run: () => spawnSync(process.execPath, ['--input-type=module', '--eval', source[1]], { cwd: directory, env, encoding: 'utf8', windowsHide: true }),
  }
}

test('dispatch verifies three user installers and the internal macOS updater ZIP at the exact run without publishing', async context => {
  const state = await preflightFixture(context)
  const result = state.run()
  assert.equal(result.status, 0, result.stderr)
  const receipt = JSON.parse(await readFile(join(state.directory, 'preflight-receipt.json'), 'utf8'))
  assert.equal(receipt.status, 'passed')
  assert.equal(receipt.version, '5.2.0')
  assert.equal(receipt.publish, false)
  assert.equal(receipt.eventName, 'workflow_dispatch')
  assert.equal(receipt.ref, 'refs/tags/desktop-v5.2.0')
  assert.equal(receipt.sourceCommit, state.env.GITHUB_SHA)
  assert.equal(receipt.runId, '12345')
  assert.equal(receipt.runAttempt, '2')
  assert.deepEqual(receipt.nativeJobs, { windows: 'success', macos: 'success', linux: 'success' })
  assert.deepEqual(receipt.files, state.files.map(({ file, bytes }) => ({ file, size: bytes.length, sha256: digest(bytes) })))
  assert.deepEqual(receipt.userInstallers, [artifactNames[0], artifactNames[1], artifactNames[3]])
  assert.deepEqual(receipt.internalUpdaterFiles, [artifactNames[2]])
  assert.deepEqual(receipt.nativeReceipts.map(row => row.file), ['SHA256SUMS-windows.txt', 'SHA256SUMS-macos.txt', 'SHA256SUMS-linux.txt'])
  assert.equal(await readFile(join(state.directory, 'SHA256SUMS-windows.txt'), 'utf8'), state.receipts['SHA256SUMS.txt'])
  for (const file of ['SHA256SUMS-macos.txt', 'SHA256SUMS-linux.txt']) {
    assert.equal(await readFile(join(state.directory, file), 'utf8'), state.receipts[file])
  }
  const combined = await readFile(join(state.directory, 'SHA256SUMS.txt'))
  const manifest = JSON.parse(await readFile(join(state.directory, 'release-manifest.json'), 'utf8'))
  assert.deepEqual(manifest.files[0], state.manifest.files[0], 'preflight must preserve Windows installer evidence')
  assert.equal(manifest.files[1].sha256, digest(combined))
  assert.equal(manifest.files[1].size, combined.length)
  assert.equal(receipt.combinedChecksums.sha256, digest(combined))
  assert.equal(receipt.releaseManifest.sha256, digest(await readFile(join(state.directory, 'release-manifest.json'))))
})

for (const file of artifactNames) {
  for (const mutation of ['missing', 'tampered']) {
    test(`preflight refuses a ${mutation} native installation asset: ${file}`, async context => {
      const state = await preflightFixture(context)
      if (mutation === 'missing') await rm(join(state.directory, file))
      else await writeFile(join(state.directory, file), 'tampered native asset')
      const result = state.run()
      assert.notEqual(result.status, 0, result.stdout)
      assert.match(result.stderr, /checksum|missing|ENOENT/iu)
      await assert.rejects(readFile(join(state.directory, 'preflight-receipt.json')), { code: 'ENOENT' })
    })
  }
}

for (const receiptFile of ['SHA256SUMS.txt', 'SHA256SUMS-macos.txt', 'SHA256SUMS-linux.txt']) {
  test(`preflight refuses an altered original native receipt: ${receiptFile}`, async context => {
    const state = await preflightFixture(context)
    await writeFile(join(state.directory, receiptFile), state.receipts[receiptFile].replace(/^[a-f0-9]{64}/u, '0'.repeat(64)))
    const result = state.run()
    assert.notEqual(result.status, 0, result.stdout)
    assert.match(result.stderr, /checksum/iu)
    await assert.rejects(readFile(join(state.directory, 'preflight-receipt.json')), { code: 'ENOENT' })
  })
}

for (const mutation of ['duplicate-checksum', 'unexpected-checksum', 'wrong-manifest-version', 'tampered-manifest', 'failed-native-job']) {
  test(`preflight refuses ${mutation} instead of writing a successful QA receipt`, async context => {
    const state = await preflightFixture(context)
    if (mutation === 'duplicate-checksum') await writeFile(join(state.directory, 'SHA256SUMS.txt'), state.receipts['SHA256SUMS.txt'].repeat(2))
    if (mutation === 'unexpected-checksum') await writeFile(join(state.directory, 'SHA256SUMS.txt'), `${digest(state.files[0].bytes)}  unexpected.exe\n`)
    if (mutation === 'wrong-manifest-version') {
      state.manifest.version = '5.1.0'
      await writeFile(join(state.directory, 'release-manifest.json'), JSON.stringify(state.manifest))
    }
    if (mutation === 'tampered-manifest') {
      state.manifest.files[0].sha256 = '0'.repeat(64)
      await writeFile(join(state.directory, 'release-manifest.json'), JSON.stringify(state.manifest))
    }
    if (mutation === 'failed-native-job') state.env.DSH_DESKTOP_NATIVE_RESULTS = JSON.stringify({ windows: { result: 'success' }, macos: { result: 'failure' }, linux: { result: 'success' } })
    const result = state.run()
    assert.notEqual(result.status, 0, result.stdout)
    assert.match(result.stderr, /checksum|version|native|success|5\.1\.0/iu)
    await assert.rejects(readFile(join(state.directory, 'preflight-receipt.json')), { code: 'ENOENT' })
  })
}
