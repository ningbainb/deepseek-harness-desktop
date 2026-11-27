export interface MarkdownChunk {
  headings: readonly string[]
  text: string
}

const TARGET_TOKENS = 600
const OVERLAP_TOKENS = Math.round(TARGET_TOKENS * 0.15)
const MAX_CHUNK_CHARS = 12_000

export function chunkMarkdown(markdown: string): MarkdownChunk[] {
  const chunks: MarkdownChunk[] = []
  const headings: string[] = []
  let section: string[] = []
  let fence: string | undefined
  const flush = () => {
    const body = section.join('\n').trim()
    section = []
    if (!body) return
    const words = Array.from(body.matchAll(/\p{Script=Han}|(?:(?!\p{Script=Han})[^\s]){1,24}/gu), word => word.index)
    for (let start = 0; start < words.length;) {
      const end = Math.min(words.length, start + TARGET_TOKENS)
      const startChar = words[start]!
      const endChar = Math.min(words[end] ?? body.length, startChar + MAX_CHUNK_CHARS)
      chunks.push({ headings: headings.filter(Boolean), text: body.slice(startChar, endChar).trimEnd() })
      if (end === words.length && endChar === body.length) break
      let next = Math.max(start + 1, end - OVERLAP_TOKENS)
      while (next > start + 1 && words[next]! >= endChar) next--
      start = next
    }
  }
  for (const line of markdown.replace(/\r\n?/gu, '\n').split('\n')) {
    const marker = /^ {0,3}(\x60{3,}|~{3,})/u.exec(line)?.[1]
    if (marker) {
      if (fence === undefined) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
      section.push(line)
      continue
    }
    const heading = fence === undefined ? /^ {0,3}(#{1,6}) +(.+?) *#* *$/u.exec(line) : null
    if (!heading) {
      section.push(line)
      continue
    }
    flush()
    const level = heading[1]!.length
    headings.length = level
    headings[level - 1] = heading[2]!.slice(0, 160)
  }
  flush()
  return chunks
}
