/**
 * Turn a byte stream into newline-delimited records without allowing one
 * malformed or unusually large JSON line to consume unbounded memory.
 *
 * The source adapters intentionally skip records that exceed the normal line
 * budget. Keeping the truncation in a stream transform means readline never
 * receives the original multi-megabyte line.
 */

import { Transform } from 'node:stream'

const NEWLINE = Buffer.from('\n')

export function createBoundedLineStream(source, { maxLineBytes = 1024 * 1024 } = {}) {
  if (!source || typeof source.pipe !== 'function') {
    throw new TypeError('a readable source stream is required')
  }
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1) {
    throw new TypeError('maxLineBytes must be a positive safe integer')
  }

  let line = Buffer.alloc(0)
  let dropping = false
  let oversizedLineCount = 0

  const appendSegment = (segment) => {
    if (dropping || segment.length === 0) return
    const remaining = maxLineBytes - line.length
    if (remaining <= 0) {
      dropping = true
      return
    }
    if (segment.length > remaining) {
      line = Buffer.concat([line, segment.subarray(0, remaining)])
      dropping = true
      return
    }
    line = line.length === 0 ? Buffer.from(segment) : Buffer.concat([line, segment])
  }

  const bounded = new Transform({
    transform(chunk, encoding, callback) {
      try {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding)
        let segmentStart = 0
        for (let index = 0; index < bytes.length; index += 1) {
          if (bytes[index] !== 0x0a) continue
          appendSegment(bytes.subarray(segmentStart, index))
          if (dropping) {
            // Do not forward a prefix of an oversized JSON record. A
            // truncated object can make the adapter's multiline recovery
            // consume the following valid line as if it were a continuation.
            // Emit only an empty record so readline advances cleanly.
            oversizedLineCount += 1
            this.push(NEWLINE)
          } else {
            this.push(line.length === 0 ? NEWLINE : Buffer.concat([line, NEWLINE]))
          }
          line = Buffer.alloc(0)
          dropping = false
          segmentStart = index + 1
        }
        appendSegment(bytes.subarray(segmentStart))
        callback()
      } catch (error) {
        callback(error)
      }
    },
    flush(callback) {
      if (dropping) {
        oversizedLineCount += 1
      } else if (line.length > 0) {
        this.push(line)
      }
      callback()
    },
  })

  Object.defineProperty(bounded, 'oversizedLineCount', {
    enumerable: true,
    get: () => oversizedLineCount,
  })

  source.once('error', (error) => bounded.destroy(error))
  bounded.once('close', () => {
    if (!source.destroyed) source.destroy()
  })
  source.pipe(bounded)
  return bounded
}
