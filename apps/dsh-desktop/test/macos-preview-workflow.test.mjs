import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const workflowPath = join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'macos-preview.yml')

test('macOS preview workflow builds and smokes an isolated unsigned arm64 package', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /workflow_dispatch:/u)
  assert.match(workflow, /runs-on: macos-15/u)
  assert.match(workflow, /test "\$\(uname -m\)" = "arm64"/u)
  assert.match(workflow, /node-version: 24/u)
  assert.match(workflow, /pnpm --filter @linxin666\/dsh-desktop pack:mac/u)
  assert.match(workflow, /pnpm --filter @linxin666\/dsh-desktop pack:verify:mac/u)
  assert.match(workflow, /pnpm --filter @linxin666\/dsh-desktop pack:smoke:mac/u)
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY: 'false'/u)
  assert.match(workflow, /REQUIRE_SIGNING: 'false'/u)
  assert.match(workflow, /Developer ID Application/u)
  assert.match(workflow, /SHA256SUMS-macos\.txt/u)
  assert.doesNotMatch(workflow, /latest-mac\.yml/u)
  assert.doesNotMatch(workflow, /softprops\/action-gh-release/u)
  assert.match(workflow, /verify-distribution-artifacts\.mjs darwin/u)
  assert.match(workflow, /hdiutil verify/u)
  assert.match(workflow, /unzip -t/u)
  assert.match(workflow, /preview-internal-updater/u)
})
