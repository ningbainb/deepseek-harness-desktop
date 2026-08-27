import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatSchemaErrors,
  loadPublicSchemas,
  publicSchemaFixtures,
  validateJsonSchema,
  validatePublicSchemas,
} from './validate-public-schemas.mjs'

test('public schema validation accepts current metadata and additive v1 fields', async () => {
  // Deliberately use the current UTC date so the regular script-test job is a
  // freshness gate for registered compatibility patches.
  const report = await validatePublicSchemas()
  assert.equal(Object.keys(report.schemaIds).length, 7)
  assert.deepEqual(report.patchIds, [
    'queued-turn-continuation',
    'cancellation-presentation',
    'tool-call-arguments-envelope',
    'desktop-skin-profile-isolation',
    'tools-capability-request-side',
    'session-startup-corruption',
    'transcript-tool-call-balance',
  ])
  assert.equal(report.matrixEntries, 1)
})

test('Task Ledger v3 freezes its required major shape while allowing additive optional fields', () => {
  const schemas = loadPublicSchemas()
  const fixture = publicSchemaFixtures().taskLedger

  assert.deepEqual(validateJsonSchema(schemas.taskLedger, fixture), [])

  const unsupportedMajor = {
    ...fixture,
    schemaVersion: 4,
  }
  const majorErrors = validateJsonSchema(schemas.taskLedger, unsupportedMajor)
  assert.ok(majorErrors.some((error) => error.startsWith('$.schemaVersion:')))

  const taskWithoutTitle = structuredClone(fixture)
  delete taskWithoutTitle.tasks[0].title
  const shapeErrors = validateJsonSchema(schemas.taskLedger, taskWithoutTitle)
  assert.ok(shapeErrors.some((error) => error.includes('$.tasks[0]: missing required property title')))
})

test('deep-link and preset schemas reject unsupported inputs with actionable version guidance', () => {
  const schemas = loadPublicSchemas()
  const fixtures = publicSchemaFixtures()
  assert.ok(validateJsonSchema(schemas.deepLink, 'dsh://task/not?allowed').length > 0)

  const unknownMajor = {
    ...fixtures.preset,
    formatVersion: 2,
  }
  const errors = validateJsonSchema(schemas.preset, unknownMajor)
  assert.ok(errors.some((error) => error.startsWith('$.formatVersion:')))
  assert.match(formatSchemaErrors('preset', errors), /Upgrade DeepSeek Harness Desktop/u)
})

test('schema validation fails deterministically when a registered patch test is absent', async () => {
  await assert.rejects(
    validatePublicSchemas({
      today: '2026-08-21',
      testExists: () => false,
    }),
    /references missing test/u,
  )
})
