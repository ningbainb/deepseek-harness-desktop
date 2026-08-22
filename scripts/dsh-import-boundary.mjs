import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const REPOSITORY_ROOT = resolve(SCRIPT_DIR, '..')
export const BASELINE_PATH = resolve(SCRIPT_DIR, 'dsh-import-boundary.baseline.json')

const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])
const CONTROLLED_PREFIXES = Object.freeze([
  'apps/dsh-desktop/src/runtime-provider.mjs',
  'packages/dsh-desktop-compat/src/',
  'packages/dsh-desktop-repair/src/',
])

function normalizedPath(root, path) {
  return relative(root, path).split(sep).join('/')
}

function signatureOf(item) {
  return `${item.path}\u0000${item.kind}\u0000${item.specifier}`
}

function occurrence(kind, specifier, match, source) {
  const before = source.slice(0, match.index)
  return {
    kind,
    specifier,
    line: before.split(/\r?\n/u).length,
    typeOnly: /\b(?:import|export)\s+type\b/u.test(match[0]),
  }
}

export function scanSourceText(source) {
  if (typeof source !== 'string') throw new TypeError('source text must be a string')
  const found = []
  const patterns = [
    {
      kind: 'static-import',
      pattern: /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"](@deepseek-ai\/dsh[^'"]*)['"]/gu,
    },
    {
      kind: 'static-export',
      pattern: /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+['"](@deepseek-ai\/dsh[^'"]*)['"]/gu,
    },
    {
      kind: 'dynamic-import',
      pattern: /\bimport\s*\(\s*['"](@deepseek-ai\/dsh[^'"]*)['"]\s*\)/gu,
    },
    {
      kind: 'require',
      pattern: /\brequire\s*\(\s*['"](@deepseek-ai\/dsh[^'"]*)['"]\s*\)/gu,
    },
  ]
  for (const { kind, pattern } of patterns) {
    for (const match of source.matchAll(pattern)) {
      found.push(occurrence(kind, match[1], match, source))
    }
  }
  return found.toSorted((left, right) => left.line - right.line || left.kind.localeCompare(right.kind))
}

export function listRepositoryFiles(root) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.once('error', reject)
    // `exit` can precede the stdio streams closing, which occasionally yielded
    // an empty or truncated file list under concurrent Linux CI scans.
    child.once('close', (code) => {
      if (code !== 0) reject(new Error(`git ls-files failed: ${stderr.trim()}`))
      else resolvePromise(
        stdout
          .split(/\r?\n/u)
          .filter(Boolean)
          .filter((path) => existsSync(resolve(root, path))),
      )
    })
  })
}

function sourceExtension(path) {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot)
}

export function isControlledImportPath(path) {
  return CONTROLLED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
}

export async function scanRepositoryImports(root = REPOSITORY_ROOT) {
  const paths = (await listRepositoryFiles(root))
    .map((path) => path.split('\\').join('/'))
    .filter((path) => SOURCE_EXTENSIONS.has(sourceExtension(path)))
    .filter((path) => !path.includes('/lib/') && !path.includes('/dist/') && !path.includes('/build/'))
    .filter((path) => !path.endsWith('.d.ts'))
    .toSorted()
  const entries = []
  for (const path of paths) {
    const absolutePath = resolve(root, path)
    const source = await readFile(absolutePath, 'utf8')
    for (const item of scanSourceText(source)) entries.push({ path: normalizedPath(root, absolutePath), ...item })
  }
  return entries
}

export function createBoundaryBaseline(entries) {
  const counts = {}
  for (const item of entries) {
    if (isControlledImportPath(item.path)) continue
    const signature = signatureOf(item)
    counts[signature] = (counts[signature] ?? 0) + 1
  }
  return {
    schemaVersion: 1,
    policy: 'New direct @deepseek-ai/dsh* imports are allowed only in controlled adapter/compat modules.',
    controlledPrefixes: [...CONTROLLED_PREFIXES],
    counts: Object.fromEntries(Object.entries(counts).toSorted(([left], [right]) => left.localeCompare(right))),
  }
}

export function compareImportBoundary(entries, baseline) {
  if (baseline?.schemaVersion !== 1 || baseline.counts === null || typeof baseline.counts !== 'object') {
    throw new TypeError('invalid DSH import boundary baseline')
  }
  const actual = createBoundaryBaseline(entries).counts
  const violations = []
  for (const [signature, count] of Object.entries(actual)) {
    const allowed = baseline.counts[signature] ?? 0
    if (count <= allowed) continue
    const [path, kind, specifier] = signature.split('\u0000')
    violations.push({ path, kind, specifier, allowed, actual: count })
  }
  return violations.toSorted((left, right) => left.path.localeCompare(right.path) || left.specifier.localeCompare(right.specifier))
}

export async function checkImportBoundary({ root = REPOSITORY_ROOT, baselinePath = BASELINE_PATH } = {}) {
  const [entries, baselineText] = await Promise.all([
    scanRepositoryImports(root),
    readFile(baselinePath, 'utf8'),
  ])
  return compareImportBoundary(entries, JSON.parse(baselineText))
}

async function main() {
  const writeBaseline = process.argv.includes('--write-baseline')
  const entries = await scanRepositoryImports()
  if (writeBaseline) {
    const baseline = createBoundaryBaseline(entries)
    await writeFile(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, { flag: 'w' })
    console.log(`wrote ${Object.keys(baseline.counts).length} DSH import boundary signatures`)
    return
  }
  const baseline = JSON.parse(await readFile(BASELINE_PATH, 'utf8'))
  const violations = compareImportBoundary(entries, baseline)
  if (violations.length === 0) {
    console.log('DSH import boundary is unchanged')
    return
  }
  for (const violation of violations) {
    console.error(`${violation.path}: new ${violation.kind} of ${violation.specifier} (${violation.actual} > ${violation.allowed})`)
  }
  process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
