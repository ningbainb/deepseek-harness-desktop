import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveTelemetryEndpoint } from '../src/telemetry-config.mjs'

test('keeps development and ordinary packaged builds disconnected by default', async () => {
  let reads = 0
  const readFile = async () => {
    reads += 1
    return '{"endpoint":"https://telemetry.example/v1/events","officialBuild":true}'
  }
  assert.equal(await resolveTelemetryEndpoint({ isPackaged: false, resourcesPath: 'unused', readFile }), undefined)
  assert.equal(reads, 0)
  assert.equal(await resolveTelemetryEndpoint({
    isPackaged: true,
    resourcesPath: 'resources',
    readFile: async () => '{"endpoint":"https://telemetry.example/v1/events","officialBuild":false}',
  }), undefined)
})

test('accepts an ingestion endpoint only from an official packaged resource', async () => {
  assert.equal(await resolveTelemetryEndpoint({
    isPackaged: true,
    resourcesPath: 'resources',
    readFile: async () => '{"endpoint":"https://telemetry.example/v1/events","officialBuild":true}',
  }), 'https://telemetry.example/v1/events')

  for (const endpoint of [
    'http://telemetry.example/v1/events',
    'https://user:secret@telemetry.example/v1/events',
    'https://telemetry.example/other',
    'https://telemetry.example/v1/events?user=1',
  ]) {
    assert.equal(await resolveTelemetryEndpoint({
      isPackaged: true,
      resourcesPath: 'resources',
      readFile: async () => JSON.stringify({ endpoint, officialBuild: true }),
    }), undefined)
  }
  assert.equal(await resolveTelemetryEndpoint({
    isPackaged: true,
    resourcesPath: 'resources',
    readFile: async () => '{"endpoint":"https://telemetry.example/v1/events","officialBuild":true,"user":"forbidden"}',
  }), undefined)
})

test('allows an explicit local endpoint only through the test seam', async () => {
  assert.equal(await resolveTelemetryEndpoint({
    isPackaged: false,
    resourcesPath: 'unused',
    testEndpoint: 'http://127.0.0.1:43191/v1/events',
  }), 'http://127.0.0.1:43191/v1/events')
})
