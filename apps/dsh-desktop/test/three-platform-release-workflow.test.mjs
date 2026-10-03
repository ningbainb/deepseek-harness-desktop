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
  const publication = workflow.slice(workflow.indexOf('  publish:'))
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
