#!/usr/bin/env node
/**
 * Unified Desktop E2E Regression Gate.
 *
 * Usage:
 *   node scripts/run-regression-e2e.mjs --source
 *   node scripts/run-regression-e2e.mjs --full --artifact /path/to/executable
 *   node scripts/run-regression-e2e.mjs --full --artifact /path/to/executable --keep-going
 *   node scripts/run-regression-e2e.mjs --full --artifact /path/to/executable --suite desktop.workspace-relocation-packaged
 *   node scripts/run-regression-e2e.mjs --list
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptedReleaseIssue } from './release-known-issues.mjs'
import { createRegressionReport, updatePlannedStatus, writeRegressionReport } from './regression-report.mjs'
import { runRegressionSuite } from './regression-runner.mjs'
import { getRegressionSuites, resolveSuiteTarget, validateRegressionSuites } from './regression-suites.mjs'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const IS_FULL = argv.includes('--full')
const KEEP_GOING = argv.includes('--keep-going')
const SOURCE_ONLY = argv.includes('--source')
const LIST_ONLY = argv.includes('--list')
const ACCEPT_KNOWN_DPI = argv.includes('--accept-known-dpi-position-3.4.0')
const VERSION = JSON.parse(readFileSync(resolve(APP_DIR, 'package.json'), 'utf8')).version
const allowedFlags = new Set(['--core', '--full', '--keep-going', '--source', '--list', '--accept-known-dpi-position-3.4.0'])

function optionValue(name) {
  const equals = argv.find(argument => argument.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function validateArguments() {
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--artifact' || argument === '--report-dir' || argument === '--suite') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`${argument} requires a value`)
      index++
      continue
    }
    if (argument.startsWith('--artifact=') || argument.startsWith('--report-dir=') || argument.startsWith('--suite=')) continue
    if (!allowedFlags.has(argument)) throw new Error(`Unknown regression option: ${argument}`)
  }
  if (IS_FULL && SOURCE_ONLY) throw new Error('--full and --source are mutually exclusive')
  if (argv.includes('--core') && IS_FULL) throw new Error('--core and --full are mutually exclusive')
}

function configuredExecutable() {
  const fromArgument = optionValue('--artifact')
  const fromEnvironment = process.env.DSH_DESKTOP_E2E_EXECUTABLE?.trim()
  if (fromArgument && fromEnvironment && resolve(fromArgument) !== resolve(fromEnvironment)) {
    throw new Error('--artifact and DSH_DESKTOP_E2E_EXECUTABLE select different executables')
  }
  const selected = fromArgument || fromEnvironment
  if (SOURCE_ONLY && selected) throw new Error('--source cannot be combined with a packaged executable')
  if (!selected) return null
  const absolute = resolve(selected)
  if (!existsSync(absolute)) throw new Error(`Packaged Desktop executable does not exist: ${absolute}`)
  return absolute
}

function elapsedSeconds(durationMs) {
  return (durationMs / 1000).toFixed(1)
}

async function main() {
  validateArguments()
  const packagedExecutable = configuredExecutable()
  if (IS_FULL && !packagedExecutable && !LIST_ONLY) {
    throw new Error('Full regression requires an explicit --artifact path or DSH_DESKTOP_E2E_EXECUTABLE; automatic dist discovery is disabled')
  }

  let suites = validateRegressionSuites(getRegressionSuites({ full: IS_FULL }), { appDir: APP_DIR })
    .map(suite => ({ ...suite, target: resolveSuiteTarget(suite, {
      packagedExecutable: packagedExecutable || (IS_FULL && LIST_ONLY ? '<required-artifact>' : null),
    }) }))
  const selectedSuiteId = optionValue('--suite')
  if (selectedSuiteId) {
    const selectedSuite = suites.find(suite => suite.id === selectedSuiteId)
    if (!selectedSuite) throw new Error(`Unknown or unavailable regression suite: ${selectedSuiteId}`)
    suites = [selectedSuite]
  }

  if (LIST_ONLY) {
    console.log(JSON.stringify({ mode: IS_FULL ? 'full' : 'core', platform: process.platform, suites }, null, 2))
    return
  }

  const { directory, report } = createRegressionReport({
    appDir: APP_DIR,
    suites,
    mode: IS_FULL ? 'full' : 'core',
    packagedExecutable,
    reportRoot: optionValue('--report-dir'),
  })
  const failures = []
  const acceptedIssues = []
  process.env.DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION = '1'
  if (packagedExecutable) process.env.DSH_DESKTOP_E2E_EXECUTABLE = packagedExecutable
  else delete process.env.DSH_DESKTOP_E2E_EXECUTABLE

  console.log(`Starting Desktop Regression E2E Gate (${IS_FULL ? 'FULL RELEASE' : 'CORE PR'} mode, ${suites.length} suites)...`)
  console.log(`Structured report: ${resolve(directory, 'report.json')}`)
  const totalStart = Date.now()

  for (let index = 0; index < suites.length; index++) {
    const suite = suites[index]
    console.log(`\nProgress: [${index + 1}/${suites.length}] ${suite.name}`)
    console.log('\n============================================================')
    console.log(` [RUNNING E2E] ${suite.name}`)
    console.log(` Suite: ${suite.id}`)
    console.log(` Target: ${suite.target}`)
    console.log(` Command: node ${suite.script} ${suite.args.join(' ')}`)
    console.log(` Timeout: ${suite.timeoutMs}ms`)
    console.log('============================================================')
    updatePlannedStatus(report, suite.id, 'running')
    writeRegressionReport(directory, report)

    const attempt = await runRegressionSuite({
      suite,
      appDir: APP_DIR,
      env: {
        ...process.env,
        DSH_DESKTOP_E2E_EXECUTABLE: packagedExecutable || undefined,
      },
      logDirectory: directory,
    })
    const issue = attempt.status === 'failed' ? acceptedReleaseIssue({
      version: VERSION,
      enabled: ACCEPT_KNOWN_DPI,
      script: suite.script,
      code: attempt.exitCode,
      signal: attempt.signal,
      output: attempt.output,
    }) : null
    const result = {
      suiteId: suite.id,
      name: suite.name,
      target: suite.target,
      status: attempt.status,
      acceptedIssue: issue,
      attempts: [{ ...attempt, output: undefined }],
    }
    report.results.push(result)
    updatePlannedStatus(report, suite.id, attempt.status)
    writeRegressionReport(directory, report)

    if (attempt.status === 'passed') {
      console.log(`[PASS] ${suite.name} (${elapsedSeconds(attempt.durationMs)}s)`)
    } else if (issue) {
      acceptedIssues.push(issue)
      console.warn(`[ACCEPTED KNOWN ISSUE] ${issue}: test failed; maintainer explicitly deferred it for 3.4.0. No test was skipped.`)
    } else {
      const reason = attempt.status === 'timed-out'
        ? `timeout after ${suite.timeoutMs}ms`
        : attempt.signal ? `signal ${attempt.signal}` : attempt.error || `exit code ${attempt.exitCode}`
      const message = `[FAIL] ${suite.name} failed with ${reason} (${elapsedSeconds(attempt.durationMs)}s)`
      failures.push(message)
      report.gate.reasons.push(message)
      console.error('\n------------------------------------------------------------')
      console.error(' [REGRESSION E2E FAILURE] Regression gate blocked release/merge!')
      console.error(` ${message}`)
      console.error('------------------------------------------------------------')
      if (!KEEP_GOING) break
    }

    if (attempt.cleanup.status === 'failed') {
      const message = `[FAIL] ${suite.name} left an unconfirmed process after cleanup timeout`
      failures.push(message)
      report.gate.reasons.push(message)
      writeRegressionReport(directory, report)
      console.error(message)
      break
    }

    if (index + 1 < suites.length) await new Promise(resolveWait => setTimeout(resolveWait, 1200))
  }

  report.completedAt = new Date().toISOString()
  report.gate.status = failures.length ? 'failed' : acceptedIssues.length ? 'passed-with-accepted-issues' : 'passed'
  report.gate.acceptedIssues = acceptedIssues
  writeRegressionReport(directory, report)

  if (failures.length) {
    console.error(`Failed ${failures.length}/${suites.length} suites:\n${failures.join('\n')}`)
    process.exitCode = 1
    return
  }

  const totalElapsed = elapsedSeconds(Date.now() - totalStart)
  console.log('\n============================================================')
  console.log(` [${acceptedIssues.length ? 'COMPLETED WITH ACCEPTED KNOWN ISSUE' : 'ALL PASSED'}] Unified Desktop Regression Gate (${suites.length} suites, ${totalElapsed}s)`)
  if (acceptedIssues.length) console.log(` Accepted issues: ${acceptedIssues.join(', ')}`)
  console.log(` Report: ${resolve(directory, 'report.json')}`)
  console.log('============================================================')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
