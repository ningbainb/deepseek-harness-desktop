import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { readFile, readdir, mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import worker from '../src/index.mjs'
import { createSession, sessionCookie } from '../src/admin-auth.mjs'

const db = new DatabaseSync(':memory:')
for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(file => file.endsWith('.sql')).sort()) db.exec(await readFile(new URL('../migrations/' + file, import.meta.url), 'utf8'))
const today = new Date().toISOString().slice(0, 10)
db.prepare("INSERT INTO product_measurement_coverage VALUES ('release-observations', ?)").run(today)
db.prepare("INSERT INTO product_release_daily VALUES (?, ?, '3.3.0', 'feature_attachment', 'succeeded', 'file', 3)").run(today, 'a'.repeat(64))
db.prepare("INSERT INTO product_release_daily VALUES (?, ?, '3.3.0', 'app_launch', 'started', 'normal', 1)").run(today, 'a'.repeat(64))
const env = { ADMIN_PASSWORD_SHA256: 'a'.repeat(43), ADMIN_SESSION_SECRET: 'b'.repeat(43), METRICS: {
  prepare(sql) { let values = []; const s = { bind(...args) { values = args; return s }, async all() { return { results: db.prepare(sql).all(...values) } } }; return s },
} }
const cookie = sessionCookie(await createSession(env)).split(';')[0]
let failRelease = false
const server = createServer(async (req, res) => {
  try {
    if (failRelease && req.url.startsWith('/admin/api/release')) { res.writeHead(503); res.end(); return }
    const request = new Request('https://test.invalid' + req.url, { headers: { cookie } })
    const response = await worker.fetch(request, env)
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
  } catch { res.writeHead(500); res.end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
try {
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:' + server.address().port + '/admin')
  await page.waitForFunction(() => document.querySelector('#release-export')?.disabled === false)
  assert.match(await page.locator('#release-rows').innerText(), /普通文件添加/)
  await page.selectOption('#release-version', '3.3.0')
  await page.waitForFunction(() => document.querySelector('#release-export')?.disabled === false)
  const downloading = page.waitForEvent('download'); await page.click('#release-export'); const download = await downloading
  assert.match(download.suggestedFilename(), /3\.3\.0/)
  const csv = await readFile(await download.path(), 'utf8'); assert.match(csv, /feature_attachment/); assert.doesNotMatch(csv, /aaaa|installation_actor/)
  await mkdir(new URL('../../../.tmp/analytics-qa/', import.meta.url), { recursive: true })
  await page.screenshot({ path: new URL('../../../.tmp/analytics-qa/release-dashboard.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), fullPage: true })
  await page.setViewportSize({ width: 720, height: 1000 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  failRelease = true; await page.selectOption('#release-days', '7')
  await page.waitForFunction(() => document.querySelector('#release-coverage').textContent.includes('加载失败'))
  assert.equal(await page.locator('#release-active').innerText(), '--')
  assert.equal(await page.locator('#release-export').isDisabled(), true)
  assert.deepEqual(errors, [])
  console.log('PASS release dashboard: authenticated SQL, version filter, CSV, narrow layout, failure state; local fixtures only')
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); db.close() }
