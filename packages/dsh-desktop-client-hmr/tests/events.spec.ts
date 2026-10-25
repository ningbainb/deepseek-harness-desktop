import { expect, test } from 'vitest'
import { parseFrame, createSseDecoder } from '../src/core/events.ts'

test.each([null, [], {}, { type: 'rebuilt', id: '', rev: 'one' }, { type: 'rebuilt', id: 'one', rev: 1 },
  { type: 'graph', graph: [] }, { type: 'graph', graph: null }].map(value => [value]))('rejects malformed known frames: %j', value => {
  expect(parseFrame(value)).toEqual({ kind: 'invalid' })
})

test('ignores unknown frame types but passes graph validation to the public controller', () => {
  expect(parseFrame({ type: 'future', private: true })).toEqual({ kind: 'unknown' })
  expect(parseFrame({ type: 'rebuilt', id: 'package', rev: 'revision' })).toEqual({ kind: 'frame',
    frame: { type: 'rebuilt', id: 'package', rev: 'revision' } })
  expect(parseFrame({ type: 'graph', graph: { release: 'future format' } })).toEqual({ kind: 'frame',
    frame: { type: 'graph', graph: { release: 'future format' } } })
})

test('decodes split CRLF, comments, multiple data lines and ignores named non-message events', () => {
  const received: string[] = []
  const decoder = createSseDecoder(data => received.push(data))
  decoder.push(': connected\r')
  decoder.push('\ndata: {"type":\r\ndata: "future"}\r\n\r')
  decoder.push('\nevent: secret\ndata: ignore\n\ndata: final\n\n')
  expect(received).toEqual(['{"type":\n"future"}', 'final'])
})

test('rejects unbounded SSE input before another event can accumulate', () => {
  const decoder = createSseDecoder(() => {})
  expect(() => decoder.push('data: ' + 'x'.repeat(1_048_576))).toThrow(/limit/u)
})
