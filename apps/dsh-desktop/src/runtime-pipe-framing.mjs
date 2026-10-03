import { createHash, randomBytes } from 'node:crypto'

export const MAX_FRAME_BYTES = 512 * 1024
export const MAX_MESSAGE_BYTES = 32 * 1024 * 1024
export const CHUNK_BYTES = 192 * 1024
const FRAGMENT_TYPES = new Set(['message-start', 'message-chunk', 'message-end'])
const MESSAGE_TYPES = new Set(['stream-open', 'stream-item', 'duplex-open', 'duplex-input', 'duplex-output'])
const writeQueues = new WeakMap()

export class RuntimePipeTransportError extends Error {
  constructor(code, bytes, limit) {
    super(`runtime pipe ${code}`)
    this.name = 'RuntimePipeTransportError'
    this.code = code
    if (bytes !== undefined) this.bytes = bytes
    if (limit !== undefined) this.limit = limit
  }
}

function invalidFragment() {
  return new RuntimePipeTransportError('transport/invalid-fragment')
}

export function createFrameReader(socket) {
  const frames = []
  const waiters = []
  let buffered = Buffer.alloc(0)
  let failure
  let ended = false
  let fragmentsAllowed = false
  let message
  let queuedBytes = 0
  const dequeue = () => {
    const entry = frames.shift()
    queuedBytes -= entry.bytes
    if (queuedBytes < MAX_MESSAGE_BYTES) socket.resume()
    return entry.frame
  }
  const enqueue = (frame, bytes) => {
    queuedBytes += bytes
    if (queuedBytes > 2 * MAX_MESSAGE_BYTES) {
      throw new RuntimePipeTransportError('transport/queue-too-large', queuedBytes, 2 * MAX_MESSAGE_BYTES)
    }
    frames.push({ frame, bytes })
    if (queuedBytes >= MAX_MESSAGE_BYTES) socket.pause()
  }
  const clearMessage = () => {
    message = undefined
  }
  const settle = () => {
    while (waiters.length > 0 && (frames.length > 0 || failure || ended)) {
      const waiter = waiters.shift()
      if (failure) waiter.reject(failure)
      else if (frames.length > 0) waiter.resolve(dequeue())
      else waiter.resolve(undefined)
    }
  }
  const fail = error => {
    failure = error
    clearMessage()
    buffered = Buffer.alloc(0)
    frames.length = 0
    queuedBytes = 0
    socket.destroy(error)
    settle()
  }
  const accept = (frame, frameBytes) => {
    if (frame === null || typeof frame !== 'object' || Array.isArray(frame)) throw invalidFragment()
    if (!FRAGMENT_TYPES.has(frame.type)) {
      if (message !== undefined) throw invalidFragment()
      enqueue(frame, frameBytes)
      return
    }
    if (!fragmentsAllowed) throw invalidFragment()
    if (frame.type === 'message-start') {
      if (message !== undefined
        || typeof frame.id !== 'string' || !/^[a-f0-9]{32}$/u.test(frame.id)
        || !Number.isSafeInteger(frame.bytes) || frame.bytes < MAX_FRAME_BYTES
        || frame.bytes > MAX_MESSAGE_BYTES
        || frame.count !== Math.ceil(frame.bytes / CHUNK_BYTES)
        || typeof frame.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(frame.sha256)) throw invalidFragment()
      message = { ...frame, chunks: [], received: 0 }
      return
    }
    if (message === undefined || frame.id !== message.id) throw invalidFragment()
    if (frame.type === 'message-chunk') {
      if (frame.index !== message.chunks.length || frame.index >= message.count
        || typeof frame.body !== 'string' || frame.body.length > Math.ceil(CHUNK_BYTES / 3) * 4) throw invalidFragment()
      const chunk = Buffer.from(frame.body, 'base64')
      if (chunk.toString('base64') !== frame.body
        || chunk.length !== Math.min(CHUNK_BYTES, message.bytes - message.received)) throw invalidFragment()
      message.received += chunk.length
      message.chunks.push(chunk)
      return
    }
    if (message.received !== message.bytes || message.chunks.length !== message.count) throw invalidFragment()
    const bytes = Buffer.concat(message.chunks, message.bytes)
    if (createHash('sha256').update(bytes).digest('hex') !== message.sha256) throw invalidFragment()
    let decoded
    try {
      decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    } catch {
      throw invalidFragment()
    }
    if (decoded === null || typeof decoded !== 'object' || !MESSAGE_TYPES.has(decoded.type)) throw invalidFragment()
    clearMessage()
    enqueue(decoded, bytes.length)
  }
  socket.on('data', chunk => {
    if (failure || ended) return
    buffered = Buffer.concat([buffered, chunk])
    try {
      for (;;) {
        const newline = buffered.indexOf(10)
        if (newline === -1) break
        const line = buffered.subarray(0, newline)
        buffered = buffered.subarray(newline + 1)
        if (line.length === 0) continue
        if (line.length + 1 > MAX_FRAME_BYTES) {
          throw new RuntimePipeTransportError('transport/frame-too-large', line.length + 1, MAX_FRAME_BYTES)
        }
        let frame
        try { frame = JSON.parse(line.toString('utf8')) } catch {
          throw new RuntimePipeTransportError('transport/invalid-json')
        }
        accept(frame, line.length)
      }
      if (buffered.length >= MAX_FRAME_BYTES) {
        throw new RuntimePipeTransportError('transport/frame-too-large', buffered.length + 1, MAX_FRAME_BYTES)
      }
    } catch (error) {
      fail(error)
      return
    }
    settle()
  })
  socket.once('error', error => {
    failure = error
    clearMessage()
    buffered = Buffer.alloc(0)
    frames.length = 0
    queuedBytes = 0
    settle()
  })
  const end = () => {
    ended = true
    if (!failure && (message !== undefined || buffered.length > 0)) {
      failure = new RuntimePipeTransportError('transport/message-truncated')
    }
    if (!failure && !socket.readableEnded) failure = new RuntimePipeTransportError('transport/closed')
    clearMessage()
    if (failure) {
      buffered = Buffer.alloc(0)
      frames.length = 0
      queuedBytes = 0
    }
    settle()
  }
  socket.once('end', end)
  socket.once('close', end)
  const readFrame = () => {
    if (failure) return Promise.reject(failure)
    if (socket.destroyed && !socket.readableEnded) return Promise.reject(socket.errored ?? new RuntimePipeTransportError('transport/closed'))
    if (frames.length > 0) return Promise.resolve(dequeue())
    if (ended) return Promise.resolve(undefined)
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }))
  }
  readFrame.enableFragments = () => { fragmentsAllowed = true }
  return readFrame
}

async function writePhysicalFrame(socket, frame) {
  const bytes = Buffer.from(`${JSON.stringify(frame)}\n`)
  if (bytes.length > MAX_FRAME_BYTES) {
    throw new RuntimePipeTransportError('transport/frame-too-large', bytes.length, MAX_FRAME_BYTES)
  }
  if (socket.destroyed || socket.writableEnded) throw new RuntimePipeTransportError('transport/closed')
  if (socket.write(bytes)) return
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.removeListener('drain', drained)
      socket.removeListener('error', failed)
      socket.removeListener('close', closed)
    }
    const drained = () => { cleanup(); resolve() }
    const failed = error => { cleanup(); reject(error) }
    const closed = () => failed(new RuntimePipeTransportError('transport/closed'))
    socket.once('drain', drained)
    socket.once('error', failed)
    socket.once('close', closed)
  })
}

export function writeFrame(socket, frame) {
  const pending = (writeQueues.get(socket) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const bytes = Buffer.from(JSON.stringify(frame))
    if (bytes.length + 1 <= MAX_FRAME_BYTES) return writePhysicalFrame(socket, frame)
    if (!MESSAGE_TYPES.has(frame.type)) {
      throw new RuntimePipeTransportError('transport/frame-too-large', bytes.length + 1, MAX_FRAME_BYTES)
    }
    if (bytes.length > MAX_MESSAGE_BYTES) {
      throw new RuntimePipeTransportError('transport/message-too-large', bytes.length, MAX_MESSAGE_BYTES)
    }
    const id = randomBytes(16).toString('hex')
    try {
      await writePhysicalFrame(socket, {
        type: 'message-start', id, bytes: bytes.length,
        count: Math.ceil(bytes.length / CHUNK_BYTES),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
      for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
        await writePhysicalFrame(socket, {
          type: 'message-chunk', id, index: offset / CHUNK_BYTES,
          body: bytes.subarray(offset, offset + CHUNK_BYTES).toString('base64'),
        })
      }
      await writePhysicalFrame(socket, { type: 'message-end', id })
    } catch (error) {
      socket.destroy()
      throw error
    }
  })
  writeQueues.set(socket, pending)
  return pending
}
