import { describe, expect, it } from 'vitest'
import { coalesceByteChunks } from '../src/byte-batches.ts'

async function* chunks(values: Buffer[]) { yield* values }
async function collect(values: AsyncIterable<Buffer>) {
  const result: Buffer[] = []
  for await (const value of values) result.push(value)
  return result
}

describe('bounded recovery byte batches', () => {
  it('preserves binary data, split UTF-8, empty chunks and record separators exactly', async () => {
    const source = Buffer.concat([Buffer.from('恢复\n'), Buffer.from([0, 255, 128]), Buffer.alloc(170000, 97)])
    const input = [source.subarray(0, 1), Buffer.alloc(0), source.subarray(1, 5), source.subarray(5)]
    const output = await collect(coalesceByteChunks(chunks(input)))
    expect(Buffer.concat(output)).toEqual(source)
    expect(output.map(value => value.length)).toEqual([65536, 65536, source.length - 131072])
  })

  it('coalesces many physical row and newline writes into bounded batches', async () => {
    const input = Array.from({ length: 300000 }, (_, index) => Buffer.from(index % 2 ? '\n' : 'x'))
    const output = await collect(coalesceByteChunks(chunks(input)))
    expect(output).toHaveLength(5)
    expect(Buffer.concat(output)).toEqual(Buffer.concat(input))
    expect(output.every(value => value.length <= 65536)).toBe(true)
  })

  it('does not read ahead past a full batch and closes the input on cancellation', async () => {
    let reads = 0
    let closed = false
    async function* input() {
      try { for (let index = 0; index < 100; index++) { reads++; yield Buffer.alloc(4, index) } }
      finally { closed = true }
    }
    const output = coalesceByteChunks(input(), 8)
    expect((await output.next()).value).toEqual(Buffer.from([0, 0, 0, 0, 1, 1, 1, 1]))
    expect(reads).toBe(2)
    await output.return(undefined)
    expect(closed).toBe(true)
    expect(reads).toBe(2)
  })

  it('propagates validation failures without publishing buffered partial data', async () => {
    const failure = new Error('invalid later row')
    async function* input() { yield Buffer.from('partial'); throw failure }
    const output = coalesceByteChunks(input())
    await expect(output.next()).rejects.toBe(failure)
    expect(await collect(coalesceByteChunks(chunks([])))).toEqual([])
  })

  it('rejects invalid batch sizes before consuming input', async () => {
    for (const size of [0, -1, 1.5, Infinity, NaN]) {
      await expect(collect(coalesceByteChunks(chunks([]), size))).rejects.toBeInstanceOf(RangeError)
    }
  })
})
