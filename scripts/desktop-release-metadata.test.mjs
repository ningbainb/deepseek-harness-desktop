import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const moduleURL = new URL('./desktop-release-metadata.mjs', import.meta.url)

async function classify(input) {
  let classifier
  try {
    classifier = (await import(moduleURL.href)).classifyDesktopReleaseMetadata
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== moduleURL.href) throw error
  }
  assert.equal(typeof classifier, 'function', 'Desktop release metadata requires a pure event classifier')
  return classifier(input)
}

for (const ref of ['refs/heads/main', 'refs/heads/codex/desktop-5.2.0-preflight',
  'refs/tags/desktop-v5.2.0', 'refs/tags/desktop-v5.1.0', 'refs/tags/desktop-v5.2.0-beta.1']) {
  test(`manual dispatch on ${ref} never publishes`, async () => {
    assert.deepEqual(await classify({ eventName: 'workflow_dispatch', ref, version: '5.2.0' }), {
      version: '5.2.0', publish: false,
    })
  })
}

test('an exact matching stable Desktop tag push may publish', async () => {
  assert.deepEqual(await classify({ eventName: 'push', ref: 'refs/tags/desktop-v5.2.0', version: '5.2.0' }), {
    version: '5.2.0', publish: true,
  })
})

test('a stable Desktop tag push with a different package version refuses publication', async () => {
  await assert.rejects(classify({ eventName: 'push', ref: 'refs/tags/desktop-v5.1.0', version: '5.2.0' }), /tag.*version|version.*tag/iu)
})

for (const ref of ['refs/tags/desktop-v5.2.0-beta.1', 'refs/tags/desktop-v05.2.0',
  'refs/tags/desktop-v5.2.0/extra', 'refs/tags/desktop-v5.2.0\npublish=true']) {
  test(`malformed stable Desktop push tag is refused: ${JSON.stringify(ref)}`, async () => {
    await assert.rejects(classify({ eventName: 'push', ref, version: '5.2.0' }), /stable|tag/iu)
  })
}

for (const [eventName, ref] of [['push', 'refs/heads/main'], ['push', 'refs/tags/v5.2.0'],
  ['pull_request', 'refs/tags/desktop-v5.2.0'], ['release', 'refs/tags/desktop-v5.2.0'],
  [undefined, 'refs/tags/desktop-v5.2.0']]) {
  test(`only a stable Desktop push may publish: ${eventName} ${ref}`, async () => {
    assert.equal((await classify({ eventName, ref, version: '5.2.0' })).publish, false)
  })
}

for (const version of ['', '5.2', '05.2.0', '5.2.0-beta.1', '5.2.0\npublish=true']) {
  test(`invalid stable package version cannot reach workflow outputs: ${JSON.stringify(version)}`, async () => {
    await assert.rejects(classify({ eventName: 'workflow_dispatch', ref: 'refs/heads/main', version }), /stable.*version|version.*stable/iu)
  })
}

test('metadata CLI writes nonpublishing dispatch outputs and leaves no outputs on a mismatched push', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-metadata-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const version = JSON.parse(await readFile(new URL('../apps/dsh-desktop/package.json', import.meta.url), 'utf8')).version
  const output = join(directory, 'github-output')
  const env = { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: `refs/tags/desktop-v${version}`, GITHUB_OUTPUT: output }
  const dispatched = spawnSync(process.execPath, [fileURLToPath(moduleURL)], { env, encoding: 'utf8', windowsHide: true })
  assert.equal(dispatched.status, 0, dispatched.stderr)
  assert.equal(await readFile(output, 'utf8'), `version=${version}\npublish=false\n`)
  const refusedOutput = join(directory, 'refused-output')
  const refused = spawnSync(process.execPath, [fileURLToPath(moduleURL)], {
    env: { ...env, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/tags/desktop-v0.0.0', GITHUB_OUTPUT: refusedOutput },
    encoding: 'utf8', windowsHide: true,
  })
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /tag.*version|version.*tag/iu)
  assert.equal(await readFile(refusedOutput, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error }), '')
})
