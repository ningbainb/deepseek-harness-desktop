import { randomBytes } from 'node:crypto'
import { createServer, createConnection } from 'node:net'
import { join, posix } from 'node:path'
import { tmpdir } from 'node:os'
import { CHUNK_BYTES, createFrameReader, MAX_MESSAGE_BYTES, RuntimePipeTransportError, writeFrame } from './runtime-pipe-framing.mjs'

export const RUNTIME_PIPE_PROTOCOL_VERSION = 3
export const RUNTIME_PIPE_ADDRESS_ENV = 'DSH_DESKTOP_PIPE_ADDRESS'
export const RUNTIME_PIPE_TOKEN_ENV = 'DSH_DESKTOP_PIPE_TOKEN'
export const RUNTIME_PIPE_GENERATION_ENV = 'DSH_DESKTOP_PIPE_GENERATION'
export const RUNTIME_PIPE_READY_LINE = 'dsh desktop pipe: ready'

const MAX_BODY_BYTES = 320 * 1024 * 1024
// Darwin sockaddr_un.sun_path is only 104 bytes including its terminator.
// Leave headroom for Node's native conversion and non-ASCII temporary paths.
export const MAX_POSIX_PIPE_ADDRESS_BYTES = 100
const POSIX_PIPE_FALLBACK_DIRECTORY = '/tmp'

function assertToken(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/u.test(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value
}

function assertAddress(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 512 || /[\r\n\0]/u.test(value)) {
    throw new TypeError('runtime pipe address is invalid')
  }
  return value
}

export function createRuntimePipeIdentity({ platform = process.platform, temporaryDirectory = tmpdir() } = {}) {
  const name = `dsh-desktop-${randomBytes(24).toString('hex')}`
  const socketName = `${name}.sock`
  const preferredAddress = posix.join(String(temporaryDirectory).replaceAll('\\', '/'), socketName)
  const posixAddress = Buffer.byteLength(preferredAddress, 'utf8') <= MAX_POSIX_PIPE_ADDRESS_BYTES
    ? preferredAddress
    : posix.join(POSIX_PIPE_FALLBACK_DIRECTORY, socketName)
  return Object.freeze({
    address: platform === 'win32' ? `\\\\.\\pipe\\${name}` : posixAddress,
    token: randomBytes(32).toString('base64url'),
    generation: randomBytes(24).toString('base64url'),
  })
}

function headersObject(headers) {
  return Object.fromEntries(new Headers(headers).entries())
}

async function connect(identity, signal) {
  assertAddress(identity.address)
  assertToken(identity.token, 'runtime pipe token')
  assertToken(identity.generation, 'runtime pipe generation')
  if (signal?.aborted) throw signal.reason ?? new Error('runtime pipe operation was cancelled')
  const socket = createConnection(identity.address)
  const abort = () => socket.destroy(signal.reason instanceof Error ? signal.reason : new Error('runtime pipe operation was cancelled'))
  signal?.addEventListener('abort', abort, { once: true })
  try {
    await new Promise((resolve, reject) => {
      const connected = () => {
        socket.removeListener('error', failed)
        resolve()
      }
      const failed = (error) => {
        socket.removeListener('connect', connected)
        reject(error)
      }
      socket.once('connect', connected)
      socket.once('error', failed)
    })
    const readFrame = createFrameReader(socket)
    await writeFrame(socket, {
      type: 'hello',
      protocolVersion: RUNTIME_PIPE_PROTOCOL_VERSION,
      token: identity.token,
      generation: identity.generation,
    })
    const hello = await readFrame()
    if (
      hello?.type !== 'hello'
      || hello.protocolVersion !== RUNTIME_PIPE_PROTOCOL_VERSION
      || hello.generation !== identity.generation
      || typeof hello.runtimeVersion !== 'string'
      || typeof hello.profile !== 'string'
    ) {
      throw new Error('runtime pipe identity handshake failed')
    }
    readFrame.enableFragments()
    return { socket, readFrame, hello, dispose: () => signal?.removeEventListener('abort', abort) }
  } catch (error) {
    signal?.removeEventListener('abort', abort)
    socket.destroy()
    throw error
  }
}

function appendChunk(chunks, encoded, state) {
  if (typeof encoded !== 'string') throw new Error('runtime pipe body chunk is invalid')
  const chunk = Buffer.from(encoded, 'base64')
  state.bytes += chunk.length
  if (state.bytes > MAX_BODY_BYTES) throw new Error('runtime pipe body exceeded the limit')
  chunks.push(chunk)
}

function createValueQueue() {
  const values = []
  const waiters = []
  let ended = false
  let failure
  let queuedBytes = 0
  const dequeue = () => {
    const entry = values.shift()
    queuedBytes -= entry.bytes
    return entry.value
  }
  const settle = () => {
    while (waiters.length > 0 && (values.length > 0 || ended || failure !== undefined)) {
      const waiter = waiters.shift()
      if (values.length > 0) waiter.resolve({ done: false, value: dequeue() })
      else if (failure !== undefined) waiter.reject(failure)
      else waiter.resolve({ done: true, value: undefined })
    }
  }
  return {
    push(value) {
      if (ended || failure !== undefined) return
      const bytes = Buffer.byteLength(JSON.stringify(value))
      if (queuedBytes + bytes > MAX_MESSAGE_BYTES) {
        throw new RuntimePipeTransportError('transport/input-queue-too-large', queuedBytes + bytes, MAX_MESSAGE_BYTES)
      }
      queuedBytes += bytes
      values.push({ value, bytes })
      settle()
    },
    end() { ended = true; settle() },
    fail(error) { failure = error; values.length = 0; queuedBytes = 0; settle() },
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (values.length > 0) return Promise.resolve({ done: false, value: dequeue() })
            if (failure !== undefined) return Promise.reject(failure)
            if (ended) return Promise.resolve({ done: true, value: undefined })
            return new Promise((resolve, reject) => waiters.push({ resolve, reject }))
          },
        }
      },
    },
  }
}

export class RuntimePipeClient {
  constructor(identity) {
    this.identity = Object.freeze({
      address: assertAddress(identity?.address),
      token: assertToken(identity?.token, 'runtime pipe token'),
      generation: assertToken(identity?.generation, 'runtime pipe generation'),
    })
    this.lastHello = undefined
  }

  async probe(signal) {
    const connection = await connect(this.identity, signal)
    this.lastHello = Object.freeze({ ...connection.hello })
    connection.dispose()
    connection.socket.end()
    return this.lastHello
  }

  async fetch(input, init = {}) {
    const request = input instanceof Request ? input : new Request(input, init)
    const connection = await connect(this.identity, request.signal)
    this.lastHello = Object.freeze({ ...connection.hello })
    let handedOff = false
    const close = () => {
      connection.dispose()
      connection.socket.end()
    }
    try {
      await writeFrame(connection.socket, {
        type: 'request-start',
        method: request.method,
        url: request.url,
        headers: headersObject(request.headers),
      })
      if (request.body !== null) {
        const reader = request.body.getReader()
        let total = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > MAX_BODY_BYTES) throw new Error('runtime pipe request body exceeded the limit')
          for (let offset = 0; offset < value.byteLength; offset += CHUNK_BYTES) {
            await writeFrame(connection.socket, {
              type: 'request-chunk',
              body: Buffer.from(value.subarray(offset, offset + CHUNK_BYTES)).toString('base64'),
            })
          }
        }
      }
      await writeFrame(connection.socket, { type: 'request-end' })
      for (;;) {
        const frame = await connection.readFrame()
        if (frame === undefined) throw new Error('runtime pipe closed before the response completed')
        if (frame.type === 'response-start') {
          if (!Number.isInteger(frame.status)) throw new Error('runtime pipe response metadata is missing')
          if (request.method === 'HEAD' || frame.status === 204 || frame.status === 304) {
            for (;;) {
              const next = await connection.readFrame()
              if (next === undefined) throw new Error('runtime pipe closed before the response completed')
              if (next.type === 'response-end') break
              if (next.type === 'error') throw new Error(typeof next.message === 'string' ? next.message : 'runtime pipe operation failed')
              if (next.type !== 'response-chunk') throw new Error('runtime pipe response frame is invalid')
            }
            return new Response(null, { status: frame.status, headers: frame.headers })
          }
          const bodyState = { bytes: 0 }
          const stream = new ReadableStream({
            async pull(controller) {
              try {
                const next = await connection.readFrame()
                if (next === undefined) throw new Error('runtime pipe closed before the response completed')
                if (next.type === 'response-chunk') {
                  const chunks = []
                  appendChunk(chunks, next.body, bodyState)
                  controller.enqueue(chunks[0])
                  return
                }
                if (next.type === 'response-end') {
                  controller.close()
                  close()
                  return
                }
                if (next.type === 'error') {
                  throw new Error(typeof next.message === 'string' ? next.message : 'runtime pipe operation failed')
                }
                throw new Error('runtime pipe response frame is invalid')
              } catch (error) {
                controller.error(error)
                connection.socket.destroy()
                connection.dispose()
              }
            },
            cancel(reason) {
              connection.socket.destroy(reason instanceof Error ? reason : undefined)
              connection.dispose()
            },
          })
          handedOff = true
          return new Response(stream, { status: frame.status, headers: frame.headers })
        }
        if (frame.type === 'error') {
          throw new Error(typeof frame.message === 'string' ? frame.message : 'runtime pipe operation failed')
        }
        throw new Error('runtime pipe response metadata is missing')
      }
    } finally {
      if (!handedOff) close()
    }
  }

  openStream(endpoint, payload, signal) {
    const identity = this.identity
    return (async function * () {
      const connection = await connect(identity, signal)
      try {
        await writeFrame(connection.socket, { type: 'stream-open', endpoint, payload })
        for (;;) {
          const frame = await connection.readFrame()
          if (frame === undefined) throw new Error('runtime pipe closed before the stream completed')
          if (frame.type === 'stream-item') yield frame.value
          else if (frame.type === 'stream-end') return
          else if (frame.type === 'error') throw new Error(typeof frame.message === 'string' ? frame.message : 'runtime pipe stream failed')
        }
      } finally {
        connection.dispose()
        connection.socket.end()
      }
    })()
  }

  openDuplex(endpoint, payload, signal) {
    const identity = this.identity
    const cancellation = new AbortController()
    const activeSignal = signal === undefined ? cancellation.signal : AbortSignal.any([signal, cancellation.signal])
    let connection
    let closed = false
    let writeQueue = Promise.resolve()
    const opened = connect(identity, activeSignal).then(async (value) => {
      connection = value
      await writeFrame(value.socket, { type: 'duplex-open', endpoint, payload })
      return value
    })
    const close = async () => {
      if (closed) return
      closed = true
      const active = await opened
      await writeQueue
      await writeFrame(active.socket, { type: 'duplex-input-end' })
    }
    return {
      write(value) {
        if (closed) return Promise.reject(new Error('runtime duplex input is closed'))
        writeQueue = writeQueue.then(() => opened).then(active => writeFrame(active.socket, { type: 'duplex-input', value }))
        return writeQueue
      },
      close,
      cancel(reason) {
        closed = true
        cancellation.abort(reason instanceof Error ? reason : new Error('runtime duplex operation was cancelled'))
        connection?.dispose()
        void opened.catch(() => {})
      },
      async *[Symbol.asyncIterator]() {
        const active = await opened
        try {
          for (;;) {
            const frame = await active.readFrame()
            if (frame === undefined) throw new Error('runtime pipe closed before the duplex stream completed')
            if (frame.type === 'duplex-output') yield frame.value
            else if (frame.type === 'duplex-end') return
            else if (frame.type === 'error') throw new Error(typeof frame.message === 'string' ? frame.message : 'runtime pipe duplex failed')
            else throw new Error('runtime pipe duplex frame is invalid')
          }
        } finally {
          active.dispose()
          active.socket.end()
        }
      },
    }
  }
}

function failureDiagnostic(error, operation, endpoint) {
  return {
    correlationId: randomBytes(12).toString('hex'),
    code: error instanceof RuntimePipeTransportError ? error.code : 'transport/host-failure',
    operation: ['request-start', 'stream-open', 'duplex-open'].includes(operation) ? operation : 'handshake',
    endpoint: ['session/follow', '$events', 'websocket'].includes(endpoint) ? endpoint : 'other',
    ...(error instanceof RuntimePipeTransportError ? { bytes: error.bytes, limit: error.limit } : {}),
  }
}

async function sendResponse(socket, response) {
  await writeFrame(socket, {
    type: 'response-start',
    status: response.status,
    headers: headersObject(response.headers),
  })
  if (response.body !== null) {
    const reader = response.body.getReader()
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BODY_BYTES) throw new Error('runtime pipe response body exceeded the limit')
      for (let offset = 0; offset < value.byteLength; offset += CHUNK_BYTES) {
        await writeFrame(socket, {
          type: 'response-chunk',
          body: Buffer.from(value.subarray(offset, offset + CHUNK_BYTES)).toString('base64'),
        })
      }
    }
  }
  await writeFrame(socket, { type: 'response-end' })
}

export async function createRuntimePipeServer({ identity, runtimeVersion, profile, fetch: fetchHandler, openStream, openDuplex, onFailure }) {
  const address = assertAddress(identity?.address)
  const token = assertToken(identity?.token, 'runtime pipe token')
  const generation = assertToken(identity?.generation, 'runtime pipe generation')
  if (typeof runtimeVersion !== 'string' || runtimeVersion.length === 0) throw new TypeError('runtime version is required')
  if (typeof profile !== 'string' || profile.length === 0) throw new TypeError('runtime profile is required')
  if (typeof fetchHandler !== 'function' || typeof openStream !== 'function') throw new TypeError('runtime pipe handlers are required')

  const sockets = new Set()
  const server = createServer((socket) => {
    sockets.add(socket)
    const abort = new AbortController()
    let operationCompleted = false
    socket.once('close', () => {
      sockets.delete(socket)
      if (!operationCompleted) abort.abort(new Error('runtime pipe peer disconnected'))
    })
    const complete = () => {
      operationCompleted = true
      socket.end()
    }
    const readFrame = createFrameReader(socket)
    void (async () => {
      let operation
      let endpoint
      try {
        const hello = await readFrame()
        if (
          hello?.type !== 'hello'
          || hello.protocolVersion !== RUNTIME_PIPE_PROTOCOL_VERSION
          || hello.token !== token
          || hello.generation !== generation
        ) {
          throw new Error('runtime pipe authentication failed')
        }
        readFrame.enableFragments()
        await writeFrame(socket, {
          type: 'hello',
          protocolVersion: RUNTIME_PIPE_PROTOCOL_VERSION,
          runtimeVersion,
          profile,
          generation,
        })
        const start = await readFrame()
        if (start === undefined) return
        operation = start.type
        endpoint = start.endpoint
        if (start.type === 'request-start') {
          const bodyState = { bytes: 0 }
          const requestBody = start.method === 'GET' || start.method === 'HEAD' ? undefined : new ReadableStream({
            async pull(controller) {
              try {
                const frame = await readFrame()
                if (frame === undefined) throw new Error('runtime pipe request ended early')
                if (frame.type === 'request-chunk') {
                  const chunks = []
                  appendChunk(chunks, frame.body, bodyState)
                  controller.enqueue(chunks[0])
                  return
                }
                if (frame.type === 'request-end') {
                  controller.close()
                  return
                }
                throw new Error('runtime pipe request frame is invalid')
              } catch (error) {
                controller.error(error)
              }
            },
          })
          const response = await fetchHandler(new Request(start.url, {
            method: start.method,
            headers: start.headers,
            body: requestBody,
            ...(requestBody === undefined ? {} : { duplex: 'half' }),
            signal: abort.signal,
          }))
          await sendResponse(socket, response)
          complete()
          return
        }
        if (start.type === 'stream-open') {
          const source = await openStream(start.endpoint, start.payload, abort.signal)
          for await (const value of source) await writeFrame(socket, { type: 'stream-item', value })
          await writeFrame(socket, { type: 'stream-end' })
          complete()
          return
        }
        if (start.type === 'duplex-open') {
          if (typeof openDuplex !== 'function') throw new Error('runtime pipe duplex is unavailable')
          const input = createValueQueue()
          void (async () => {
            try {
              for (;;) {
                const frame = await readFrame()
                if (frame === undefined || frame.type === 'duplex-input-end') {
                  input.end()
                  return
                }
                if (frame.type !== 'duplex-input') throw new Error('runtime pipe duplex input frame is invalid')
                input.push(frame.value)
              }
            } catch (error) {
              input.fail(error)
              socket.destroy(error)
            }
          })()
          const source = await openDuplex(start.endpoint, start.payload, input.iterable, abort.signal)
          for await (const value of source) await writeFrame(socket, { type: 'duplex-output', value })
          await writeFrame(socket, { type: 'duplex-end' })
          complete()
          return
        }
        throw new Error('runtime pipe operation is invalid')
      } catch (error) {
        const diagnostic = failureDiagnostic(error, operation, endpoint)
        try {
          if (typeof onFailure === 'function') onFailure(diagnostic)
          else process.stderr.write(`[runtime-pipe] ${JSON.stringify(diagnostic)}\n`)
        } catch {}
        if (!socket.destroyed) {
          await writeFrame(socket, {
            type: 'error',
            message: `runtime carrier ${diagnostic.code} [${diagnostic.correlationId}]`,
          }).catch(() => {})
          socket.end()
        }
      }
    })()
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(address, resolve)
  })
  return Object.freeze({
    address,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    },
  })
}
