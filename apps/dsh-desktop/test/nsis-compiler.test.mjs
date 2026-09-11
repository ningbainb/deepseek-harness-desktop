import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveNsisCompiler } from '../scripts/nsis-compiler.mjs'

test('NSIS fixture uses the pinned builder resolver and its compiler environment', async () => {
  const environment = { ELECTRON_BUILDER_CACHE: 'D:/runner/custom-cache', TEMP: 'C:/runner/temp', NSISDIR: 'obsolete' }
  let calls = 0
  const resolved = await resolveNsisCompiler({ environment, resolveBundledCompiler: async () => {
    calls++
    return { path: 'D:/runner/custom-cache/nsis/unique/Bin/makensis.exe', env: { NSISDIR: 'D:/runner/custom-cache/nsis/unique' } }
  } })
  assert.equal(calls, 1)
  assert.deepEqual(resolved, {
    path: 'D:/runner/custom-cache/nsis/unique/Bin/makensis.exe',
    env: { ...environment, NSISDIR: 'D:/runner/custom-cache/nsis/unique' },
  })
  assert.equal(environment.NSISDIR, 'obsolete', 'tool environment does not mutate the parent process')
})

test('explicit NSIS compiler override remains supported without resolving or downloading a tool', async () => {
  const environment = { DSH_NSIS_COMPILER: 'D:/custom/makensis.exe', NSISDIR: 'D:/custom' }
  const resolved = await resolveNsisCompiler({ environment, resolveBundledCompiler: () => {
    assert.fail('explicit override must not resolve another compiler')
  } })
  assert.deepEqual(resolved, { path: environment.DSH_NSIS_COMPILER, env: environment })
  assert.notEqual(resolved.env, environment)
})

test('NSIS resolver errors and invalid compiler results fail rather than skip installation checks', async () => {
  const error = new Error('tool cache could not be resolved')
  await assert.rejects(resolveNsisCompiler({ environment: {}, resolveBundledCompiler: async () => { throw error } }), value => value === error)
  for (const compiler of [undefined, {}, { path: '' }]) {
    await assert.rejects(resolveNsisCompiler({ environment: {}, resolveBundledCompiler: async () => compiler }), /did not resolve an NSIS compiler/u)
  }
})
