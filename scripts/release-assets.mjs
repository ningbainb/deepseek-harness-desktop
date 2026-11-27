#!/usr/bin/env node
/**
 * Download the published npm tarballs for a release tag so the pipeline can
 * attach them to the GitHub Release as real installable artifacts (a
 * bare `gh release create` leaves only GitHub's auto-generated source
 * archives).
 *
 * Walks the same package set as verify-version.mjs (packages/* and
 * packages/skins/*, non-recursive), reads each package.json name + version,
 * and runs `npm pack <name>@<version>` against the npm registry. Packing
 * from the registry (not the working tree) makes every uploaded tarball
 * byte-identical to what `pnpm -r publish` pushed moments earlier.
 *
 * Prints one tarball path per line plus a summary. Fails (exit 1) when a
 * package version does not match the tag or npm pack fails.
 *
 * Usage: node scripts/release-assets.mjs <vX.Y.Z> <outDir>
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { familyPackageManifests } from './family-package-manifests.mjs'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

export function packageFiles(cwd) {
  return familyPackageManifests(cwd).sort()
}

/**
 * Pack one published package from the registry into outDir and return the
 * resulting tarball path. `run` mirrors execFileSync and is injectable for
 * tests.
 */
export function packOne(name, version, outDir, run = (file, args, options) => execFileSync(file, args, options)) {
  const stdout = run('npm', ['pack', name + '@' + version, '--pack-destination', outDir, '--json'], { encoding: 'utf8' })
  const filename = JSON.parse(stdout)[0]?.filename
  if (typeof filename !== 'string' || filename === '') {
    throw new Error('npm pack returned no filename for ' + name + '@' + version)
  }
  return join(outDir, filename)
}

function main() {
  const tag = process.argv[2] ?? ''
  const outDir = process.argv[3] ?? ''
  if (!/^v?\d+\.\d+\.\d+$/.test(tag) || outDir === '') {
    console.error('usage: node scripts/release-assets.mjs <vX.Y.Z> <outDir>')
    process.exit(2)
  }
  const version = tag.replace(/^v/, '')
  mkdirSync(outDir, { recursive: true })
  const files = packageFiles(REPO_ROOT)
  if (files.length === 0) {
    console.error('no package.json found under packages/')
    process.exit(1)
  }
  const packed = []
  for (const file of files) {
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    if (pkg.version !== version) {
      console.error('::error file=' + file + '::version ' + pkg.version + ' does not match tag ' + tag)
      process.exit(1)
    }
    const tgz = packOne(pkg.name, version, outDir)
    packed.push(tgz)
    console.log(tgz)
  }
  console.log('[release-assets] packed ' + packed.length + ' tarballs into ' + outDir)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
