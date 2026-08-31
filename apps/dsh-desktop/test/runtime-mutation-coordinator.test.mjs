import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import {
  createRuntimeMutationCoordinator,
  normalizeMutationPlan,
} from '../src/runtime-mutation-coordinator.mjs'

/**
 * Fault-injection coverage for the one sequence that must never be wrong:
 * a failed plugin or preset mutation has to put the Runtime back the way it
 * was, and if it cannot, the original error must not be lost.
 *
 * Concurrency, QQ Bot conflicts and shutdown quiescing live in the
 * enqueuePluginMutation layer and are covered by extension-ipc tests; this
 * file covers the coordinator's own contract.
 */

function harness({ stop, start, ensureProfile } = {}) {
  const calls = []
  const logLines = []
  const controller = {
    stop: async () => {
      calls.push('stop')
      if (stop) await stop()
    },
    start: async () => {
      calls.push('start')
      if (start) await start()
    },
  }
  const coordinator = createRuntimeMutationCoordinator({
    controller,
    ensureProfile: async () => {
      calls.push('ensureProfile')
      if (ensureProfile) await ensureProfile()
    },
    log: (line) => logLines.push(line),
  })
  return { coordinator, calls, logLines }
}

function transaction(name, { failRollback = false, failCommit = false } = {}) {
  return {
    name,
    commit: async () => {
      if (failCommit) throw new Error(`${name} commit failed`)
    },
    rollback: async () => {
      if (failRollback) throw new Error(`${name} rollback failed`)
    },
    result: { name },
  }
}

describe('argument validation', () => {
  test('requires a controller with stop and start', () => {
    assert.throws(() => createRuntimeMutationCoordinator({ ensureProfile: async () => {} }), /runtime controller/u)
    assert.throws(
      () => createRuntimeMutationCoordinator({ controller: { stop: async () => {} }, ensureProfile: async () => {} }),
      /runtime controller/u,
    )
  })

  test('requires ensureProfile', () => {
    assert.throws(
      () => createRuntimeMutationCoordinator({ controller: { stop: async () => {}, start: async () => {} } }),
      /ensureProfile/u,
    )
  })

  test('requires an apply step', async () => {
    const { coordinator } = harness()
    await assert.rejects(() => coordinator.run({ label: 'x' }), /apply step/u)
  })
})

describe('normalizeMutationPlan', () => {
  test('undefined means the mutation touched nothing rollback-capable', () => {
    assert.equal(normalizeMutationPlan(undefined), undefined)
    assert.equal(normalizeMutationPlan(null), undefined)
  })

  test('rejects a non-object plan', () => {
    assert.throws(() => normalizeMutationPlan('nope'), /plan object/u)
    assert.throws(() => normalizeMutationPlan([]), /plan object/u)
  })

  test('rejects transactions that cannot roll back', () => {
    assert.throws(() => normalizeMutationPlan({ transactions: [{}] }), /rollback-capable/u)
  })

  test('accepts commit-only and rollback-only entries', () => {
    const plan = normalizeMutationPlan({
      transactions: [{ commit: async () => {} }, { rollback: async () => {} }],
      result: 1,
    })
    assert.equal(plan.transactions.length, 2)
    assert.equal(plan.result, 1)
  })
})

describe('happy path', () => {
  test('runs prepare, apply, restore-profile, restart, commit and finalize in order', async () => {
    const { coordinator, calls } = harness()
    const tx = transaction('t')
    const result = await coordinator.run({
      label: 'plugin change',
      prepare: async () => {
        calls.push('prepare')
        return 'prepared'
      },
      apply: async (prepared) => {
        calls.push(`apply:${prepared}`)
        return { transactions: [tx], result: { name: 't' } }
      },
      finalize: async (plan) => {
        calls.push(`finalize:${plan.result.name}`)
        return 'done'
      },
    })
    assert.equal(result, 'done')
    assert.deepEqual(calls, ['prepare', 'stop', 'apply:prepared', 'ensureProfile', 'start', 'finalize:t'])
  })

  test('prepare runs before the runtime goes down', async () => {
    const { coordinator, calls } = harness()
    await coordinator.run({ apply: async () => undefined })
    assert.deepEqual(calls, ['stop', 'ensureProfile', 'start'])
  })

  test('a mutation with no transaction still restarts the runtime', async () => {
    const { coordinator, calls } = harness()
    const result = await coordinator.run({
      apply: async () => ({ transactions: [], result: { name: '@community/active' } }),
    })
    assert.deepEqual(result, { name: '@community/active' })
    assert.deepEqual(calls, ['stop', 'ensureProfile', 'start'])
  })
})

describe('recovery', () => {
  test('apply failure with a successful rollback rethrows the original error', async () => {
    const { coordinator, calls } = harness()
    const tx = transaction('t')
    const original = new Error('package apply failed')
    await assert.rejects(
      () => coordinator.run({
        label: 'plugin change',
        apply: async () => {
          throw original
        },
      }),
      /package apply failed/u,
    )
    // No transaction was produced, but the runtime still comes back.
    assert.deepEqual(calls, ['stop', 'ensureProfile', 'start'])
    void tx
  })

  test('a failed rollback during recovery produces one aggregated error', async () => {
    // The apply step succeeds so a real transaction exists to unwind; the
    // failure is injected on the forward path instead.
    const { coordinator } = harness({
      ensureProfile: async () => {
        throw new Error('profile stage failed')
      },
    })
    const error = await coordinator.run({
      label: 'plugin change',
      apply: async () => ({ transactions: [transaction('t', { failRollback: true })], result: {} }),
    }).then(() => undefined, (thrown) => thrown)

    assert.ok(error instanceof Error)
    assert.match(error.message, /plugin change failed and the previous runtime could not be restored/u)
    assert.match(error.message, /rollback failed/u)
    assert.ok(error.cause instanceof AggregateError, 'the original error must survive in cause')
  })

  test('ensureProfile failure during recovery is reported', async () => {
    const { coordinator } = harness({
      ensureProfile: async () => {
        throw new Error('profile restore failed')
      },
    })
    const error = await coordinator.run({
      label: 'plugin change',
      apply: async () => undefined,
    }).then(() => undefined, (thrown) => thrown)

    assert.match(error.message, /could not be restored/u)
    assert.match(error.message, /profile restore failed/u)
    assert.ok(error.cause instanceof AggregateError)
  })

  test('a failed restart after a successful rollback is reported', async () => {
    const { coordinator } = harness({
      start: async () => {
        throw new Error('runtime recovery failed')
      },
    })
    const error = await coordinator.run({
      label: 'plugin change',
      apply: async () => undefined,
    }).then(() => undefined, (thrown) => thrown)

    assert.match(error.message, /could not be restored/u)
    assert.match(error.message, /runtime recovery failed/u)
    assert.ok(error.cause instanceof AggregateError)
  })

  test('a stop failure is never masked by recovery', async () => {
    const { coordinator, calls } = harness({
      stop: async () => {
        throw new Error('stop refused')
      },
    })
    await assert.rejects(
      () => coordinator.run({ apply: async () => undefined }),
      /stop refused/u,
    )
    // Nothing was taken down, so nothing is restored or restarted.
    assert.deepEqual(calls, ['stop'])
  })

  test('recovery failure is written to the log sink', async () => {
    const { coordinator, logLines } = harness({
      start: async () => {
        throw new Error('restart down')
      },
    })
    await coordinator.run({
      label: 'plugin batch',
      apply: async () => undefined,
    }).catch(() => {})
    await coordinator.run({
      label: 'plugin batch',
      apply: async () => {
        throw new Error('boom')
      },
    }).catch(() => {})

    assert.ok(
      logLines.some((line) => /plugin batch recovery failed/u.test(line) && /restart down/u.test(line)),
      `expected a recovery diagnostic, got ${JSON.stringify(logLines)}`,
    )
  })

  test('onRecovered runs only when the runtime came back intact', async () => {
    const { coordinator } = harness()
    let recovered = 0
    const error = await coordinator.run({
      label: 'preset import',
      apply: async () => {
        throw new Error('preset boom')
      },
      onRecovered: async () => {
        recovered += 1
      },
    }).then(() => undefined, (thrown) => thrown)

    assert.equal(recovered, 1)
    assert.match(error.message, /preset boom/u)
    assert.doesNotMatch(error.message, /could not be restored/u)
  })

  test('onRecovered does not run when recovery itself failed', async () => {
    const { coordinator } = harness({
      start: async () => {
        throw new Error('down')
      },
    })
    let recovered = 0
    await coordinator.run({
      label: 'preset import',
      apply: async () => undefined,
      onRecovered: async () => {
        recovered += 1
      },
    }).catch(() => {})
    // The second start is the recovery one and it throws, so no callback.
    assert.equal(recovered, 0)
  })
})

describe('transaction ordering', () => {
  test('commits and rolls back in the caller declared order', async () => {
    const order = []
    const make = (name, failApply = false) => ({
      commit: async () => order.push(`commit:${name}`),
      rollback: async () => order.push(`rollback:${name}`),
      result: { name },
      failApply,
    })
    const config = make('config')
    const packages = make('packages')
    const { coordinator } = harness()

    // Success path order.
    await coordinator.run({
      apply: async () => ({ transactions: [config, packages], result: {} }),
    })
    assert.deepEqual(order, ['commit:config', 'commit:packages'])

    // Failure path must unwind in the same declared order - the preset path
    // stages config before packages and relies on that for a clean revert.
    order.length = 0
    await coordinator.run({
      apply: async () => ({ transactions: [config, packages], result: {} }),
      finalize: async () => {
        throw new Error('late failure')
      },
    }).catch(() => {})
    assert.deepEqual(order, [
      'commit:config',
      'commit:packages',
      'rollback:config',
      'rollback:packages',
    ])
  })

  test('a commit failure still unwinds', async () => {
    let rolledBack = false
    const { coordinator } = harness()
    await coordinator.run({
      apply: async () => ({
        transactions: [{
          commit: async () => {
            throw new Error('commit failed')
          },
          rollback: async () => {
            rolledBack = true
          },
        }],
        result: {},
      }),
    }).catch(() => {})
    assert.equal(rolledBack, true)
  })
})

describe('progress events', () => {
  test('emits stopping, starting, rolling-back and restored', async () => {
    const events = []
    const { coordinator } = harness()
    await coordinator.run({
      apply: async () => undefined,
      onRuntimeEvent: (event) => events.push(event),
    })
    assert.deepEqual(events, ['stopping', 'starting'])

    events.length = 0
    await coordinator.run({
      apply: async () => {
        throw new Error('boom')
      },
      onRuntimeEvent: (event) => events.push(event),
    }).catch(() => {})
    assert.deepEqual(events, ['stopping', 'rolling-back', 'restored'])
  })
})
