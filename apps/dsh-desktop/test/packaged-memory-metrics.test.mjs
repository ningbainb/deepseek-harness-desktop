import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createMemorySample,
  normalizeProcessSnapshot,
  selectProcessTree,
  summarizeMemorySamples,
} from '../scripts/packaged-memory-metrics.mjs'

const rows = normalizeProcessSnapshot([
  { ProcessId: 10, ParentProcessId: 1, WorkingSetSize: 100, PrivatePageCount: 70, Name: 'app.exe' },
  { ProcessId: 11, ParentProcessId: 10, WorkingSetSize: 80, PrivatePageCount: 60, Name: 'renderer.exe' },
  {
    ProcessId: 12,
    ParentProcessId: 11,
    WorkingSetSize: 40,
    PrivatePageCount: 30,
    Name: 'node.exe',
    CommandLine: 'node app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js --profile desktop',
  },
  { ProcessId: 20, ParentProcessId: 1, WorkingSetSize: 900, PrivatePageCount: 800, Name: 'unrelated.exe' },
])

test('process tree selection includes descendants and excludes unrelated processes', () => {
  assert.deepEqual(selectProcessTree(rows, 10).map(row => row.processId).toSorted(), [10, 11, 12])
})

test('memory samples total the application tree and identify the DSH host', () => {
  assert.deepEqual(createMemorySample(rows, 10, 5_000), {
    elapsedMs: 5_000,
    totalWorkingSetBytes: 220,
    totalPrivateBytes: 160,
    runtimeWorkingSetBytes: 40,
    processCount: 3,
  })
})

test('memory summaries use only the final idle window and compute even medians', () => {
  const sample = (elapsedMs, value) => ({
    elapsedMs,
    totalWorkingSetBytes: value,
    totalPrivateBytes: value + 1,
    runtimeWorkingSetBytes: value + 2,
    processCount: value + 3,
  })
  const summary = summarizeMemorySamples([
    sample(1_000, 1),
    sample(40_000, 10),
    sample(70_000, 20),
    sample(100_000, 30),
  ], { idleMs: 100_000, windowMs: 60_000 })
  assert.equal(summary.sampleCount, 4)
  assert.equal(summary.finalWindowSampleCount, 3)
  assert.deepEqual(summary.totalWorkingSetBytes, { minimum: 10, median: 20, maximum: 30 })
})
