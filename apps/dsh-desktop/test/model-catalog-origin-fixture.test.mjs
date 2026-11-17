import assert from 'node:assert/strict'
import test from 'node:test'
import { isValueModeCatalogInitiator } from '../scripts/model-catalog-origin-fixture.mjs'

const url = 'dsh-runtime://app/plugins/??@deepseek-ai/dsh-api-remotes/client.js,@linxin666/dsh-value-mode/client.js'
test('the actual Promise.then advisory initiator is counted through its async parent', () => {
  assert.equal(isValueModeCatalogInitiator({ callFrames: [{ functionName: 'invokeSelected', url }],
    parent: { description: 'Promise.then', callFrames: [{ functionName: 'fetchModels', url }] } }), true)
})
test('native readers and refreshes in the same shared Models document remain separately counted', () => {
  for (const functionName of ['read', 'readCatalog', 'load', 'refresh', 'refreshIfLoaded']) {
    assert.equal(isValueModeCatalogInitiator({ callFrames: [{ functionName, url }],
      parent: { callFrames: [{ functionName: 'refreshModels', url }] } }), false)
  }
})
test('an unrelated fetchModels function and absent initiator cannot impersonate the advisory loader', () => {
  assert.equal(isValueModeCatalogInitiator({ callFrames: [{ functionName: 'fetchModels', url: 'https://unrelated.example/client.js' }] }), false)
  assert.equal(isValueModeCatalogInitiator(undefined), false)
})
test('malformed cyclic async stacks terminate without reporting a read', () => {
  const stack = { callFrames: [] }; stack.parent = stack
  assert.equal(isValueModeCatalogInitiator(stack), false)
})
