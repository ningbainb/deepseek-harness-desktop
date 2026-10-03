import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { BUILTIN_SKIN_IDS } from '../src/profile.mjs'
import { STAR_PROMPT_VERSION } from '../src/star-prompt.mjs'
import { seedPrimaryRuntimePermissionForTest } from './primary-runtime-permission-fixture.mjs'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporary = await mkdtemp(join(tmpdir(), 'dsh-account-skin-chrome-'))
const userData = join(temporary, 'user-data')
const dshHome = join(temporary, 'dsh-home')
const evidence = { temporary, skins: [], baiSetupReady: false, loginDialog: null, authorizationLinkForwarded: false, authInit: false, callback: false, signedIn: false }
const requests = []
let initialization
let app
let platformOrigin
const mock = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
  requests.push({ path: request.url, body })
  let data
  if (request.url === '/auth-api/v0/dsh/auth_init') {
    initialization = body
    data = { authorize_url: `${platformOrigin}/dsh/authorize?authorize_id=isolated-fixture`, authorize_id: 'isolated-fixture', expires_in: 120 }
  } else if (request.url === '/auth-api/v0/dsh/auth_exchange') {
    assert.equal(body.code, 'isolated-code')
    assert.equal(body.redirect_uri, initialization.redirect_uri)
    assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), initialization.code_challenge)
    data = { token: 'dsh_mock_isolated_account_fixture', authorized_url: `${platformOrigin}/dsh/authorized` }
  } else {
    response.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ code: 1 }))
    return
  }
  response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ code: 0, data: { biz_code: 0, biz_data: data } }))
})

try {
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve))
  platformOrigin = `http://127.0.0.1:${mock.address().port}`
  await Promise.all([mkdir(userData), mkdir(dshHome)])
  await writeFile(join(userData, 'star-prompt-state.json'), JSON.stringify({ schemaVersion: 1, shownVersions: [STAR_PROMPT_VERSION] }))
  await writeFile(join(dshHome, 'cordis.patch.yml'), `- id: deepseek-account\n  config:\n    platformOrigin: ${platformOrigin}\n    desktopPlatform: ${process.platform}\n    allowLoopbackHttp: true\n- id: ui-settings-account\n  config:\n    step: done\n    completion: skipped\n`)
  await seedPrimaryRuntimePermissionForTest({ userData })
  const executable = process.env.DSH_DESKTOP_E2E_EXECUTABLE
  app = await electron.launch({ executablePath: executable || electronPath,
    args: executable ? [] : [join(appDir, 'src', 'main.mjs')], cwd: appDir,
    env: { ...process.env, DSH_DESKTOP_USER_DATA: userData, DSH_HOME: dshHome, DSH_AGENTS_HOME: join(temporary, 'agents'),
      DSH_DESKTOP_DISABLE_UPDATES: '1', DSH_DESKTOP_VERIFY_UPDATER: '0', DSH_DESKTOP_DISABLE_PROTOCOL_REGISTRATION: '1' } })
  app.process().stdout?.on('data', chunk => process.stdout.write(chunk))
  app.process().stderr?.on('data', chunk => process.stderr.write(chunk))
  const deadline = Date.now() + 180_000
  let page
  while (Date.now() < deadline) {
    page = app.windows().find(candidate => /^dsh-runtime:\/\/app\//u.test(candidate.url()))
    if (page) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(page, 'isolated Runtime window must become ready')
  page.on('console', message => { if (message.type() === 'error') console.error(`renderer: ${message.text()}`) })
  page.on('pageerror', error => console.error(`renderer exception: ${error.message}`))
  console.log(`Runtime window ready: ${temporary}`)
  await page.waitForFunction(() => window.__skinRuntime?.controller && document.querySelector('[data-dsh-frame]'), undefined, { timeout: 120_000 })
  for (const id of [...BUILTIN_SKIN_IDS, null]) {
    await page.evaluate(async target => {
      const runtime = window.__skinRuntime
      await runtime.refreshCatalog()
      const entry = target === null ? null : runtime.find(target)
      if (target !== null && entry === null) throw new Error(`missing preserved skin ${target}: ${JSON.stringify({ catalog: runtime.catalog()?.map(item => item.manifest.id), diagnostics: runtime.diagnostics(), replaced: window.__skinRuntime !== runtime })}`)
      if (await runtime.controller.switchTo(target, entry) !== target) throw new Error(`skin ${target} did not activate: ${JSON.stringify(runtime.controller.getState())}`)
    }, id)
    await page.waitForTimeout(350)
    const geometry = await page.evaluate(() => {
      const root = document.getElementById('root').getBoundingClientRect()
      const bars = [...document.body.children].filter(element => element.hasAttribute('data-skin-chrome')).flatMap(element => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return style.position === 'fixed' && style.display !== 'none' && style.visibility !== 'hidden' && box.height > 0
          ? [{ kind: element.getAttribute('data-skin-chrome'), top: box.top, bottom: box.bottom }] : []
      })
      return { root: { top: root.top, bottom: root.bottom }, bars, viewport: innerHeight,
        rootStyle: document.getElementById('root').getAttribute('style'), rootClass: document.getElementById('root').className,
        rootPosition: getComputedStyle(document.getElementById('root')).position,
        bodyStyle: { padding: getComputedStyle(document.body).padding, display: getComputedStyle(document.body).display, transform: getComputedStyle(document.body).transform },
        desktopChrome: document.documentElement.getAttribute('data-dsh-desktop-window-chrome'),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        topInset: getComputedStyle(document.documentElement).getPropertyValue('--dsh-desktop-skin-top-inset').trim() }
    })
    await writeFile(join(temporary, 'last-geometry.json'), JSON.stringify({ id, geometry }, null, 2))
    if (id === 'blue-fantasy') await page.screenshot({ path: join(temporary, 'blue-fantasy.png') })
    assert.ok(geometry.root.top >= 32 - 1, `${id}: ${JSON.stringify(geometry)}`)
    assert.ok(geometry.root.bottom <= geometry.viewport + 1, `${id}: ${JSON.stringify(geometry)}`)
    assert.equal(geometry.overflow, false, `${id}: horizontal overflow`)
    for (const bar of geometry.bars) {
      if (bar.kind === 'titlebar') {
        assert.ok(bar.top >= 32 - 1, `${id}: skin caption under Desktop caption`)
        assert.ok(geometry.root.top >= bar.bottom - 1, `${id}: skin caption covers root ${JSON.stringify(geometry)}`)
      }
      if (bar.kind === 'statusbar') assert.ok(geometry.root.bottom <= bar.top + 1, `${id}: status bar covers root`)
    }
    if (id === null) assert.equal(geometry.topInset, '0px', 'removing a skin retracts its caption reservation')
    evidence.skins.push({ id, geometry })
    console.log(`Skin caption geometry passed: ${id ?? 'official'}`)
    if (['xp', 'miku', 'trading'].includes(id)) await page.screenshot({ path: join(temporary, `${id}.png`) })
  }
  await page.evaluate(async () => { const runtime = window.__skinRuntime; await runtime.controller.switchTo('xp', runtime.find('xp')) })
  const account = page.locator('[data-signed-out="true"][aria-haspopup="menu"]').first()
  await account.click()
  const menu = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: /^(?:登录|Sign in)$/u }) }).first()
  const official = menu.getByRole('menuitem', { name: /^(?:登录|Sign in)$/u })
  await menu.locator('[data-dsh-account-relay]').waitFor({ timeout: 15_000 })
  assert.equal(await official.isVisible(), true)
  assert.equal(await official.isEnabled(), true)
  const recommended = menu.locator('[data-dsh-account-relay]')
  assert.match(await recommended.innerText(), /(?:低于官方|cost less than the official)/u)
  await page.screenshot({ path: join(temporary, 'account-menu-xp.png') })
  const dockOpened = app.waitForEvent('window', { timeout: 30_000 })
  await recommended.getByRole('menuitem').click()
  const dock = await dockOpened
  await dock.waitForURL(url => url.pathname.endsWith('/extensions.html'), { timeout: 30_000 })
  await dock.locator('#models-tab.active[aria-selected="true"]').waitFor({ timeout: 60_000 })
  const settingsDeadline = Date.now() + 60_000
  let baiSettings
  while (Date.now() < settingsDeadline) {
    baiSettings = app.windows().find(candidate => candidate.url().includes('desktop-dock-setting='))
    if (baiSettings) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(baiSettings, 'bai recommendation opens existing provider setup view')
  await baiSettings.locator('[data-dsh-dock-settings="models"] [data-relay-onboarding-card="true"]').waitFor({ timeout: 60_000 })
  await baiSettings.getByRole('button', { name: /^(?:登录或注册，自动连接 bai|Sign in or register and connect bai)$/u }).waitFor({ timeout: 30_000 })
  evidence.baiSetupReady = true
  await baiSettings.screenshot({ path: join(temporary, 'bai-provider-setup.png') })
  await dock.close()
  if (await account.getAttribute('aria-expanded') !== 'true') await account.click()
  await official.click()
  await page.getByRole('dialog').waitFor({ timeout: 15_000 })
  const loginDialog = await page.getByRole('dialog').evaluate(dialog => {
    const rectangle = dialog.getBoundingClientRect()
    const target = document.elementFromPoint(rectangle.left + rectangle.width / 2, rectangle.top + rectangle.height / 2)
    return { top: rectangle.top, bottom: rectangle.bottom, viewport: innerHeight, unobscured: target === dialog || dialog.contains(target) }
  })
  assert.ok(loginDialog.top >= 32 && loginDialog.bottom <= loginDialog.viewport, 'official login dialog fits below the Desktop caption')
  assert.equal(loginDialog.unobscured, true, 'XP skin must not intercept official login dialog interaction')
  evidence.loginDialog = loginDialog
  await page.screenshot({ path: join(temporary, 'official-login-xp.png') })
  await page.waitForFunction(() => document.body.innerText.includes('isolated-fixture') || /等待登录|Continue in your browser|Waiting/.test(document.body.innerText), undefined, { timeout: 15_000 })
  const initializationDeadline = Date.now() + 15_000
  while (initialization === undefined && Date.now() < initializationDeadline) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.ok(initialization, 'official account start reached the isolated auth_init endpoint')
  assert.equal(initialization.code_challenge_method, 'S256')
  assert.equal(initialization.login_source, 'desktop')
  const callback = new URL(initialization.redirect_uri)
  assert.equal(callback.hostname, '127.0.0.1')
  assert.equal(callback.pathname, '/oauth/callback')
  assert.ok(callback.port && callback.port !== new URL(platformOrigin).port)
  evidence.authInit = true
  await app.evaluate(({ shell }) => {
    globalThis.accountAuthorizationLinks = []
    shell.openExternal = async target => { globalThis.accountAuthorizationLinks.push(target) }
  })
  const authorizationLink = 'https://platform.deepseek.com/dsh/authorize?authorize_id=isolated-fixture&theme=dark'
  const windowCount = app.windows().length
  await page.evaluate(target => { window.open(target, '_blank', 'noopener,noreferrer') }, authorizationLink)
  const forwardingDeadline = Date.now() + 15_000
  let forwarded = []
  while (Date.now() < forwardingDeadline) {
    forwarded = await app.evaluate(() => globalThis.accountAuthorizationLinks)
    if (forwarded.length > 0) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.deepEqual(forwarded, [authorizationLink], 'official HTTPS authorization link reaches the system browser boundary')
  assert.equal(app.windows().length, windowCount, 'official authorization must not create an Electron popup')
  evidence.authorizationLinkForwarded = true
  assert.equal((await fetch(`${callback.origin}/api/account/getState`)).status, 404)
  assert.equal((await fetch(`${callback.origin}/oauth/callback?code=isolated-code&state=foreign-state`)).status, 400)
  const accepted = await fetch(`${initialization.redirect_uri}?code=isolated-code&state=${encodeURIComponent(initialization.state)}`, { redirect: 'manual' })
  assert.equal(accepted.status, 302)
  assert.equal(new URL(accepted.headers.get('location')).pathname, '/dsh/authorized')
  evidence.callback = true
  await page.locator('[data-signed-out="false"][aria-haspopup="menu"]').waitFor({ timeout: 30_000 })
  evidence.signedIn = true
  assert.equal(requests.filter(request => request.path === '/auth-api/v0/dsh/auth_exchange').length, 1)
  await page.screenshot({ path: join(temporary, 'signed-in-xp.png') })
  await app.close()
  app = undefined
  await assert.rejects(fetch(`${callback.origin}/oauth/callback?code=isolated-code&state=x`))
  console.log(`Account login, preserved skins and caption geometry passed: ${temporary}`)
} finally {
  await writeFile(join(temporary, 'evidence.json'), JSON.stringify(evidence, null, 2))
  await app?.close().catch(() => {})
  await new Promise(resolve => { mock.close(resolve); mock.closeAllConnections() })
}
