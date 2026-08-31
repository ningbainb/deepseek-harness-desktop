import assert from 'node:assert/strict'
import test from 'node:test'

import {
  __test,
  normalizeValueModeProductEvent,
  parseValueModeRuntimeTelemetryLine,
} from '../src/value-mode-telemetry.mjs'

test('parses only the privacy-safe Value Mode runtime route marker', () => {
  const prefix = __test.VALUE_MODE_RUNTIME_TELEMETRY_PREFIX
  assert.deepEqual(
    parseValueModeRuntimeTelemetryLine(`${prefix}{"event":"call","outcome":"started","role":"controller"}`),
    { outcome: 'started', role: 'controller' },
  )
  assert.deepEqual(
    parseValueModeRuntimeTelemetryLine(`${prefix}{"event":"call","outcome":"failed","role":"subagent"}\r`),
    { outcome: 'failed', role: 'subagent' },
  )
  for (const line of [
    `${prefix}{"event":"call","outcome":"started","role":"controller","model":"secret-model"}`,
    `${prefix}{"event":"call","outcome":"started","role":"controller","sessionId":"secret"}`,
    `${prefix}{"event":"call","outcome":"unknown","role":"controller"}`,
    `${prefix}not-json`,
    'ordinary runtime output',
  ]) assert.equal(parseValueModeRuntimeTelemetryLine(line), undefined)
})

test('normalizes only fixed renderer Value Mode events', () => {
  assert.deepEqual(normalizeValueModeProductEvent({ kind: 'entry', configured: false }), {
    kind: 'entry',
    configured: false,
  })
  assert.deepEqual(normalizeValueModeProductEvent({ kind: 'onboarding', outcome: 'completed', surface: 'hero' }), {
    kind: 'onboarding',
    outcome: 'completed',
    surface: 'hero',
  })
  assert.deepEqual(normalizeValueModeProductEvent({ kind: 'state', state: 'enabled', source: 'onboarding' }), {
    kind: 'state',
    state: 'enabled',
    source: 'onboarding',
  })
  assert.deepEqual(normalizeValueModeProductEvent({ kind: 'strategy', strategy: 'balanced' }), {
    kind: 'strategy',
    strategy: 'balanced',
  })
  for (const value of [
    { kind: 'entry', configured: false, model: 'secret' },
    { kind: 'onboarding', outcome: 'shown', surface: 'prompt text' },
    { kind: 'state', state: 'enabled', source: 'free-form' },
    { kind: 'strategy', strategy: 'cheap-model' },
    { kind: 'unknown' },
  ]) assert.throws(() => normalizeValueModeProductEvent(value), /invalid value mode telemetry event/u)
})
