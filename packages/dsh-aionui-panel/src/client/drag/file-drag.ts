/**
 * Pure drag-to-composer helpers shared by the explorer rows (the drag
 * source) and the composer dock inlay (the drop target): the custom MIME
 * type, the drag-state detector, and the draft-splicing rule. Deliberately
 * framework-free so the splicing math is unit-testable in isolation.
 *
 * Workspace files carry a custom MIME (`application/x-dsh-file`); external
 * OS document files (markdown, source code, text, config, pdf) are read and
 * spliced cleanly into the active draft with formatted attachments.
/**
 * Pure drag-to-composer helpers shared by the explorer rows (the drag
 * source) and the composer dock inlay (the drop target): the custom MIME
 * type, the drag-state detector, and the draft-splicing rule. Deliberately
 * framework-free so the splicing math is unit-testable in isolation.
 *
 * Workspace files carry a custom MIME (`application/x-dsh-file`); external
 * OS document files (markdown, source code, text, config, pdf) are read and
 * spliced cleanly into the active draft with formatted attachments.
 * @module dsh-aionui-panel/client/drag/file-drag
 */

/** Custom MIME carrying a workspace-relative file path. */
export const FILE_DRAG_MIME = 'application/x-dsh-file'

/** Common document extensions that can be parsed as text. */
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
  maxDimension = MAX_IMAGE_DIMENSION
): Promise<File> {
  if (!isImageFile(file)) return file

  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') {
    return file
  }

  // Fast path: small files under 1.5MB that are within dimension need no recompression
  if (file.size <= 1.5 * 1024 * 1024) {
    return file
  }

  return new Promise<File>((resolve) => {
    let objectUrl = ''
    try {
      objectUrl = URL.createObjectURL(file)
    } catch {
      resolve(file)
      return
    }

    const img = new Image()
    const cleanup = (): void => {
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl)
        } catch {}
      }
    }

    img.onload = () => {
      cleanup()
      const origW = img.naturalWidth || img.width
      const origH = img.naturalHeight || img.height

      if (origW <= 0 || origH <= 0) {
        resolve(file)
        return
      }

      if (file.size <= maxBytes && origW <= maxDimension && origH <= maxDimension) {
        resolve(file)
        return
      }

      const { width: targetW, height: targetH } = calculateScaledDimensions(origW, origH, maxDimension)

      const canvas = document.createElement('canvas')
      canvas.width = targetW
      canvas.height = targetH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, targetW, targetH)

      const qualities = [0.85, 0.72, 0.55, 0.4]
      let qIndex = 0

      const tryNextQuality = (): void => {
        const quality = qualities[qIndex] ?? 0.5
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file)
              return
            }
            if (blob.size <= maxBytes || qIndex >= qualities.length - 1) {
              const baseName = file.name.replace(/\.[^.]+$/u, '')
              const compressedFile = new File([blob], `${baseName}.jpg`, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
              resolve(compressedFile)
            } else {
              qIndex++
              tryNextQuality()
            }
          },
          'image/jpeg',
          quality
        )
      }

      tryNextQuality()
    }

    img.onerror = () => {
      cleanup()
      resolve(file)
    }

    img.src = objectUrl
  })
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
 * Read and format any dropped OS file into the appropriate markdown snippet:
 * - Images: `![fileName](filePath)`
 * - Text/code documents (< 1MB): formatted code block with content
 * - Other files (PDF, Word, Excel, ZIP, binary, large files): `[fileName](filePath)`
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
