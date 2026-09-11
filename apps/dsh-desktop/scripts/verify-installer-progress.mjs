import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { promisify } from 'node:util'
import { resolveNsisCompiler } from './nsis-compiler.mjs'

const exec = promisify(execFile)
const desktop = resolve(import.meta.dirname, '..')
const compiler = await resolveNsisCompiler()
const root = await mkdtemp(join(tmpdir(), 'dsh-installer-progress-'))
const output = resolve(desktop, '../../.tmp/installer-progress-ui')
await mkdir(output, { recursive: true })
try {
  for (const fallback of [false, true]) {
    const name = fallback ? 'observer-unavailable' : 'live-progress'
    const scenario = join(root, name)
    const evidence = join(output, name)
    await mkdir(scenario)
    await mkdir(evidence, { recursive: true })
    const installer = join(scenario, `${name}.exe`)
    await exec(compiler.path, ['/V2', `/DBUILD_RESOURCES_DIR=${join(desktop, 'build')}`,
      `/DTEST_OUTPUT=${installer}`, `/DTEST_INSTALL=${join(scenario, 'install')}`,
      `/DTEST_REGISTRY=Software\\DeepSeekHarnessDesktopTests\\progress-${process.pid}`,
      ...(fallback ? ['/DTEST_NO_OBSERVER'] : []),
      join(desktop, 'test/fixtures/installer-progress-ui.nsi')], { env: compiler.env, windowsHide: true, timeout: 30_000 })
    // This GUI fixture uses only UI macros; it does not run process cleanup,
    // install application data, modify real registry keys, or launch the app.
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
      join(desktop, 'test/fixtures/observe-installer-progress.ps1'), '-InstallerPath', installer, '-OutputDirectory', evidence], { windowsHide: true, timeout: 60_000 })
    const rows = JSON.parse((await readFile(join(evidence, 'observations.json'), 'utf8')).replace(/^\uFEFF/u, ''))
    assert.ok(rows.some(row => row.title.startsWith('1 / 3')), `${name}: preparation stage missing`)
    const working = rows.filter(row => row.title.startsWith('2 / 3') && !row.finished)
    assert.ok(working.length > 0, `${name}: file phase missing`)
    assert.ok(working.every(row => row.marquee), `${name}: activity bar stopped during blocking work`)
    assert.ok(working.every(row => row.detailsAvailable), 'details action must remain available')
    assert.ok(rows.some(row => row.title.startsWith('3 / 3')), 'commit phase missing')
    assert.ok(rows.some(row => row.finished), 'finish page missing')
    assert.ok(rows.every(row => !row.subtitle.includes('%')), 'do not invent percentages')
    if (!fallback) {
      assert.ok(new Set(working.map(row => row.subtitle.match(/已用 (\d+:\d+)/u)?.[1]).filter(Boolean)).size >= 3, 'elapsed time must update during the blocked copy call')
      assert.ok(working.some(row => row.subtitle.includes('暂未观察到新的文件读写')), 'quiet I/O must be reported honestly')
    }
    console.log(`PASS ${name}: phase labels, animation, details and finish; ${working.length} working snapshots`)
  }
} finally {
  // An antivirus may still hold a just-executed fixture; preserve the primary
  // test error and leave its uniquely named temporary directory for diagnosis.
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
    .catch(error => console.warn(`Fixture cleanup deferred: ${error.code}`))
}
