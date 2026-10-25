import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

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
  assert.match(publication, /needs: \[metadata, windows, macos, linux\]/u)
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

test('Windows release also verifies the latest 5.0.1 stable upgrade without replacing older coverage', async () => {
  const workflow = await readFile(workflowPath, 'utf8')
  const setup = workflow.slice(workflow.indexOf('- name: Verify production Setup'), workflow.indexOf('- name: Run packaged Windows regression'))
  for (const version of ['4.3.0', '5.0.0', '5.0.1']) {
    assert.ok(setup.includes(`$env:DSH_DESKTOP_PREVIOUS_RELEASE_VERSION = '${version}'`))
    assert.ok(setup.includes(`gh release download desktop-v${version} --repo ningbainb/deepseek-harness-desktop --pattern 'DeepSeek-Harness-Desktop-Setup-${version}-x64.exe' --pattern SHA256SUMS.txt`))
    assert.ok(setup.includes(`setup-from-${version}.json`))
  }
  assert.equal(setup.match(/node apps\/dsh-desktop\/scripts\/verify-release-installer\.mjs/gu)?.length, 3)
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
