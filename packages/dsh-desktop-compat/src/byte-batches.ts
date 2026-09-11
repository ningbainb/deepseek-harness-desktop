/** Coalesce small stream writes without changing bytes or buffering the input. */
export async function* coalesceByteChunks(
  input: AsyncIterable<Buffer>,
  targetBytes = 64 * 1024,
): AsyncGenerator<Buffer> {
  if (!Number.isSafeInteger(targetBytes) || targetBytes <= 0) {
    throw new RangeError('byte batch size must be a positive safe integer')
  }
  let parts: Buffer[] = []
  let size = 0
  for await (const chunk of input) {
    let offset = 0
    while (offset < chunk.length) {
      const take = Math.min(targetBytes - size, chunk.length - offset)
      parts.push(chunk.subarray(offset, offset + take))
      size += take
      offset += take
      if (size === targetBytes) {
        const batch = Buffer.concat(parts, size)
        parts = []
        size = 0
        yield batch
      }
    }
  }
  if (size > 0) yield Buffer.concat(parts, size)
}
