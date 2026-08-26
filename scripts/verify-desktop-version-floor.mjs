#!/usr/bin/env node
// Guards against the main branch shipping a Desktop version older than the
// latest released desktop-vX.Y.Z tag (the 3.0.9/main divergence regression).
// Comparison is semantic: versions are parsed into numeric triples instead of
// compared as strings. Prerelease tags never raise the floor.
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const DESKTOP_MANIFEST = new URL('../apps/dsh-desktop/package.json', import.meta.url)

export function parseSemanticVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/u.exec(String(value ?? '').trim())
  if (!match) return undefined
  return Object.freeze({
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] !== undefined,
  })
}

function compareTriples(left, right) {
  for (const field of ['major', 'minor', 'patch']) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1
  }
  return 0
}

const STABLE_DESKTOP_TAG = /^desktop-v(\d+)\.(\d+)\.(\d+)$/u

export function latestStableDesktopVersion(tags) {
  let latest
  for (const tag of tags ?? []) {
    // Only fully stable release tags raise the floor; prerelease tags
    // (desktop-vX.Y.Z-rc.N and desktop-beta-v...) never qualify.
    const match = STABLE_DESKTOP_TAG.exec(String(tag))
    if (!match) continue
    const candidate = Object.freeze({ major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) })
    if (latest === undefined || compareTriples(latest, candidate) < 0) latest = candidate
  }
  return latest === undefined ? undefined : `${latest.major}.${latest.minor}.${latest.patch}`
}

/** Pure floor decision so tests and the CLI share one comparison path. */
export function evaluateDesktopVersionFloor({ version, tags }) {
  const current = parseSemanticVersion(version)
  if (current === undefined) throw new Error(`invalid desktop version: ${JSON.stringify(version)}`)
  const floor = latestStableDesktopVersion(tags)
  return { current: version, floor, ok: floor === undefined || compareTriples(current, parseSemanticVersion(floor)) >= 0 }
}

async function listGitTags() {
  try {
    const { stdout } = await execFileAsync('git', ['tag', '--list', 'desktop-v*'], { encoding: 'utf8' })
    if (stdout.trim().length > 0) return stdout.split(/\r?\n/u).filter(Boolean)
  } catch {
    // Fall through to the network listing for shallow CI clones without tags.
  }
  const { stdout } = await execFileAsync(
    'git',
    ['ls-remote', '--tags', 'origin', 'refs/tags/desktop-v*.tips'],
    { encoding: 'utf8' },
  ).catch(() => ({ stdout: '' }))
  return [...stdout.matchAll(/refs\/tags\/(desktop-v[0-9A-Za-z.-]+)$/gm)].map(([, tag]) => tag)
}

async function resolveFloorFromRepository({ readText = readFile } = {}) {
  const manifest = JSON.parse(await readText(DESKTOP_MANIFEST, 'utf8'))
  return evaluateDesktopVersionFloor({ version: manifest.version, tags: await listGitTags() })
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/gu, '/')}`).href) {
  const { current, floor, ok } = await resolveFloorFromRepository()
  if (floor === undefined) {
    console.log(`desktop version ${current}: no released desktop-vX.Y.Z tag found; floor check skipped`)
  } else if (ok) {
    console.log(`desktop version ${current} satisfies the ${floor} release floor`)
  } else {
    console.error(`desktop version ${current} is older than the latest release tag desktop-v${floor}`)
    console.error('Raise apps/dsh-desktop/package.json to at least the released version.')
    process.exitCode = 1
  }
}
