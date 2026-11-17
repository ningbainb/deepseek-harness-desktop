import assert from 'node:assert/strict'
import test from 'node:test'
import { adaptRuntimeAgentTeamPatches } from '../src/runtime-agent-team-migration.mjs'
import { composeEntries } from '@deepseek-ai/dsh-app-boot'

test('retired manually inserted team rows map to the existing rc.3 roster once', () => {
  const patches = [
    { insert: [
      { id: 'agent-team', name: '@deepseek-ai/dsh-agent-team', config: { maxTasks: 256 } },
      { id: 'tool-agent-team', name: '@deepseek-ai/dsh-tool-agent-team' },
      { id: 'ui-agent-team', name: '@deepseek-ai/dsh-client-ui-agent-team' },
      { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
    ] },
    { insert: [
      { id: 'agent-team', name: '@deepseek-ai/dsh-experimental-agent-team', config: { maxTasks: 42, oldField: 'retain-in-backup' } },
      { id: 'tool-agent-team', name: '@deepseek-ai/dsh-experimental-tool-agent-team', disabled: true },
      { id: 'custom-user-row', name: '@community/keep', config: { key: 'value' } },
    ] },
    { id: 'tool-subagent-control', disabled: true },
  ]
  const original = structuredClone(patches)
  const next = adaptRuntimeAgentTeamPatches(patches)
  const rows = composeEntries(next)
  assert.equal(rows.filter(row => row.id === 'agent-team').length, 1)
  assert.deepEqual(rows.find(row => row.id === 'agent-team').config, { maxTasks: 42 })
  assert.equal(rows.find(row => row.id === 'tool-agent-team').disabled, true)
  assert.equal(rows.find(row => row.id === 'custom-user-row').name, '@community/keep')
  assert.equal(rows.find(row => row.id === 'tool-subagent-control').disabled, true)
  assert.deepEqual(patches, original)
  assert.deepEqual(adaptRuntimeAgentTeamPatches(next), next)
})

test('team migration preserves modern patches and unrelated third-party plugins exactly', () => {
  const patches = [{ id: 'agent-team', config: { maxTasks: 99, defaultEnabled: false } }, { insert: [{ id: 'third-party', name: 'third-party' }] }]
  assert.deepEqual(adaptRuntimeAgentTeamPatches(patches), patches)
})
