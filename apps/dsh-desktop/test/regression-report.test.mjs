import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createRegressionReport, updatePlannedStatus, writeRegressionReport } from '../scripts/regression-report.mjs'

test('regression report exposes unexecuted suites and persists status atomically', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-regression-report-'))
  const executable = join(temporary, 'candidate')
  writeFileSync(executable, 'candidate bytes')
  mkdirSync(join(temporary, 'resources'))
  writeFileSync(join(temporary, 'resources', 'app.asar'), 'archive bytes')
  const suiteScript = join(temporary, 'suite.mjs')
  writeFileSync(suiteScript, 'export {}\n')
  const suites = [{ id: 'desktop.example', name: 'Example', target: 'packaged', script: suiteScript }]
  const { directory, report } = createRegressionReport({
    appDir: process.cwd(),
    suites,
    mode: 'full',
    packagedExecutable: executable,
    reportRoot: join(temporary, 'report'),
    now: new Date('2026-09-13T00:00:00.000Z'),
  })
  assert.equal(report.planned[0].status, 'not-run')
  assert.match(report.artifact.digest, /^[a-f0-9]{64}$/)
  assert.match(report.testDigest, /^[a-f0-9]{64}$/)
  updatePlannedStatus(report, 'desktop.example', 'passed')
  writeRegressionReport(directory, report)
  const persisted = JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8'))
  assert.equal(persisted.planned[0].status, 'passed')
  assert.throws(() => updatePlannedStatus(report, 'desktop.unknown', 'failed'), /Unknown planned suite/)
})
