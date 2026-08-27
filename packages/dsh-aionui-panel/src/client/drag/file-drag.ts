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
 * Format dropped document content as a markdown attachment block.
 */
export function formatDocumentAttachment(fileName: string, content: string, filePath?: string): string {
  const parts = fileName.split('.')
  const ext = parts.length > 1 ? (parts[parts.length - 1]?.toLowerCase() ?? '') : ''
  const lang = ext === 'txt' || ext === 'log' ? '' : ext
  const header = filePath ? `📎 [${fileName}](${filePath})` : `📎 **${fileName}**`
  const trimmed = content.trim()
  if (trimmed === '') return header
  return `${header}\n\`\`\`${lang}\n${trimmed}\n\`\`\``
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
