import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { assertNativeFixtureStorage } from './native-fixture-storage.mjs'
import { resolveNsisCompiler } from './nsis-compiler.mjs'

// Compile only. Starting this independent UI fixture is an explicit later step.
const { values } = parseArgs({ options: { output: { type: 'string' } } })
assert.equal(process.platform, 'win32', 'Native Windows display fixture only')
assert.ok(isAbsolute(values.output ?? ''), 'Use --output with a new absolute evidence directory')
await assertNativeFixtureStorage({ outputDirectory: values.output })
await mkdir(values.output, { recursive: true })
const executable = join(values.output, 'installer-finish-paths-display.exe')
await assert.rejects(stat(executable), { code: 'ENOENT' })
const compiler = await resolveNsisCompiler()
await promisify(execFile)(compiler.path, ['/WX', '/V2',
  `/DBUILD_RESOURCES_DIR=${fileURLToPath(new URL('../build/', import.meta.url))}`,
  `/DTEST_OUTPUT=${executable}`, fileURLToPath(new URL('../test/fixtures/installer-finish-paths.nsi', import.meta.url))],
{ windowsHide: true, env: compiler.env, timeout: 30000 })
await writeFile(join(values.output, 'scope.json'), JSON.stringify({ compiledOnly: true, executable,
  scope: 'Isolated stock Finish layout with a long synthetic program path; no installation, registry, Home discovery, application launch or GUI execution by this preparation command',
  pending: ['Run the display fixture, verify read-only text can be copied, scroll to END-OF-PATH-EVIDENCE and check Finish remains usable',
    'Final real installer validation, including stock launch checkbox and update arguments'] }, null, 2), { flag: 'wx' })
console.log(executable)
