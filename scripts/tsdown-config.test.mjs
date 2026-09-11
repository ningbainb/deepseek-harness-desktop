import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const deprecatedProperty = /^\s*(?:external|noExternal)\s*:/mu

async function tsdownConfigSources() {
  const packageRoot = join(repositoryRoot, 'packages')
  const entries = await readdir(packageRoot, { recursive: true, withFileTypes: true })
  const packageConfigs = entries
    .filter((entry) => entry.isFile() && /^tsdown(?:\.[a-z0-9-]+)?\.config\.ts$/u.test(entry.name))
    .map((entry) => resolve(entry.parentPath, entry.name))
  return [join(repositoryRoot, 'shared', 'tsdown.client.ts'), ...packageConfigs].toSorted()
}

test('tsdown configs use the supported deps API for dependency boundaries', async () => {
  const violations = []
  for (const path of await tsdownConfigSources()) {
    const source = await readFile(path, 'utf8')
    if (deprecatedProperty.test(source)) violations.push(relative(repositoryRoot, path))
  }
  assert.deepEqual(violations, [])
})

test('tsdown configs do not opt out of bundled dependency validation', async () => {
  const violations = []
  for (const path of await tsdownConfigSources()) {
    const source = await readFile(path, 'utf8')
    if (/onlyBundle\s*:\s*false/u.test(source)) violations.push(relative(repositoryRoot, path))
  }
  assert.deepEqual(violations, [])
})

test('remote web UI prepare build preserves reviewed dependency boundaries', async () => {
  const packageRoot = join(repositoryRoot, 'packages', 'dsh-remote-web-ui')
  const production = await import(pathToFileURL(join(packageRoot, 'tsdown.config.ts')).href)
  const prepare = await import(pathToFileURL(join(packageRoot, 'tsdown.prepare.config.ts')).href)
  const [library] = prepare.default({ env: {} })

  assert.ok(library.deps.neverBundle.includes('@deepseek-ai/dsh-settings'))
  assert.deepEqual(production.REMOTE_WEB_UI_CLIENT_ONLY_BUNDLE, ['clsx', 'qrcode.react'])
})

test('production client compression preserves factory exports, names and source maps', async () => {
  const { build } = await import('tsdown')
  const { clientBundle } = await import('../shared/tsdown.client.ts')
  const parent = await realpath(tmpdir())
  const root = await realpath(await mkdtemp(join(parent, 'dsh-client-build-test-')))
  assert.ok(root.startsWith(parent + (process.platform === 'win32' ? '\\' : '/')))
  const previousCwd = process.cwd()
  const previousMode = process.env.NODE_ENV
  try {
    await mkdir(join(root, 'src', 'client'), { recursive: true })
    const source = '/*! @license fixture-license-preserved */\nexport class DesktopFixture { value = 42 }\nexport function namedAction() { return new DesktopFixture().value }\n'
    await writeFile(join(root, 'src', 'client', 'index.ts'), source)
    process.chdir(root)
    for (const mode of ['production', 'development']) {
      process.env.NODE_ENV = mode
      const config = clientBundle('@fixture/dsh-client-test', [])({ env: {} })
        .find(config => config.platform === 'browser')
      assert.equal(config.minify, mode === 'production')
      assert.equal(config.sourcemap, true)
      assert.equal(config.outputOptions.keepNames, true)
      const outDir = join(root, mode)
      await build({ ...config, config: false, cwd: root, outDir, logLevel: 'silent' })
      const code = await readFile(join(outDir, 'client.js'), 'utf8')
      const map = JSON.parse(await readFile(join(outDir, 'client.js.map'), 'utf8'))
      let registration
      runInNewContext(code, { window: { __ModuleLoader__: { load: value => { registration = value } } } })
      assert.equal(registration.id, '@fixture/dsh-client-test')
      const exported = registration.factory(() => { throw new Error('unexpected bundled dependency') })
      assert.equal(exported.DesktopFixture.name, 'DesktopFixture')
      assert.equal(exported.namedAction.name, 'namedAction')
      assert.equal(exported.namedAction(), 42)
      assert.equal(map.version, 3)
      assert.ok(map.sourcesContent.includes(source))
      assert.ok(map.mappings.length > 0)
      assert.match(code, /sourceMappingURL=client\.js\.map/u)
      assert.match(code, /fixture-license-preserved/u)
    }
  } finally {
    process.chdir(previousCwd)
    if (previousMode === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousMode
    await rm(root, { recursive: true, force: true })
  }
})
