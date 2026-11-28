import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inspectDocument, readDocument } from '../src/index.ts'
import { runParseWorker } from '../src/host/worker.ts'

let workspace: string

beforeEach(async () => {
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'dsh-doc-parser-')))
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

function pdfWithStreams(streams: string[], options: { encrypted?: boolean; chinese?: boolean } = {}): Buffer {
  const pageIds = streams.map((_, index) => 4 + index * 2)
  const descendantFontId = 4 + streams.length * 2
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${streams.length} >>`,
    options.chinese
      ? `<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /GBK-EUC-H /DescendantFonts [${descendantFontId} 0 R] >>`
      : '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...streams.flatMap((stream, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[index] + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ]),
  ]
  if (options.chinese) {
    objects.push('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>')
  }
  if (options.encrypted) {
    const key = '00'.repeat(32)
    objects.push(`<< /Filter /Standard /V 1 /R 2 /O <${key}> /U <${key}> /P -4 >>`)
  }
  let source = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const start = Buffer.byteLength(source)
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
    return start
  })
  const xref = Buffer.byteLength(source)
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  source += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  const encryption = options.encrypted ? ` /Encrypt ${objects.length} 0 R /ID [<0123456789abcdef> <0123456789abcdef>]` : ''
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R${encryption} >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(source, 'utf8')
}

describe('document parser worker', () => {
  it('extracts a Word document with Chinese paragraphs and a table', async () => {
    await writeFile(join(workspace, 'report.docx'), zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
      'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>季度报告</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>项目</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>收入</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>甲方</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>42</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'),
    }))
    const result = await readDocument(workspace, 'report.docx')
    expect(result.metadata.format).toBe('docx')
    expect(result.markdown).toMatch(/季度报告/)
    expect(result.markdown).toMatch(/\|.*甲方.*\|.*42.*\|/)
  }, 15_000)

  it('exposes workbook names and extracts the selected sheet only', async () => {
    const sheet = (name: string) => `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${name}</t></is></c><c r="B1"><f>40+2</f><v>42</v></c></row></sheetData></worksheet>`
    await writeFile(join(workspace, 'workbook.xlsx'), zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
      '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="doc" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="第一季度" sheetId="1" r:id="rId1"/><sheet name="第二季度" sheetId="2" r:id="rId2"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8(sheet('表一明细')),
      'xl/worksheets/sheet2.xml': strToU8(sheet('表二明细')),
    }))
    const result = await readDocument(workspace, 'workbook.xlsx', { sheet: '第二季度' })
    expect(result.metadata.sheets).toEqual(['第一季度', '第二季度'])
    expect(result.markdown).toContain('表二明细')
    expect(result.markdown).toContain('42')
    expect(result.markdown).toContain('=40+2')
    expect(result.markdown).not.toContain('表一明细')
  }, 15_000)

  it('extracts RTF text and filters credential-like values', async () => {
    await writeFile(join(workspace, 'report.rtf'), '{\\rtf1\\ansi Authorized report.\\par token=sample-token-value}')
    const result = await readDocument(workspace, 'report.rtf')
    expect(result.markdown).toContain('Authorized report.')
    expect(result.markdown).toContain('[REDACTED]')
    expect(result.markdown).not.toContain('sample-token-value')
  })

  it('extracts text from an OpenDocument package', async () => {
    const mime = 'application/vnd.oasis.opendocument.text'
    await writeFile(join(workspace, 'brief.odt'), zipSync({
      mimetype: [strToU8(mime), { level: 0 }],
      'content.xml': strToU8('<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h text:outline-level="1">项目方案</text:h><text:p>这是一段本地文档文字。</text:p></office:text></office:body></office:document-content>'),
    }))
    const result = await readDocument(workspace, 'brief.odt')
    expect(result.metadata.headings).toContain('项目方案')
    expect(result.markdown).toContain('这是一段本地文档文字。')
  })

  it('includes the speaker notes associated with a slide', async () => {
    const content = (name: string, text: string) => `<p:${name} xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:${name}>`
    await writeFile(join(workspace, 'slides.pptx'), zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'),
      'ppt/presentation.xml': strToU8('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>'),
      'ppt/_rels/presentation.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'),
      'ppt/slides/slide1.xml': strToU8(content('sld', 'Quarterly review slide')),
      'ppt/slides/_rels/slide1.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="notes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>'),
      'ppt/notesSlides/notesSlide1.xml': strToU8(content('notes', 'Discuss additional risks.')),
    }))
    const result = await readDocument(workspace, 'slides.pptx', { pages: '1' })
    expect(result.metadata.pages).toBe(1)
    expect(result.markdown).toContain('Quarterly review slide')
    expect(result.markdown).toContain('Discuss additional risks.')
  })

  it('selects the requested PDF page and reports the original page count', async () => {
    await writeFile(join(workspace, 'pages.pdf'), pdfWithStreams([
      'BT /F1 12 Tf 10 100 Td (First page) Tj ET',
      'BT /F1 12 Tf 10 100 Td (Second page) Tj ET',
    ]))
    const result = await readDocument(workspace, 'pages.pdf', { pages: '2' })
    expect(result.metadata).toMatchObject({ format: 'pdf', pages: 2, scannedPdf: false })
    expect(result.markdown).toContain('Second page')
    expect(result.markdown).not.toContain('First page')
  })

  it('reports the absence of a text layer for a PDF', async () => {
    await writeFile(join(workspace, 'scan.pdf'), pdfWithStreams(['0 0 1 1 re f']))
    await expect(inspectDocument(workspace, 'scan.pdf')).resolves.toMatchObject({ format: 'pdf', pages: 1, scannedPdf: true })
  })

  it('resolves a Chinese font through the local CMap assets across PDF pages', async () => {
    await writeFile(join(workspace, 'chinese.pdf'), pdfWithStreams([
      'BT /F1 12 Tf 10 100 Td <D6D0CEC4> Tj ET',
      'BT /F1 12 Tf 10 100 Td <B1A8B8E6> Tj ET',
    ], { chinese: true }))
    const result = await readDocument(workspace, 'chinese.pdf')
    expect(result.metadata.pages).toBe(2)
    expect(result.markdown).toContain('中文')
    expect(result.markdown).toContain('报告')
  })

  it('rejects a malformed PDF', async () => {
    await writeFile(join(workspace, 'broken.pdf'), '%PDF-1.4\nmalformed')
    await expect(readDocument(workspace, 'broken.pdf')).rejects.toThrow(/parse/i)
  })

  it('reports a protected PDF as unreadable without prompting for a password', async () => {
    await writeFile(join(workspace, 'protected.pdf'), pdfWithStreams([''], { encrypted: true }))
    await expect(readDocument(workspace, 'protected.pdf')).rejects.toThrow(/encrypted/i)
  })

  it('extracts webpage text while retaining code and stripping active content', async () => {
    const html = '<html><head><title>Parsing test</title></head><body><main><article><h1>Parsing test</h1><p>A descriptive main article paragraph about extracting public content. It is long enough to identify the main article.</p><pre><code class="language-js">const total = 1;</code></pre><script>notArticleContent()</script></article></main></body></html>'
    const result = await runParseWorker({ kind: 'web', html, url: 'https://example.com/article' })
    expect(result.markdown).toMatch(/```js\s+const total = 1;\s+```/u)
    expect(result.markdown).not.toContain('notArticleContent')
    expect(result.metadata).toMatchObject({ format: 'html', domain: 'example.com' })
  })

  it('does not start a parse after cancellation', async () => {
    const controller = new AbortController()
    controller.abort(new Error('caller cancelled'))
    await expect(runParseWorker({ kind: 'web', html: '<p>test</p>', url: 'https://example.com/' }, { signal: controller.signal })).rejects.toThrow('caller cancelled')
  })

  it('terminates a worker that did not respond before its deadline', async () => {
    await expect(runParseWorker(
      { kind: 'web', html: '<p>test</p>', url: 'https://example.com/' },
      { timeoutMs: 1 },
    )).rejects.toThrow(/time limit/i)
    const recovered = await runParseWorker({ kind: 'web', html: '<article><p>Next request</p></article>', url: 'https://example.com/' })
    expect(recovered.markdown).toContain('Next request')
  })
})
