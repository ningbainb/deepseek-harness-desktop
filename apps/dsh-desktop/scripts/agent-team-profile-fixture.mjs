import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { parseDocument } = createRequire(new URL('../package.json', import.meta.url))('yaml')

/** rc3 owns the Team roster in its base bundle; the profile persists its switch. */
export function assertAgentTeamProfile(profile, patch, enabled) {
  assert.equal(profile.dsh.profile.desktopAgentTeamEnabled, enabled)
  assert.equal(profile.dsh.profile.bundles.includes('@deepseek-ai/dsh-experimental-agent-team-profile'), false)
  const document = parseDocument(patch, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }] })
  assert.deepEqual(document.errors, [])
  const rows = document.toJS().filter(row => row.id === 'agent-team')
  assert.equal(rows.length, 1, 'the managed Team switch must have one effective edit location')
  assert.equal(rows[0].config.defaultEnabled, enabled, 'the persisted switch must reach the official rc3 Team service')
  assert.notEqual(rows[0].disabled, true)
  assert.equal(rows[0].config.maxTasks, 256)
}
