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

const timingFailure = {
  version: '5.3.0', platform: 'win32', streamTimingApproved: true,
  script: 'scripts/verify-beta-usability.mjs', code: 1, signal: null,
  output: 'AssertionError [ERR_ASSERTION]: DSH_STREAM_FRAME_P95 {"p95Ms":46.79999999999927,"limitMs":35}',
}

test('the 5.3.0 Windows exception accepts only the approved stream timing overrun', () => {
  assert.equal(acceptedReleaseIssue(timingFailure), 'DSH-530-WINDOWS-STREAM-P95')
  for (const override of [{ streamTimingApproved: false }, { platform: 'linux' }, { version: '5.3.1' },
    { version: '5.3.0-rc.1' }, { script: 'scripts/verify-installer-lifecycle.mjs' }, { code: 2 }, { signal: 'SIGTERM' },
    { output: 'AssertionError: streamed Chinese text must be complete and ordered' },
    { output: timingFailure.output.replace('46.79999999999927', '47.1') },
    { output: timingFailure.output.replace('46.79999999999927', 'null') },
    { output: timingFailure.output.replace('"limitMs":35', '"limitMs":50') },
    { output: timingFailure.output + '\n' + timingFailure.output }]) {
    assert.equal(acceptedReleaseIssue({ ...timingFailure, ...override }), null, JSON.stringify(override))
  }
})
