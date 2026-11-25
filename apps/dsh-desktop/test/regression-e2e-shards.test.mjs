import assert from 'node:assert/strict'
import test from 'node:test'
import { SUITE_DURATION_HINTS, parseRetryCount, parseShardSpec, selectShardSuites } from '../scripts/regression-e2e-shards.mjs'

test('parseShardSpec handles unset values, valid 1-based shards, and invalid ranges', () => {
  assert.equal(parseShardSpec(undefined), null)
  assert.equal(parseShardSpec(''), null)
  assert.equal(parseShardSpec('  '), null)
  assert.deepEqual(parseShardSpec('1/4'), { index: 1, total: 4 })
  assert.deepEqual(parseShardSpec('4/4'), { index: 4, total: 4 })

  for (const invalid of ['0/4', '5/4', '1/0', 'abc', '1/2/3', '-1/4']) {
    assert.throws(() => parseShardSpec(invalid), RangeError, `expected RangeError for "${invalid}"`)
  }
})

test('parseRetryCount accepts 0..3 and rejects out-of-range or malformed values', () => {
  assert.equal(parseRetryCount(undefined), 0)
  assert.equal(parseRetryCount(''), 0)
  assert.equal(parseRetryCount('0'), 0)
  assert.equal(parseRetryCount('1'), 1)
  assert.equal(parseRetryCount('3'), 3)

  for (const invalid of ['-1', '4', '1.5', 'abc']) {
    assert.throws(() => parseRetryCount(invalid), RangeError, `expected RangeError for "${invalid}"`)
  }
})

test('selectShardSuites partitions all suites cleanly with balanced estimated duration and stable ordering', () => {
  const scripts = Object.keys(SUITE_DURATION_HINTS)
  const suites = scripts.map((script, index) => ({
    name: `Suite ${index + 1}`,
    script,
    args: [],
  }))

  assert.equal(selectShardSuites(suites, null), suites)

  const seen = []
  const loads = []
  for (let index = 1; index <= 4; index++) {
    const picked = selectShardSuites(suites, { index, total: 4 })
    assert.ok(picked.length > 0, `shard ${index} should not be empty`)
    const positions = picked.map(item => suites.indexOf(item))
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'shard preserves original suite order')
    loads.push(picked.reduce((sum, item) => sum + SUITE_DURATION_HINTS[item.script], 0))
    seen.push(...picked)
  }

  assert.equal(seen.length, suites.length, 'shards must cover every suite exactly once')
  assert.equal(new Set(seen).size, suites.length, 'shards must not overlap')

  const minLoad = Math.min(...loads)
  const maxLoad = Math.max(...loads)
  assert.ok(maxLoad - minLoad <= 60, `shard loads should stay balanced (loads=${JSON.stringify(loads)})`)
})
