import assert from 'node:assert/strict'
import test from 'node:test'

import { parseStartupTimings, summarizeSamples } from '../scripts/startup-metrics.mjs'

test('startup timing parser uses the latest complete phase values', () => {
  const first = [
    'application-ready=100',
    'package-resolution=20',
    'profile-ready=40',
    'compatibility-ready=10',
    'shell-ready=250',
    'runtime-ready=900',
    'renderer-loaded=150',
  ]
  const second = [
    'application-ready=90',
    'package-resolution=15',
    'profile-ready=30',
    'compatibility-ready=8',
    'shell-ready=200',
    'runtime-ready=700',
    'renderer-loaded=100',
  ]
  const log = [...first, ...second].map((entry) => `[startup] ${entry}ms`).join('\n')
    + '\n[startup] total-to-renderer=950ms'
  assert.deepEqual(parseStartupTimings(log), {
    'application-ready': 90,
    'package-resolution': 15,
    'profile-ready': 30,
    'shell-ready': 200,
    'runtime-ready': 700,
    'renderer-loaded': 100,
    'total-to-renderer': 950,
    'estimated-serialized-total': 1_000,
    'estimated-overlap-saved': 50,
  })
})

test('startup timing parser derives a legacy total when the direct marker is absent', () => {
  const log = [
    'application-ready=90',
    'package-resolution=15',
    'profile-ready=30',
    'compatibility-ready=8',
    'shell-ready=200',
    'runtime-ready=700',
    'renderer-loaded=100',
  ].map((entry) => `[startup] ${entry}ms`).join('\n')
  assert.deepEqual(parseStartupTimings(log), {
    'application-ready': 90,
    'package-resolution': 15,
    'profile-ready': 30,
    'shell-ready': 200,
    'runtime-ready': 700,
    'renderer-loaded': 100,
    'total-to-renderer': 1_000,
    'estimated-serialized-total': 1_000,
    'estimated-overlap-saved': 0,
  })
})

test('startup timing parser rejects an incomplete log', () => {
  assert.throws(() => parseStartupTimings('[startup] application-ready=100ms'), /package-resolution/u)
})

test('startup sample summary retains raw values and reports ordered statistics', () => {
  assert.deepEqual(summarizeSamples([9, 1, 5, 3]), {
    minimumMs: 1,
    medianMs: 5,
    meanMs: 4.5,
    maximumMs: 9,
    samplesMs: [9, 1, 5, 3],
  })
  assert.throws(() => summarizeSamples([]), /non-empty/u)
})
