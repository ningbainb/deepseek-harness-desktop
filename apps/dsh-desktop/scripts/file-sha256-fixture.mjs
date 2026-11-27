import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export async function fileSha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
