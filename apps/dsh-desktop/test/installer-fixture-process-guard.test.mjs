import assert from 'node:assert/strict'
import test from 'node:test'
test('isolated installer fixtures refuse any existing product process without killing it', async () => {
  const { productProcessIdsFromTasklist } = await import('../scripts/installer-fixture-process-guard.mjs')
  assert.deepEqual(productProcessIdsFromTasklist('"Image Name","PID"\r\n"DeepSeek Harness Desktop.exe","1234","Console","1","10 K"\r\n"node.exe","5678","Console","1","10 K"'), [1234])
  assert.deepEqual(productProcessIdsFromTasklist('INFO: No tasks are running which match the specified criteria.'), [])
  assert.deepEqual(productProcessIdsFromTasklist('"deepseek harness desktop.exe","42","Console","1","10 K"'), [42])
})
