import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import test from 'node:test'
import { runRegressionSuite } from '../scripts/regression-runner.mjs'

const sink = new Writable({ write(_chunk, _encoding, callback) { callback() } })

function fixture(source) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-regression-runner-'))
  const logDirectory = join(directory, 'logs')
  mkdirSync(logDirectory)
  writeFileSync(join(directory, 'fixture.mjs'), source)
  return { directory, logDirectory }
}

test('regression runner captures a passing attempt', async () => {
  const paths = fixture("console.log('fixture passed')\n")
  const attempt = await runRegressionSuite({
    suite: { id: 'desktop.fixture-pass', script: 'fixture.mjs', args: [], timeoutMs: 1_000, cleanupTimeoutMs: 100 },
    appDir: paths.directory,
    env: process.env,
    logDirectory: paths.logDirectory,
    stdout: sink,
    stderr: sink,
  })
  assert.equal(attempt.status, 'passed')
  assert.equal(attempt.exitCode, 0)
  assert.equal(attempt.evidence.length, 1)
})

test('regression runner turns a hung process into a timed-out attempt', async () => {
  const paths = fixture('setInterval(() => {}, 10_000)\n')
  const attempt = await runRegressionSuite({
    suite: { id: 'desktop.fixture-timeout', script: 'fixture.mjs', args: [], timeoutMs: 80, cleanupTimeoutMs: 100 },
    appDir: paths.directory,
    env: process.env,
    logDirectory: paths.logDirectory,
    stdout: sink,
    stderr: sink,
  })
  assert.equal(attempt.status, 'timed-out')
  assert.equal(attempt.errorCategory, 'timeout')
  assert.ok(attempt.durationMs < 2_000)
})
