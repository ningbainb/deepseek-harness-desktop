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
  version: '5.3.4', platform: 'win32', streamTimingApproved: true,
  script: 'scripts/verify-beta-usability.mjs', code: 1, signal: null,
  output: 'AssertionError [ERR_ASSERTION]: DSH_STREAM_FRAME_P95 {"p95Ms":46.79999999999927,"limitMs":35}',
}

test('the approved Windows releases accept only the bounded stream timing overrun', () => {
  assert.equal(acceptedReleaseIssue(timingFailure), 'DSH-530-WINDOWS-STREAM-P95')
  const current = { ...timingFailure, version: '5.3.5', output: timingFailure.output.replace('46.79999999999927', '46.9') }
  assert.equal(acceptedReleaseIssue(current), 'DSH-530-WINDOWS-STREAM-P95')
  assert.equal(acceptedReleaseIssue({ ...current, output: current.output.replace('46.9', '47') }), 'DSH-530-WINDOWS-STREAM-P95')
  for (const override of [{ streamTimingApproved: false }, { platform: 'linux' }, { platform: 'darwin' }, { version: '5.3.6' },
    { version: '5.3.4-rc.1' }, { version: '5.3.5-rc.1' }, { script: 'scripts/verify-installer-lifecycle.mjs' }, { code: 2 }, { signal: 'SIGTERM' },
    { output: 'AssertionError: streamed Chinese text must be complete and ordered' },
    { output: timingFailure.output.replace('46.79999999999927', '47.1') },
    { output: timingFailure.output.replace('46.79999999999927', 'null') },
    { output: timingFailure.output.replace('"limitMs":35', '"limitMs":50') },
    { output: timingFailure.output + '\n' + timingFailure.output }]) {
    for (const fixture of [timingFailure, current]) {
      assert.equal(acceptedReleaseIssue({ ...fixture, ...override }), null, JSON.stringify(override))
    }
  }
})

test('the approved Windows releases accept only a bounded fallback on the first idle Runtime stop', () => {
  const failure = {
    version: '5.3.4', platform: 'win32', initialShutdownApproved: true,
    script: 'scripts/verify-runtime-provider.mjs', code: 1, signal: null,
    output: 'AssertionError [ERR_ASSERTION]: DSH_INITIAL_RUNTIME_STOP {"outcomes":["fallback","acknowledged","acknowledged"],"elapsedMs":[4598,1076,1075]}',
  }
  assert.equal(acceptedReleaseIssue(failure), 'DSH-530-WINDOWS-INITIAL-STOP')
  const current = { ...failure, version: '5.3.5', output: failure.output.replace('4598,1076,1075', '4630,1109,1094') }
  assert.equal(acceptedReleaseIssue(current), 'DSH-530-WINDOWS-INITIAL-STOP')
  for (const override of [{ initialShutdownApproved: false }, { version: '5.3.6' }, { version: '5.3.5-rc.1' }, { platform: 'linux' }, { platform: 'darwin' },
    { script: 'scripts/verify-update-shutdown.mjs' }, { signal: 'SIGTERM' }, { code: 2 },
    { output: failure.output.replace('4598', '5000') }, { output: failure.output.replace('1075', 'null') },
    { output: failure.output.replace('"acknowledged","acknowledged"', '"fallback","acknowledged"') },
    { output: failure.output.replace('"fallback","acknowledged"', '"acknowledged","fallback"') },
    { output: failure.output + '\n' + failure.output }]) {
    for (const fixture of [failure, current]) {
      assert.equal(acceptedReleaseIssue({ ...fixture, ...override }), null, JSON.stringify(override))
    }
  }
})
