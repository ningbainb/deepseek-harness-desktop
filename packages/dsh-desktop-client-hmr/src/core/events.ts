export type Frame = { type: 'graph'; graph: object } | { type: 'rebuilt'; id: string; rev: string }
export type ParsedFrame = { kind: 'frame'; frame: Frame } | { kind: 'invalid' | 'unknown' }

export function parseFrame(value: unknown): ParsedFrame {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { kind: 'invalid' }
  const record = value as Record<string, unknown>
  if (record.type === 'graph') {
    return typeof record.graph === 'object' && record.graph !== null && !Array.isArray(record.graph)
      ? { kind: 'frame', frame: { type: 'graph', graph: record.graph } } : { kind: 'invalid' }
  }
  if (record.type === 'rebuilt') {
    return typeof record.id === 'string' && record.id.length > 0 && typeof record.rev === 'string' && record.rev.length > 0
      ? { kind: 'frame', frame: { type: 'rebuilt', id: record.id, rev: record.rev } } : { kind: 'invalid' }
  }
  return { kind: typeof record.type === 'string' ? 'unknown' : 'invalid' }
}

export function createSseDecoder(receive: (data: string) => void) {
  const limit = 1_048_576
  let buffer = ''
  let data: string[] = []
  let length = 0
  let event = ''
  let skipLf = false
  let firstChunk = true
  const line = (text: string) => {
    if (text === '') {
      if (data.length > 0 && (event === '' || event === 'message')) receive(data.join('\n'))
      data = []
      length = 0
      event = ''
      return
    }
    const colon = text.indexOf(':')
    if (colon === 0) return
    const field = colon < 0 ? text : text.slice(0, colon)
    let value = colon < 0 ? '' : text.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') { data.push(value); length += value.length + 1 }
    else if (field === 'event') event = value
    if (length + event.length > limit) throw new Error('HMR event exceeds the frame limit')
  }
  return {
    push(chunk: string) {
      if (firstChunk && chunk.length > 0) { firstChunk = false; chunk = chunk.replace(/^\uFEFF/u, '') }
      if (skipLf && chunk.length > 0) { skipLf = false; if (chunk[0] === '\n') chunk = chunk.slice(1) }
      buffer += chunk
      let start = 0
      for (let index = 0; index < buffer.length; index++) {
        if (buffer[index] !== '\n' && buffer[index] !== '\r') continue
        if (index - start + length > limit) throw new Error('HMR event exceeds the frame limit')
        line(buffer.slice(start, index))
        if (buffer[index] === '\r') {
          if (buffer[index + 1] === '\n') index++
          else if (index + 1 === buffer.length) skipLf = true
        }
        start = index + 1
      }
      buffer = buffer.slice(start)
      if (buffer.length + length > limit) throw new Error('HMR event exceeds the frame limit')
    },
  }
}
