import assert from 'node:assert/strict'
import test from 'node:test'
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertNativeFixtureStorage, nativeFixtureStoragePolicy, prepareNativeFixtureStorage } from '../scripts/native-fixture-storage.mjs'

// Pure path-policy tests. These do not launch Setup or establish native CI acceptance.
const hosted = {
  CI: 'true', GITHUB_ACTIONS: 'true', RUNNER_OS: 'Windows',
  RUNNER_ENVIRONMENT: 'github-hosted', RUNNER_NAME: 'GitHub Actions 12',
  RUNNER_TEMP: 'D:\\a\\_temp', GITHUB_WORKSPACE: 'D:\\a\\desktop\\desktop',
}
const temporaryDirectory = 'D:\\a\\_temp\\dsh-native-fixtures'
const nativeWindows = { skip: process.platform === 'win32' ? false : 'Requires native Windows filesystem paths; Windows must run this case', timeout: 30_000 }

test('local native fixtures retain the E-drive temporary and output requirement', () => {
  const policy = nativeFixtureStoragePolicy({ env: {}, temporaryDirectory: 'E:\\build\\temp', outputDirectory: 'E:\\build\\artifacts\\screens' })
  assert.equal(policy.mode, 'local-e-drive')
  assert.equal(policy.root, 'E:\\')
  assert.throws(() => nativeFixtureStoragePolicy({ env: {}, temporaryDirectory: 'C:\\Temp' }), /E:/u)
  assert.throws(() => nativeFixtureStoragePolicy({ env: {}, temporaryDirectory: 'E:\\temp', outputDirectory: 'D:\\screens' }), /E:/u)
})

test('hosted Windows CI permits only its dedicated RUNNER_TEMP child', () => {
  const policy = nativeFixtureStoragePolicy({ env: hosted, temporaryDirectory, outputDirectory: temporaryDirectory + '\\screens\\new' })
  assert.equal(policy.mode, 'github-hosted-windows')
  assert.equal(policy.root, temporaryDirectory)
  assert.throws(() => nativeFixtureStoragePolicy({ env: hosted, temporaryDirectory: hosted.RUNNER_TEMP }), /dedicated/u)
})

test('runner sibling paths, traversal, and workspace outputs cannot escape the evidence root', () => {
  for (const outputDirectory of ['D:\\a\\_temp\\dsh-native-fixtures-other', temporaryDirectory + '\\..\\outside', hosted.GITHUB_WORKSPACE]) {
    assert.throws(() => nativeFixtureStoragePolicy({ env: hosted, temporaryDirectory, outputDirectory }), /dedicated/u)
  }
})

test('incomplete, self-hosted, and non-Windows contexts do not relax local storage rules', () => {
  for (const [key, value] of [['CI', 'false'], ['GITHUB_ACTIONS', 'false'], ['RUNNER_OS', 'Linux'], ['RUNNER_ENVIRONMENT', 'self-hosted'], ['RUNNER_NAME', 'private-worker'], ['RUNNER_TEMP', 'relative'], ['GITHUB_WORKSPACE', 'relative']]) {
    assert.throws(() => nativeFixtureStoragePolicy({ env: { ...hosted, [key]: value }, temporaryDirectory }), /E:/u)
  }
})

test('root-relative and drive-relative Windows paths are not fully qualified fixture paths', () => {
  for (const temporaryDirectory of ['E:temp', '\\temp', 'relative', 'E:\\temp\nINJECTED=value']) {
    assert.throws(() => nativeFixtureStoragePolicy({ env: {}, temporaryDirectory }), /absolute/u)
  }
})

test('filesystem checks reject output and root junction escapes without invoking Setup', {
  skip: process.platform === 'win32' ? false : 'Requires native Windows filesystem junctions; Windows must run this case',
  timeout: 30_000,
}, async t => {
  await assertNativeFixtureStorage()
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-storage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runner = join(root, 'runner'), allowed = join(runner, 'dsh-native-fixtures'), outside = join(root, 'outside')
  await mkdir(allowed, { recursive: true }); await mkdir(outside)
  const env = { ...hosted, RUNNER_TEMP: runner, GITHUB_WORKSPACE: join(root, 'workspace') }
  await assertNativeFixtureStorage({ env, temporaryDirectory: allowed, outputDirectory: join(allowed, 'future', 'screens') })
  await symlink(outside, join(allowed, 'escape'), 'junction')
  await assert.rejects(assertNativeFixtureStorage({ env, temporaryDirectory: allowed, outputDirectory: join(allowed, 'escape', 'new') }), /escapes/u)
  const secondRunner = join(root, 'second-runner'); await mkdir(secondRunner)
  const linkedRoot = join(secondRunner, 'dsh-native-fixtures'); await symlink(outside, linkedRoot, 'junction')
  await assert.rejects(assertNativeFixtureStorage({ env: { ...env, RUNNER_TEMP: secondRunner }, temporaryDirectory: linkedRoot }), /escapes/u)
  const thirdRunner = join(root, 'third-runner'), sibling = join(thirdRunner, 'other-fixture')
  await mkdir(sibling, { recursive: true })
  const siblingRoot = join(thirdRunner, 'dsh-native-fixtures'); await symlink(sibling, siblingRoot, 'junction')
  await assert.rejects(assertNativeFixtureStorage({ env: { ...env, RUNNER_TEMP: thirdRunner }, temporaryDirectory: siblingRoot }), /link/u)
})

async function preparationFixture(t) {
  await assertNativeFixtureStorage()
  const root = await mkdtemp(join(tmpdir(), 'dsh-native-storage-prepare-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runner = join(root, 'runner'); await mkdir(runner)
  const environmentFile = join(runner, 'github-env'); await writeFile(environmentFile, 'EXISTING=value\n')
  return { root, runner, environmentFile, env: { ...hosted, RUNNER_TEMP: runner, GITHUB_WORKSPACE: root, GITHUB_ENV: environmentFile } }
}

test('CI preparation creates its dedicated root and exports paths without mutating caller environment', nativeWindows, async t => {
  const fixture = await preparationFixture(t)
  await writeFile(fixture.environmentFile, 'EXISTING=value')
  const original = process.env.TEMP
  const result = await prepareNativeFixtureStorage({ env: fixture.env })
  assert.equal(result.mode, 'github-hosted-windows')
  await access(join(fixture.runner, 'dsh-native-fixtures'))
  const lines = (await readFile(fixture.environmentFile, 'utf8')).trim().split(/\r?\n/u)
  assert.deepEqual(lines, ['EXISTING=value', ...['TEMP', 'TMP', 'TMPDIR'].map(name => `${name}=${result.root}`)])
  assert.equal(process.env.TEMP, original)
})

test('CI preparation rejects foreign command files and incomplete context before creating a root', nativeWindows, async t => {
  const fixture = await preparationFixture(t)
  const outside = join(fixture.root, 'outside-command'); await writeFile(outside, 'preserve')
  await assert.rejects(prepareNativeFixtureStorage({ env: { ...fixture.env, GITHUB_ENV: outside } }), /command file/u)
  await assert.rejects(prepareNativeFixtureStorage({ env: { ...fixture.env, CI: 'false' } }), /hosted/u)
  assert.equal(await readFile(outside, 'utf8'), 'preserve')
  assert.equal(await readFile(fixture.environmentFile, 'utf8'), 'EXISTING=value\n')
  await assert.rejects(access(join(fixture.runner, 'dsh-native-fixtures')), { code: 'ENOENT' })
})

test('CI preparation refuses a linked dedicated root before exporting any environment', nativeWindows, async t => {
  const fixture = await preparationFixture(t), outside = join(fixture.root, 'outside')
  await mkdir(outside); await symlink(outside, join(fixture.runner, 'dsh-native-fixtures'), 'junction')
  await assert.rejects(prepareNativeFixtureStorage({ env: fixture.env }), /link/u)
  assert.equal(await readFile(fixture.environmentFile, 'utf8'), 'EXISTING=value\n')
})
