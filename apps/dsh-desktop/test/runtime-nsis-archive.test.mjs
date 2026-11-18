import assert from 'node:assert/strict'
import test from 'node:test'
import * as options from '../scripts/runtime-nsis-options.mjs'

const core = ['DeepSeek Harness Desktop.exe', 'resources/app.asar', 'resources/app.asar.unpacked/package.json', 'resources/app.asar.unpacked/runtime-support/browser-component.json']
const metadata = 'resources/runtime-reconstruction/manifest.json'
const nested = 'resources/app.asar.unpacked/node_modules/electron/dist/electron.exe'
const office = 'resources/app.asar.unpacked/node_modules/@deepseek-ai/libreoffice-kit-win32-x64'
const officeFiles = [`${office}/prebuilds.json`, `${office}/bin/dsoffice.exe`]

test('NSIS archive validates a complete external-browser core without requiring nested Electron', () => {
  assert.equal(typeof options.verifyNormalNsisArchive, 'function')
  const adapter = { fullRuntime: true, externalBrowserRuntime: true, omittedTargets: [], requiredTargets: core }
  const paths = new Set([metadata, ...core, ...officeFiles])
  options.verifyNormalNsisArchive(adapter, paths)
  for (const target of [...core, ...officeFiles]) {
    const missing = new Set(paths); missing.delete(target)
    assert.throws(() => options.verifyNormalNsisArchive(adapter, missing), /missing/i)
  }
  assert.throws(() => options.verifyNormalNsisArchive({ ...adapter, requiredTargets: core.slice(1) }, paths), /adapter/i)
  assert.throws(() => options.verifyNormalNsisArchive({ ...adapter, requiredTargets: [...core, core[0]] }, paths), /adapter/i)
  assert.throws(() => options.verifyNormalNsisArchive(adapter, new Set([...paths, nested])), /nested/i)
  const wasm = 'resources/app.asar.unpacked/node_modules/@deepseek-ai/libreoffice-kit-wasm/assets/engine.wasm'
  assert.throws(() => options.verifyNormalNsisArchive(adapter, new Set([...paths, wasm])), /Office WASM/i)
  assert.throws(() => options.verifyNormalNsisArchive(adapter, new Set(core)), /metadata/i)
})

test('legacy complete archives still require nested Electron and compact archives reject omitted files', () => {
  assert.equal(typeof options.verifyNormalNsisArchive, 'function')
  const adapter = { fullRuntime: true, omittedTargets: [], requiredTargets: [nested] }
  options.verifyNormalNsisArchive(adapter, new Set([metadata, nested]))
  assert.throws(() => options.verifyNormalNsisArchive(adapter, new Set([metadata])), /missing/i)
  assert.throws(() => options.verifyNormalNsisArchive({ ...adapter, requiredTargets: core }, new Set([metadata, ...core])), /adapter/i)
  assert.throws(() => options.verifyNormalNsisArchive({ omittedTargets: [nested] }, new Set([metadata, nested])), /stale/i)
})
