import { basename } from 'node:path/posix'
import type { DOMParser, Element } from 'linkedom'

interface Formula {
  address: string
  expression: string
}

type MarkdownFormulas = (sheetNames: readonly string[]) => string
type XmlDocument = ReturnType<DOMParser['parseFromString']>

const MAX_FORMULAS = 5000
const MAX_EXPRESSION_LENGTH = 8192
const MAX_FORMULA_CHARS = 1024 * 1024

function selectChildren(node: Element, name: string): Element[] {
  return Array.from(node.children).filter(child => child.tagName.split(':').at(-1) === name)
}

function selectDescendants(node: XmlDocument | Element, name: string): Element[] {
  const elements = node.querySelectorAll('*') as Iterable<Element>
  return Array.from(elements).filter(child => child.tagName.split(':').at(-1) === name)
}

function utf8(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  return new TextDecoder().decode(bytes)
}

function markdownLiteral(text: string): string {
  const inline = text.replace(/\s+/gu, ' ').trim()
  let fence = '`'
  for (const run of inline.matchAll(/`+/gu)) {
    if (run[0].length >= fence.length) fence = '`'.repeat(run[0].length + 1)
  }
  return `${fence} ${inline} ${fence}`
}

function columnName(index: number): string {
  let position = index
  let result = ''
  while (position > 0) {
    position--
    result = String.fromCharCode(65 + position % 26) + result
    position = Math.floor(position / 26)
  }
  return result
}

function repeatLength(node: Element, attribute: string): number {
  const count = Number(node.getAttribute(attribute) ?? 1)
  return Number.isSafeInteger(count) && count > 0 ? Math.min(count, 1_048_576) : 1
}

export async function createSpreadsheetFormulaReader(format: 'xlsx' | 'ods'): Promise<{
  shouldRead: (name: string) => boolean
  readPart: (name: string, data: Buffer) => void
  markdown: MarkdownFormulas
}> {
  const { DOMParser } = await import('linkedom')
  const worksheetFormulas = new Map<string, Formula[]>()
  const idToPart = new Map<string, string>()
  const sheetToId = new Map<string, string>()
  let formulasCount = 0
  let formulaChars = 0

  const pushFormula = (formulas: Formula[], address: string, expression: string | null | undefined): void => {
    if (!expression) return
    formulasCount++
    formulaChars += expression.length
    if (formulasCount > MAX_FORMULAS || expression.length > MAX_EXPRESSION_LENGTH || formulaChars > MAX_FORMULA_CHARS) {
      throw new Error('Spreadsheet formula data exceeds the document extraction limit.')
    }
    formulas.push({ address, expression })
  }

  function readXlsxPart(name: string, xml: XmlDocument): void {
    if (name === 'xl/workbook.xml') {
      for (const sheet of selectDescendants(xml, 'sheet')) {
        const sheetName = sheet.getAttribute('name')
        const id = sheet.getAttribute('r:id')
        if (sheetName && id) sheetToId.set(sheetName, id)
      }
    } else if (name === 'xl/_rels/workbook.xml.rels') {
      for (const rel of selectDescendants(xml, 'Relationship')) {
        const id = rel.getAttribute('Id')
        const path = rel.getAttribute('Target')
        const relation = rel.getAttribute('Type')
        if (id && path && relation?.endsWith('/worksheet') && rel.getAttribute('TargetMode') !== 'External') {
          idToPart.set(id, basename(path))
        }
      }
    } else {
      const formulas: Formula[] = []
      for (const cell of selectDescendants(xml, 'c')) {
        const address = cell.getAttribute('r')
        const formula = selectChildren(cell, 'f')[0]
        if (!address || !formula || !/^[A-Z]{1,3}[1-9]\d{0,6}$/iu.test(address)) continue
        const text = formula.textContent?.trim()
        if (text) pushFormula(formulas, address, `=${text}`)
        else if (formula.getAttribute('t') === 'shared') {
          const sharedGroup = formula.getAttribute('si') ?? ''
          if (/^\d{1,8}$/u.test(sharedGroup)) pushFormula(formulas, address, `Shared formula group ${sharedGroup}`)
        }
      }
      if (formulas.length) worksheetFormulas.set(basename(name), formulas)
    }
  }

  function readOdsPart(xml: XmlDocument): void {
    const spreadsheet = selectDescendants(xml, 'spreadsheet')[0]
    if (!spreadsheet) return
    for (const sheet of selectChildren(spreadsheet, 'table')) {
      const name = sheet.getAttribute('table:name')
      if (!name) continue
      const formulas: Formula[] = []
      let row = 1
      for (const record of selectDescendants(sheet, 'table-row')) {
        let column = 1
        const rowCount = repeatLength(record, 'table:number-rows-repeated')
        for (const cell of Array.from(record.children)) {
          const tag = cell.tagName.split(':').at(-1)
          if (tag !== 'table-cell' && tag !== 'covered-table-cell') continue
          const columns = repeatLength(cell, 'table:number-columns-repeated')
          const first = `${columnName(column)}${row}`
          const address = rowCount + columns === 2 ? first : `${first}:${columnName(column + columns - 1)}${row + rowCount - 1}`
          pushFormula(formulas, address, cell.getAttribute('table:formula'))
          column += columns
        }
        row += rowCount
      }
      if (formulas.length) worksheetFormulas.set(name, formulas)
    }
  }

  return {
    shouldRead: format === 'ods'
      ? name => name === 'content.xml'
      : name => name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/[^/]+\.xml$/iu.test(name),
    readPart(name, data) {
      const xml = new DOMParser().parseFromString(utf8(data), 'text/xml')
      if (format === 'xlsx') readXlsxPart(name, xml)
      else readOdsPart(xml)
    },
    markdown(sheetNames) {
      const sections = sheetNames.flatMap(name => {
        const key = format === 'ods' ? name : idToPart.get(sheetToId.get(name) ?? '') ?? name
        const entries = worksheetFormulas.get(key) ?? []
        if (!entries.length) return []
        return [`\n\n### Formulas in ${markdownLiteral(name)}\n\n${entries.map(({ address, expression }) =>
          `- ${address} ${markdownLiteral(expression)}`).join('\n')}`]
      })
      return sections.join('')
    },
  }
}
