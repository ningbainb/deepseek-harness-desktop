import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { startWindowsConsoleObserver } from './windows-console-observer.mjs'

// Wrap a real Desktop UI regression, observing the entire isolated app lifetime.
const allowed = new Set(['verify-terminal.mjs', 'verify-packaged-model-preferences.mjs'])
const name = process.argv[2]
if (!allowed.has(name)) throw new Error('choose a supported Desktop console-observed regression')
const observer = await startWindowsConsoleObserver()
let child
let observation
try {
  child = spawn(process.execPath, [resolve(import.meta.dirname, name)], {
    env: process.env, stdio: 'inherit', windowsHide: true,
  })
  const code = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('exit', resolveExit)
  })
  assert.equal(code, 0, 'observed Desktop regression failed')
} finally { observation = await observer.stop() }
assert.equal(observation.dropped, 0)
const related = observation.events.filter(event => event.ancestors.includes(child.pid))
assert.deepEqual(related, [], `Desktop showed an external console: ${JSON.stringify(related)}`)
console.log(JSON.stringify({ consoleObservation: { script: name, relatedWindows: related.length, totalConsoleEvents: observation.events.length, durationMs: Math.round(observation.elapsed) } }))
