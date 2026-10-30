import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { gunzipSync } from 'node:zlib'

const require = createRequire(new URL('../../../packages/dsh-web-ui-settings/package.json', import.meta.url))
const { JSDOM } = require('jsdom')
const archive = readFileSync(new URL('../../../vendor/plugins-20261026/dsh-dafeiyu-pet-0.2.0.tgz', import.meta.url))
assert.equal(createHash('sha256').update(archive).digest('hex'), '9759c153bef8b95284a380cddfa3d686d86aef4d5a28e2c00619f0d203d8b39e')
const tar = gunzipSync(archive), files = new Map()
for (let offset = 0; offset + 512 <= tar.length && tar[offset];) {
  const name = tar.subarray(offset, offset + 100).toString().replace(/\0.*$/s, '').replace(/^package\//, '')
  const size = parseInt(tar.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0
  files.set(name, tar.subarray(offset + 512, offset + 512 + size).toString())
  offset += 512 + Math.ceil(size / 512) * 512
}
const originals = new Map(files)
const patchPath = new URL('../../../patches/dsh-dafeiyu-pet@0.2.0.patch', import.meta.url)
// Apply the shipped patch strictly in memory, never to node_modules or the archive.
if (existsSync(patchPath) && process.env.DAFEIYU_TEST_ORIGINAL !== '1') {
  const lines = readFileSync(patchPath, 'utf8').split('\n')
  let name, original, result, cursor
  const finish = () => { if (name) files.set(name, [...result, ...original.slice(cursor)].join('\n')) }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('+++ b/')) {
      finish(); name = lines[i].slice(6); original = files.get(name).split('\n'); result = []; cursor = 0
    }
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i])
    if (!header) continue
    const start = Number(header[1]) - 1, before = [], after = []
    while (i + 1 < lines.length && /^[ +\-]/.test(lines[i + 1]) && !lines[i + 1].startsWith('--- ')) {
      const line = lines[++i]
      if (line[0] !== '+') before.push(line.slice(1))
      if (line[0] !== '-') after.push(line.slice(1))
    }
    assert.equal(before.length, Number(header[2] ?? 1)); assert.equal(after.length, Number(header[4] ?? 1))
    assert.deepEqual(original.slice(start, start + before.length), before, `patch context ${name}:${start + 1}`)
    result.push(...original.slice(cursor, start), ...after); cursor = start + before.length
  }
  finish()
}
const widget = files.get('assets/whale-widget.js'), host = files.get('lib/index.js')
const key = 'dsh-release-plugin-adapter.dafeiyu-visible'
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }

test('community patch applies to the pinned archive with Git and both complete entrypoints parse', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-dafeiyu-patch-'))
  t.after(() => rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  for (const name of ['assets/whale-widget.js', 'lib/index.js']) {
    await mkdir(dirname(join(temporary, name)), { recursive: true })
    await writeFile(join(temporary, name), originals.get(name))
  }
  execFileSync('git', ['apply', '--check', patchPath.pathname.replace(/^\/([A-Za-z]:)/, '$1')], { cwd: temporary, windowsHide: true })
  new vm.Script(widget)
  const parsed = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: host, encoding: 'utf8', windowsHide: true })
  assert.equal(parsed.status, 0, parsed.stderr)
  const manifest = JSON.parse(readFileSync(new URL('../../../apps/dsh-desktop/runtime-support/builtin-plugin-adaptation.json', import.meta.url), 'utf8'))
  const selection = manifest.plugins.find(entry => entry.name === 'dsh-dafeiyu-pet').selection
  assert.equal(selection.patch, 'patches/dsh-dafeiyu-pet@0.2.0.patch')
  assert.equal(selection.sha256, createHash('sha256').update(archive).digest('hex'))
})

function browser(t, { visible = false, settings = false, audioDecode, webkitAudio = false, role = 'retained-role', geometry = false } = {}) {
  const dom = new JSDOM('<html><head></head><body><div id="root"><textarea></textarea></div><div id="original-pet"></div></body></html>', {
    url: `https://desktop.invalid/${settings ? '?desktop-dock-setting=plugin-options' : ''}`, runScripts: 'outside-only',
  })
  t.after(() => { dom.window.dispatchEvent(new dom.window.Event('pagehide')); dom.window.close() })
  const w = dom.window, timers = new Map(), frames = new Map(), requests = [], images = [], readbacks = [], warnings = [], holds = [], registrations = []
  const decodes = [], alerts = [], canvasWrites = []
  let next = 0
  if (geometry) {
    const rectangle = w.Element.prototype.getBoundingClientRect
    w.Element.prototype.getBoundingClientRect = function () {
      const root = this.closest('.dfy-root')
      if (!root) return rectangle.call(this)
      const left = parseFloat(root.style.left || '750'), top = parseFloat(root.style.top || '500')
      const scale = Number(root.style.getPropertyValue('--dfy-scale') || 1.1)
      const width = geometry === 'scaled' ? 200 * scale : 180, height = geometry === 'scaled' ? 200 * scale : 220
      return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }
    }
  }
  w.dshDesktop = {}; w.localStorage.setItem(key, String(visible)); w.localStorage.setItem('dfy-role', role); w.localStorage.setItem('pet', 'retained-original')
  const nativeAdd = w.EventTarget.prototype.addEventListener
  w.EventTarget.prototype.addEventListener = function (type, listener, options) {
    registrations.push({ target: this, type, listener })
    return nativeAdd.call(this, type, listener, options)
  }
  w.setTimeout = (fn, ms) => { const id = ++next; timers.set(id, { fn, ms, interval: false }); return id }
  w.setInterval = (fn, ms) => { const id = ++next; timers.set(id, { fn, ms, interval: true }); return id }
  w.clearTimeout = w.clearInterval = id => timers.delete(id)
  w.requestAnimationFrame = fn => { const id = ++next; frames.set(id, fn); return id }
  w.cancelAnimationFrame = id => frames.delete(id)
  w.matchMedia = () => Object.assign(new w.EventTarget(), { matches: false })
  w.alert = message => alerts.push(message)
  if (audioDecode) {
    class NativeAudioContext {
      closed = false
      close() { this.closed = true; return w.Promise.resolve() }
      decodeAudioData(...args) {
        if (args[0] === 'throw') throw new TypeError('native decode argument rejected')
        const context = this
        let resolve, reject
        const promise = new w.Promise((yes, no) => { resolve = yes; reject = no })
        if (audioDecode === 'callback') promise.catch(() => {})
        decodes.push({ context, args, promise,
          succeed(value) { args[1]?.call(context, value); resolve(value) },
          fail(error) { args[2]?.call(context, error); reject(error) },
        })
        return audioDecode === 'callback' ? undefined : promise
      }
    }
    w[webkitAudio ? 'webkitAudioContext' : 'AudioContext'] = NativeAudioContext
  }
  w.Image = function () {
    const img = w.document.createElement('img')
    Object.defineProperties(img, { naturalWidth: { value: 1536 }, naturalHeight: { value: 2288 } })
    images.push(img); return img
  }
  w.HTMLCanvasElement.prototype.getContext = function (_kind, options) {
    if (this.context) return this.context
    this.context = new Proxy({
      getImageData: (_x, _y, width, height) => {
        readbacks.push(options)
        const data = new Uint8ClampedArray(width * height * 4); data.fill(255); return { data }
      },
    }, { get: (target, name) => target[name] ?? ((...args) => { canvasWrites.push({ canvas: this, name, args }); return { addColorStop() {} } }), set: (target, name, value) => { target[name] = value; return true } })
    return this.context
  }
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,fixture'
  w.console.warn = (...args) => warnings.push(args.join(' '))
  w.fetch = (url, options = {}) => {
    requests.push({ url: String(url), options })
    if (String(url).includes('size.json')) return new Promise(resolve => holds.push(() => resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, scale: 1.1, vol: 0.4, sound: false, pressOn: false }) })))
    const data = String(url).includes('balance.json') ? { ok: false, code: 'NO_KEY', unconfigured: true, error: 'Not configured' }
      : String(url).includes('pet-state.json') ? { ok: true, state: 'idle', workingCount: 0 }
        : { ok: true, roles: [{ id: 'retained-role', name: 'Retained role', url: '/saved-role.png' }], files: [], models: [], events: {} }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data), arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })
  }
  const originalTimers = [w.setTimeout, w.setInterval, w.requestAnimationFrame, w.fetch, w.console.warn]
  w.eval(widget)
  const toggle = value => {
    w.localStorage.setItem(key, String(value))
    w.document.documentElement.setAttribute('data-desktop-dafeiyu-visible', String(value))
    w.dispatchEvent(new w.CustomEvent('dsh-dafeiyu-visibility', { detail: value }))
  }
  return { w, timers, frames, requests, images, readbacks, warnings, holds, registrations, toggle, originalTimers, decodes, alerts, canvasWrites }
}

const decodedAudio = () => ({ duration: 1, getChannelData: () => new Float32Array(480) })

async function projectedWidget(t, { geometry = true, offset = { x: 0, y: -140 } } = {}) {
  const f = browser(t, { geometry }), inputs = []
  f.w.__dshDafeiyuProjectPosition = input => { inputs.push({ ...input }); return { left: input.left + offset.x, top: input.top + offset.y } }
  f.toggle(true); await flush()
  for (const ready of f.holds.splice(0)) ready()
  await flush()
  for (const image of [...f.images].reverse()) image.onload?.()
  await flush()
  const root = f.w.document.querySelector('.dfy-root'), image = root.querySelector('.dfy-img')
  assert.ok(inputs.length > 0, 'The complete patched widget must project its own express() display')
  assert.equal(parseFloat(root.style.top), inputs.at(-1).top + offset.y)
  const pointer = (type, x, y) => {
    const event = new f.w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
      buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0 })
    Object.defineProperty(event, 'pointerType', { value: 'mouse' })
    const target = type === 'pointerdown' ? root.querySelector('.dfy-img') : f.w.document
    target.dispatchEvent(event)
  }
  return { ...f, root, inputs, pointer, refresh: () => f.w.dispatchEvent(new f.w.Event('dsh-dafeiyu-clearance-refresh')) }
}

test('display projection and refresh never change the saved anchor or raw position and unload with the widget', async t => {
  const f = await projectedWidget(t), raw = { ...f.inputs.at(-1) }
  const saved = f.w.localStorage.getItem('dfy-pos'), writes = f.requests.filter(row => /^(PUT|POST)$/.test(row.options.method)).length
  for (let step = 0; step < 5; step++) f.refresh()
  assert.deepEqual(f.inputs.at(-1), raw, 'A displayed offset must never feed back into the next raw position')
  assert.equal(f.w.localStorage.getItem('dfy-pos'), saved)
  assert.equal(f.requests.filter(row => /^(PUT|POST)$/.test(row.options.method)).length, writes)
  delete f.w.__dshDafeiyuProjectPosition; f.refresh()
  assert.equal(parseFloat(f.root.style.left), raw.left)
  assert.equal(parseFloat(f.root.style.top), raw.top)
  f.w.__dshDafeiyuProjectPosition = () => assert.fail('disposed refresh listener ran')
  f.toggle(false); f.refresh()
})

test('drag follows the displayed start without projection and cancel restores the original raw anchor', async t => {
  const f = await projectedWidget(t), raw = { ...f.inputs.at(-1) }, display = f.root.getBoundingClientRect()
  const saved = f.w.localStorage.getItem('dfy-pos')
  const x = display.left + 70, y = display.top + 70
  f.pointer('pointerdown', x, y)
  assert.equal(f.root.classList.contains('dfy-dragging'), true)
  const calls = f.inputs.length
  f.refresh()
  assert.equal(parseFloat(f.root.style.top), display.top, 'A geometry refresh while held must not jump to the raw anchor')
  f.pointer('pointermove', x - 25, y - 20)
  assert.equal(parseFloat(f.root.style.left), display.left - 25)
  assert.equal(parseFloat(f.root.style.top), display.top - 20)
  assert.equal(f.inputs.length, calls, 'Dragging must suspend automatic projection')
  f.pointer('pointercancel', 0, 0)
  delete f.w.__dshDafeiyuProjectPosition; f.refresh()
  assert.equal(parseFloat(f.root.style.left), raw.left)
  assert.equal(parseFloat(f.root.style.top), raw.top)
  assert.equal(f.w.localStorage.getItem('dfy-pos'), saved)
})

test('a real drop retains vendor anchor persistence while a click does not adopt the projected offset', async t => {
  const f = await projectedWidget(t), display = f.root.getBoundingClientRect(), raw = { ...f.inputs.at(-1) }
  const x = display.left + 70, y = display.top + 70, saved = f.w.localStorage.getItem('dfy-pos')
  f.pointer('pointerdown', x, y); f.pointer('pointerup', x, y)
  delete f.w.__dshDafeiyuProjectPosition; f.refresh()
  assert.equal(parseFloat(f.root.style.top), raw.top)
  assert.equal(f.w.localStorage.getItem('dfy-pos'), saved)
  f.w.__dshDafeiyuProjectPosition = input => { f.inputs.push({ ...input }); return { left: input.left, top: input.top - 140 } }
  f.refresh()
  f.pointer('pointerdown', x, y)
  assert.equal(f.root.classList.contains('dfy-dragging'), true)
  f.pointer('pointermove', x - 60, y - 30)
  assert.equal(parseFloat(f.root.style.top), display.top - 30)
  f.pointer('pointerup', x - 60, y - 30)
  const anchor = JSON.parse(f.w.localStorage.getItem('dfy-pos'))
  assert.equal(anchor.v, 2)
  const dropped = f.inputs.at(-1)
  const savedTop = anchor.vAnchor === 'top' ? anchor.vDist : f.w.innerHeight - 220 - anchor.vDist
  assert.equal(savedTop, Math.round(dropped.top), 'Explicit drop persists the raw anchor, not its display projection')
  assert.notEqual(savedTop, Math.round(parseFloat(f.root.style.top)))
})

test('consecutive full-widget scaling preserves the raw bottom-right corner and never saves automatic offsets', async t => {
  const f = await projectedWidget(t, { geometry: 'scaled', offset: { x: -80, y: -140 } })
  const slider = f.w.document.querySelector('input[type="range"][min="0.6"]')
  assert.ok(slider, 'Exercise the original vendor scale control')
  const samples = [], beforeWrites = f.requests.filter(row => row.options.method === 'PUT').length
  for (const scale of [1.1, 1.2, 1.3]) {
    slider.value = String(scale); slider.dispatchEvent(new f.w.Event('input'))
    f.refresh()
    samples.push({ scale, anchor: JSON.parse(f.w.localStorage.getItem('dfy-pos')), raw: { ...f.inputs.at(-1) } })
  }
  assert.deepEqual(samples.map(sample => sample.anchor.vDist), [0, 0, 0], 'Only the raw bottom anchor may be persisted across consecutive scales')
  assert.deepEqual(samples.map(sample => sample.anchor.hDist), [0, 0, 0], 'Horizontal display clearance must not enter the right anchor')
  for (const sample of samples) {
    assert.equal(sample.raw.left + sample.raw.width, 1024)
    assert.equal(sample.raw.top + sample.raw.height, 768)
  }
  await flush()
  const writes = f.requests.filter(row => row.options.method === 'PUT').slice(beforeWrites)
  assert.deepEqual(writes.map(row => JSON.parse(row.options.body).scale), [1.1, 1.2, 1.3], 'Retain exactly the original user-requested configuration saves')
})

test('full-widget scale round-trip saves final raw anchors with exactly one PUT per user change', async t => {
  const f = await projectedWidget(t, { geometry: 'scaled', offset: { x: -80, y: -140 } })
  const slider = f.w.document.querySelector('input[type="range"][min="0.6"]')
  const scales = [1.2, 1.3, 1.4, 1.3, 1.2, 1.1], anchors = []
  for (const scale of scales) {
    const beforeWrites = f.requests.filter(row => row.options.method === 'PUT').length
    slider.value = String(scale); slider.dispatchEvent(new f.w.Event('input'))
    f.refresh()
    const raw = f.inputs.at(-1)
    assert.equal(raw.left + raw.width, 1024)
    assert.equal(raw.top + raw.height, 768)
    anchors.push(JSON.parse(f.w.localStorage.getItem('dfy-pos')))
    await flush()
    const writes = f.requests.filter(row => row.options.method === 'PUT').slice(beforeWrites)
    assert.deepEqual(writes.map(row => JSON.parse(row.options.body).scale), [scale], 'Each user scale change retains exactly one configuration PUT')
  }
  assert.deepEqual(anchors.map(anchor => [anchor.hAnchor, anchor.hDist, anchor.vAnchor, anchor.vDist]),
    Array.from({ length: 6 }, () => ['right', 0, 'bottom', 0]),
    'Growing and shrinking must save the corrected raw geometry, never the prior-size anchor')
})

test('full-widget scaling keeps the flipped raw bottom-left corner after an explicit drag', async t => {
  const f = await projectedWidget(t, { geometry: 'scaled', offset: { x: 80, y: -100 } })
  const box = f.root.getBoundingClientRect(), x = box.left + 70, y = box.top + 70
  f.pointer('pointerdown', x, y); f.pointer('pointermove', 70, y); f.pointer('pointerup', 70, y)
  assert.equal(f.root.classList.contains('dfy-left'), true, 'Use the vendor left-side drag/flip behavior')
  const before = { ...f.inputs.at(-1) }, samples = []
  const slider = f.w.document.querySelector('input[type="range"][min="0.6"]')
  for (const scale of [1.2, 1.3]) {
    slider.value = String(scale); slider.dispatchEvent(new f.w.Event('input')); f.refresh()
    samples.push({ ...f.inputs.at(-1) })
  }
  for (const sample of samples) {
    assert.equal(sample.left, 0, 'The left raw corner must not absorb the positive display offset')
    assert.equal(sample.top + sample.height, before.top + before.height)
  }
  assert.equal(f.root.classList.contains('dfy-left'), true)
})

test('closing the original menu computes snap anchors from raw geometry before later scaling saves them', async t => {
  const f = await projectedWidget(t, { geometry: 'scaled' }), before = { ...f.inputs.at(-1) }
  f.root.querySelector('.dfy-menu-btn').click()
  assert.equal(f.w.document.querySelector('.dfy-menu').classList.contains('dfy-menu-open'), true)
  f.w.document.getElementById('root').dispatchEvent(new f.w.MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20, button: 0, buttons: 1 }))
  assert.equal(f.w.document.querySelector('.dfy-menu').classList.contains('dfy-menu-open'), false)
  const afterClose = { ...f.inputs.at(-1) }
  f.w.dispatchEvent(new f.w.Event('resize'))
  const slider = f.w.document.querySelector('input[type="range"][min="0.6"]')
  slider.value = '1.2'; slider.dispatchEvent(new f.w.Event('input'))
  assert.equal(afterClose.left, before.left)
  assert.equal(afterClose.top, before.top, 'Closing a menu must not adopt its projected screen position as a new raw anchor')
  assert.equal(JSON.parse(f.w.localStorage.getItem('dfy-pos')).vDist, 0)
})

test('unchanged full-body animation frames do not rewrite status or motion; real state changes still render', async t => {
  const f = browser(t, { visible: true, role: 'default' })
  Object.defineProperty(f.w.document, 'hidden', { configurable: true, value: false })
  await flush()
  for (const img of [...f.images].reverse()) img.onload?.()
  await flush()
  const preview = f.w.document.querySelector('select[aria-label="大肥鱼动作预览"]')
  assert.ok(preview, 'The complete live widget must expose its original action controls')
  const status = preview.previousElementSibling
  const image = f.w.document.querySelector('.dfy-img')
  let now = f.w.performance.now()
  const step = async () => {
    const batch = [...f.frames.values()]; f.frames.clear()
    for (const frame of batch) frame(now += 16)
    await flush()
  }
  await step()
  assert.ok(status.textContent.startsWith('大肥鱼 · '))
  assert.ok(image.dataset.cuteMotion)
  const initial = status.textContent
  let statusMutations = 0, motionMutations = 0
  const observer = new f.w.MutationObserver(records => {
    statusMutations += records.filter(record => record.target === status).length
    motionMutations += records.filter(record => record.target === image && record.attributeName === 'data-cute-motion').length
  })
  observer.observe(status, { childList: true, characterData: true, subtree: true })
  observer.observe(image, { attributes: true, attributeFilter: ['data-cute-motion'] })
  t.after(() => observer.disconnect())
  for (let index = 0; index < 60; index++) await step()
  assert.equal(statusMutations, 0, 'Unchanged idle status must not produce one DOM replacement per frame')
  assert.equal(motionMutations, 0, 'Unchanged motion must not trigger document observers every frame')
  assert.ok(f.frames.size > 0, 'Animation scheduling continues without reducing frame cadence')
  preview.value = 'running'
  preview.dispatchEvent(new f.w.Event('change'))
  await step()
  assert.notEqual(status.textContent, initial, 'A real action change must render on the next frame')
  assert.equal(statusMutations, 1)
  assert.ok(f.frames.size > 0)
})

async function importAudioThroughWidget(f) {
  const input = f.w.document.querySelector('input[type="file"][accept="audio/*"]')
  assert.ok(input, 'the complete original widget retains its real audio import control')
  const before = f.decodes.length
  Object.defineProperty(input, 'files', { configurable: true, value: [new f.w.File([new Uint8Array(128)], 'retained.wav', { type: 'audio/wav' })] })
  input.dispatchEvent(new f.w.Event('change'))
  for (let step = 0; step < 30 && f.decodes.length === before; step++) await new Promise(setImmediate)
  assert.equal(f.decodes.length, before + 1, 'real FileReader and original openAudioCrop must reach native decode')
  return f.decodes.at(-1)
}

for (const outcome of ['success', 'error']) {
  test(`full widget audio import retains the live ${outcome} callback`, async t => {
    const f = browser(t, { audioDecode: 'callback' })
    f.toggle(true); await flush()
    const decode = await importAudioThroughWidget(f)
    const before = f.canvasWrites.length
    if (outcome === 'success') {
      decode.succeed(decodedAudio())
      assert.ok(f.canvasWrites.length > before, 'live success draws the original waveform')
      assert.deepEqual(f.alerts, [])
    } else {
      decode.fail(new f.w.DOMException('invalid audio', 'EncodingError'))
      assert.deepEqual(f.alerts, ['音频解码失败'])
    }
  })

  test(`full widget late decode ${outcome} cannot draw or alert after off/on`, async t => {
    const f = browser(t, { audioDecode: 'callback', webkitAudio: outcome === 'error' })
    f.toggle(true); await flush()
    const decode = await importAudioThroughWidget(f)
    f.toggle(false); await flush()
    assert.equal(decode.context.closed, true)
    f.toggle(true); await flush()
    // Drain the new widget's native FileReader/fetch/MutationObserver jobs
    // before comparing its DOM against an old generation's completion.
    await new Promise(setImmediate); await flush()
    const before = { writes: f.canvasWrites.length, requests: f.requests.length, html: f.w.document.body.innerHTML }
    if (outcome === 'success') decode.succeed(decodedAudio())
    else decode.fail(new f.w.DOMException('invalid audio', 'EncodingError'))
    await flush()
    assert.equal(f.canvasWrites.length, before.writes, 'disposed waveform callback must not draw')
    assert.deepEqual(f.alerts, [], 'disposed error callback must not alert')
    assert.equal(f.requests.length, before.requests)
    const htmlHash = text => createHash('sha256').update(text).digest('hex')
    assert.equal(htmlHash(f.w.document.body.innerHTML), htmlHash(before.html), 'late completion must not create toast or alter the next widget')
    assert.equal(f.w.document.querySelectorAll('.dfy-root').length, 1)
  })
}

test('full widget owned decoder preserves native Promise and optional callback semantics while alive', async t => {
  const f = browser(t, { audioDecode: 'promise' })
  f.toggle(true); await flush()
  const initial = await importAudioThroughWidget(f)
  initial.succeed(decodedAudio()); await flush()
  const context = initial.context, input = new f.w.ArrayBuffer(4), value = decodedAudio()
  const success = context.decodeAudioData(input)
  assert.ok(success instanceof f.w.Promise)
  assert.equal(f.decodes.at(-1).args.length, 1, 'Promise-only calls retain native arity')
  assert.equal(f.decodes.at(-1).args[0], input)
  f.decodes.at(-1).succeed(value)
  assert.equal(await success, value)
  const error = new f.w.DOMException('invalid audio', 'EncodingError')
  const failure = context.decodeAudioData(input)
  const rejected = assert.rejects(failure, received => received === error)
  f.decodes.at(-1).fail(error); await rejected
  const calls = []
  const both = context.decodeAudioData(input, function (buffer) { calls.push({ receiver: this, value: buffer }) }, null)
  assert.equal(f.decodes.at(-1).args[2], null)
  f.decodes.at(-1).succeed(value)
  assert.equal(await both, value)
  assert.deepEqual(calls, [{ receiver: context, value }])
  const bothFailure = context.decodeAudioData(input, undefined, function (failure) { calls.push({ receiver: this, error: failure }) })
  assert.equal(f.decodes.at(-1).args[1], undefined)
  const bothRejected = assert.rejects(bothFailure, received => received === error)
  f.decodes.at(-1).fail(error); await bothRejected
  assert.deepEqual(calls.at(-1), { receiver: context, error })
  assert.throws(() => context.decodeAudioData('throw'), /native decode argument rejected/u)
})

for (const outcome of ['success', 'error']) {
  test(`full widget owned decoder fences Promise ${outcome} and new work after disposal`, async t => {
    const f = browser(t, { audioDecode: 'promise' })
    f.toggle(true); await flush()
    const initial = await importAudioThroughWidget(f)
    initial.succeed(decodedAudio()); await flush()
    const context = initial.context, input = new f.w.ArrayBuffer(4), completions = []
    context.decodeAudioData(input).then(value => completions.push(value), error => completions.push(error))
    const pending = f.decodes.at(-1)
    f.toggle(false); await flush()
    if (outcome === 'success') pending.succeed(decodedAudio())
    else pending.fail(new f.w.DOMException('closed', 'InvalidStateError'))
    await flush()
    assert.deepEqual(completions, [], 'disposed native completion must not enter widget Promise callbacks')
    const count = f.decodes.length
    context.decodeAudioData(input).then(() => completions.push('new work'))
    await flush()
    assert.equal(f.decodes.length, count, 'a disposed context must not submit another native decode')
    assert.deepEqual(f.alerts, [])
  })
}

test('Desktop off-first and independent settings never initialize widget resources', async t => {
  for (const options of [{}, { visible: true, settings: true }]) {
    const f = browser(t, options); await flush()
    assert.equal(f.w.document.querySelector('.dfy-root'), null)
    assert.equal(f.requests.length, 0); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0); assert.equal(f.readbacks.length, 0)
  }
})

test('real widget on/off/on owns resources, fences late callbacks and preserves preferences and the original pet', async t => {
  const f = browser(t)
  f.toggle(true); await flush()
  assert.equal(f.w.document.querySelectorAll('.dfy-root').length, 1)
  assert.ok(f.requests.length > 0); assert.ok(f.timers.size > 0); assert.ok(f.frames.size > 0)
  for (const img of [...f.images].reverse()) img.onload?.()
  assert.ok(f.readbacks.length > 0, 'enabled widget still executes pixel hit testing')
  assert.ok(f.readbacks.every(options => options?.willReadFrequently === true))
  const lateImage = f.images.at(-1).onload, lateTimers = [...f.timers.values()].map(item => item.fn), lateFrames = [...f.frames.values()]
  f.toggle(false)
  const count = f.requests.length, reads = f.readbacks.length
  assert.equal(f.w.document.querySelector('.dfy-root'), null)
  assert.equal(Object.hasOwn(f.w, 'dfyRegisterMask'), false)
  assert.equal(f.timers.size, 0, JSON.stringify([...f.timers.values()].map(timer => ({ ms: timer.ms, fn: String(timer.fn).slice(0, 200) }))))
  assert.equal(f.frames.size, 0)
  assert.ok(f.requests.every(request => request.options.signal), 'every request carries a private owner abort signal')
  assert.ok(f.requests.filter(request => request.url.includes('size.json')).every(request => request.options.signal.aborted), 'pending requests are aborted')
  for (const resolve of f.holds.splice(0)) resolve()
  lateImage?.(); lateTimers.forEach(fn => fn()); lateFrames.forEach(fn => fn(12345)); await flush()
  assert.equal(f.requests.length, count); assert.equal(f.readbacks.length, reads)
  assert.equal(f.w.document.querySelector('.dfy-root'), null)
  f.toggle(true); f.toggle(true); await flush()
  assert.equal(f.w.document.querySelectorAll('.dfy-root').length, 1)
  const currentRequests = f.requests.length, currentReads = f.readbacks.length
  lateImage?.(); lateTimers.forEach(fn => fn()); lateFrames.forEach(fn => fn(23456)); await flush()
  assert.equal(f.requests.length, currentRequests); assert.equal(f.readbacks.length, currentReads)
  assert.equal(f.w.document.querySelectorAll('.dfy-root').length, 1, 'callbacks from the disposed generation cannot affect the new instance')
  assert.equal(f.w.localStorage.getItem('dfy-role'), 'retained-role'); assert.equal(f.w.localStorage.getItem('pet'), 'retained-original')
  assert.ok(f.w.document.getElementById('original-pet'))
  assert.deepEqual([f.w.setTimeout, f.w.setInterval, f.w.requestAnimationFrame, f.w.fetch, f.w.console.warn], f.originalTimers)
})

test('closing the widget leaves other plugin timers, RAFs and document listeners running', async t => {
  const f = browser(t)
  let clicks = 0
  f.w.document.addEventListener('click', () => { clicks++ })
  const timer = f.w.setInterval(() => {}, 123), frame = f.w.requestAnimationFrame(() => {})
  f.toggle(true); await flush(); f.toggle(false); await flush()
  assert.deepEqual([...f.timers.keys()], [timer]); assert.deepEqual([...f.frames.keys()], [frame])
  f.w.document.dispatchEvent(new f.w.Event('click')); assert.equal(clicks, 1)
})

test('full widget restores dfyRegisterMask descriptor on off and preserves a foreign replacement', async t => {
  const f = browser(t), original = () => 'original'
  const descriptor = { value: original, configurable: true, enumerable: false, writable: true }
  Object.defineProperty(f.w, 'dfyRegisterMask', descriptor)
  f.toggle(true); await flush()
  assert.equal(typeof f.w.dfyRegisterMask, 'function', 'the original complete widget must reach its real registration seam')
  assert.notEqual(f.w.dfyRegisterMask, original)
  f.toggle(false); await flush()
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.w, 'dfyRegisterMask'), descriptor)
  f.toggle(true); await flush()
  const foreign = () => 'foreign replacement'
  f.w.dfyRegisterMask = foreign
  f.toggle(false); await flush()
  assert.equal(f.w.dfyRegisterMask, foreign)
  f.toggle(true); await flush()
  const ownedValue = f.w.dfyRegisterMask
  const foreignDescriptor = { get: () => ownedValue, enumerable: true, configurable: true }
  Object.defineProperty(f.w, 'dfyRegisterMask', foreignDescriptor)
  f.toggle(false); await flush()
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.w, 'dfyRegisterMask'), { ...foreignDescriptor, set: undefined })
})

test('all listeners registered by the complete widget are harmless when delivered after off', async t => {
  const f = browser(t)
  const start = f.registrations.length
  f.toggle(true); await flush()
  const callbacks = f.registrations.slice(start)
  assert.ok(callbacks.length > 100, 'exercise the complete widget UI registration, not only the lifecycle wrapper')
  t.diagnostic(`full widget registered ${callbacks.length} listeners before teardown`)
  f.toggle(false); await flush()
  const requests = f.requests.length, reads = f.readbacks.length
  for (const { target, type, listener } of callbacks) {
    const event = new f.w.Event(type)
    if (typeof listener === 'function') listener.call(target, event)
    else listener?.handleEvent(event)
  }
  await flush()
  assert.equal(f.requests.length, requests); assert.equal(f.readbacks.length, reads)
  assert.equal(f.w.document.querySelector('.dfy-root'), null)
  assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0)
})

test('cross-document preference changes and repeated injection keep one widget and reload saved scale', async t => {
  const f = browser(t)
  f.w.localStorage.setItem(key, 'true')
  f.w.dispatchEvent(new f.w.StorageEvent('storage', { key, storageArea: f.w.localStorage }))
  await flush(); f.holds.shift()(); await flush()
  assert.equal(f.w.document.querySelector('.dfy-root').style.getPropertyValue('--dfy-scale'), '1.1')
  f.w.eval(widget)
  assert.equal(f.w.document.querySelectorAll('.dfy-root').length, 1)
  f.toggle(false); await flush(); f.toggle(true); await flush()
  for (const resolve of f.holds.splice(0)) resolve()
  await flush()
  assert.equal(f.w.document.querySelectorAll('.dfy-root').length, 1)
  assert.equal(f.w.document.querySelector('.dfy-root').style.getPropertyValue('--dfy-scale'), '1.1')
})

async function accountFallback(t, result, keyError = null) {
  const start = host.indexOf("    let accountDiag = ''"), end = host.indexOf('    async function fetchBalance()', start)
  const timers = []
  t.after(() => timers.forEach(clearTimeout))
  const context = vm.createContext({
    ctx: { get: () => ({ getState: () => ({}), getBalance: typeof result === 'function' ? result : async () => result }) },
    createHash, process, ACCOUNT_FALLBACK_MS: 5,
    setTimeout(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id },
  })
  vm.runInContext(host.slice(start, end), context)
  return vm.runInContext('accountFallback', context)(keyError)
}

test('only absent key plus explicitly logged-out account is unconfigured; account failures keep diagnostics', async t => {
  assert.equal((await accountFallback(t, null)).unconfigured, true)
  for (const result of [undefined, () => new Promise(() => {}), async () => { throw Error('account transport failed') }, { status: 'error' }]) {
    assert.notEqual((await accountFallback(t, result)).unconfigured, true)
  }
  assert.notEqual((await accountFallback(t, null, { code: 'BAD_KEY', error: 'invalid key' })).unconfigured, true)
})

test('widget treats unconfigured as a normal state, while genuine NO_KEY and BOTH_FAILED still warn and retry', async () => {
  const start = widget.indexOf('function refresh(manual) {'), end = widget.indexOf('\n}', start) + 2
  for (const [data, expected] of [[{ ok: false, code: 'NO_KEY', unconfigured: true, error: 'Not configured' }, 0], [{ ok: false, code: 'NO_KEY', error: 'Account timeout' }, 1], [{ ok: false, code: 'BOTH_FAILED', error: 'Failed' }, 1]]) {
    const warnings = [], retries = []
    const context = vm.createContext({
      busy: false, animDelayTimer: null, state: { balance: null }, BALANCE_URL: '/balance', FETCH_TIMEOUT_MS: 25000,
      render() {}, balanceRetryLater: () => retries.push(true), console: { warn: (...args) => warnings.push(args) },
      setTimeout: () => 1, clearTimeout() {}, AbortController,
      fetch: () => Promise.resolve({ json: () => Promise.resolve(data) }),
    })
    vm.runInContext(widget.slice(start, end), context); vm.runInContext('refresh(false)', context); await flush()
    assert.equal(warnings.length, expected); assert.equal(retries.length, expected)
  }
})
