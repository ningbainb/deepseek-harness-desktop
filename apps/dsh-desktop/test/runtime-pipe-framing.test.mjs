import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import {
  CHUNK_BYTES, createFrameReader, MAX_FRAME_BYTES, MAX_MESSAGE_BYTES, writeFrame,
} from '../src/runtime-pipe-framing.mjs'

function fragments(value) {
  const bytes = Buffer.from(JSON.stringify(value))
  const id = 'a'.repeat(32)
  const frames = [{ type: 'message-start', id, bytes: bytes.length,
    count: Math.ceil(bytes.length / CHUNK_BYTES), sha256: createHash('sha256').update(bytes).digest('hex') }]
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    frames.push({ type: 'message-chunk', id, index: offset / CHUNK_BYTES,
      body: bytes.subarray(offset, offset + CHUNK_BYTES).toString('base64') })
  }
  frames.push({ type: 'message-end', id })
  return frames
}

function fixture(context, authenticated = true) {
  const socket = new PassThrough()
  const reader = createFrameReader(socket)
  if (authenticated) reader.enableFragments()
  context.after(() => socket.destroy())
  return { socket, reader, send: frames => socket.write(frames.map(frame => JSON.stringify(frame)).join('\n') + '\n') }
}

const snapshot = { type: 'duplex-output', value: { type: 'snapshot', content: '历史'.repeat(200_000) } }

test('fragmented frames preserve unicode and each physical frame remains bounded', async context => {
  const { socket, reader } = fixture(context)
  const physicalLines = []
  socket.on('data', bytes => physicalLines.push(...bytes.toString().trimEnd().split('\n')))
  await writeFrame(socket, snapshot)
  assert.deepEqual(await reader(), snapshot)
  assert.ok(physicalLines.length > 3)
  for (const line of physicalLines) assert.ok(Buffer.byteLength(line) + 1 <= MAX_FRAME_BYTES)
})

test('concurrent large writes cannot interleave message fragments', async context => {
  const { socket, reader } = fixture(context)
  const values = [snapshot, { type: 'duplex-output', value: 2 }, snapshot]
  await Promise.all(values.map(value => writeFrame(socket, value)))
  for (const value of values) assert.deepEqual(await reader(), value)
})

const malformed = {
  unauthenticated: frames => frames,
  'out-of-order': frames => { frames[1].index = 1; return frames },
  duplicate: frames => { frames.splice(2, 0, frames[1]); return frames },
  'missing-chunk': frames => { frames.splice(1, 1); return frames },
  'incorrect-size': frames => { frames[0].bytes -= 1; return frames },
  'invalid-base64': frames => { frames[1].body += '!'; return frames },
  'wrong-id': frames => { frames[1].id = 'b'.repeat(32); return frames },
  'hash-mismatch': frames => { frames[0].sha256 = '0'.repeat(64); return frames },
  'excessive-allocation': frames => { frames[0].bytes = MAX_MESSAGE_BYTES + 1; return frames },
  nested: frames => { frames.splice(1, 0, frames[0]); return frames },
  'interleaved-control': frames => { frames.splice(1, 0, { type: 'duplex-end' }); return frames },
  'unsupported-message': () => fragments({ type: 'hello', value: snapshot }),
}
for (const [name, corrupt] of Object.entries(malformed)) {
  test(`fragment reader rejects ${name}`, async context => {
    const { reader, send } = fixture(context, name !== 'unauthenticated')
    send(corrupt(fragments(snapshot)))
    await assert.rejects(reader(), /transport\/invalid-fragment/u)
  })
}

test('fragment reader rejects partial message disconnect without yielding history', async context => {
  const { socket, reader, send } = fixture(context)
  send(fragments(snapshot).slice(0, 2))
  socket.end()
  await assert.rejects(reader(), /transport\/message-truncated/u)
})

test('fragment reader rejects truncated physical JSON', async context => {
  const { socket, reader } = fixture(context)
  socket.end('{"type":')
  await assert.rejects(reader(), /transport\/message-truncated/u)
})

test('fragment reader preserves the physical size guard including trailing partial input', async context => {
  const { socket, reader } = fixture(context)
  socket.write(Buffer.concat([Buffer.from('{"type":"item"}\n'), Buffer.alloc(MAX_FRAME_BYTES, 120)]))
  await assert.rejects(reader(), /transport\/frame-too-large/u)
})

test('fragment writer rejects oversized unfragmentable control frames', async context => {
  const { socket } = fixture(context)
  await assert.rejects(writeFrame(socket, { type: 'hello', value: snapshot }), /transport\/frame-too-large/u)
})

test('fragment cancellation rejects pending writes and clears partial history', async context => {
  const { socket, reader, send } = fixture(context)
  send(fragments(snapshot).slice(0, 2))
  socket.destroy(new Error('synthetic cancellation'))
  await assert.rejects(reader(), /synthetic cancellation|transport\/closed/u)
  await assert.rejects(writeFrame(socket, snapshot), /transport\/closed/u)
})

test('cancellation discards complete queued snapshots rather than yielding late history', async context => {
  const { socket, reader, send } = fixture(context)
  send(fragments(snapshot))
  socket.destroy(new Error('cancelled history'))
  await assert.rejects(reader(), /cancelled history|transport\/closed/u)
})

test('reader resumes after its 32 MiB queued high water mark without losing complete frames', async context => {
  const { socket, reader, send } = fixture(context)
  const value = { type: 'duplex-output', value: 'q'.repeat(400 * 1024) }
  const count = 85
  send(Array.from({ length: count }, () => value))
  assert.equal(socket.isPaused(), true)
  for (let index = 0; index < count; index += 1) assert.deepEqual(await reader(), value)
  assert.equal(socket.isPaused(), false)
  socket.end()
  assert.equal(await reader(), undefined)
})

test('FIN during a paused queue with a partial next message fails without yielding partial history', async context => {
  const { socket, reader, send } = fixture(context)
  const completed = { type: 'duplex-output', value: 'q'.repeat(400 * 1024) }
  send([...Array.from({ length: 85 }, () => completed), ...fragments(snapshot).slice(0, 2)])
  assert.equal(socket.isPaused(), true)
  socket.end()
  await assert.rejects(async () => {
    for (;;) {
      const frame = await reader()
      assert.deepEqual(frame, completed, 'no part of the truncated snapshot may be yielded')
    }
  }, /transport\/message-truncated/u)
})
