import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

function stepBlock(workflow, name) {
  const normalized = workflow.replace(/\r\n?/gu, '\n')
  const escapedName = name.replace(/[.*+?^$\{\}()|[\]\\]/gu, '\\$&')
  const match = new RegExp(
    `      - name: ${escapedName}\\n[\\s\\S]*?(?=\\n      - name:|$)`,
    'u',
  ).exec(normalized)
  assert.ok(match, `workflow is missing step: ${name}`)
  return match[0]
}

test('gallery workflow always checks committed output and deploys only with complete Cloudflare credentials', async () => {
  const workflow = await readFile(
    join(import.meta.dirname, '..', '.github', 'workflows', 'deploy-gallery.yml'),
    'utf8',
  )
  const consistency = stepBlock(workflow, 'Gallery consistency')
  const credentials = stepBlock(workflow, 'Detect Cloudflare deployment credentials')
  const install = stepBlock(workflow, 'Install wrangler')
  const deploy = stepBlock(workflow, 'Deploy gallery')

  assert.match(consistency, /run: pnpm gallery:check/u)
  assert.doesNotMatch(consistency, /^\s*if:/mu)
  assert.match(credentials, /^\s*id: cloudflare$/mu)
  assert.match(credentials, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u)
  assert.match(credentials, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/u)
  assert.match(credentials, /configured=true/u)
  assert.match(credentials, /configured=false/u)
  assert.match(credentials, /::notice::/u)
  assert.match(install, /if: steps\.cloudflare\.outputs\.configured == 'true'/u)
  assert.match(deploy, /if: steps\.cloudflare\.outputs\.configured == 'true'/u)
})
