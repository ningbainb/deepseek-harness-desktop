import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  CRITICAL_RUNTIME_FILES,
  assertRuntimeIntegrity,
} from '../src/runtime-integrity.mjs'

const machineIdPath = [
  '@deepseek-ai',
  'dsh-session-telemetry-otel',
  'node_modules',
  '@opentelemetry',
  'resources',
  'build',
  'src',
  'detectors',
  'platform',
  'node',
  'machine-id',
  'getMachineId.js',
].join('/')

test('runtime integrity includes the OpenTelemetry machine identifier reported missing in the field', () => {
  assert.ok(Object.isFrozen(CRITICAL_RUNTIME_FILES))
  assert.ok(CRITICAL_RUNTIME_FILES.includes(machineIdPath))
})

test('desktop directly declares the telemetry package required during bootstrap', async () => {
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-session-telemetry-otel'], '0.1.1-rc.1')
})

test('desktop directly declares the directory-picker host imported by the browse implementation', async () => {
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-host-directory-picker'], '0.1.1-rc.1')
})

test('desktop directly declares RC.1 authorization and sidebar client peers', async () => {
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  for (const packageName of [
    '@deepseek-ai/dsh-authorization',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-slots',
  ]) {
    assert.equal(manifest.dependencies[packageName], '0.1.1-rc.1')
  }
})

test('desktop directly pins every RC.1 boot layer used by the packaged runtime', async () => {
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  for (const packageName of [
    '@deepseek-ai/dsh',
    '@deepseek-ai/dsh-app-boot',
    '@deepseek-ai/dsh-base',
    '@deepseek-ai/dsh-web-app',
  ]) {
    assert.equal(manifest.dependencies[packageName], '0.1.1-rc.1')
  }
})

test('runtime integrity reports an incomplete installation and recommends reinstalling', async () => {
  const modulesRoot = await mkdtemp(join(tmpdir(), 'dsh-runtime-integrity-'))
  try {
    assert.throws(
      () => assertRuntimeIntegrity({ modulesRoot }),
      (error) => {
        assert.equal(error.code, 'DSH_DESKTOP_INSTALLATION_INCOMPLETE')
        assert.match(error.message, /getMachineId\.js/u)
        assert.match(error.message, /重新安装 Desktop/u)
        return true
      },
    )

    for (const relativePath of CRITICAL_RUNTIME_FILES) {
      const target = join(modulesRoot, ...relativePath.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, 'verified')
    }
    assert.doesNotThrow(() => assertRuntimeIntegrity({ modulesRoot }))
  } finally {
    await rm(modulesRoot, { recursive: true, force: true })
  }
})

test('package verification consumes the shared critical runtime file contract', async () => {
  const source = await readFile(fileURLToPath(new URL('../scripts/verify-package.mjs', import.meta.url)), 'utf8')
  assert.match(source, /CRITICAL_RUNTIME_FILES/u)
  assert.match(source, /for \(const relativePath of CRITICAL_RUNTIME_FILES\)/u)
  assert.match(source, /verifyRuntimeFileEvidence/u)
  assert.match(source, /readRuntimePackageVersion/u)
  assert.match(source, /join\(resources, 'runtime-support', 'known-good\.json'\)/u)
  assert.match(source, /join\(resources, 'runtime-support', 'supported-runtimes\.json'\)/u)
  assert.match(source, /readRuntimeSupportMatrix/u)
  assert.match(source, /assessRuntimeSupport/u)
  assert.match(source, /patchEvidence: packagedRuntimeEvidence\.patches/u)
  assert.match(source, /STABLE_RUNTIME_MATRIX_STATUSES/u)
  assert.match(source, /'@deepseek-ai\/dsh-host-directory-picker'/u)
  assert.match(source, /packaged SSH client eagerly bundles xterm/u)
  assert.match(source, /'@xterm', 'xterm', 'lib', 'xterm\.js'/u)
  assert.match(source, /'node-pty', 'prebuilds', 'win32-x64', 'conpty\.node'/u)
})
