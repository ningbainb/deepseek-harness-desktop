import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, stat, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const text = 'DSH Office runtime verification 2026'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const xml = value => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${value}`)
const relationships = target => xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="${target}"/></Relationships>`)
export function createOfficeFixtures() {
 const docx = zipSync({
  '[Content_Types].xml': xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels': relationships('word/document.xml'),
  'word/document.xml': xml(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`),
 })
 const xlsx = zipSync({
  '[Content_Types].xml': xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
  '_rels/.rels': relationships('xl/workbook.xml'),
  'xl/workbook.xml': xml('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Checks" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>'),
  'xl/_rels/workbook.xml.rels': xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml': xml('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C2"/><sheetData><row r="1"><c r="A1"><v>7</v></c><c r="B1"><f>SUM(A1:A2)</f><v>0</v></c><c r="C1"><f>B1+B2</f><v>0</v></c></row><row r="2"><c r="A2"><v>6</v></c><c r="B2"><f>A1*A2</f><v>0</v></c></row></sheetData></worksheet>'),
 })
 return { docx, xlsx, text }
}
export function workbookValues(bytes) {
 const entries = unzipSync(bytes), sheets = Object.keys(entries).filter(path => /^xl\/worksheets\/sheet\d+\.xml$/u.test(path))
 assert.ok(sheets.length, 'recalculated workbook must contain a worksheet')
 const values = {}
 for (const name of sheets) for (const match of strFromU8(entries[name]).matchAll(/<c\b[^>]*\br="([A-Z]+[0-9]+)"[^>]*>([\s\S]*?)<\/c>/gu)) {
  const value = match[2].match(/<v>([^<]+)<\/v>/u)
  if (value) values[match[1]] = Number(value[1])
 }
 return values
}
export function assertRecalculatedWorkbook(bytes) {
 const values = workbookValues(bytes)
 assert.equal(values.B1, 13, 'SUM must refresh stale cached zero to 13')
 assert.equal(values.B2, 42, 'multiplication must refresh stale cached zero to 42')
 assert.equal(values.C1, 55, 'dependent formula must refresh stale cached zero to 55')
 return { B1: values.B1, B2: values.B2, C1: values.C1 }
}
export async function resolveOfficeRuntime(resources) {
 let root = resources ? resolve(resources) : desktop
 if (resources && !root.endsWith('app.asar.unpacked')) root = join(root, 'app.asar.unpacked')
 const verifyLocation = async path => {
  if (!resources) return
  const rel = relative(await realpath(root), await realpath(path))
  assert.ok(rel && rel !== '..' && !rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(rel), `packaged Office dependency escaped supplied resources: ${path}`)
 }
 const appRequire = createRequire(join(root, 'package.json'))
 const dshPath = appRequire.resolve('@deepseek-ai/dsh/package.json')
 await verifyLocation(dshPath)
 const dshRequire = createRequire(dshPath)
 const officePath = dshRequire.resolve('@deepseek-ai/dsh-office-kit/package.json'), officeRequire = createRequire(officePath)
 const kitPath = officeRequire.resolve('@deepseek-ai/libreoffice-kit/package.json'), kitRequire = createRequire(kitPath)
 await verifyLocation(officePath); await verifyLocation(kitPath)
 const cordisPath = officeRequire.resolve('@deepseek-ai/cordis/package.json'); await verifyLocation(cordisPath)
 const officeManifest = JSON.parse(await readFile(officePath, 'utf8')), kitManifest = JSON.parse(await readFile(kitPath, 'utf8'))
 assert.equal(officeManifest.version, '0.2.2-rc.3', 'smoke must use the actual rc3 Office service')
 assert.equal(kitManifest.version, '0.2.3', 'smoke must use the selected official engine cohort')
 return { officePath, kitPath, officeManifest, kitManifest,
  office: await import(pathToFileURL(officeRequire.resolve('@deepseek-ai/dsh-office-kit')).href),
  kit: await import(pathToFileURL(kitRequire.resolve('@deepseek-ai/libreoffice-kit')).href),
  cordis: await import(pathToFileURL(officeRequire.resolve('@deepseek-ai/cordis')).href), kitRequire, verifyLocation,
 }
}
function errorDetails(error) {
 return { name: error?.name, code: error?.code, message: error?.message ?? String(error), ...(error?.cause ? { cause: errorDetails(error.cause) } : {}) }
}
export async function verifyOfficeRuntime({ resources, output = join(tmpdir(), `dsh-office-evidence-${process.pid}-${Date.now()}`), onProgress = message => console.log(message) } = {}) {
 output = resolve(output); await mkdir(output, { recursive: true }); await mkdir(join(output, 'scratch'), { recursive: true }); await mkdir(join(output, 'cache'), { recursive: true })
 const report = { platform: process.platform, arch: process.arch, status: 'running', output, steps: [], artifacts: [] }
 const changedEnv = { TEMP: join(output, 'scratch'), TMP: join(output, 'scratch'), TMPDIR: join(output, 'scratch'), LOCALAPPDATA: join(output, 'cache'), XDG_CACHE_HOME: join(output, 'cache') }
 const previous = Object.fromEntries(Object.keys(changedEnv).map(key => [key, process.env[key]]))
 Object.assign(process.env, changedEnv)
 let fiber, failure
 try {
  const runtime = await resolveOfficeRuntime(resources), discovered = await runtime.kit.discoverRuntime()
  if (resources && process.platform === 'win32' && process.arch === 'x64') {
   assert.equal(discovered.backend, 'native', 'Windows x64 Desktop must operate on its packaged native Office engine')
  }
  const engineName = discovered.backend === 'wasm' ? '@deepseek-ai/libreoffice-kit-wasm' : `@deepseek-ai/libreoffice-kit-${process.platform}-${process.arch}`
  const engineManifestPath = runtime.kitRequire.resolve(`${engineName}/prebuilds.json`)
  await runtime.verifyLocation(engineManifestPath)
  const engine = JSON.parse(await readFile(engineManifestPath, 'utf8'))
  report.runtime = { serviceVersion: runtime.officeManifest.version, kitVersion: runtime.kitManifest.version, ...discovered,
   enginePackage: engineName, engineManifestPath, engine: engine.engine, engineStatus: engine.status }
  const engineExecutable = engine.engine?.executable
  if (engineExecutable) report.runtime.engineExecutableBytes = (await stat(join(dirname(engineManifestPath), engineExecutable))).size
  onProgress(`Office engine ${process.platform}/${process.arch}: ${engineName} ${discovered.backend}`)
  const fixture = createOfficeFixtures()
  await writeFile(join(output, 'input.docx'), fixture.docx); await writeFile(join(output, 'input.xlsx'), fixture.xlsx)
  assert.deepEqual(workbookValues(fixture.xlsx), { A1: 7, B1: 0, C1: 0, A2: 6, B2: 0 })
  const ctx = new runtime.cordis.Context()
  fiber = ctx.plugin(runtime.office.OfficeKit, { outputDirectory: join(output, 'service-store'), timeoutMs: 120000, maxConcurrentConversions: 1, maxBackgroundConversions: 0 })
  await fiber
  const service = ctx.officeKit
  assert.ok(service, 'the official Cordis OfficeKit service must register')
  const source = (bytes, name) => ({ key: runtime.office.OfficeSourceKey(JSON.stringify({ owner: 'office-runtime-verification', path: join(output, name) })), version: hash(bytes), bytes: bytes.length,
   read: async (signal, maximum) => { signal.throwIfAborted(); assert.ok(bytes.length <= maximum); return { bytes: bytes.slice(), version: hash(bytes) } } })
  const doc = source(fixture.docx, 'input.docx'), book = source(fixture.xlsx, 'input.xlsx')
  const save = async (name, bytes) => { await writeFile(join(output, name), bytes); report.artifacts.push({ name, bytes: bytes.length, sha256: hash(bytes) }) }
  const step = async (name, operation) => {
   onProgress(`Office ${name}`); const started = Date.now()
   try { const result = await operation(); report.steps.push({ name, status: 'passed', elapsedMs: Date.now() - started }); return result }
   catch (error) { report.steps.push({ name, status: 'failed', elapsedMs: Date.now() - started }); throw error }
  }
  await step('document PDF preview through OfficeKit.convert', async () => {
   const result = await service.convert({ extension: 'docx', priority: 'foreground', source: doc })
   assert.equal(Buffer.from(result.pdf).subarray(0, 5).toString(), '%PDF-'); assert.ok(result.pdf.length > 100)
   await save('preview.pdf', result.pdf)
  })
  await step('document image preview through OfficeKit.renderImages', async () => {
   const result = await service.renderImages({ extension: 'docx', source: doc, pages: [1], dpi: 72, maxImages: 1, maxPixels: 4000000, maxDimension: 4096, maxBytes: 8000000 })
   assert.equal(result.images.length, 1); const image = result.images[0], png = Buffer.from(image.png)
   assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.ok(image.width > 0 && image.height > 0)
   assert.equal(png.readUInt32BE(16), image.width); assert.equal(png.readUInt32BE(20), image.height)
   await save('preview.png', image.png)
  })
  await step('document format conversion through OfficeKit.convertTo', async () => {
   const result = await service.convertTo({ extension: 'docx', format: 'txt', source: doc, output: { owner: 'office-smoke', name: 'converted.txt' } })
   const bytes = await readFile(result.path); assert.ok(bytes.toString('utf8').includes(text)); await save('converted.txt', bytes)
  })
  await step('workbook formula recalculation through OfficeKit.recalculate', async () => {
   const result = await service.recalculate({ extension: 'xlsx', format: 'xlsx', source: book, output: { owner: 'office-smoke', name: 'recalculated.xlsx' } })
   const bytes = await readFile(result.path); report.values = assertRecalculatedWorkbook(bytes); await save('recalculated.xlsx', bytes)
  })
  report.status = 'passed'
 } catch (error) { report.status = 'failed'; report.error = errorDetails(error); failure = error }
 finally {
  try { await fiber?.dispose() } catch (error) {
   report.status = 'failed'; if (!failure) { failure = error; report.error = errorDetails(error) }
  } finally {
   await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
   for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
 }
 if (failure) throw Object.assign(failure, { officeReport: report })
 return report
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 const args = process.argv.slice(2), options = {}
 for (let i = 0; i < args.length; i++) { if (args[i] === '--resources') options.resources = args[++i]; else if (args[i] === '--output') options.output = args[++i]; else throw Error(`Unknown Office smoke argument: ${args[i]}`) }
 try { console.log(JSON.stringify(await verifyOfficeRuntime(options), null, 2)) }
 catch (error) { console.error(JSON.stringify(error.officeReport ?? errorDetails(error), null, 2)); process.exitCode = 1 }
}
