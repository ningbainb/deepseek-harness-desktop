import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

const sha = value => createHash('sha256').update(value).digest('hex')
for (const scenario of ['complete', 'corrupt-file', 'corrupt-manifest', 'missing-required', 'traversal']) {
  test(`installer commit verifies full runtime without reconstruction: ${scenario}`, { skip: process.platform !== 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-full-runtime-'))
    try {
      const prefix = 'resources/app.asar.unpacked/node_modules/electron/'
      await mkdir(join(root, prefix, 'dist'), { recursive: true })
      await mkdir(join(root, 'resources/runtime-reconstruction'), { recursive: true })
      const completeFiles = []
      for (const target of ['dist/electron.exe', 'package.json']) {
        const value = target === 'package.json' ? '{"name":"electron"}' : 'verified-independent-runtime'
        await writeFile(join(root, prefix, target), value)
        completeFiles.push({ target: prefix + target, size: Buffer.byteLength(value), sha256: sha(value) })
      }
      if (scenario === 'corrupt-file') await writeFile(join(root, prefix, 'dist/electron.exe'), 'damaged')
      if (scenario === 'missing-required') completeFiles.pop()
      if (scenario === 'traversal') completeFiles[0].target = prefix + 'dist/../../outside.exe'
      const metadata = JSON.stringify({ schemaVersion: 1, completeFiles })
      await writeFile(join(root, 'resources/runtime-reconstruction/manifest.json'), scenario === 'corrupt-manifest' ? metadata + '\n' : metadata)
      const run = () => promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
        join(import.meta.dirname, '../build/installer-upgrade-transaction.ps1'), '-Mode', 'Commit', '-CompleteRuntimePayload',
        '-InstallDirectory', root, '-RuntimeManifestSHA256', sha(metadata)], { windowsHide: true })
      if (scenario === 'complete') assert.match((await run()).stdout, /runtime-complete-payload-validated/u)
      else await assert.rejects(run(), /runtime.*(?:integrity|target|manifest|missing)/iu)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
}


const externalTargets = [
  'DeepSeek Harness Desktop.exe', 'resources/app.asar', 'resources/app.asar.unpacked/package.json',
  'resources/app.asar.unpacked/runtime-support/browser-component.json',
]
for (const scenario of ['complete', 'missing-file', 'corrupt-file', 'corrupt-manifest', 'missing-required', 'extra-file', 'duplicate-target',
  'traversal', 'wrong-kind', 'wrong-version', 'wrong-schema', 'invalid-size', 'string-size', 'same-size-bad-hash', 'bad-json', 'invalid-hash', 'linked-directory', 'linked-manifest']) {
  test(`installer commit verifies external browser payload without reconstruction: ${scenario}`, { skip: process.platform !== 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-external-runtime-'))
    try {
      const completeFiles = []
      for (const target of externalTargets) {
        await mkdir(join(root, target, '..'), { recursive: true })
        const value = target.endsWith('.json') ? '{"fixture":true}' : 'verified-external-browser-payload'
        await writeFile(join(root, target), value)
        completeFiles.push({ target, size: Buffer.byteLength(value), sha256: sha(value) })
      }
      const manifest = { schemaVersion: 2, payloadKind: 'external-browser', electronVersion: '44.7.0', completeFiles }
      if (scenario === 'missing-file') await rm(join(root, externalTargets[0]))
      if (scenario === 'corrupt-file') await writeFile(join(root, externalTargets[0]), 'damaged')
      if (scenario === 'same-size-bad-hash') await writeFile(join(root, externalTargets[0]), 'x'.repeat(completeFiles[0].size))
      if (scenario === 'missing-required') completeFiles.pop()
      if (scenario === 'extra-file') completeFiles.push({ ...completeFiles[0], target: 'extra.exe' })
      if (scenario === 'duplicate-target') completeFiles[3] = { ...completeFiles[2] }
      if (scenario === 'traversal') completeFiles[0].target = 'resources/../DeepSeek Harness Desktop.exe'
      if (scenario === 'wrong-kind') manifest.payloadKind = 'full-runtime'
      if (scenario === 'wrong-version') manifest.electronVersion = '44.7.1'
      if (scenario === 'wrong-schema') manifest.schemaVersion = 3
      if (scenario === 'invalid-size') completeFiles[0].size = -1
      if (scenario === 'string-size') completeFiles[0].size = String(completeFiles[0].size)
      if (scenario === 'invalid-hash') completeFiles[0].sha256 = 'invalid'
      if (scenario === 'linked-directory') {
        await rename(join(root, 'resources/app.asar.unpacked'), join(root, 'actual-unpacked'))
        await symlink(join(root, 'actual-unpacked'), join(root, 'resources/app.asar.unpacked'), 'junction')
      }
      const metadata = scenario === 'bad-json' ? '{invalid-json' : JSON.stringify(manifest)
      await mkdir(join(root, 'resources/runtime-reconstruction'), { recursive: true })
      await writeFile(join(root, 'resources/runtime-reconstruction/manifest.json'), scenario === 'corrupt-manifest' ? metadata + '\n' : metadata)
      if (scenario === 'linked-manifest') {
        await rename(join(root, 'resources/runtime-reconstruction'), join(root, 'actual-manifest'))
        await symlink(join(root, 'actual-manifest'), join(root, 'resources/runtime-reconstruction'), 'junction')
      }
      const run = () => promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
        join(import.meta.dirname, '../build/installer-upgrade-transaction.ps1'), '-Mode', 'Commit', '-CompleteRuntimePayload',
        '-InstallDirectory', root, '-RuntimeManifestSHA256', sha(metadata)], { windowsHide: true })
      if (scenario === 'complete') {
        const { stdout } = await run()
        assert.match(stdout, /runtime-complete-payload-validated/u)
        assert.doesNotMatch(stdout, /runtime-restor(?:ed|ing)/iu)
      } else await assert.rejects(run(), /runtime.*(?:integrity|target|manifest|missing|link)/iu)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
}
