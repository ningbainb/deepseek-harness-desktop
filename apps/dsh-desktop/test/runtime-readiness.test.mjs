import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { finalizeRuntimeReadiness } from '../src/runtime-readiness.mjs'

test('readiness waits for official startup listeners and queued initial HMR work before announcement', async () => {
  const events = []
  let release
  const initialReload = new Promise(resolve => { release = resolve })
  const hmr = {
    async runExclusive(operation) {
      assert.equal(this, hmr)
      events.push('barrier')
      await initialReload
      await operation()
      events.push('settled')
    },
  }
  const pending = finalizeRuntimeReadiness({
    commit() { events.push('commit') }, hmr,
    announce() { events.push('ready') },
  })
  await Promise.resolve()
  assert.deepEqual(events, ['commit', 'barrier'])
  release()
  assert.equal(await pending, true)
  assert.deepEqual(events, ['commit', 'barrier', 'settled', 'ready'])
})

test('legacy runtimes without the serialized HMR API still commit before announcement', async () => {
  for (const hmr of [undefined, {}, { registerConfig() {} }]) {
    const events = []
    assert.equal(await finalizeRuntimeReadiness({ hmr,
      commit() { events.push('commit') }, announce() { events.push('ready') },
    }), true)
    assert.deepEqual(events, ['commit', 'ready'])
  }
})

test('shutdown cancelling a pending official HMR barrier cannot become a startup failure', async () => {
  let stopping = false
  let rejectBarrier
  const barrier = new Promise((_, reject) => { rejectBarrier = reject })
  const pending = finalizeRuntimeReadiness({
    commit() {}, hmr: { runExclusive() { return barrier } },
    isStopping: () => stopping,
    announce() { assert.fail('a stopping runtime must not announce readiness') },
  })
  stopping = true
  rejectBarrier(new Error('HMR is disposed'))
  assert.equal(await pending, false)
})

for (const phase of ['commit', 'barrier', 'announce']) {
  test(`a failed ${phase} cannot become successful runtime readiness`, async () => {
    const failure = new Error(`failed ${phase}`)
    const events = []
    const step = name => { events.push(name); if (phase === name) throw failure }
    await assert.rejects(finalizeRuntimeReadiness({
      commit() { step('commit') },
      hmr: { async runExclusive(operation) { step('barrier'); await operation() } },
      announce() { step('announce') },
    }), error => error === failure)
    assert.deepEqual(events, ['commit', 'barrier', 'announce'].slice(0, ['commit', 'barrier', 'announce'].indexOf(phase) + 1))
  })
}

for (const phase of ['before-commit', 'commit', 'barrier']) {
  test(`shutdown during ${phase} cannot publish a ready carrier`, async () => {
    let stopping = phase === 'before-commit'
    let announcements = 0
    assert.equal(await finalizeRuntimeReadiness({
      isStopping: () => stopping,
      commit() { if (phase === 'commit') stopping = true },
      hmr: { async runExclusive(operation) { if (phase === 'barrier') stopping = true; await operation() } },
      announce() { announcements++ },
    }), false)
    assert.equal(announcements, 0)
  })
}

test('launcher publishes both pipe and diagnostic readiness only through the completion barrier', async () => {
  const source = await readFile(new URL('../src/runtime-launcher.mjs', import.meta.url), 'utf8')
  const guarded = source.slice(source.indexOf('await finalizeRuntimeReadiness('))
  assert.match(guarded, /commit: \(\) => ready\.commit\(\)/u)
  assert.match(guarded, /hmr: ctx\.get\('hmr'\)/u)
  assert.match(guarded, /isStopping: \(\) => shuttingDown/u)
  assert.match(guarded, /if \(pipeIdentity === undefined\) process\.stdout\.write\(`\$\{RUNTIME_HTTP_READY_LINE\}\\n`\)/u)
  assert.match(guarded, /announce: \(\) => \{\r?\n\s*if \(pipeIdentity !== undefined\) process\.stdout\.write\(`\$\{RUNTIME_PIPE_READY_LINE\}\\n`\)\r?\n\s*markStartup\('ready'\)/u)
  assert.equal(source.split('ready.commit()').length, 2)
  assert.equal(source.split("markStartup('ready')").length, 2)
})
