import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { createCommunityMarketService } from '../src/extensions/community-market.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const uiRoot = resolve(appDir, 'src', 'ui')
const outputArgument = process.argv.find((argument) => argument.toLowerCase().endsWith('.png'))
const output = resolve(outputArgument ?? 'market-preview.png')
const contentTypes = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
})

const catalog = await createCommunityMarketService().list()
const plugins = Object.freeze([
  Object.freeze({
    name: '@deepseek-ai/dsh-base',
    version: '0.1.1-rc.1',
    requested: '@deepseek-ai/dsh-base',
    enabled: true,
    builtIn: true,
    compatibility: { status: 'compatible' },
  }),
  Object.freeze({
    name: 'reasoning-slider',
    version: '0.0.3',
    requested: 'reasoning-slider',
    enabled: true,
    builtIn: true,
    compatibility: { status: 'compatible' },
  }),
])
const inventory = Object.freeze({
  plugins,
  skills: Object.freeze([]),
  communityPlugins: Object.freeze([]),
  qqbot: Object.freeze({ bound: false, binding: false, pending: false }),
})
const recovery = Object.freeze({
  safeMode: false,
  baselineQuarantineAvailable: false,
  disabledPlugins: Object.freeze([]),
  incidents: Object.freeze([]),
  snapshots: Object.freeze([]),
})

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const target = resolve(uiRoot, `.${decodeURIComponent(pathname === '/' ? '/extensions.html' : pathname)}`)
    if (target !== uiRoot && !target.startsWith(`${uiRoot}${sep}`)) throw new Error('invalid path')
    const body = await readFile(target)
    response.writeHead(200, { 'content-type': contentTypes[extname(target)] ?? 'application/octet-stream' })
    response.end(body)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
})
await new Promise((resolveListen, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolveListen)
})

const address = server.address()
if (address === null || typeof address === 'string') throw new Error('market capture server did not bind')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(({ catalogValue, inventoryValue, pluginsValue, recoveryValue }) => {
    const removeListener = () => {}
    window.dshDesktop = {
      listExtensions: async () => inventoryValue,
      getPluginRecoveryState: async () => recoveryValue,
      checkPluginUpdates: async () => pluginsValue,
      listCommunityMarket: async () => catalogValue,
      onQqBotEvent: () => removeListener,
      onExtensionProgress: () => removeListener,
      onExtensionNavigate: () => removeListener,
      onPresetPreview: () => removeListener,
      onPluginInstallPrefill: () => removeListener,
    }
  }, { catalogValue: catalog, inventoryValue: inventory, pluginsValue: plugins, recoveryValue: recovery })
  await page.goto(`http://127.0.0.1:${address.port}/extensions.html`, { waitUntil: 'domcontentloaded' })
  await page.locator('#market-tab').click()
  await page.locator('.market-card').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.body.dataset.busy !== 'true')
  const renderedCount = await page.locator('.market-card').count()
  if (renderedCount !== 20) throw new Error(`expected 20 market cards, found ${renderedCount}`)
  if (pageErrors.length > 0) throw new Error(`market page error: ${pageErrors.join('; ')}`)
  await page.screenshot({ path: output })
  console.log(`captured native market UI (${catalog.count} entries): ${output}`)
} finally {
  await browser.close()
  await new Promise((resolveClose) => server.close(resolveClose))
}
