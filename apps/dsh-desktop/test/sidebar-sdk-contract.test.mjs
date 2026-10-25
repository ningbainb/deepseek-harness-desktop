import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const root = dirname(require.resolve('dsh-better-sidebar/package.json'))
const compiled = await readFile(join(root, 'lib/index.js'), 'utf8')

test('the preserved sidebar host mounts against the official Connection instead of the removed WebRuntime', () => {
  const injection = compiled.match(/const inject = \[([\s\S]*?)\];/u)?.[1]
  assert.ok(injection)
  assert.match(injection, /"connection"/u)
  assert.doesNotMatch(injection, /"webRuntime"/u)
  for (const service of ['webServer', 'sessions', 'tools']) assert.ok(injection.includes(JSON.stringify(service)))
})

test('every sidebar request delegates authentication and authority checks to the SDK Connection', () => {
  const expression = compiled.match(/const fence = ([^;]+);/u)?.[1]
  assert.ok(expression)
  const request = { synthetic: true }
  const seen = []
  let rejection
  const connection = {
    requestRejection: input => { seen.push(input); return rejection },
  }
  const fence = runInNewContext(`(${expression})`, { isTrustedApiRequest: () => true, ctx: {
    webRuntime: { trustedHosts: [] }, connection,
    get: service => { assert.equal(service, 'connection'); return connection },
  } })
  assert.equal(fence(request), true)
  for (const status of [401, 403, 409]) {
    rejection = status
    assert.equal(fence(request), false, `SDK rejection ${status} must be retained`)
  }
  assert.equal(seen.length, 4)
  assert.ok(seen.every(input => input === request))
})

test('the Host fence preserves the existing client Connection declaration without duplicate members', async () => {
  for (const file of ['src/context-types.ts', 'lib/types/context-types.d.ts']) {
    const source = await readFile(join(root, file), 'utf8')
    assert.equal([...source.matchAll(/^\s+connection\??:/gmu)].length, 1, file)
    assert.match(source, /connection\?:\s*\{[\s\S]*?state:[\s\S]*?reconnect\(\): void/u, file)
  }
  const host = await readFile(join(root, 'src/index.ts'), 'utf8')
  assert.match(host, /import type \{ HostConnectionHandle \} from '@deepseek-ai\/dsh-client-connection'/u)
})
