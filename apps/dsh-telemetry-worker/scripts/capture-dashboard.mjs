import { createServer } from 'node:http'
import { resolve } from 'node:path'

import { chromium } from 'playwright'

import { __test } from '../src/admin-dashboard.mjs'

const output = resolve(process.argv[2] ?? 'telemetry-dashboard-preview.png')
const summary = Object.freeze({
  schema: 3,
  rangeDays: 30,
  generatedAt: '2026-08-23T08:00:00.000Z',
  downloads: {
    totalClicks: 1284,
    trend: [
      { day: '2026-08-17', count: 94 },
      { day: '2026-08-18', count: 112 },
      { day: '2026-08-19', count: 176 },
      { day: '2026-08-20', count: 203 },
      { day: '2026-08-21', count: 229 },
      { day: '2026-08-22', count: 247 },
      { day: '2026-08-23', count: 223 },
    ],
    countries: [],
    sources: [{ source: 'hero', count: 632 }, { source: 'nav', count: 418 }, { source: 'install', count: 234 }],
    versions: [],
  },
  desktop: {
    launches: 3841,
    surfaces: [{ surface: 'settings', count: 904 }, { surface: 'extensions', count: 517 }],
    events: [{ event: 'app_launch', count: 3841 }, { event: 'app_session_end', count: 2860 }],
  },
  active: {
    dau: 486,
    mau: 2319,
    dailyTrend: [],
    monthlyTrend: [],
    countries: [{ countryCode: 'CN', count: 1784 }, { countryCode: 'US', count: 226 }, { countryCode: 'SG', count: 104 }],
    versions: [{ version: '3.0.2', count: 1964 }, { version: '3.0.1', count: 355 }],
  },
  funnels: {
    updates: [{ event: 'update_available', count: 901 }, { event: 'update_completed', count: 724 }],
    dock: [{ event: 'dock_entry_impression', count: 1840 }, { event: 'dock_entry_click', count: 612 }, { event: 'dock_opened', count: 581 }],
  },
  retention: {
    d1: { cohortUsers: 1320, retainedUsers: 721, rate: 54.62 },
    d7: { cohortUsers: 984, retainedUsers: 381, rate: 38.72 },
    d30: { cohortUsers: 447, retainedUsers: 126, rate: 28.19 },
    cohorts: [
      { cohortDay: '2026-08-21', cohortUsers: 102, retainedD1: 58, retainedD7: null, retainedD30: null },
      { cohortDay: '2026-08-15', cohortUsers: 87, retainedD1: 51, retainedD7: 32, retainedD30: null },
      { cohortDay: '2026-07-20', cohortUsers: 74, retainedD1: 43, retainedD7: 29, retainedD30: 22 },
    ],
  },
  usage: {
    sessionDurations: [
      { bucket: 'under-5m', count: 486 },
      { bucket: '5-30m', count: 1204 },
      { bucket: '30-120m', count: 921 },
      { bucket: 'over-120m', count: 249 },
    ],
  },
})

const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  if (path === '/admin/dashboard.js') {
    response.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' })
    response.end(__test.DASHBOARD_SCRIPT)
    return
  }
  if (path === '/admin/api/summary') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(summary))
    return
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(__test.DASHBOARD_PAGE)
})

await new Promise((resolveListen, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolveListen)
})
const address = server.address()
if (address === null || typeof address === 'string') throw new Error('preview server did not bind')

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto(`http://127.0.0.1:${address.port}/admin`, { waitUntil: 'networkidle' })
  await page.locator('#load-state[data-state="ready"]').waitFor({ state: 'visible' })
  if (pageErrors.length > 0) throw new Error(`dashboard page error: ${pageErrors.join('; ')}`)
  await page.screenshot({ path: output, fullPage: true })
  console.log(output)
} finally {
  await browser.close()
  await new Promise(resolveClose => server.close(resolveClose))
}
