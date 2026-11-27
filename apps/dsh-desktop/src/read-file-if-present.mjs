import { readFile } from 'node:fs/promises'

/** Only a missing path represents absent state. Callers choose bytes or text. */
export async function readFileIfPresent(path, encoding, read = readFile) {
  try {
    return await read(path, encoding)
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}
