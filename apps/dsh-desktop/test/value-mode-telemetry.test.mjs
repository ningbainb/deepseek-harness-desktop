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

test('parses canonical route diagnostics without admitting extra runtime data', () => {
  const prefix = __test.VALUE_MODE_RUNTIME_TELEMETRY_PREFIX
  const event = {
    event: 'cost_mode_route',
    params: { role: 'main', result: 'failure', strategy: 'balanced', model: 'deepseek-v4-pro', error_type: 'timeout' },
    timestamp: '2026-09-10T00:00:00.000Z',
  }
  assert.deepEqual(parseValueModeRuntimeTelemetryLine(prefix + JSON.stringify(event)), event)
  for (const invalid of [
    { ...event, sessionId: 'private-session' },
    { ...event, params: { ...event.params, error: 'raw provider response' } },
    { ...event, params: { ...event.params, model: 'token=secret' } },
    { ...event, params: { ...event.params, error_type: 'free-form error' } },
    { ...event, timestamp: 'invalid' },
  ]) assert.equal(parseValueModeRuntimeTelemetryLine(prefix + JSON.stringify(invalid)), undefined)
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
