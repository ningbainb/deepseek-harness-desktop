import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const verifier = await readFile(new URL('../scripts/verify-packaged-release-browser.mjs', import.meta.url), 'utf8')
const start = verifier.indexOf('owner.child = spawn(exe, [')
const end = verifier.indexOf("\n  owner.child.once('error'", start)
assert.ok(start >= 0 && end > start, 'Execute the actual normal-EXE spawn statement')

test('the normal packaged browser QA launch identifies automation to Chromium without replacing main', () => {
  let launch
  const exe = 'E:/qa/win-unpacked/DeepSeek Harness Desktop.exe'
  runInNewContext(verifier.slice(start, end), {
    owner: {}, exe, port: 12345, userData: 'E:/qa/user-data',
    proxyOrigin: 'http://127.0.0.1:12346', payload: 'E:/qa/win-unpacked', env: {},
    spawn(executable, args, options) { launch = { executable, args: [...args], options }; return {} },
  })
  assert.equal(launch.executable, exe)
  assert.ok(launch.args.includes('--enable-automation'), 'CDP attachment alone does not set navigator.webdriver; QA must use the real Chromium automation switch')
  assert.equal(launch.options.cwd, 'E:/qa/win-unpacked')
  assert.equal(launch.options.shell, false)
  assert.ok(!launch.args.some(value => /(?:--require|--import|host-main|\.mjs$)/u.test(value)), 'Keep the real packaged main entry')
})

const require = createRequire(import.meta.url)
const pet = dirname(require.resolve('@linxin666/dsh-pet/package.json'))
const heartbeat = await readFile(join(pet, 'lib/types/client/telemetry.js'), 'utf8')
function telemetry(webdriver) {
  const stored = new Map(), requests = []
  const reportDailyHeartbeat = runInNewContext(
    `${heartbeat.replace(/^export function /mu, 'function ')}\nreportDailyHeartbeat`, {
      navigator: { webdriver },
      crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
      localStorage: {
        get length() { return stored.size },
        getItem: key => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
        removeItem: key => stored.delete(key),
        key: index => [...stored.keys()][index] ?? null,
      },
      fetch(url, options) { requests.push({ url, options }); return Promise.resolve({ ok: true }) },
    }, { timeout: 5000 })
  return { stored, requests, reportDailyHeartbeat }
}

test('the actual published community heartbeat makes no request or visitor ID in an automated renderer', () => {
  const qa = telemetry(true)
  qa.reportDailyHeartbeat([{ name: '@linxin666/dsh-pet', version: '0.4.4' }])
  assert.deepEqual(qa.requests, [])
  assert.equal(qa.stored.size, 0)
})

test('the actual published heartbeat retains the non-automation positive control and daily acknowledgement', async () => {
  const ordinary = telemetry(false)
  const items = [{ name: '@linxin666/dsh-pet', version: '0.4.4' }]
  ordinary.reportDailyHeartbeat(items)
  assert.equal(ordinary.requests.length, 1, 'Do not disable telemetry globally to pass QA')
  assert.equal(ordinary.requests[0].url, 'https://dsh-market.com/api/telemetry/event')
  assert.deepEqual(JSON.parse(ordinary.requests[0].options.body).items, items)
  await Promise.resolve()
  ordinary.reportDailyHeartbeat(items)
  assert.equal(ordinary.requests.length, 1, 'An acknowledged ordinary heartbeat remains once per day')
})
