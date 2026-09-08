/**
 * Pure drag-to-composer helpers shared by the explorer rows (the drag
 * source) and the composer dock inlay (the drop target): the custom MIME
 * type, the drag-state detector, and the draft-splicing rule. Deliberately
 * framework-free so the splicing math is unit-testable in isolation.
 *
 * Workspace files carry a custom MIME (`application/x-dsh-file`); external
 * Plain-text files are read into the draft. PDF, Word, spreadsheet, archive,
 * binary, and large files contribute only a path reference; this layer does
 * not parse their content or open the Preview panel.
 * @module dsh-aionui-panel/client/drag/file-drag
 */

/** Custom MIME carrying a workspace-relative file path. */
export const FILE_DRAG_MIME = 'application/x-dsh-file'

/** Plain-text extensions whose bytes may be inserted into the draft as text. */
export const TEXT_DOCUMENT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'rs',
  'go', 'rb', 'php', 'html', 'htm', 'css', 'scss', 'less', 'sql', 'sh', 'bash', 'zsh',
  'ps1', 'bat', 'cmd', 'log', 'env', 'dockerfile', 'makefile', 'ini', 'conf', 'proto',
  'vue', 'svelte', 'graphql', 'gql', 'r', 'swift', 'kt', 'kts', 'dart', 'lua',
  'diff', 'patch', 'properties', 'cfg', 'config', 'mod', 'sum',
])

/** Image extensions supported for direct inline markdown or preview. */
export const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif',
])

/**
 * Whether a drag event carries our internal workspace file payload.
 * @param types - the live `dataTransfer.types` list (read-only during drag).
 * @returns true when our MIME is present.
 */
export function hasFileDrag(types: readonly string[] | undefined): boolean {
  return types !== undefined && types.includes(FILE_DRAG_MIME)
}

/**
 * Whether a drag event carries either workspace file or external OS files.
 * @param types - the live `dataTransfer.types` list.
 */
export function hasAnyFileDrag(types: readonly string[] | undefined): boolean {
  return types !== undefined && (types.includes(FILE_DRAG_MIME) || types.includes('Files'))
}

/**
 * Detect whether the drag operation carries solely image files based on DataTransfer items.
 * If true, this drag is delegated to the native image attachment drop handler.
 */
export function isPureImageDrag(
  types: readonly string[] | undefined,
  items?: ArrayLike<{ kind?: string; type?: string }> | null
): boolean {
  if (!types || !types.includes('Files') || types.includes(FILE_DRAG_MIME)) {
    return false
  }
  if (!items || items.length === 0) {
    return false
  }
  let fileCount = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'file') {
      fileCount++
      if (!item.type || !item.type.startsWith('image/')) {
        return false
      }
    }
  }
  return fileCount > 0
}

/**
 * Target maximum image byte size (default: 3MB to safely stay under the 5MB/10MB host limits).
 */
export const MAX_SAFE_IMAGE_BYTES = 3 * 1024 * 1024

/**
 * Target maximum width or height in pixels.
 * 2048px preserves crisp text, diagrams, and fine detail while keeping payload modest.
 */
export const MAX_IMAGE_DIMENSION = 2048

/** Hard admission limits applied before browser image decoding. */
export const MAX_SOURCE_IMAGE_BYTES = 32 * 1024 * 1024
export const MAX_SOURCE_IMAGE_PIXELS = 32_000_000
export const MAX_SOURCE_IMAGE_DIMENSION = 12_000

export type ImageProcessingPhase = 'validating' | 'decoding' | 'compressing'

export type ImageProcessingErrorCode =
  | 'aborted'
  | 'empty'
  | 'not-image'
  | 'source-too-large'
  | 'dimensions-unknown'
  | 'dimensions-invalid'
  | 'decode-failed'
  | 'canvas-unavailable'
  | 'encode-failed'
  | 'output-too-large'

export class ImageProcessingError extends Error {
  constructor(readonly code: ImageProcessingErrorCode, message: string) {
    super(message)
    this.name = 'ImageProcessingError'
  }
}

export interface ImageProcessingOptions {
  signal?: AbortSignal
  onPhase?: (phase: ImageProcessingPhase) => void
}

interface ImageDimensions {
  width: number
  height: number
}

function abortError(): ImageProcessingError {
  return new ImageProcessingError('aborted', 'image processing was cancelled')
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

function u24le(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
}

/** Read dimensions from common image headers without allocating decoded pixels. */
export function imageDimensionsFromHeader(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes.length >= 10 && String.fromCharCode(...bytes.slice(0, 3)) === 'GIF') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 2)) === 'BM') {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) }
  }
  if (bytes.length >= 30
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    const kind = String.fromCharCode(...bytes.slice(12, 16))
    if (kind === 'VP8X') return { width: 1 + u24le(bytes, 24), height: 1 + u24le(bytes, 27) }
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8),
        height: 1 + (bytes[22]! >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10),
      }
    }
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = bytes[offset + 1]!
      offset += 2
      if (marker === 0xd8 || marker === 0xd9) continue
      if (offset + 2 > bytes.length) break
      const length = (bytes[offset]! << 8) | bytes[offset + 1]!
      if (length < 2 || offset + length > bytes.length) break
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return {
          width: (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
          height: (bytes[offset + 3]! << 8) | bytes[offset + 4]!,
        }
      }
      offset += length
    }
  }
  return null
}

export function validateImageDimensions(dimensions: ImageDimensions): void {
  const { width, height } = dimensions
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new ImageProcessingError('dimensions-invalid', 'image dimensions are invalid')
  }
  if (width > MAX_SOURCE_IMAGE_DIMENSION || height > MAX_SOURCE_IMAGE_DIMENSION || width * height > MAX_SOURCE_IMAGE_PIXELS) {
    throw new ImageProcessingError('source-too-large', `image dimensions exceed the ${MAX_SOURCE_IMAGE_PIXELS} pixel safety limit`)
  }
}

async function probeImageDimensions(file: File, signal?: AbortSignal): Promise<ImageDimensions | null> {
  throwIfAborted(signal)
  if (typeof file.slice !== 'function') return null
  const header = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer())
  throwIfAborted(signal)
  return imageDimensionsFromHeader(header)
}

async function decodeImage(
  file: File,
  knownDimensions: ImageDimensions | null,
  signal?: AbortSignal,
): Promise<{ source: CanvasImageSource; dimensions: ImageDimensions; release: () => void }> {
  throwIfAborted(signal)
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap | undefined
    try {
      bitmap = await createImageBitmap(file)
      throwIfAborted(signal)
      const dimensions = { width: bitmap.width, height: bitmap.height }
      validateImageDimensions(dimensions)
      if (knownDimensions !== null && (knownDimensions.width !== dimensions.width || knownDimensions.height !== dimensions.height)) {
        throw new ImageProcessingError('dimensions-invalid', 'decoded image dimensions do not match its header')
      }
      const decoded = bitmap
      return {
        source: decoded,
        dimensions,
        release: () => decoded.close(),
      }
    } catch (error) {
      bitmap?.close()
      if (error instanceof ImageProcessingError) throw error
      throw new ImageProcessingError('decode-failed', 'the image could not be decoded')
    }
  }

  let objectUrl = ''
  try {
    objectUrl = URL.createObjectURL(file)
  } catch {
    throw new ImageProcessingError('decode-failed', 'the browser could not open this image')
  }
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanupListeners = (): void => {
        image.onload = null
        image.onerror = null
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = (): void => {
        cleanupListeners()
        image.src = ''
        reject(abortError())
      }
      image.onload = () => {
        cleanupListeners()
        resolve()
      }
      image.onerror = () => {
        cleanupListeners()
        reject(new ImageProcessingError('decode-failed', 'the image could not be decoded'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      image.src = objectUrl
    })
    throwIfAborted(signal)
    const dimensions = {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    }
    validateImageDimensions(dimensions)
    if (knownDimensions !== null && (knownDimensions.width !== dimensions.width || knownDimensions.height !== dimensions.height)) {
      throw new ImageProcessingError('dimensions-invalid', 'decoded image dimensions do not match its header')
    }
    return {
      source: image,
      dimensions,
      release: () => {
        image.src = ''
        URL.revokeObjectURL(objectUrl)
      },
    }
  } catch (error) {
    image.src = ''
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

async function canvasBlob(canvas: HTMLCanvasElement, quality: number, signal?: AbortSignal): Promise<Blob> {
  throwIfAborted(signal)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (signal?.aborted) reject(abortError())
      else if (blob === null) reject(new ImageProcessingError('encode-failed', 'image encoding failed'))
      else resolve(blob)
    }, 'image/jpeg', quality)
  })
}

/**
 * Calculate scaled dimensions that fit within maxDimension while maintaining aspect ratio.
 */
export function calculateScaledDimensions(
  width: number,
  height: number,
  maxDimension = MAX_IMAGE_DIMENSION
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height }
  }
  if (width >= height) {
    const scaledHeight = Math.round((height * maxDimension) / width)
    return { width: maxDimension, height: Math.max(1, scaledHeight) }
  } else {
    const scaledWidth = Math.round((width * maxDimension) / height)
    return { width: Math.max(1, scaledWidth), height: maxDimension }
  }
}

/**
 * Automatically compress an image file to fit within safe limits:
 * - If already within byte and dimension limits, returns the original File unchanged.
 * - If larger, rescales and recompresses via Canvas down to JPEG under maxBytes.
 */
export async function compressImageFileToFit(
  file: File,
  maxBytes = MAX_SAFE_IMAGE_BYTES,
  maxDimension = MAX_IMAGE_DIMENSION,
  options: ImageProcessingOptions = {},
): Promise<File> {
  const { signal, onPhase } = options
  onPhase?.('validating')
  throwIfAborted(signal)
  if (!isImageFile(file)) throw new ImageProcessingError('not-image', 'the selected file is not an image')
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new ImageProcessingError('empty', 'the image is empty')
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new ImageProcessingError('source-too-large', `image exceeds the ${MAX_SOURCE_IMAGE_BYTES} byte source limit`)
  }

  const headerDimensions = await probeImageDimensions(file, signal)
  if (headerDimensions !== null) validateImageDimensions(headerDimensions)
  if (headerDimensions === null && file.size > maxBytes) {
    throw new ImageProcessingError('dimensions-unknown', 'image dimensions could not be verified before decoding')
  }

  if (typeof window === 'undefined'
    || typeof document === 'undefined'
    || (typeof Image === 'undefined' && typeof createImageBitmap !== 'function')) {
    if (file.size <= maxBytes) return file
    throw new ImageProcessingError('canvas-unavailable', 'image compression is unavailable in this environment')
  }

  if (file.size <= maxBytes
    && headerDimensions !== null
    && headerDimensions.width <= maxDimension
    && headerDimensions.height <= maxDimension) {
    return file
  }
  onPhase?.('decoding')
  const decoded = await decodeImage(file, headerDimensions, signal)
  const canvas = document.createElement('canvas')
  try {
    const { width: targetW, height: targetH } = calculateScaledDimensions(
      decoded.dimensions.width,
      decoded.dimensions.height,
      maxDimension,
    )
    if (file.size <= maxBytes && targetW === decoded.dimensions.width && targetH === decoded.dimensions.height) return file
    onPhase?.('compressing')
    canvas.width = targetW
    canvas.height = targetH
    const context = canvas.getContext('2d')
    if (context === null) throw new ImageProcessingError('canvas-unavailable', 'image canvas is unavailable')
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(decoded.source, 0, 0, targetW, targetH)
    let output: Blob | undefined
    for (const quality of [0.85, 0.72, 0.55, 0.4]) {
      output = await canvasBlob(canvas, quality, signal)
      if (output.size <= maxBytes) break
    }
    if (output === undefined || output.size > maxBytes) {
      throw new ImageProcessingError('output-too-large', 'compressed image still exceeds the attachment limit')
    }
    const baseName = file.name.replace(/\.[^.]+$/u, '') || 'image'
    return new File([output], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    decoded.release()
    canvas.width = 0
    canvas.height = 0
  }
}

/** Process one image at a time so decoded pixel buffers cannot multiply by batch size. */
export async function processImageFilesSequentially(
  files: readonly File[],
  options: ImageProcessingOptions = {},
): Promise<File[]> {
  const output: File[] = []
  for (const file of files) {
    throwIfAborted(options.signal)
    output.push(await compressImageFileToFit(file, MAX_SAFE_IMAGE_BYTES, MAX_IMAGE_DIMENSION, options))
  }
  return output
}

/**
 * Check if a file is an image based on name or MIME type.
 */
export function isImageFile(file: { name: string; type?: string }): boolean {
  if (file.type && file.type.startsWith('image/')) return true
  const parts = file.name.split('.')
  if (parts.length < 2) return false
  const ext = parts[parts.length - 1]?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

/**
 * Check if a file is likely a text/code document based on name or MIME type.
 */
export function isTextDocumentFile(file: { name: string; type?: string }): boolean {
  if (file.type && (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('yaml') || file.type.includes('xml'))) {
    return true
  }
  const parts = file.name.split('.')
  if (parts.length < 2) return false
  const ext = parts[parts.length - 1]?.toLowerCase() ?? ''
  return TEXT_DOCUMENT_EXTENSIONS.has(ext)
}

/**
 * Format image attachment as an inline markdown image.
 */
export function formatImageAttachment(fileName: string, filePath?: string): string {
  const target = filePath && filePath !== '' ? filePath : fileName
  return `![${fileName}](${target})`
}

/**
 * Format any general file attachment as a markdown link.
 */
export function formatGenericFileAttachment(fileName: string, filePath?: string): string {
  const target = filePath && filePath !== '' ? filePath : fileName
  return `[${fileName}](${target})`
}

/**
 * Format dropped document content as a markdown attachment block.
 */
export function formatDocumentAttachment(fileName: string, content: string, filePath?: string): string {
  const parts = fileName.split('.')
  const ext = parts.length > 1 ? (parts[parts.length - 1]?.toLowerCase() ?? '') : ''
  const lang = ext === 'txt' || ext === 'log' ? '' : ext
  const header = filePath ? `[${fileName}](${filePath})` : `**${fileName}**`
  const trimmed = content.trim()
  if (trimmed === '') return header
  return `${header}\n\`\`\`${lang}\n${trimmed}\n\`\`\``
}

/**
 * Read and format any dropped OS file into the appropriate draft snippet:
 * - Images: `![fileName](filePath)`
 * - Text/code documents (< 1MB): formatted code block with content
 * - Other files (PDF, Word, Excel, ZIP, binary, large files): path reference only
 */
export async function formatDroppedFile(file: File): Promise<string> {
  const electronPath = (file as unknown as { path?: string }).path

  if (isImageFile(file)) {
    if (electronPath) {
      return formatImageAttachment(file.name, electronPath)
    }
    if (file.size < 2_000_000 && typeof FileReader !== 'undefined') {
      return new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : ''
          resolve(dataUrl !== '' ? `![${file.name}](${dataUrl})` : formatImageAttachment(file.name))
        }
        reader.onerror = () => resolve(formatImageAttachment(file.name))
        reader.readAsDataURL(file)
      })
    }
    return formatImageAttachment(file.name)
  }

  if (isTextDocumentFile(file) && file.size < 1_000_000 && typeof FileReader !== 'undefined') {
    return new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : ''
        resolve(formatDocumentAttachment(file.name, content, electronPath))
      }
      reader.onerror = () => resolve(formatGenericFileAttachment(file.name, electronPath))
      reader.readAsText(file)
    })
  }

  return formatGenericFileAttachment(file.name, electronPath)
}

/** Format dropped files serially so FileReader buffers are bounded to one file. */
export async function formatDroppedFilesSequentially(files: readonly File[], signal?: AbortSignal): Promise<string[]> {
  const output: string[] = []
  for (const file of files) {
    throwIfAborted(signal)
    output.push(await formatDroppedFile(file))
  }
  throwIfAborted(signal)
  return output
}

/**
 * Splice a workspace-relative path into a composer draft at the caret.
 *
 * Separator rule: one space is added before the path unless the caret sits
 * at the start of the draft or right after whitespace; one space is added
 * after the path unless the caret sits at the end of the draft or right
 * before whitespace. Empty path or an out-of-range caret are no-ops.
 *
 * @param draft - the current draft text.
 * @param path - the relative path to insert.
 * @param caret - insertion offset (default: the end of the draft).
 * @returns the next draft; the caller owns writing it through the input
 * facade.
 */
export function insertPathIntoDraft(draft: string, path: string, caret?: number): string {
  if (path === '') return draft
  const at = caret === undefined ? draft.length : Math.min(Math.max(caret, 0), draft.length)
  const before = draft.slice(0, at)
  const after = draft.slice(at)
  const needBefore = before !== '' && !/\s$/.test(before)
  const needAfter = after !== '' && !/^\s/.test(after)
  return before + (needBefore ? ' ' : '') + path + (needAfter ? ' ' : '') + after
}
