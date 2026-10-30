import assert from 'node:assert/strict'
import test from 'node:test'
import { createProfileDirectoryPreparer } from '../src/profile-directory-preparation.mjs'

test('concurrent package links share one recursive mkdir per parent within an invocation', async () => {
  const calls = []
  let release
  const pending = new Promise(resolve => { release = resolve })
  const prepare = createProfileDirectoryPreparer(async (path, options) => {
    calls.push({ path, options })
    await pending
  })
  const requests = Array.from({ length: 300 }, (_, index) => prepare(index % 3 === 0 ? 'profile/node_modules' : 'profile/node_modules/@deepseek-ai'))
  await Promise.resolve()
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map(call => call.options), [{ recursive: true }, { recursive: true }])
  release()
  await Promise.all(requests)
  await prepare('profile/node_modules/@deepseek-ai')
  assert.equal(calls.length, 2, 'Later links in the same invocation reuse its settled directory preparation')
})

test('a subsequent profile invocation prepares directories again rather than trusting stale state', async () => {
  const calls = []
  const mkdir = async path => { calls.push(path) }
  await createProfileDirectoryPreparer(mkdir)('profile/node_modules')
  await createProfileDirectoryPreparer(mkdir)('profile/node_modules')
  assert.deepEqual(calls, ['profile/node_modules', 'profile/node_modules'])
})

for (const code of ['EACCES', 'EPERM', 'ENOTDIR']) {
  test(`shared directory preparation preserves the original ${code} error for every link`, async () => {
    const failure = Object.assign(new Error('fixture mkdir failure'), { code })
    let calls = 0
    const prepare = createProfileDirectoryPreparer(async () => { calls++; throw failure })
    const results = await Promise.allSettled([prepare('same-parent'), prepare('same-parent')])
    assert.equal(calls, 1)
    for (const result of results) {
      assert.equal(result.status, 'rejected')
      assert.equal(result.reason, failure)
    }
    let nextCalls = 0
    await createProfileDirectoryPreparer(async () => { nextCalls++ })('same-parent')
    assert.equal(nextCalls, 1, 'A later invocation retries after permissions or filesystem state changes')
  })
}
