import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { prepareInstalledBrowserUpgrade } from '../src/browser-upgrade-preflight.mjs'
async function fixture(t, { minimal = false, patch = '' } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-browser-upgrade-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(join(home, 'profiles/desktop'), { recursive: true })
  const original = JSON.stringify({ name: 'dsh-profile-desktop', dsh: { profile: { bundles: [], ...(minimal ? { desktopDefaults: 'minimal-v1' } : {}) } } })
  await writeFile(join(home, 'profiles/desktop/package.json'), original)
  await writeFile(join(home, 'profiles/desktop/cordis.patch.yml'), patch)
  let prepared = 0
  return { home, original, count: () => prepared, createManager: () => ({
    prepare: async ({ signal } = {}) => { signal?.throwIfAborted(); prepared++; return { executablePath: join(home, 'verified.exe') } },
    status: () => ({ phase: 'ready' }),
  }) }
}
for (const patch of ['', '- id: browser-electron\n  disabled: false\n', ': invalid: yaml']) {
 test(`legacy unknown or enabled browser is prepared: ${JSON.stringify(patch)}`, async t => {
  const f = await fixture(t, { patch })
  const result = await prepareInstalledBrowserUpgrade(f)
  assert.equal(result.prepared, true); assert.equal(f.count(), 1)
  assert.equal(await readFile(join(f.home, 'profiles/desktop/package.json'), 'utf8'), f.original)
 })
}
test('an explicitly disabled browser provider avoids download', async t => {
 const f = await fixture(t, { patch: '- id: browser-electron\n  disabled: true\n' })
 assert.equal((await prepareInstalledBrowserUpgrade(f)).reason, 'disabled'); assert.equal(f.count(), 0)
})
test('a fresh minimal profile without prior component avoids download', async t => {
 const f = await fixture(t, { minimal: true })
 assert.equal((await prepareInstalledBrowserUpgrade(f)).reason, 'unused-minimal'); assert.equal(f.count(), 0)
})
test('a used minimal profile verifies or repairs its existing component', async t => {
 const f = await fixture(t, { minimal: true })
 await mkdir(join(f.home, 'desktop-components/browser-electron/44.7.0-win32-x64'), { recursive: true })
 assert.equal((await prepareInstalledBrowserUpgrade(f)).prepared, true); assert.equal(f.count(), 1)
})
test('preparation failure and cancellation reject before any profile mutation', async t => {
 const f = await fixture(t)
 await assert.rejects(prepareInstalledBrowserUpgrade({ ...f, createManager: () => ({ prepare: async () => { throw Error('offline') } }) }), /offline/u)
 const controller = new AbortController(); controller.abort(Error('cancelled'))
 await assert.rejects(prepareInstalledBrowserUpgrade({ ...f, signal: controller.signal }), /cancelled/u)
 assert.equal(await readFile(join(f.home, 'profiles/desktop/package.json'), 'utf8'), f.original)
})
test('invalid or ambiguous Home contracts fail without guessing another directory', async t => {
 const f = await fixture(t)
 await writeFile(join(f.home, 'profiles/desktop/package.json'), '{"name":"other-app"}')
 await assert.rejects(prepareInstalledBrowserUpgrade(f), /Home.*identity/u)
 await assert.rejects(prepareInstalledBrowserUpgrade({ home: 'relative-home' }), /Home.*absolute/u)
})

test('disabling only the real inert root/client row cannot skip a still-enabled sibling browser service/provider', async t => {
 const f = await fixture(t, { patch: '- id: dsh-builtin-browser\n  disabled: true\n' })
 const result = await prepareInstalledBrowserUpgrade(f)
 assert.equal(result.prepared, true); assert.equal(f.count(), 1)
})
test('a real group disabled override applies to its config children, without treating insert as a group', async t => {
 const f = await fixture(t, { patch: '- insert:\n    - id: browser-stack\n      group: true\n      config:\n        - id: browser-electron\n          name: dsh-builtin-browser/browser-electron\n          disabled: false\n- id: browser-stack\n  disabled: true\n' })
 assert.equal((await prepareInstalledBrowserUpgrade(f)).reason, 'disabled'); assert.equal(f.count(), 0)
})
for (const [patch, expected] of [
 ['- id: browser-electron\n  disabled: true\n- id: browser-electron\n  disabled: false\n', true],
 ['- id: browser-electron\n  disabled: false\n- id: browser-electron\n  disabled: true\n', false],
 ['- id: browser\n  disabled: true\n- id: browser-electron\n  disabled: false\n', false],
]) test(`browser overrides use final effective service/provider values: prepare=${expected}`, async t => {
 const f = await fixture(t, { patch }), result = await prepareInstalledBrowserUpgrade(f)
 assert.equal(result.prepared, expected); assert.equal(f.count(), expected ? 1 : 0)
})
test('a linked existing component is rejected instead of classified as unused', async t => {
 const f = await fixture(t, { minimal: true })
 const external = join(f.home, 'other'); await mkdir(external)
 await mkdir(join(f.home, 'desktop-components/browser-electron'), { recursive: true })
 await symlink(external, join(f.home, 'desktop-components/browser-electron/44.7.0-win32-x64'), process.platform === 'win32' ? 'junction' : 'dir')
 await assert.rejects(prepareInstalledBrowserUpgrade(f), /contains a link/u)
 assert.equal(f.count(), 0)
})

test('the actually installed vendor sibling bundle keeps preparing when only its inert client root is disabled', async t => {
 const require = createRequire(import.meta.url), vendor = dirname(require.resolve('dsh-builtin-browser/package.json'))
 const publishedBundle = await readFile(join(vendor, 'cordis.patch.yml'), 'utf8')
 const f = await fixture(t, { patch: publishedBundle + '\n- id: dsh-builtin-browser\n  disabled: true\n' })
 assert.equal((await prepareInstalledBrowserUpgrade(f)).prepared, true); assert.equal(f.count(), 1)
})
test('a later effective group enable restores preparation for its enabled provider', async t => {
 const f = await fixture(t, { patch: '- insert:\n    - id: browser-stack\n      group: true\n      disabled: true\n      config:\n        - id: browser-electron\n          name: dsh-builtin-browser/browser-electron\n          disabled: false\n- id: browser-stack\n  disabled: false\n' })
 assert.equal((await prepareInstalledBrowserUpgrade(f)).prepared, true); assert.equal(f.count(), 1)
})

test('Home patch overrides the profile patch in the actual runtime layer order', async t => {
 const f = await fixture(t, { patch: '- id: browser-electron\n  disabled: true\n' })
 await writeFile(join(f.home, 'cordis.patch.yml'), '- id: browser-electron\n  disabled: false\n')
 assert.equal((await prepareInstalledBrowserUpgrade(f)).prepared, true); assert.equal(f.count(), 1)
})

test('an explicit final Home disable is respected after a profile enable', async t => {
 const f = await fixture(t, { patch: '- id: browser-electron\n  disabled: false\n' })
 await writeFile(join(f.home, 'cordis.patch.yml'), '- id: browser-electron\n  disabled: true\n')
 assert.equal((await prepareInstalledBrowserUpgrade(f)).reason, 'disabled'); assert.equal(f.count(), 0)
})
