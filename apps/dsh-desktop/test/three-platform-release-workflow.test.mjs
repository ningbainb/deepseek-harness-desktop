import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import YAML from 'yaml'

const workflowPath = join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'desktop-three-platform-release.yml')

test('three-platform release delegates the stable updater channel to the Windows packer once', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /^\s*- run: pnpm --filter @linxin666\/dsh-desktop pack:win\s*$/mu)
  assert.doesNotMatch(workflow, /pack:win[^\n]*--config\.publish\.channel/u)
  assert.match(workflow, /DSH_DESKTOP_UPDATE_CHANNEL: stable/u)
})

test('packaged Windows regression stops when any native validation command fails', async () => {
  const workflow = await readFile(workflowPath, 'utf8')
  const regression = workflow.slice(workflow.indexOf('- name: Run packaged Windows regression'), workflow.indexOf('- run: pnpm --filter @linxin666/dsh-desktop pack:verify'))

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
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /gh release download desktop-v4\.3\.0[^\n]*--pattern SHA256SUMS\.txt/u)
  assert.match(workflow, /node apps\/dsh-desktop\/scripts\/verify-release-installer\.mjs/u)
  assert.ok(workflow.indexOf('verify-release-installer.mjs') > workflow.indexOf('pack:win'))
})

test('failed Windows candidates retain diagnostics without entering the publication artifact set', async () => {
  const workflow = await readFile(workflowPath, 'utf8')
  const diagnostics = workflow.slice(workflow.indexOf('      - name: Preserve failed Windows candidate diagnostics'), workflow.indexOf('  macos:'))
  assert.match(diagnostics, /if: failure\(\)/u)
  assert.match(diagnostics, /include-hidden-files: true/u)
  assert.match(diagnostics, /name: desktop-debug-\$\{\{ needs\.metadata\.outputs\.version \}\}-windows-x64/u)
  assert.match(diagnostics, /\.tmp\/release-qa\/\*\*/u)
  assert.match(diagnostics, /DeepSeek-Harness-Desktop-Setup-\*\.exe/u)
  const publication = workflow.slice(workflow.lastIndexOf('  publish:'))
  assert.match(publication, /pattern: desktop-\$\{\{ needs\.metadata\.outputs\.version \}\}-\*/u)
  assert.doesNotMatch(publication, /desktop-debug/u)
})

test('Windows release also verifies the latest 5.1.0 stable upgrade without replacing older coverage', async () => {
  const workflow = await readFile(workflowPath, 'utf8')
  const setup = workflow.slice(workflow.indexOf('- name: Verify production Setup'), workflow.indexOf('- name: Run packaged Windows regression'))
  for (const version of ['4.3.0', '5.0.0', '5.0.1', '5.1.0']) {
    assert.ok(setup.includes(`$env:DSH_DESKTOP_PREVIOUS_RELEASE_VERSION = '${version}'`))
    assert.ok(setup.includes(`gh release download desktop-v${version} --repo ningbainb/deepseek-harness-desktop --pattern 'DeepSeek-Harness-Desktop-Setup-${version}-x64.exe' --pattern SHA256SUMS.txt`))
    assert.ok(setup.includes(`setup-from-${version}.json`))
  }
  assert.equal(setup.match(/node apps\/dsh-desktop\/scripts\/verify-release-installer\.mjs/gu)?.length, 4)
})

test('Windows acceptance receipts survive successful runs and remain separate from public assets', async () => {
  const workflow = await readFile(workflowPath, 'utf8')
  const start = workflow.indexOf('      - name: Preserve Windows acceptance evidence')
  assert.ok(start > 0)
  const evidence = workflow.slice(start, workflow.indexOf('      - name: Preserve failed Windows candidate diagnostics', start))
  assert.match(evidence, /if: always\(\)/u)
  assert.match(evidence, /name: desktop-qa-\$\{\{ needs\.metadata\.outputs\.version \}\}-windows-x64/u)
  assert.match(evidence, /include-hidden-files: true/u)
  assert.match(evidence, /\.tmp\/release-qa\/\*\*/u)
  const publication = workflow.slice(workflow.lastIndexOf('  publish:'))
  assert.match(publication, /pattern: desktop-\$\{\{ needs\.metadata\.outputs\.version \}\}-\*/u)
  assert.doesNotMatch(publication, /desktop-qa/u)
})

test('workflow metadata uses the functional classifier and source regression explicitly selects source-only suites', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const metadata = workflow.jobs.metadata.steps.find(step => step.id === 'meta')
  assert.equal(metadata.run.trim(), 'node scripts/desktop-release-metadata.mjs')
  const regression = workflow.jobs.windows.steps.find(step => step.run?.startsWith('pnpm desktop:regression:e2e'))
  assert.match(regression.run, /(?:^|\s)--source(?:\s|$)/u)
  assert.match(regression.run, /(?:^|\s)--collect-failures(?:\s|$)/u)
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

const artifactNames = [
  'DeepSeek-Harness-Desktop-Setup-5.2.0-x64.exe',
  'DeepSeek-Harness-Desktop-5.2.0-arm64.dmg',
  'DeepSeek-Harness-Desktop-5.2.0-arm64.zip',
  'DeepSeek-Harness-Desktop-5.2.0-x86_64.AppImage',
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

test('dispatch verifies all five native assets and binds their QA receipt to the exact run without publishing', async context => {
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
