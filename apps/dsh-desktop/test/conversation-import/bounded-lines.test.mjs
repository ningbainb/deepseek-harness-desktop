import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createInterface } from 'node:readline'
import test from 'node:test'

import { createBoundedLineStream } from '../../src/conversation-import/bounded-lines.mjs'

test('bounded line stream never forwards an oversized JSON line in full', async () => {
  const source = Readable.from([
    Buffer.from('{"ok":1}\n', 'utf8'),
    Buffer.from('x'.repeat(100) + '\n', 'utf8'),
    Buffer.from('{"ok":2}', 'utf8'),
  ])
  const bounded = createBoundedLineStream(source, { maxLineBytes: 32 })
  const lines = []
  const reader = createInterface({ input: bounded, crlfDelay: Infinity })
  for await (const line of reader) lines.push(line)

  assert.deepEqual(lines, ['{"ok":1}', '', '{"ok":2}'])
  assert.equal(bounded.oversizedLineCount, 1)
})
