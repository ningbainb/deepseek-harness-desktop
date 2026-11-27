/**
 * Structural validation for a bundled `agent.cordis.yml`.
 *
 * Deliberately dependency-free: it parses only the flat row metadata the sync
 * and the dsh agent-presets loader rely on. Every top-level row is written as
 * `- id: <id>` at column zero, with the `name`/`group`/`disabled` keys at two
 * spaces of indentation. Nested `config:` and `isolate:` bodies are opaque to
 * this validator — the dsh loader checks their semantics.
 *
 * Returns the list of problems found; an empty array means the document is
 * structurally valid.
 */

/** A top-level row opener: `- id: <id>` (id may be blank for diagnostics). */
const ROW_RE = /^-\s+id:\s*(.*)$/
/** Any top-level list item, for ids missing from a row opener. */
const ITEM_RE = /^-\s/
/** A two-space-indented flat metadata key: `  name: <value>`. */
const META_RE = /^ {2}([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/
/** The only `name` forms the dsh agent-presets loader mounts from a row. */
const NAME_PREFIX_RE = /^(\.\/|@|cordis:)/

/** Strip one pair of surrounding single or double quotes from a scalar. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    if ((first === "'" || first === '"') && value.endsWith(first)) {
      return value.slice(1, -1)
    }
  }
  return value
}

/**
 * Validate the structural contract of an `agent.cordis.yml` document.
 * @param text - the raw YAML document text.
 * @returns a list of human-readable problems; empty means valid.
 */
export function validateAgentCordis(text: string): string[] {
  const errors: string[] = []
  const normalized = text.replace(/\r\n/g, '\n')
  if (normalized.trim() === '') {
    return ['document is empty']
  }

  const seenIds = new Set<string>()
  const current = { id: null as string | null, name: null as string | null, group: null as string | null }

  const closeRow = (): void => {
    if (current.id === null) return
    if (current.name === null) {
      errors.push(`row "${current.id}": missing "name" key`)
    } else if (!NAME_PREFIX_RE.test(current.name)) {
      errors.push(`row "${current.id}": name "${current.name}" must start with "./", "@" or "cordis:"`)
    }
    if (current.group === 'true' && current.name !== 'cordis:group') {
      errors.push(`row "${current.id}": "group: true" requires name "cordis:group"`)
    }
    current.name = null
    current.group = null
    current.id = null
  }

  const lines = normalized.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const row = ROW_RE.exec(line)
    if (row !== null) {
      closeRow()
      const id = row[1].trim()
      if (id === '') {
        errors.push(`line ${lineNo}: empty row id`)
        current.id = null
      } else {
        if (seenIds.has(id)) errors.push(`line ${lineNo}: duplicate row id "${id}"`)
        seenIds.add(id)
        current.id = id
      }
      current.name = null
      current.group = null
      continue
    }

    if (current.id === null) {
      if (ITEM_RE.test(line)) {
        errors.push(`line ${lineNo}: list item does not declare an "id:"`)
      } else if (/^\S/.test(line)) {
        errors.push(`line ${lineNo}: content outside a "- id:" row`)
      }
      continue
    }

    const meta = META_RE.exec(line)
    if (meta !== null) {
      const value = unquote(meta[2].trim())
      if (meta[1] === 'name') current.name = value
      else if (meta[1] === 'group') current.group = value
      continue
    }
    // Anything indented at least two spaces is a nested body, opaque here.
    if (/^ {2}/.test(line)) continue
    errors.push(`line ${lineNo}: unexpected content in row "${current.id}"`)
  }
  closeRow()
  return errors
}
