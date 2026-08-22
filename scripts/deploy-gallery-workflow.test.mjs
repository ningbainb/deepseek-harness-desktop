import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'

test('gallery workflow always checks committed output and deploys only with complete Cloudflare credentials', async () => {
  const workflow = parse(await readFile(
    join(import.meta.dirname, '..', '.github', 'workflows', 'deploy-gallery.yml'),
    'utf8',
  ))
  const steps = workflow.jobs.deploy.steps
  const consistency = steps.find((step) => step.name === 'Gallery consistency')
  const credentials = steps.find((step) => step.name === 'Detect Cloudflare deployment credentials')
  const install = steps.find((step) => step.name === 'Install wrangler')
  const deploy = steps.find((step) => step.name === 'Deploy gallery')

  assert.equal(consistency.run, 'pnpm gallery:check')
  assert.equal(consistency.if, undefined)
  assert.equal(credentials.id, 'cloudflare')
  assert.equal(credentials.env.CLOUDFLARE_API_TOKEN, '${{ secrets.CLOUDFLARE_API_TOKEN }}')
  assert.equal(credentials.env.CLOUDFLARE_ACCOUNT_ID, '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}')
  assert.match(credentials.run, /configured=true/u)
  assert.match(credentials.run, /configured=false/u)
  assert.match(credentials.run, /::notice::/u)
  assert.equal(install.if, "steps.cloudflare.outputs.configured == 'true'")
  assert.equal(deploy.if, "steps.cloudflare.outputs.configured == 'true'")
})
