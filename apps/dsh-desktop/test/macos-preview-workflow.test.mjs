import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import YAML from 'yaml'

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

test('macOS browser component carrier runs after build and before upload using the actual packaged main', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const steps = workflow.jobs.build.steps
  const build = steps.findIndex(step => step.run?.includes('pnpm --filter @linxin666/dsh-desktop pack:mac'))
  const tests = steps.filter(step => step.run?.includes('node --test apps/dsh-desktop/test/browser-component.test.mjs apps/dsh-desktop/test/runtime-browser-component.test.mjs'))
  assert.equal(tests.length, 1, 'Retain exactly one complete component and adapter test invocation')
  const index = steps.indexOf(tests[0])
  const upload = steps.findIndex(step => step.uses === 'actions/upload-artifact@v4')
  assert.ok(build >= 0 && index > build, 'The real carrier test requires the packaged application from the build')
  assert.ok(index < upload, 'A carrier failure must block every upload')
  assert.equal(tests[0].env.DSH_BROWSER_COMPONENT_CARRIER, '${{ github.workspace }}/apps/dsh-desktop/dist/mac-arm64/DeepSeek Harness Desktop.app/Contents/MacOS/DeepSeek Harness Desktop')
  assert.doesNotMatch(tests[0].run, /--test-name-pattern|--test-skip-pattern/u)
})
