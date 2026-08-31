import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import {
  baseVersion,
  checkRuntimeIdentityGraph,
  collectIdentityPackages,
  parseLockfileImporters,
  parseLockfileResolutions,
} from './runtime-graph-check.mjs'

/**
 * Fixtures are trimmed pnpm-lock.yaml v9 fragments. Indentation matters: the
 * parser keys off two-space `packages:` entries exactly as pnpm writes them.
 */
const header = (body) => `lockfileVersion: '9.0'\n\npackages:\n\n${body}`

const entry = (name, version) => `  '${name}@${version}':\n    resolution: {integrity: sha512-fixture}\n`

describe('baseVersion', () => {
  test('strips a pnpm peer-resolution suffix', () => {
    assert.equal(baseVersion('0.1.1-rc.1(5493e0ab460eb504a0593977b284c2a8)'), '0.1.1-rc.1')
  })

  test('strips a nested peer suffix that itself contains an @scope', () => {
    assert.equal(baseVersion('0.1.1-rc.1(@deepseek-ai/cordis@4.0.1)'), '0.1.1-rc.1')
  })

  test('leaves a plain version untouched', () => {
    assert.equal(baseVersion('0.1.1-rc.1'), '0.1.1-rc.1')
  })
})

describe('parseLockfileResolutions', () => {
  test('collects distinct versions per package', () => {
    const resolutions = parseLockfileResolutions(header(
      entry('@deepseek-ai/dsh-tools', '0.1.1-rc.1')
      + entry('@deepseek-ai/dsh-tools', '0.1.2'),
    ))
    assert.deepEqual([...resolutions.get('@deepseek-ai/dsh-tools')].sort(), ['0.1.1-rc.1', '0.1.2'])
  })

  test('collapses peer variants of one version into a single resolution', () => {
    const resolutions = parseLockfileResolutions(header(
      entry('@deepseek-ai/dsh-tools', '0.1.1-rc.1')
      + entry('@deepseek-ai/dsh-tools', '0.1.1-rc.1(5493e0ab460eb504a0593977b284c2a8)'),
    ))
    assert.deepEqual([...resolutions.get('@deepseek-ai/dsh-tools')], ['0.1.1-rc.1'])
  })

  test('returns an empty map for an empty lockfile', () => {
    assert.equal(parseLockfileResolutions('').size, 0)
    assert.equal(parseLockfileResolutions(undefined).size, 0)
  })
})

describe('parseLockfileImporters', () => {
  test('records the declared specifier and which section asked for it', () => {
    const lockfile = [
      "lockfileVersion: '9.0'",
      '',
      'importers:',
      '',
      '  apps/dsh-desktop:',
      '    dependencies:',
      "      '@deepseek-ai/dsh-tools':",
      '        specifier: 0.1.1-rc.1',
      '        version: 0.1.1-rc.1(abc)',
      '',
      '  packages/dsh-live-stats:',
      '    devDependencies:',
      "      '@deepseek-ai/dsh-tools':",
      '        specifier: ^0.1.1-rc.1',
      '        version: 0.1.1-rc.1(abc)',
      '',
    ].join('\n')
    const importers = parseLockfileImporters(lockfile)
    assert.equal(importers.get('apps/dsh-desktop').get('@deepseek-ai/dsh-tools').specifier, '0.1.1-rc.1')
    assert.equal(importers.get('apps/dsh-desktop').get('@deepseek-ai/dsh-tools').section, 'dependencies')
    assert.equal(importers.get('packages/dsh-live-stats').get('@deepseek-ai/dsh-tools').specifier, '^0.1.1-rc.1')
    assert.equal(importers.get('packages/dsh-live-stats').get('@deepseek-ai/dsh-tools').section, 'devDependencies')
  })
})

describe('collectIdentityPackages', () => {
  test('takes runtime dependencies only, never devDependencies', () => {
    const identity = collectIdentityPackages([
      { name: 'app', dependencies: { '@deepseek-ai/dsh-tools': '0.1.1-rc.1' } },
      {
        name: 'plugin',
        dependencies: { '@deepseek-ai/dsh-settings': '0.1.1-rc.1' },
        devDependencies: { '@deepseek-ai/dsh-llm': '^0.1.1-rc.1', tsdown: '^0.22.2' },
      },
    ])
    assert.deepEqual(identity, ['@deepseek-ai/dsh-settings', '@deepseek-ai/dsh-tools'])
  })

  test('ignores non-SDK packages entirely', () => {
    assert.deepEqual(
      collectIdentityPackages([{ dependencies: { react: '^18.3.1', 'node-pty': '1.2.0-beta.15' } }]),
      [],
    )
  })
})

describe('checkRuntimeIdentityGraph', () => {
  // Case 1: one version -> pass.
  test('case 1 - a single resolved version passes', () => {
    const problems = checkRuntimeIdentityGraph({
      lockfileText: header(
        entry('@deepseek-ai/dsh-tools', '0.1.1-rc.1')
        + entry('@deepseek-ai/dsh-session', '0.1.1-rc.1'),
      ),
      identityPackages: ['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-session'],
    })
    assert.deepEqual(problems, [])
  })

  // Case 2: two identity-sensitive versions -> fail, with both versions reported.
  test('case 2 - two versions of an identity package fail', () => {
    const problems = checkRuntimeIdentityGraph({
      lockfileText: header(
        entry('@deepseek-ai/dsh-tools', '0.1.1-rc.1')
        + entry('@deepseek-ai/dsh-tools', '0.1.2'),
      ),
      identityPackages: ['@deepseek-ai/dsh-tools'],
    })
    assert.equal(problems.length, 1)
    assert.equal(problems[0].kind, 'multiple-versions')
    assert.equal(problems[0].name, '@deepseek-ai/dsh-tools')
    assert.deepEqual(problems[0].versions, ['0.1.1-rc.1', '0.1.2'])
  })

  // Case 3: tooling may legitimately have several versions.
  test('case 3 - multiple versions of a non-identity tooling dependency are allowed', () => {
    const problems = checkRuntimeIdentityGraph({
      lockfileText: header(
        entry('typescript', '5.9.2')
        + entry('typescript', '5.9.3')
        + entry('vitest', '3.2.4')
        + entry('@deepseek-ai/dsh-tools', '0.1.1-rc.1'),
      ),
      identityPackages: ['@deepseek-ai/dsh-tools'],
    })
    assert.deepEqual(problems, [])
  })

  // Case 4: different declared ranges are fine as long as resolution is unique.
  test('case 4 - differing specifiers that resolve to one version are allowed', () => {
    const lockfile = [
      "lockfileVersion: '9.0'",
      '',
      'importers:',
      '',
      '  apps/dsh-desktop:',
      '    dependencies:',
      "      '@deepseek-ai/dsh-tools':",
      '        specifier: 0.1.1-rc.1',
      '        version: 0.1.1-rc.1(abc)',
      '',
      '  packages/dsh-live-stats:',
      '    devDependencies:',
      "      '@deepseek-ai/dsh-tools':",
      '        specifier: ^0.1.1-rc.1',
      '        version: 0.1.1-rc.1(def)',
      '',
      'packages:',
      '',
      entry('@deepseek-ai/dsh-tools', '0.1.1-rc.1'),
    ].join('\n')
    const problems = checkRuntimeIdentityGraph({
      lockfileText: lockfile,
      identityPackages: ['@deepseek-ai/dsh-tools'],
    })
    assert.deepEqual(problems, [])
  })

  // Case 5a: an identity package that never resolved must be diagnosed, not skipped.
  test('case 5a - a missing resolution is reported, never silently passed', () => {
    const problems = checkRuntimeIdentityGraph({
      lockfileText: header(entry('@deepseek-ai/dsh-session', '0.1.1-rc.1')),
      identityPackages: ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-tools'],
    })
    assert.equal(problems.length, 1)
    assert.equal(problems[0].kind, 'missing-resolution')
    assert.equal(problems[0].name, '@deepseek-ai/dsh-tools')
  })

  // Case 5b: an unanalyzable lockfile must say so.
  test('case 5b - an empty lockfile is diagnosed as unverified', () => {
    const problems = checkRuntimeIdentityGraph({
      lockfileText: '',
      identityPackages: ['@deepseek-ai/dsh-tools'],
    })
    assert.equal(problems.length, 1)
    assert.equal(problems[0].kind, 'unanalyzable')
    assert.match(problems[0].message, /unverified/u)
  })

  test('case 5c - a lockfile with no packages section is diagnosed as unverified', () => {
    const problems = checkRuntimeIdentityGraph({
      lockfileText: "lockfileVersion: '9.0'\n\nimporters: {}\n",
      identityPackages: ['@deepseek-ai/dsh-tools'],
    })
    assert.equal(problems.length, 1)
    assert.equal(problems[0].kind, 'unanalyzable')
  })

  test('reports every offending package, not just the first', () => {
    const problems = checkRuntimeIdentityGraph({
      lockfileText: header(
        entry('@deepseek-ai/dsh-tools', '0.1.1-rc.1')
        + entry('@deepseek-ai/dsh-tools', '0.1.2')
        + entry('@deepseek-ai/dsh-session', '0.1.1-rc.1')
        + entry('@deepseek-ai/dsh-session', '0.2.0'),
      ),
      identityPackages: ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-tools'],
    })
    assert.equal(problems.length, 2)
    assert.deepEqual(problems.map((problem) => problem.name), [
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-tools',
    ])
  })
})
