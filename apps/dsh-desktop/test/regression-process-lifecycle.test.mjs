import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'

test('regression suites classify their result only after their output pipes close', async () => {
  const source = await readFile(new URL('../scripts/run-regression-e2e.mjs', import.meta.url), 'utf8')
  assert.match(source, /child\.on\('close', \(code, signal\) =>/u)
  assert.doesNotMatch(source, /child\.on\('exit',/u)
})

test('complete release regression includes the real original plugin configuration form and save', async () => {
  const source = await readFile(new URL('../scripts/run-regression-e2e.mjs', import.meta.url), 'utf8')
  const packagedSuites = source.slice(source.indexOf('const PACKAGED_SUITES = ['), source.indexOf('function runSuite('))
  assert.match(packagedSuites, /script: 'scripts\/verify-plugin-options.mjs'/u)
  const verifier = await readFile(new URL('../scripts/verify-plugin-options.mjs', import.meta.url), 'utf8')
  assert.match(verifier, /preparePluginOptionsArchive\(/u)
  assert.match(verifier, /\[data-configure-plugin="dsh-free-search"\]/u)
  assert.match(verifier, /await pluginPage\.locator\('button\.dshfs-save'\)\.click\(\)/u)
  assert.match(verifier, /assert\.match\(patch, \/ddg-lite\/u\)/u)
  assert.doesNotMatch(verifier, /force: true/u)
})

async function regressionFixture({ collectFailures, acceptedIssues = [], errorWithoutResult = false, successfulOnly = false }) {
  const source = await readFile(new URL('../scripts/run-regression-e2e.mjs', import.meta.url), 'utf8')
  const start = source.indexOf('async function main() {')
  const end = source.indexOf('main().catch(', start)
  assert.ok(start >= 0 && end > start)
  const suites = ['failed-first', 'passed-middle', 'failed-last'].map(name => ({ name }))
  const executed = []
  const receipts = []
  const output = []
  const processFixture = { exit: code => { throw new Error(`exit ${code}`) }, exitCode: 0 }
  const runSuite = async suite => {
    executed.push(suite.name)
    const status = !successfulOnly && suite.name.startsWith('failed') ? 'failed' : 'passed'
    const result = { name: suite.name, status }
    if (status === 'failed') throw Object.assign(new Error(suite.name), errorWithoutResult ? {} : { suiteResult: result })
    return result
  }
  const main = new Function('IS_FULL', 'CORE_SUITES', 'PACKAGED_SUITES', 'COLLECT_FAILURES', 'runSuite', 'writeReceipt', 'acceptedIssues', 'process', 'console', 'setTimeout', `${source.slice(start, end)}; return main`)(
    true, suites.slice(0, 2), suites.slice(2), collectFailures, runSuite,
    receipt => receipts.push(structuredClone(receipt)), acceptedIssues, processFixture,
    { log: message => output.push(message), error: message => output.push(message) }, callback => callback(),
  )
  return { main, executed, receipts, output, processFixture }
}

test('the default regression gate still fails fast without authorizing later suites', async () => {
  const fixture = await regressionFixture({ collectFailures: false })
  await assert.rejects(fixture.main(), /exit 1/u)
  assert.deepEqual(fixture.executed, ['failed-first'])
  assert.equal(fixture.receipts.at(-1).status, 'failed')
  assert.deepEqual(fixture.receipts.at(-1).suites, [{ name: 'failed-first', status: 'failed' }])
})

test('failure collection executes every suite and retains all failures with a failing exit code', async () => {
  const fixture = await regressionFixture({ collectFailures: true, acceptedIssues: ['unrelated-known-issue'] })
  await fixture.main()
  assert.deepEqual(fixture.executed, ['failed-first', 'passed-middle', 'failed-last'])
  assert.equal(fixture.processFixture.exitCode, 1)
  const receipt = fixture.receipts.at(-1)
  assert.equal(receipt.status, 'failed')
  assert.deepEqual(receipt.suites.map(suite => suite.status), ['failed', 'passed', 'failed'])
  assert.equal(receipt.failure, 'failed-first\nfailed-last')
  assert.ok(fixture.output.some(message => message.includes('[FAILED]')))
  assert.ok(fixture.output.every(message => !message.includes('[ALL PASSED]')))
  const checkpoint = fixture.receipts.find(receipt => receipt.suites.length === 2)
  assert.equal(checkpoint.status, 'failed')
  assert.equal(checkpoint.terminal, false)
  assert.equal(checkpoint.failure, 'failed-first')
})

test('successful checkpoints remain non-terminal until every requested suite finishes', async () => {
  const fixture = await regressionFixture({ collectFailures: true, successfulOnly: true })
  await fixture.main()
  assert.deepEqual(fixture.executed, ['failed-first', 'passed-middle', 'failed-last'])
  const checkpoints = fixture.receipts.filter(receipt => receipt.terminal === false)
  assert.deepEqual(checkpoints.map(receipt => receipt.suites.length), [1, 2, 3])
  assert.deepEqual(checkpoints.map(receipt => receipt.status), ['running', 'running', 'running'])
  assert.equal(fixture.receipts.at(-1).status, 'passed')
  assert.equal(fixture.processFixture.exitCode, 0)
})

test('disk checkpoints cannot claim completion or finishedAt until all suites finish', async testContext => {
  const home = await mkdtemp(join(tmpdir(), 'desktop-regression-receipt-'))
  testContext.after(() => rm(home, { recursive: true, force: true }))
  const receiptPath = join(home, 'evidence', 'receipt.json')
  const source = await readFile(new URL('../scripts/run-regression-e2e.mjs', import.meta.url), 'utf8')
  const start = source.indexOf('function writeReceipt(')
  const end = source.indexOf('async function main()', start)
  assert.ok(start >= 0 && end > start)
  const writer = new Function('RECEIPT_PATH', 'APP_DIR', 'VERSION', 'IS_FULL', 'SOURCE_ONLY', 'CORE_SUITES', 'PACKAGED_SUITES', 'acceptedIssues', 'repositoryCommit', 'releaseArtifactEvidence', 'process', 'relative', 'resolve', 'dirname', 'mkdirSync', 'writeFileSync', 'renameSync', 'rmSync', 'console', `${source.slice(start, end)}; return writeReceipt`)(
    receiptPath, home, '4.4.1', true, false, [{}, {}], [{}], [],
    () => 'fixture-commit', () => undefined, { env: {}, pid: process.pid },
    relative, resolve, dirname, mkdirSync, writeFileSync, renameSync, rmSync, { log() {} },
  )
  const startedAt = Date.now()
  writer({ startedAt, finishedAt: startedAt + 1000, status: 'running', suites: [{ status: 'passed' }], terminal: false })
  const running = JSON.parse(await readFile(receiptPath, 'utf8'))
  assert.equal(running.status, 'running')
  assert.equal(running.completedSuites, 1)
  assert.equal(running.totalSuites, 3)
  assert.equal(running.completed, false)
  assert.equal(Object.hasOwn(running, 'finishedAt'), false)
  assert.equal(running.updatedAt, new Date(startedAt + 1000).toISOString())
  const suites = [{ status: 'passed' }, { status: 'failed' }, { status: 'passed' }]
  writer({ startedAt, finishedAt: startedAt + 2000, status: 'failed', suites, terminal: false, failure: 'fixture-failure' })
  const interrupted = JSON.parse(await readFile(receiptPath, 'utf8'))
  assert.equal(interrupted.status, 'failed')
  assert.equal(interrupted.completedSuites, 3)
  assert.equal(interrupted.completed, false)
  assert.equal(interrupted.failure, 'fixture-failure')
  assert.equal(Object.hasOwn(interrupted, 'finishedAt'), false)
  writer({ startedAt, finishedAt: startedAt + 3000, status: 'failed', suites, failure: 'fixture-failure' })
  const finished = JSON.parse(await readFile(receiptPath, 'utf8'))
  assert.equal(finished.completed, true)
  assert.equal(finished.status, 'failed')
  assert.equal(finished.finishedAt, new Date(startedAt + 3000).toISOString())
  assert.deepEqual(finished.suites, suites)
  assert.deepEqual(finished.acceptedIssues, [])
})

test('failure collection records failed suites even when launch rejects without a child result', async () => {
  const fixture = await regressionFixture({ collectFailures: true, errorWithoutResult: true })
  await fixture.main()
  assert.equal(fixture.processFixture.exitCode, 1)
  const receipt = fixture.receipts.at(-1)
  assert.equal(receipt.status, 'failed')
  assert.deepEqual(receipt.suites.map(suite => suite.name), ['failed-first', 'passed-middle', 'failed-last'])
  assert.deepEqual(receipt.suites.map(suite => suite.status), ['failed', 'passed', 'failed'])
  assert.equal(receipt.suites[0].reason, 'failed-first')
  assert.equal(receipt.suites[2].reason, 'failed-last')
})

test('suite exit can precede inherited output and must not authorize the next suite', { timeout: 10000 }, async () => {
  const source = await readFile(new URL('../scripts/run-regression-e2e.mjs', import.meta.url), 'utf8')
  const start = source.indexOf('function runSuite(suite) {')
  const end = source.indexOf('function repositoryCommit()', start)
  assert.ok(start >= 0 && end > start)
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() })
  let output = ''
  const processFixture = {
    execPath: 'fixture-node', env: {},
    stdout: { write: chunk => { output += chunk.toString() } },
    stderr: { write: chunk => { output += chunk.toString() } },
  }
  const runSuite = new Function('spawn', 'process', 'APP_DIR', 'console', `${source.slice(start, end)}; return runSuite`)(
    () => child, processFixture, 'fixture-app', { log() {} },
  )
  let settled = false
  const result = runSuite({ name: 'Fixture suite', script: 'fixture.mjs', args: [] })
  result.then(() => { settled = true })
  const closed = once(child, 'close')
  const exited = once(child, 'exit')
  child.emit('exit', 0, null)
  const [exitCode, exitSignal] = await exited
  assert.equal(exitCode, 0)
  assert.equal(exitSignal, null)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false, 'the next suite must not start while output pipes remain open')
  assert.doesNotMatch(output, /suite-output-drained/u)
  child.stdout.emit('data', Buffer.from('suite-output-drained'))
  child.emit('close', 0, null)
  const [closeCode, closeSignal] = await closed
  assert.equal(closeCode, 0)
  assert.equal(closeSignal, null)
  assert.equal((await result).status, 'passed')
  assert.equal(settled, true)
  assert.match(output, /suite-output-drained/u)
})
