import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const repositoryRoot = resolve(import.meta.dirname, '..', '..', '..')

test('3.0 release builds retain an inert telemetry configuration and do not inject an endpoint', async () => {
  const [configuration, workflow, packaging] = await Promise.all([
    readFile(resolve(import.meta.dirname, '..', 'build', 'telemetry-config.json'), 'utf8'),
    readFile(resolve(repositoryRoot, '.github', 'workflows', 'desktop-release.yml'), 'utf8'),
    readFile(resolve(import.meta.dirname, '..', 'electron-builder.yml'), 'utf8'),
  ])

  assert.deepEqual(JSON.parse(configuration), { endpoint: '' })
  assert.doesNotMatch(workflow, /DSH_TELEMETRY_ENDPOINT|Configure official anonymous product metrics/u)
  assert.match(workflow, /telemetry-config\.json/u)
  assert.match(packaging, /from: build\/telemetry-config\.json[\s\S]*to: telemetry-config\.json/u)
})
