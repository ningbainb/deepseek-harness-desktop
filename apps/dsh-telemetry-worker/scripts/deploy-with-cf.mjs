// Reuses the installed Cloudflare CLI login without printing or copying secrets.
// Default is inspection. --apply uploads these four local modules to the existing Worker.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const account = '2bb454806328793bb1891295126e8880'
const script = 'dsh-desktop-telemetry'
const database = 'ae704c84-608e-4b60-a16c-703ebf2c1961'
const mode = process.argv[2] ?? '--inspect'
assert.ok(['--inspect', '--apply', '--verify'].includes(mode))
const credentials = JSON.parse(await readFile(join(process.env.APPDATA, 'xdg.config', 'cloudflare', 'config', 'default.json'), 'utf8'))
assert.equal(typeof credentials.oauth_token, 'string')
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`
async function api(path, init = {}) {
  const result = await fetch(base + path, { ...init, headers: { ...init.headers, authorization: 'Bearer ' + credentials.oauth_token }, signal: AbortSignal.timeout(30_000) })
  const data = await result.json()
  if (!result.ok || data.success !== true) throw new Error(`Cloudflare API failed: HTTP ${result.status}, codes ${(data.errors ?? []).map(error => error.code).join(',')}`)
  return data.result
}
const settings = await api(`/workers/scripts/${script}/settings`)
assert.equal(settings.bindings.find(binding => binding.name === 'METRICS')?.id ?? settings.bindings.find(binding => binding.name === 'METRICS')?.database_id, database)
assert.equal(settings.bindings.find(binding => binding.name === 'INGEST_ENABLED')?.text, '1')
for (const name of ['ADMIN_PASSWORD_SHA256', 'ADMIN_SESSION_SECRET']) assert.equal(settings.bindings.find(binding => binding.name === name)?.type, 'secret_text')
const deployments = await api(`/workers/scripts/${script}/deployments`)
const files = ['index.mjs', 'admin-auth.mjs', 'admin-dashboard.mjs', 'release-analytics.mjs']
const modules = await Promise.all(files.map(async file => ({ file, source: await readFile(new URL('../src/' + file, import.meta.url), 'utf8') })))
console.log(JSON.stringify({ mode, account, script, database, previous: deployments.deployments?.[0]?.versions, modules: modules.map(module => ({ file: module.file, sha256: createHash('sha256').update(module.source).digest('hex') })) }))
if (mode === '--apply') {
  const tables = await api(`/d1/database/${database}/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('product_release_daily','product_measurement_coverage')" }) })
  assert.equal(tables[0].results.length, 2, 'Apply migration 0005 before uploading')
  const metadata = {
    main_module: 'index.mjs', compatibility_date: settings.compatibility_date,
    compatibility_flags: settings.compatibility_flags ?? [],
    bindings: settings.bindings.filter(binding => binding.type !== 'secret_text').map(binding => binding.type === 'd1' ? { type: 'd1', name: binding.name, id: binding.id ?? binding.database_id } : binding),
    keep_bindings: ['secret_text'], logpush: settings.logpush ?? false,
    tail_consumers: settings.tail_consumers ?? [], tags: settings.tags ?? [],
    annotations: { 'workers/message': 'Desktop 3.3.0 release analytics: bounded batches, schema 4 observations, version report' },
  }
  const body = new FormData(); body.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
  for (const module of modules) body.set(module.file, new Blob([module.source], { type: 'application/javascript+module' }), module.file)
  const deployed = await api(`/workers/scripts/${script}`, { method: 'PUT', body })
  console.log(JSON.stringify({ deployed: true, id: deployed.id, modified: deployed.modified_on, etag: deployed.etag, startupMs: deployed.startup_time_ms }))
}
if (mode === '--verify') {
  const result = await fetch(base + `/workers/scripts/${script}`, { headers: { authorization: 'Bearer ' + credentials.oauth_token }, signal: AbortSignal.timeout(30_000) })
  assert.equal(result.ok, true)
  const body = await result.formData()
  for (const module of modules) {
    const actual = body.get(module.file)
    assert.ok(actual, 'missing deployed module ' + module.file)
    assert.equal(typeof actual === 'string' ? actual : await actual.text(), module.source, 'deployed module differs: ' + module.file)
  }
  console.log(JSON.stringify({ verifiedModules: modules.length, secretsPreserved: true, ingestionEnabled: true }))
  const baseUrl = 'https://guanli.1521003.xyz'
  const login = await fetch(baseUrl + '/admin')
  assert.equal(login.status, 200)
  assert.match(await login.text(), /password/)
  for (const path of ['/admin/api/summary?days=30', '/admin/api/release?days=30']) {
    assert.equal((await fetch(baseUrl + path)).status, 401)
  }
  const invalid = await fetch(baseUrl + '/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schema: 4, events: [] }) })
  assert.equal(invalid.status, 400)
  console.log(JSON.stringify({ login: 200, protectedApis: 401, invalidEventRejected: 400, syntheticEventsSent: 0 }))
}
