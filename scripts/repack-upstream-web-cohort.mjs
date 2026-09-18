import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { COHORT_DIRECTORY } from './verify-upstream-web-cohort.mjs'

const DEFAULT_NPM_CLI = process.platform === 'win32'
  ? 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'
  : undefined

function invoke(program, args, { cwd, label }) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed: ${result.error?.code ?? result.status ?? 'unknown'}\n${result.stderr?.slice(-1000) ?? ''}`)
  }
}

function sortedDependencies(record) {
  if (record === undefined) return record
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('packed dependency table is invalid')
  }
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right, 'en')))
}

export function canonicalizePackedManifest(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('packed manifest must be an object')
  }
  const result = { ...value }
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (Object.hasOwn(result, key)) result[key] = sortedDependencies(result[key])
  }
  return result
}

export async function repackUpstreamWebCohort({ input, output, npmCli = DEFAULT_NPM_CLI } = {}) {
  if (typeof input !== 'string' || typeof output !== 'string') throw new TypeError('input and output directories are required')
  const inputRoot = resolve(input)
  const outputRoot = resolve(output)
  if (inputRoot === outputRoot) throw new Error('input and output directories must differ')
  const provenance = JSON.parse(await readFile(join(COHORT_DIRECTORY, 'provenance.json'), 'utf8'))
  const names = Object.keys(provenance.artifacts).sort()
  await mkdir(outputRoot, { recursive: true })
  for (const filename of names) {
    const scratch = await mkdtemp(join(tmpdir(), 'dsh-web-repack-'))
    try {
      invoke('tar', ['-xf', join(inputRoot, filename), '-C', scratch], { label: `extract ${filename}` })
      const packageDir = join(scratch, 'package')
      const manifestPath = join(packageDir, 'package.json')
      const manifest = canonicalizePackedManifest(JSON.parse(await readFile(manifestPath, 'utf8')))
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
      const command = npmCli ? process.execPath : 'npm'
      const args = npmCli
        ? [npmCli, 'pack', '--ignore-scripts', '--pack-destination', outputRoot]
        : ['pack', '--ignore-scripts', '--pack-destination', outputRoot]
      invoke(command, args, { cwd: packageDir, label: `repack ${filename}` })
      const packedManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      if (packedManifest.name !== `@linxin666/${filename.slice('linxin666-'.length, -'-0.3.23.tgz'.length)}`) {
        throw new Error(`upstream package name changed while repacking: ${filename}`)
      }
    } finally {
      const fromTemp = relative(resolve(tmpdir()), scratch)
      if (fromTemp && fromTemp !== '..' && !fromTemp.startsWith(`..${sep}`)) {
        await rm(scratch, { recursive: true, force: true })
      }
    }
  }
  return Object.freeze({ count: names.length, output: outputRoot })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const value = flag => {
    const index = args.indexOf(flag)
    return index === -1 ? undefined : args[index + 1]
  }
  if (args.length !== 4 && args.length !== 6) throw new Error('usage: --input DIR --output DIR [--npm-cli FILE]')
  const result = await repackUpstreamWebCohort({ input: value('--input'), output: value('--output'), npmCli: value('--npm-cli') ?? DEFAULT_NPM_CLI })
  console.log(`[PASS] normalized ${result.count} upstream Web source packages`)
}
