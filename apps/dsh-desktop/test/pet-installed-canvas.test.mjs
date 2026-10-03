import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const appRequire = createRequire(new URL('../package.json', import.meta.url))
const sharedRequire = createRequire(new URL('../../../shared/package.json', import.meta.url))
const packageDir = dirname(appRequire.resolve('@linxin666/dsh-pet/package.json'))
const typescript = sharedRequire('typescript')
const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
assert.equal(manifest.version, '0.4.4')
const client = await readFile(join(packageDir, 'lib/client.js'), 'utf8')
const source = await readFile(join(packageDir, 'src/client/renderers/frames2d.ts'), 'utf8')
const region = '//#region src/client/renderers/frames2d.ts'
const start = client.indexOf(region)
const end = client.indexOf('//#endregion', start)
assert.ok(start >= 0 && end > start)
const programs = {
  source: typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
    fileName: 'frames2d.ts',
  }).outputText,
  compiled: `${client.slice(start, end)}\nexports.frames2dRenderer = frames2dRenderer;`,
}

for (const [mode, program] of Object.entries(programs)) {
  for (const canvasAvailable of [true, false]) {
    test(`installed pet ${mode} retains ${canvasAvailable ? 'readback canvas and decoded pixels' : 'image fallback'}`, async context => {
      const children = []
      const cleanups = []
      const pixels = new Uint8ClampedArray(24).fill(255)
      const bitmap = { width: 2, height: 3, close: context.mock.fn() }
      const drawImage = context.mock.fn()
      const getImageData = context.mock.fn(() => ({ data: pixels }))
      const getContext = context.mock.fn(() => canvasAvailable ? { drawImage, getImageData, clearRect() {} } : null)
      const remove = context.mock.fn()
      const canvas = { dataset: {}, style: {}, width: 0, height: 0, getContext, remove }
      const image = { dataset: {}, style: {}, getAttribute: () => null, remove }
      const exports = {}
      const apiVersion = 'x-org.linxin666.pet-center/v1alpha1'
      runInNewContext(program, {
        exports,
        require: identifier => {
          assert.equal(identifier, '../../contracts/renderer.ts')
          return { PET_RENDERER_API_VERSION: apiVersion }
        },
        PET_RENDERER_API_VERSION: apiVersion,
        window: { matchMedia: () => ({ matches: true }) },
        document: { createElement: tag => {
          assert.ok(tag === 'canvas' || tag === 'img')
          return tag === 'canvas' ? canvas : image
        } },
        fetch: async () => ({ ok: true, blob: async () => ({}) }),
        createImageBitmap: async () => bitmap,
        setTimeout, clearTimeout, setInterval, clearInterval,
      }, { filename: `installed-pet-frames2d-${mode}.js` })
      const config = { tracks: { idle: { frames: ['/pet/fixture/frame.webp'], durations: [200], loop: true } }, phases: { idle: 'idle' } }
      const handle = exports.frames2dRenderer.mount({
        petId: 'fixture', container: { appendChild: child => children.push(child) },
        phase: { get: () => 'idle', subscribe: () => () => {} },
        onCleanup: callback => cleanups.push(callback),
      }, config)
      try {
        for (let flush = 0; flush < 24; flush++) await Promise.resolve()
        assert.equal(getContext.mock.callCount(), 1)
        const [kind, options] = getContext.mock.calls[0].arguments
        assert.equal(kind, '2d')
        assert.equal(options.willReadFrequently, true)
        assert.deepEqual(Object.keys(options), ['willReadFrequently'])
        assert.deepEqual(children, [canvasAvailable ? canvas : image])
        assert.equal(handle.currentTrack(), 'idle')
        if (canvasAvailable) {
          assert.equal(drawImage.mock.callCount(), 1)
          assert.deepEqual(Array.from(drawImage.mock.calls[0].arguments), [bitmap, 0, 0])
          assert.equal(canvas.width, bitmap.width)
          assert.equal(canvas.height, bitmap.height)
          assert.deepEqual(canvas.getContext('2d').getImageData(0, 0, 2, 3).data, pixels)
        } else assert.equal(image.src, '/pet/fixture/frame.webp')
      } finally {
        handle.dispose()
        for (const cleanup of cleanups) cleanup()
      }
      assert.equal(remove.mock.callCount(), 1)
    })
  }
}
