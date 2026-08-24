import { createHash } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  REPOSITORY_ROOT,
  isControlledImportPath,
  listRepositoryFiles,
  scanRepositoryImports,
} from './dsh-import-boundary.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
export const AUDIT_JSON_PATH = resolve(REPOSITORY_ROOT, 'docs/archive/desktop-2.5-dsh-coupling-audit.json')
export const AUDIT_MARKDOWN_PATH = resolve(REPOSITORY_ROOT, 'docs/archive/desktop-2.5-dsh-coupling-audit.md')

const SCANNED_SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'])
const SEAM_PATTERNS = Object.freeze([
  {
    category: 'slot',
    source: String.raw`\b(?:slots?\.(?:inject|register)|ctx\.slots\.(?:inject|register))\s*\(\s*['"]([^'"]+)['"]`,
  },
  {
    category: 'host-service',
    source: String.raw`\b(?:inject\s*=\s*\[[^\]]*|registerHostService\s*\()[\s\S]{0,200}?['"]([a-z][a-z0-9.-]{1,80})['"]`,
  },
  {
    category: 'runtime-lifecycle',
    source: String.raw`\b(?:controller|runtimeProvider|rawRuntimeController)\.(start|stop|restart|recover)\s*\(`,
  },
  {
    category: 'profile-home',
    source: String.raw`\b(ensureDesktopProfile|resolveRuntimePackages|resolveDshCliPath|DSH_HOME|DSH_PROFILE|profileDir|runtimeHome)\b`,
  },
  {
    category: 'workspace',
    source: String.raw`\b(?:ctx\.)?workspaces?\.(register|create|get|open|watch|list)\s*\(`,
  },
  {
    category: 'session',
    source: String.raw`\b(?:ctx\.)?sessions?\.(create|subscribe|get|watch|prompt|list)\s*\(`,
  },
])

function normalizedPath(root, path) {
  return relative(root, path).split(sep).join('/')
}

export function canonicalText(value) {
  return value.replace(/\r\n/g, '\n')
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function lineAt(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length
}

function sourceExtension(path) {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot)
}

function classifyImport(item) {
  if (item.path.startsWith('packages/dsh-desktop-compat/')) return 'compatibility-patch'
  if (item.specifier.includes('/src/') || item.specifier.includes('/lib/')) return 'private-high-risk'
  if (item.specifier.includes('/api/') || /\/(?:client|server)$/u.test(item.specifier)) return 'public-experimental'
  return 'public-stable'
}

export async function scanRuntimeSeams(root = REPOSITORY_ROOT) {
  const paths = (await listRepositoryFiles(root))
    .map((path) => path.split('\\').join('/'))
    .filter((path) => SCANNED_SOURCE_EXTENSIONS.has(sourceExtension(path)))
    .filter((path) => !path.includes('/lib/') && !path.includes('/dist/') && !path.includes('/build/'))
    .filter((path) => !path.endsWith('.d.ts'))
    .toSorted()
  const results = []
  for (const path of paths) {
    const source = canonicalText(await readFile(resolve(root, path), 'utf8'))
    for (const { category, source: patternSource } of SEAM_PATTERNS) {
      // Construct a fresh matcher for every file. Shared global RegExp instances
      // carry mutable lastIndex state and made the Linux full-suite audit flaky.
      const pattern = new RegExp(patternSource, 'gu')
      for (const match of source.matchAll(pattern)) {
        results.push({
          category,
          path: normalizedPath(root, resolve(root, path)),
          line: lineAt(source, match.index),
          operation: match[1],
        })
      }
    }
  }
  return results.toSorted((left, right) => (
    compareText(left.category, right.category)
    || compareText(left.path, right.path)
    || left.line - right.line
  ))
}

function lockfileHash(lockfile) {
  return createHash('sha256').update(canonicalText(lockfile.toString('utf8'))).digest('hex')
}

export async function createCouplingAudit(root = REPOSITORY_ROOT) {
  const [imports, seams, desktopManifestText, lockfile] = await Promise.all([
    scanRepositoryImports(root),
    scanRuntimeSeams(root),
    readFile(resolve(root, 'apps/dsh-desktop/package.json'), 'utf8'),
    readFile(resolve(root, 'pnpm-lock.yaml')),
  ])
  const desktopManifest = JSON.parse(desktopManifestText)
  return {
    schemaVersion: 1,
    desktopVersion: desktopManifest.version,
    upstreamVersion: desktopManifest.dependencies?.['@deepseek-ai/dsh'],
    lockfileSha256: lockfileHash(lockfile),
    policy: {
      controlledImportPrefixes: [
        'apps/dsh-desktop/src/runtime-provider.mjs',
        'packages/dsh-desktop-compat/src/',
      ],
      capabilityIsNotAuthorization: true,
    },
    imports: imports.map((item) => ({
      ...item,
      classification: classifyImport(item),
      controlled: isControlledImportPath(item.path),
    })),
    seams,
  }
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

export function renderCouplingAuditMarkdown(audit) {
  const counts = Object.fromEntries(
    ['public-stable', 'public-experimental', 'compatibility-patch', 'private-high-risk']
      .map((classification) => [classification, audit.imports.filter((item) => item.classification === classification).length]),
  )
  const lines = [
    '# Desktop 2.5 DSH coupling audit',
    '',
    `Authoritative Desktop version: ${audit.desktopVersion}.`,
    '',
    `Stable DSH package version: ${audit.upstreamVersion}.`,
    '',
    `Lockfile SHA-256: \`${audit.lockfileSha256}\`.`,
    '',
    'Capability discovery is compatibility evidence only. Renderer surface identity, channel allowlists, and argument validation remain the authorization boundary.',
    '',
    '## Classification summary',
    '',
    '| Classification | Count |',
    '| --- | ---: |',
    ...Object.entries(counts).map(([classification, count]) => `| ${classification} | ${count} |`),
    '',
    '## Direct imports, dynamic imports, and requires',
    '',
    '| File | Line | Kind | Specifier | Type-only | Classification | Controlled |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
    ...audit.imports.map((item) => `| ${markdownCell(item.path)} | ${item.line} | ${item.kind} | ${markdownCell(item.specifier)} | ${item.typeOnly ? 'yes' : 'no'} | ${item.classification} | ${item.controlled ? 'yes' : 'no'} |`),
    '',
    '## Slot, Host service, Profile/Home, Workspace, Session, and Runtime lifecycle seams',
    '',
    '| Category | File | Line | Operation or identity |',
    '| --- | --- | ---: | --- |',
    ...audit.seams.map((item) => `| ${item.category} | ${markdownCell(item.path)} | ${item.line} | ${markdownCell(item.operation)} |`),
    '',
  ]
  return lines.join('\n')
}

async function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  const backup = `${path}.bak-${process.pid}-${Date.now()}`
  await writeFile(temporary, content, { flag: 'wx' })
  let movedExisting = false
  try {
    try {
      await rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true })
    if (movedExisting) {
      await rm(path, { force: true })
      await rename(backup, path)
    }
    throw error
  }
}

async function main() {
  const audit = await createCouplingAudit()
  const json = `${JSON.stringify(audit, null, 2)}\n`
  const markdown = renderCouplingAuditMarkdown(audit)
  if (process.argv.includes('--check')) {
    const [existingJson, existingMarkdown] = await Promise.all([
      readFile(AUDIT_JSON_PATH, 'utf8'),
      readFile(AUDIT_MARKDOWN_PATH, 'utf8'),
    ])
    if (existingJson !== json || existingMarkdown !== markdown) {
      throw new Error('DSH coupling audit is stale; run node scripts/audit-dsh-coupling.mjs --write')
    }
    console.log('DSH coupling audit is current')
    return
  }
  if (!process.argv.includes('--write')) throw new Error('use --write or --check')
  await Promise.all([
    atomicWrite(AUDIT_JSON_PATH, json),
    atomicWrite(AUDIT_MARKDOWN_PATH, markdown),
  ])
  console.log(`wrote DSH coupling audit with ${audit.imports.length} imports and ${audit.seams.length} seams`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
