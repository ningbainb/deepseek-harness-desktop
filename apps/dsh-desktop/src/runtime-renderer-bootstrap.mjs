export function installDesktopTransportBridge(target = globalThis, { accountCallbackOrigin } = {}) {
  if (accountCallbackOrigin !== undefined && !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/u.test(accountCallbackOrigin)) {
    throw new TypeError('Desktop account callback requires a loopback HTTP origin')
  }
  if (accountCallbackOrigin !== undefined && Number(new URL(accountCallbackOrigin).port) > 65535) {
    throw new TypeError('Desktop account callback port is invalid')
  }
  const bridge = target.dshDesktopTransport ?? target.dshDesktop
  if (!bridge || typeof bridge.openRuntimeStream !== 'function') {
    throw new Error('Desktop transport bridge is unavailable')
  }

  const queues = new Map()
  const pendingFrames = new Map()
  let quiescing = false
  bridge.onRuntimeStream(frame => {
    if (frame.type === 'lifecycle') {
      if (frame.phase === 'quiescing') quiescing = true
      else if (frame.phase === 'resumed') {
        quiescing = false
        for (const queue of queues.values()) queue.wake?.()
      }
      return
    }
    const queue = queues.get(frame.id)
    if (queue === undefined) {
      const pending = pendingFrames.get(frame.id) ?? []
      if (pending.length < 256) pending.push(frame)
      pendingFrames.set(frame.id, pending)
      return
    }
    queue.frames.push(frame)
    queue.wake?.()
  })

  function openStream(endpoint, payload, signal, uplink) {
    const controller = signal === undefined ? new target.AbortController() : undefined
    const activeSignal = signal ?? controller.signal
    const state = { id: undefined, frames: [], wake: undefined, cancelled: activeSignal.aborted, finished: false }
    const started = bridge.openRuntimeStream(endpoint, payload).then(id => {
      state.id = id
      queues.set(id, state)
      const pending = pendingFrames.get(id)
      if (pending !== undefined) {
        state.frames.push(...pending)
        pendingFrames.delete(id)
        state.wake?.()
      }
      if (activeSignal.aborted) bridge.cancelRuntimeStream(id)
      return id
    })
    activeSignal.addEventListener('abort', () => {
      state.cancelled = true
      if (state.id !== undefined) bridge.cancelRuntimeStream(state.id)
      state.wake?.()
    }, { once: true })
    if (endpoint !== 'websocket') {
      void (async () => {
        const id = await started
        if (uplink !== undefined) {
          for await (const value of uplink) {
            activeSignal.throwIfAborted()
            if (state.cancelled || state.finished) return
            if (!await bridge.writeRuntimeStream(id, value)) throw new Error('Runtime stream input is closed')
          }
        }
        if (!state.cancelled && !state.finished && typeof bridge.endRuntimeStream === 'function') {
          await bridge.endRuntimeStream(id)
        }
      })().catch(error => {
        if (state.cancelled || state.finished) return
        state.frames.push({ type: 'error', message: error instanceof Error ? error.message : 'Runtime stream input failed' })
        state.wake?.()
      })
    }
    return {
      async *[Symbol.asyncIterator]() {
        await started
        try {
          for (;;) {
            while (!state.cancelled && (state.frames.length === 0 || (quiescing && state.frames[0].type !== 'item'))) {
              await new Promise(resolve => { state.wake = resolve })
            }
            state.wake = undefined
            if (state.cancelled) throw activeSignal.reason ?? new Error('Runtime stream cancelled')
            const frame = state.frames.shift()
            if (frame.type === 'item') yield frame.value
            else if (frame.type === 'end') return
            else throw new Error(frame.message ?? 'Runtime stream failed')
          }
        } finally {
          state.finished = true
          queues.delete(state.id)
          pendingFrames.delete(state.id)
          if (state.id !== undefined) bridge.cancelRuntimeStream(state.id)
        }
      },
      write: async value => {
        const id = await started
        if (!await bridge.writeRuntimeStream(id, value)) throw new Error('Runtime stream input is closed')
      },
      close: async () => {
        controller?.abort(new Error('Runtime stream closed'))
      },
      cancel: reason => {
        state.cancelled = true
        state.wake?.()
        if (controller !== undefined) controller.abort(reason)
        else if (state.id !== undefined) bridge.cancelRuntimeStream(state.id)
      },
    }
  }

  const remap = input => {
    const url = new URL(input instanceof target.Request ? input.url : String(input), target.location.href)
    if (url.protocol === 'dsh-runtime:' && url.hostname === 'app') return url
    if ((url.hostname === target.location.hostname || url.origin === accountCallbackOrigin) && (url.protocol === 'http:' || url.protocol === 'https:')) {
      return new URL(url.pathname + url.search, 'dsh-runtime://app/')
    }
    return url
  }

  target.__DSH_TRANSPORT__ = Object.freeze({
    ...(accountCallbackOrigin === undefined ? {} : { streamBaseUrl: accountCallbackOrigin }),
    ownsHost: true,
    fetch: (input, init) => target.fetch(
      input instanceof target.Request ? new target.Request(remap(input), input) : remap(input),
      init,
    ),
    openStream,
  })

  if (typeof bridge.writeRuntimeStream !== 'function' || typeof target.WebSocket !== 'function') return

  const NativeWebSocket = target.WebSocket
  const textEncoder = new target.TextEncoder()
  const textDecoder = new target.TextDecoder('utf-8', { fatal: false })
  const MAX_MESSAGE_BYTES = 16 * 1024 * 1024
  const MAX_CLIENT_FRAME_BYTES = 480 * 1024

  function decodeBase64(value) {
    if (typeof value !== 'string') throw new TypeError('Desktop WebSocket carrier frame is invalid')
    const binary = target.atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  }

  function encodeBase64(bytes) {
    let binary = ''
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
    }
    return target.btoa(binary)
  }

  function concatBytes(parts, total = parts.reduce((sum, part) => sum + part.length, 0)) {
    const output = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
      output.set(part, offset)
      offset += part.length
    }
    return output
  }

  function clientFrame(opcode, payload) {
    if (payload.length > MAX_CLIENT_FRAME_BYTES) throw new RangeError('Desktop WebSocket frame exceeded the limit')
    const extended = payload.length < 126 ? 0 : payload.length <= 0xffff ? 2 : 8
    const header = new Uint8Array(2 + extended + 4)
    header[0] = 0x80 | opcode
    if (extended === 0) header[1] = 0x80 | payload.length
    else if (extended === 2) {
      header[1] = 0x80 | 126
      header[2] = payload.length >>> 8
      header[3] = payload.length
    } else {
      header[1] = 0x80 | 127
      new DataView(header.buffer).setBigUint64(2, BigInt(payload.length))
    }
    const maskOffset = 2 + extended
    target.crypto.getRandomValues(header.subarray(maskOffset, maskOffset + 4))
    const output = new Uint8Array(header.length + payload.length)
    output.set(header)
    for (let index = 0; index < payload.length; index += 1) {
      output[header.length + index] = payload[index] ^ header[maskOffset + (index % 4)]
    }
    return output
  }

  function eventWith(type, fields) {
    const event = new target.Event(type)
    for (const [name, value] of Object.entries(fields)) Object.defineProperty(event, name, { value, enumerable: true })
    return event
  }

  class DesktopWebSocket extends target.EventTarget {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3

    constructor(input, protocols) {
      super()
      const url = new URL(String(input), target.location.href)
      const isOwned = target.location.protocol === 'dsh-runtime:'
        && (url.hostname === target.location.hostname || (accountCallbackOrigin !== undefined && url.origin.replace(/^ws/u, 'http') === accountCallbackOrigin))
        && (url.protocol === 'ws:' || url.protocol === 'wss:')
      if (!isOwned) return protocols === undefined ? new NativeWebSocket(input) : new NativeWebSocket(input, protocols)

      this.url = url.href
      this.protocol = ''
      this.extensions = ''
      this.binaryType = 'blob'
      this.bufferedAmount = 0
      this.readyState = DesktopWebSocket.CONNECTING
      this.onopen = null
      this.onmessage = null
      this.onerror = null
      this.onclose = null
      this._buffer = new Uint8Array(0)
      this._handshakeComplete = false
      this._fragmentOpcode = undefined
      this._fragmentParts = []
      this._fragmentBytes = 0
      this._closeSent = false
      this._closeReceived = false
      this._protocols = typeof protocols === 'string' ? [protocols] : protocols === undefined ? [] : Array.from(protocols)
      const unique = new Set(this._protocols)
      if (unique.size !== this._protocols.length || this._protocols.some(value => !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(value))) {
        throw new target.DOMException('Invalid WebSocket subprotocol', 'SyntaxError')
      }
      this._controller = new target.AbortController()
      this._stream = openStream('websocket', {
        url: `${url.pathname}${url.search}`,
        protocols: this._protocols,
      }, this._controller.signal)
      void this._consume()
    }

    _emit(type, fields = {}) {
      const event = eventWith(type, fields)
      this.dispatchEvent(event)
      const handler = this[`on${type}`]
      if (typeof handler === 'function') handler.call(this, event)
    }

    _fail() {
      if (this.readyState === DesktopWebSocket.CLOSED) return
      this._emit('error')
      this._finishClose(1006, '', false)
    }

    _finishClose(code, reason, wasClean) {
      if (this.readyState === DesktopWebSocket.CLOSED) return
      this.readyState = DesktopWebSocket.CLOSED
      this._controller.abort(new Error('Desktop WebSocket closed'))
      this._emit('close', { code, reason, wasClean })
    }

    async _writeFrame(opcode, payload) {
      const frame = clientFrame(opcode, payload)
      this.bufferedAmount += payload.length
      try {
        await this._stream.write(encodeBase64(frame))
      } finally {
        this.bufferedAmount = Math.max(0, this.bufferedAmount - payload.length)
      }
    }

    _append(chunk) {
      this._buffer = concatBytes([this._buffer, chunk])
      if (!this._handshakeComplete) {
        let headerEnd = -1
        for (let index = 3; index < this._buffer.length; index += 1) {
          if (this._buffer[index - 3] === 13 && this._buffer[index - 2] === 10 && this._buffer[index - 1] === 13 && this._buffer[index] === 10) {
            headerEnd = index + 1
            break
          }
        }
        if (headerEnd === -1) {
          if (this._buffer.length > 16 * 1024) throw new Error('Desktop WebSocket handshake exceeded the limit')
          return
        }
        const headers = textDecoder.decode(this._buffer.subarray(0, headerEnd))
        if (!/^HTTP\/1\.[01] 101(?: |\r)/u.test(headers)) throw new Error('Desktop WebSocket upgrade was rejected')
        const selected = /^sec-websocket-protocol:\s*([^\r\n]+)/imu.exec(headers)?.[1]?.trim() ?? ''
        if (selected !== '' && !this._protocols.includes(selected)) throw new Error('Desktop WebSocket selected an invalid protocol')
        this.protocol = selected
        this._buffer = this._buffer.subarray(headerEnd)
        this._handshakeComplete = true
        this.readyState = DesktopWebSocket.OPEN
        this._emit('open')
      }
      this._parseFrames()
    }

    _parseFrames() {
      for (;;) {
        if (this._buffer.length < 2) return
        const first = this._buffer[0]
        const second = this._buffer[1]
        const fin = (first & 0x80) !== 0
        const opcode = first & 0x0f
        if ((first & 0x70) !== 0 || (second & 0x80) !== 0) throw new Error('Desktop WebSocket received an invalid frame')
        let length = second & 0x7f
        let offset = 2
        if (length === 126) {
          if (this._buffer.length < 4) return
          length = new DataView(this._buffer.buffer, this._buffer.byteOffset + 2, 2).getUint16(0)
          offset = 4
        } else if (length === 127) {
          if (this._buffer.length < 10) return
          const wide = new DataView(this._buffer.buffer, this._buffer.byteOffset + 2, 8).getBigUint64(0)
          if (wide > BigInt(MAX_MESSAGE_BYTES)) throw new RangeError('Desktop WebSocket message exceeded the limit')
          length = Number(wide)
          offset = 10
        }
        if (length > MAX_MESSAGE_BYTES || this._buffer.length < offset + length) return
        const payload = this._buffer.slice(offset, offset + length)
        this._buffer = this._buffer.subarray(offset + length)
        if (opcode >= 8) {
          if (!fin || length > 125) throw new Error('Desktop WebSocket received an invalid control frame')
          if (opcode === 8) {
            const code = length >= 2 ? new DataView(payload.buffer, payload.byteOffset, 2).getUint16(0) : 1005
            const reason = length > 2 ? textDecoder.decode(payload.subarray(2)) : ''
            this._closeReceived = true
            if (!this._closeSent) {
              this._closeSent = true
              void this._writeFrame(8, payload).catch(() => {})
            }
            this._finishClose(code, reason, true)
            return
          }
          if (opcode === 9) void this._writeFrame(10, payload).catch(() => this._fail())
          else if (opcode !== 10) throw new Error('Desktop WebSocket received an unknown control frame')
          continue
        }
        if (opcode === 0) {
          if (this._fragmentOpcode === undefined) throw new Error('Desktop WebSocket continuation is invalid')
        } else if (opcode === 1 || opcode === 2) {
          if (this._fragmentOpcode !== undefined) throw new Error('Desktop WebSocket fragmentation is invalid')
          this._fragmentOpcode = opcode
        } else {
          throw new Error('Desktop WebSocket received an unknown data frame')
        }
        this._fragmentParts.push(payload)
        this._fragmentBytes += payload.length
        if (this._fragmentBytes > MAX_MESSAGE_BYTES) throw new RangeError('Desktop WebSocket message exceeded the limit')
        if (!fin) continue
        const message = concatBytes(this._fragmentParts, this._fragmentBytes)
        const messageOpcode = this._fragmentOpcode
        this._fragmentOpcode = undefined
        this._fragmentParts = []
        this._fragmentBytes = 0
        const data = messageOpcode === 1
          ? textDecoder.decode(message)
          : this.binaryType === 'arraybuffer'
            ? message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength)
            : new target.Blob([message])
        this._emit('message', { data, origin: `dsh-runtime://app` })
      }
    }

    async _consume() {
      try {
        for await (const value of this._stream) this._append(decodeBase64(value))
        if (this.readyState !== DesktopWebSocket.CLOSED) {
          this._finishClose(this._closeReceived ? 1000 : 1006, '', this._closeReceived)
        }
      } catch {
        this._fail()
      }
    }

    send(data) {
      if (this.readyState !== DesktopWebSocket.OPEN) throw new target.DOMException('WebSocket is not open', 'InvalidStateError')
      let opcode = 2
      let payload
      if (typeof data === 'string') {
        opcode = 1
        payload = textEncoder.encode(data)
      } else if (data instanceof target.ArrayBuffer) {
        payload = new Uint8Array(data)
      } else if (target.ArrayBuffer.isView(data)) {
        payload = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      } else {
        throw new TypeError('Desktop WebSocket send supports strings and binary buffers')
      }
      void this._writeFrame(opcode, payload).catch(() => this._fail())
    }

    close(code = 1000, reason = '') {
      if (this.readyState === DesktopWebSocket.CLOSED || this.readyState === DesktopWebSocket.CLOSING) return
      if (code !== 1000 && (code < 3000 || code > 4999)) throw new target.DOMException('Invalid WebSocket close code', 'InvalidAccessError')
      const reasonBytes = textEncoder.encode(String(reason))
      if (reasonBytes.length > 123) throw new target.DOMException('WebSocket close reason is too long', 'SyntaxError')
      this.readyState = DesktopWebSocket.CLOSING
      this._closeSent = true
      const payload = new Uint8Array(2 + reasonBytes.length)
      new DataView(payload.buffer).setUint16(0, code)
      payload.set(reasonBytes, 2)
      void this._writeFrame(8, payload).catch(() => this._fail())
    }
  }

  target.WebSocket = DesktopWebSocket
}

export function transportBootstrapScript(options = {}) {
  return `(${installDesktopTransportBridge.toString()})(globalThis, ${JSON.stringify(options)})`
}
