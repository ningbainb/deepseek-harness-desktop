import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

import { publicRuntimeStatus } from '../src/ipc.mjs'
import { DshRuntimeController } from '../src/runtime-controller.mjs'

const verifierURL = new URL('../scripts/verify-packaged-release-browser.mjs', import.meta.url)
const verifier = await readFile(verifierURL, 'utf8')
// Execute the callback used by the real harness without importing its EXE launcher.
const matches = [...verifier.matchAll(/await waitUntil\((async \(\) => \{\r?\n\s+const status = await owner\.main\.evaluate\(\(\) => window\.dshDesktop\.getStatus\(\)\)[\s\S]*?\r?\n\s+\}),/gu)]
assert.equal(matches.length, 1, 'Locate exactly one actual Runtime status readiness predicate')

function actualPredicate(getStatus) {
  let evaluations = 0
  const predicate = runInNewContext(`(${matches[0][1]})`, {
    owner: { main: { async evaluate(callback) { evaluations++; return callback() } } },
    window: { dshDesktop: { getStatus } },
  }, { filename: fileURLToPath(verifierURL) })
  return { predicate, evaluations: () => evaluations }
}

for (const state of ['ready', 'running', 'starting', 'stopped', 'restarting', 'stopping']) {
  test(`actual packaged browser predicate accepts ${state} only when it is ready`, async () => {
    const { predicate, evaluations } = actualPredicate(async () => ({ state }))
    assert.equal(await predicate(), state === 'ready')
    assert.equal(evaluations(), 1, 'Read status through the actual renderer evaluation callback')
  })
}

for (const state of ['error', 'failed', 'crashed']) {
  test(`actual packaged browser predicate throws for ${state}`, async () => {
    const { predicate, evaluations } = actualPredicate(async () => ({ state }))
    await assert.rejects(predicate(), error => {
      assert.equal(error.name, 'Error')
      assert.equal(error.message, `Packaged Runtime failed: ${state}`)
      return true
    })
    assert.equal(evaluations(), 1)
  })
}

test('actual predicate propagates a status IPC failure instead of accepting readiness', async () => {
  const failure = new Error('status IPC unavailable')
  const { predicate } = actualPredicate(async () => { throw failure })
  await assert.rejects(predicate(), error => error === failure)
})

class ControlledChild extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  exitCode = null

  kill() {
    this.exitCode = 0
    queueMicrotask(() => this.emit('exit', 0, 'SIGTERM'))
    return true
  }
}

test('actual predicate follows real RuntimeController public status across its readiness probe', async t => {
  const child = new ControlledChild()
  const probeEntered = Promise.withResolvers()
  const releaseProbe = Promise.withResolvers()
  let spawnCalls = 0
  let probeCalls = 0
  let terminateCalls = 0
  const controller = new DshRuntimeController({
    cliPath: fileURLToPath(new URL('../node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url)),
    cwd: process.cwd(), dshHome: process.cwd(), autoRestart: false,
    spawnProcess() { spawnCalls++; return child },
    async probeReady() {
      probeCalls++
      probeEntered.resolve()
      await releaseProbe.promise
    },
    async terminateProcessTree() { terminateCalls++; child.kill() },
  })
  const { predicate } = actualPredicate(() => publicRuntimeStatus(controller.status))
  let pending
  t.after(async () => {
    releaseProbe.resolve()
    await controller.stop()
    await pending?.catch(() => {})
    child.stdout.destroy()
    child.stderr.destroy()
  })
  assert.equal(controller.status.state, 'stopped')
  assert.equal(await predicate(), false)
  pending = controller.start()
  pending.catch(() => {})
  assert.equal(spawnCalls, 1)
  assert.equal(controller.status.state, 'starting')
  assert.equal(await predicate(), false)
  child.stdout.write('dsh web: http://127.0.0.1:43125\n')
  child.stdout.write('dsh desktop web: ready\n')
  await probeEntered.promise
  assert.equal(probeCalls, 1)
  assert.equal(controller.status.state, 'starting', 'A pending readiness probe is not ready')
  assert.equal(await predicate(), false)
  releaseProbe.resolve()
  assert.equal(await pending, 'http://127.0.0.1:43125/')
  assert.equal(controller.status.state, 'ready')
  assert.equal(publicRuntimeStatus(controller.status).url, 'http://127.0.0.1:43125/')
  assert.equal(await predicate(), true, 'Accept the real public ready status without inventing running')
  await controller.stop()
  assert.equal(terminateCalls, 1, 'Dispose the controlled transport without launching or killing a real process')
  assert.equal(controller.status.state, 'stopped')
  assert.equal(await predicate(), false)
})
