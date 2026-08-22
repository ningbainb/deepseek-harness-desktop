import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ProductAnalyticsIdentityStore } from '../src/product-analytics-state.mjs'

test('creates one local secret and derives stable but rotating daily and monthly actors', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-product-analytics-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'product-analytics-state.json')
  const first = await new ProductAnalyticsIdentityStore({ path }).loadOrCreate()
  const second = await new ProductAnalyticsIdentityStore({ path }).loadOrCreate()

  const firstDay = first.actorsAt(new Date('2026-08-22T00:00:00.000Z'))
  const sameDay = second.actorsAt(new Date('2026-08-22T23:59:59.999Z'))
  const nextDay = second.actorsAt(new Date('2026-08-23T00:00:00.000Z'))
  const nextMonth = second.actorsAt(new Date('2026-09-01T00:00:00.000Z'))

  assert.deepEqual(firstDay, sameDay)
  assert.notEqual(firstDay.dailyActor, nextDay.dailyActor)
  assert.equal(firstDay.monthlyActor, nextDay.monthlyActor)
  assert.notEqual(firstDay.monthlyActor, nextMonth.monthlyActor)
  assert.match(firstDay.dailyActor, /^[a-f0-9]{64}$/u)
  assert.match(firstDay.monthlyActor, /^[a-f0-9]{64}$/u)
  assert.doesNotMatch(await readFile(path, 'utf8'), new RegExp(firstDay.dailyActor, 'u'))
})

test('replaces malformed analytics state without surfacing its contents', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-product-analytics-corrupt-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'state.json')
  await writeFile(path, '{"secret":"private-corrupt-value"', 'utf8')

  const identity = await new ProductAnalyticsIdentityStore({ path }).loadOrCreate()
  const actors = identity.actorsAt(new Date('2026-08-22T00:00:00.000Z'))

  assert.match(actors.dailyActor, /^[a-f0-9]{64}$/u)
  assert.doesNotMatch(await readFile(path, 'utf8'), /private-corrupt-value/u)
})

test('rejects invalid dates and never exposes the stored secret through JSON', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-product-analytics-private-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  const identity = await new ProductAnalyticsIdentityStore({ path: join(root, 'state.json') }).loadOrCreate()

  assert.throws(() => identity.actorsAt(new Date('invalid')), /date/u)
  assert.deepEqual(JSON.parse(JSON.stringify(identity)), {})
})
