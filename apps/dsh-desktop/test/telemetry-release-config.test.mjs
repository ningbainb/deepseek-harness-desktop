import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..')

test('source builds stay inert while official release builds inject the reviewed analytics resource', async () => {
  const [configuration, workflow, packaging] = await Promise.all([
    readFile(resolve(import.meta.dirname, '..', 'build', 'telemetry-config.json'), 'utf8'),
    readFile(resolve(repositoryRoot, '.github', 'workflows', 'desktop-release.yml'), 'utf8'),
    readFile(resolve(import.meta.dirname, '..', 'electron-builder.yml'), 'utf8'),
  ])

  assert.deepEqual(JSON.parse(configuration), { endpoint: '', officialBuild: false })
  assert.match(workflow, /DSH_TELEMETRY_ENDPOINT/u)
  assert.match(workflow, /Configure official anonymous product metrics/u)
  assert.match(workflow, /officialBuild\s*=\s*\$true/u)
  assert.match(workflow, /telemetry-config\.json/u)
  assert.match(packaging, /from: build\/telemetry-config\.json[\s\S]*to: telemetry-config\.json/u)
})
