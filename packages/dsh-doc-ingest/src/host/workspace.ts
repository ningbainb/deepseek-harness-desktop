import { open, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { DOCUMENT_FORMATS, MAX_FILE_BYTES, type DocumentFormat } from '../core/types.ts'

function isOutside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)
}

function validatePath(path: string): void {
  if (path.length === 0 || path.length > 4096 || /[\x00-\x1f]/u.test(path)) throw new Error('Invalid document path.')
  if (/^(?:\\{2}[?.]\\|\/\/[^/])/u.test(path)) throw new Error('Invalid document path.')
  const components = path.replace(/^[a-z]:[\\/]/iu, '').split(/[\\/]/u)
  if (components.some(component => component.includes(':')
    || /^[^/]*[. ]$/u.test(component) && component !== '.' && component !== '..'
    || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(component))) {
    throw new Error('Invalid document path.')
  }
}

export async function openWorkspaceDocument(
  workspace: string,
  path: string,
  signal?: AbortSignal,
): Promise<{ format: DocumentFormat; bytes: Uint8Array<ArrayBuffer> }> {
  signal?.throwIfAborted()
  validatePath(path)
  if (!isAbsolute(workspace)) throw new Error('The document workspace path must be absolute.')
  const root = await realpath(workspace)
  if (relative(workspace, root) !== '') throw new Error('The document workspace path has changed.')
  const candidate = resolve(root, path)
  if (isOutside(root, candidate)) throw new Error('Document path is outside the current workspace.')
  const extension = extname(basename(candidate)).slice(1).toLowerCase()
  const format = DOCUMENT_FORMATS.find(entry => entry === extension)
  if (!format) throw new Error('Unsupported document format.')

  const actual = await realpath(candidate)
  if (isOutside(root, actual)) throw new Error('Document link points outside the current workspace.')
  const before = await stat(actual)
  if (!before.isFile()) throw new Error('Document path must name a regular file.')
  if (before.size > MAX_FILE_BYTES) throw new Error('Document exceeds the 32 MiB size limit.')

  const file = await open(actual, 'r')
  try {
    const opened = await file.stat()
    const verified = await realpath(candidate)
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev
      || relative(actual, verified) !== '' || isOutside(root, verified)) {
      throw new Error('Document path changed before it could be opened.')
    }
    if (opened.size > MAX_FILE_BYTES) throw new Error('Document exceeds the 32 MiB size limit.')
    const bytes = new Uint8Array(opened.size)
    let position = 0
    while (position < bytes.byteLength) {
      signal?.throwIfAborted()
      const { bytesRead } = await file.read(bytes, position, Math.min(bytes.byteLength - position, 1024 * 1024), position)
      if (bytesRead === 0) break
      position += bytesRead
    }
    if (position !== bytes.byteLength || (await file.stat()).size !== opened.size) {
      throw new Error('Document changed while it was being read.')
    }
    signal?.throwIfAborted()
    return { format, bytes }
  } finally {
    await file.close()
  }
}
