import assert from 'node:assert/strict'
import test from 'node:test'
import { closeIsolatedElectron } from '../scripts/electron-cleanup-fixture.mjs'

test('healthy isolated Electron cleanup never terminates its process', async () => {
  let terminated = false
  await closeIsolatedElectron({ process: () => ({ pid: 12345 }), close: async () => {} }, {
    terminate: async () => { terminated = true },
  })
  assert.equal(terminated, false)
})

test('hung cleanup terminates only its owned process and fails acceptance', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const child = { pid: 12345 }
  const targets = []
  const operation = closeIsolatedElectron({ process: () => child, close: () => new Promise(() => {}) }, {
    terminate: async target => targets.push(target),
  })
  const rejected = assert.rejects(operation, error => error instanceof AggregateError
    && error.cause.message.includes('exceeded its deadline'))
  await Promise.resolve()
  context.mock.timers.tick(45_000)
  await rejected
  assert.deepEqual(targets, [child])
})

test('cleanup preserves both its original error and a termination failure', async () => {
  const original = new Error('quit rejected')
  const termination = new Error('termination rejected')
  await assert.rejects(closeIsolatedElectron({ process: () => ({ pid: 12345 }), close: async () => { throw original } }, {
    terminate: async () => { throw termination },
  }), error => error instanceof AggregateError && error.cause === original
    && error.errors[0] === original && error.errors[1] === termination)
})

test('cleanup is safe when Electron launch never returned a process', async () => {
  await closeIsolatedElectron(undefined)
})
