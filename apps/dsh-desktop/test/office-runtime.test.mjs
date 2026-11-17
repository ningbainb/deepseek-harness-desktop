import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOfficeFixtures, workbookValues, assertRecalculatedWorkbook, resolveOfficeRuntime } from '../scripts/verify-office-runtime.mjs'
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate'
test('the Office workbook fixture starts with stale zeros and the verification rejects unchanged caches', () => {
 const fixture = createOfficeFixtures()
 assert.equal(strFromU8(unzipSync(fixture.docx)['word/document.xml']).includes(fixture.text), true)
 assert.deepEqual(workbookValues(fixture.xlsx), { A1: 7, B1: 0, C1: 0, A2: 6, B2: 0 })
 assert.throws(() => assertRecalculatedWorkbook(fixture.xlsx), /SUM.*13/u)
 const entries = unzipSync(fixture.xlsx)
 entries['xl/worksheets/sheet1.xml'] = strToU8(strFromU8(entries['xl/worksheets/sheet1.xml']).replace('<f>SUM(A1:A2)</f><v>0</v>', '<f>SUM(A1:A2)</f><v>13</v>').replace('<f>B1+B2</f><v>0</v>', '<f>B1+B2</f><v>55</v>').replace('<f>A1*A2</f><v>0</v>', '<f>A1*A2</f><v>42</v>'))
 assert.deepEqual(assertRecalculatedWorkbook(zipSync(entries)), { B1: 13, B2: 42, C1: 55 })
})
test('Office runtime resolution uses the installed official rc3 service and 0.2.3 engine cohort', async () => {
 const runtime = await resolveOfficeRuntime()
 assert.equal(runtime.officeManifest.version, '0.2.2-rc.3'); assert.equal(runtime.kitManifest.version, '0.2.3')
 assert.equal(typeof runtime.office.OfficeKit, 'function'); assert.equal(typeof runtime.kit.createConverter, 'function')
})

test('a supplied packaged resource tree cannot silently borrow missing official SDK packages from the workspace', async t => {
 const root = await mkdtemp(join(tmpdir(), 'dsh-office-resource-resolution-'))
 t.after(() => rm(root, { recursive: true, force: true }))
 await mkdir(join(root, 'app.asar.unpacked'))
 await writeFile(join(root, 'app.asar.unpacked/package.json'), '{"name":"isolated-packaged-fixture"}')
 await assert.rejects(resolveOfficeRuntime(root), /Cannot find module|escaped supplied resources/u)
})
