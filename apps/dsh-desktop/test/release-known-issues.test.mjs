import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptedReleaseIssue } from '../scripts/release-known-issues.mjs'

const failure = { version: '3.4.0', enabled: true, script: 'scripts/verify-window-state-dpi.mjs',
  code: 1, signal: null, output: 'AssertionError: automatic DPI restoration must not rewrite logical geometry' }
test('only the explicitly approved legacy 3.4.0 DPI failure is accepted', () => {
  assert.equal(acceptedReleaseIssue(failure), 'DSH-340-DPI-01')
  assert.equal(acceptedReleaseIssue({ ...failure, version: '3.5.0' }), null)
  for (const override of [{ enabled: false }, { version: '3.5.1' }, { version: '3.5.0-beta.1' },
    { script: 'scripts/verify-installer-lifecycle.mjs' }, { code: 0 }, { code: 2 },
    { signal: 'SIGTERM' }, { output: 'DPI fixture crashed for a different reason' }]) {
    assert.equal(acceptedReleaseIssue({ ...failure, ...override }), null)
  }
})
