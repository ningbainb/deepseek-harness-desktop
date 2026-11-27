const DOCUMENT_EXTENSIONS = new Set(['docx', 'xlsx', 'pptx', 'pdf', 'odt', 'ods', 'odp', 'rtf'])

export function isIngestibleDocument(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot >= 0 && DOCUMENT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}
