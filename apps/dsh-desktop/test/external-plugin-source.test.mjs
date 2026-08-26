import assert from 'node:assert/strict'
import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { gzipSync } from 'node:zlib'

import {
  ExternalPluginSourceResolver,
  assertExternalPluginDescriptor,
  createExternalPluginSourceSummary,
  parseExternalPluginReference,
  parseRemoteExternalPluginReference,
  revalidateExternalPluginSource,
  resolveExternalPluginSource,
  stageExternalPluginSource,
} from '../src/external-plugin-source.mjs'

async function createPluginDirectory(root, name = '@external/example') {
  const directory = join(root, 'plugin')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify({
    name,
    version: '1.2.3',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(directory, 'index.mjs'), 'export default {}\n')
  return directory
}

function tarEntry(name, body) {
  const content = Buffer.from(body)
  const header = Buffer.alloc(512)
  Buffer.from(name).copy(header, 0)
  Buffer.from('0000777\0').copy(header, 100)
  Buffer.from('0000000\0').copy(header, 108)
  Buffer.from('0000000\0').copy(header, 116)
  Buffer.from(`${content.length.toString(8).padStart(11, '0')}\0`).copy(header, 124)
  Buffer.from('00000000000\0').copy(header, 136)
  header[156] = '0'.charCodeAt(0)
  Buffer.from('ustar\0').copy(header, 257)
  const padding = Buffer.alloc((512 - content.length % 512) % 512)
  return Buffer.concat([header, content, padding])
}

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-external-plugin-source-'))
  try {
    return await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('resolver canonicalizes a user-selected local directory without loading or mutating it', async () => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root)
    const resolver = new ExternalPluginSourceResolver({ baseDir: root })
    const descriptor = await resolver.resolve(directory)

    assert.equal(descriptor.sourceType, 'directory')
    assert.equal(descriptor.referenceType, 'path')
    assert.equal(descriptor.fingerprintKind, 'content')
    assert.equal(descriptor.hasLinkedEntries, false)
    assert.equal(descriptor.approval.maximumTrustScope, 'source')
    assert.equal(descriptor.package.name, '@external/example')
    assert.equal(descriptor.loader.declaredDshBundle, true)
    assert.match(descriptor.sourceId, /^sha256:[a-f0-9]{64}$/u)
    assert.match(descriptor.candidateId, /^sha256:[a-f0-9]{64}$/u)
    assert.match(descriptor.contentFingerprint, /^sha256:[a-f0-9]{64}$/u)
    assert.equal(descriptor.installSpec, pathToFileURL(descriptor.canonicalPath).href)
    assert.equal(await readFile(join(directory, 'index.mjs'), 'utf8'), 'export default {}\n')
  })
})

test('file, link, and resolved workspace descriptors keep local loading semantics', async () => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root)
    const resolver = new ExternalPluginSourceResolver({ baseDir: root })
    const fromFile = await resolver.resolve(pathToFileURL(directory).href)
    const fromRelativeFile = await resolver.resolve('file:./plugin')
    const fromLink = await resolver.resolve('link:./plugin')
    const fromWorkspace = await resolver.resolve('workspace:./plugin')

    assert.equal(fromFile.referenceType, 'file')
    assert.equal(fromRelativeFile.referenceType, 'file')
    assert.equal(fromLink.referenceType, 'link')
    assert.equal(fromWorkspace.referenceType, 'workspace')
    assert.equal(fromFile.sourceId, fromLink.sourceId)
    assert.equal(fromRelativeFile.sourceId, fromLink.sourceId)
    assert.equal(fromLink.sourceId, fromWorkspace.sourceId)
    assert.match(fromLink.installSpec, /^link:/u)
    assert.match(fromWorkspace.installSpec, /^link:/u)
    assert.throws(() => parseExternalPluginReference('workspace:*', { baseDir: root }), /resolved to a local directory/u)
  })
})

test('remote npm, git, and HTTPS sources produce opaque descriptors without downloading code', async () => {
  const resolver = new ExternalPluginSourceResolver({ baseDir: process.cwd() })
  const cases = [
    {
      spec: '@external/registry-plugin@1.2.3',
      sourceType: 'npm',
      referenceType: 'npm',
      packageName: '@external/registry-plugin',
      packageIdentity: 'npm',
    },
    {
      spec: 'npm:@external/aliased-plugin@4.5.6',
      sourceType: 'npm',
      referenceType: 'npm',
      packageName: '@external/aliased-plugin',
      packageIdentity: 'npm',
    },
    {
      spec: 'desktop-alias@npm:@external/aliased-plugin@4.5.6',
      sourceType: 'npm',
      referenceType: 'npm',
      packageName: 'desktop-alias',
      packageIdentity: 'npm-alias',
    },
    {
      spec: 'git+https://github.com/example/external-plugin.git#v1.2.3',
      sourceType: 'git',
      referenceType: 'git',
      packageIdentity: 'opaque',
    },
    {
      // Git's ordinary SSH URI form includes the account name and often a
      // non-default port.  This is an account selector, not an HTTP
      // credential, and remains a one-time opaque remote confirmation.
      spec: 'git+ssh://git@github.com:2222/example/external-plugin.git#v1.2.3',
      sourceType: 'git',
      referenceType: 'git',
      packageIdentity: 'opaque',
    },
    {
      spec: 'github:example/external-plugin#main',
      sourceType: 'git',
      referenceType: 'git',
      packageIdentity: 'opaque',
    },
    {
      spec: 'https://plugins.example.invalid/external-plugin.tgz?release=2026-08-20&channel=beta',
      sourceType: 'https',
      referenceType: 'https',
      packageIdentity: 'opaque',
    },
  ]

  for (const item of cases) {
    const descriptor = await resolver.resolve(item.spec)
    const summary = createExternalPluginSourceSummary(descriptor)
    assert.equal(assertExternalPluginDescriptor(descriptor), descriptor)
    assert.equal(descriptor.sourceType, item.sourceType)
    assert.equal(descriptor.referenceType, item.referenceType)
    assert.equal(descriptor.installSpec, item.spec)
    assert.match(descriptor.canonicalPath, new RegExp(`^remote:${item.sourceType}:[a-f0-9]{64}$`, 'u'))
    assert.equal(descriptor.fingerprintKind, 'reference')
    assert.equal(descriptor.approval.maximumTrustScope, 'once')
    assert.equal(descriptor.package.identity, item.packageIdentity)
    assert.equal(descriptor.loader.packageIdentity, item.packageIdentity)
    if (item.packageName === undefined) {
      assert.match(descriptor.package.name, /^external-source-[a-f0-9]{24}$/u)
      assert.equal(summary.displayName, `External ${item.sourceType} source`)
    } else {
      assert.equal(descriptor.package.name, item.packageName)
    }
    assert.equal(JSON.stringify(summary).includes(item.spec), false)
    assert.equal('canonicalPath' in summary, false)
    assert.equal('installSpec' in summary, false)
  }
})

test('user-selected sources revalidate for technical consistency without a trust decision', async () => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root)
    const resolver = new ExternalPluginSourceResolver({ baseDir: root })
    const sources = [
      '@external/registry-plugin@1.2.3',
      'alias@npm:@external/registry-plugin@1.2.3',
      'git+https://github.com/example/external-plugin.git#v1.2.3',
      'git+ssh://git@github.com/example/external-plugin.git#v1.2.3',
      'https://plugins.example.invalid/external-plugin.tgz',
      directory,
      `file:${directory}`,
      `link:${directory}`,
      `workspace:${directory}`,
    ]
    for (const spec of sources) {
      const descriptor = await resolver.resolve(spec)
      const revalidated = await revalidateExternalPluginSource(descriptor, { resolver })
      assert.equal(revalidated.sourceId, descriptor.sourceId)
      assert.equal(revalidated.installSpec, descriptor.installSpec)
    }
  })
})

test('a bare package falls back to npm only after an equally named local path is absent', async () => {
  await withTemporaryDirectory(async (root) => {
    const resolver = new ExternalPluginSourceResolver({ baseDir: root })
    const remote = await resolver.resolve('external-registry-plugin')
    assert.equal(remote.sourceType, 'npm')
    assert.equal(remote.package.name, 'external-registry-plugin')

    await createPluginDirectory(root, 'external-registry-plugin')
    const local = await resolver.resolve('plugin')
    assert.equal(local.sourceType, 'directory')
    assert.equal(local.package.name, 'external-registry-plugin')
  })
})

test('remote pnpm forms reject option-like, control-byte, whitespace, and shell-like input', async () => {
  const unsafe = [
    '',
    '  ',
    '--config.ignore-scripts=true',
    'https://plugins.example.invalid/archive.tgz\nwhoami',
    'git+https://github.com/example/plugin.git\u0000--config.ignore-scripts=true',
    'https://plugins.example.invalid/archive.tgz;whoami',
    'https://plugins.example.invalid/archive.tgz && whoami',
    'https://token:secret@plugins.example.invalid/archive.tgz',
    'git+https://token:secret@github.com/example/plugin.git',
    'git+ssh://git:secret@github.com/example/plugin.git',
    'git+ssh://git%20user@github.com/example/plugin.git',
    'npm:external-plugin@file:./local-plugin',
    'http://plugins.example.invalid/archive.tgz',
    'ftp://plugins.example.invalid/archive.tgz',
  ]
  const resolver = new ExternalPluginSourceResolver()
  for (const spec of unsafe) {
    await assert.rejects(resolver.resolve(spec), /invalid|unsupported|unsafe|must be a non-empty|option prefix|registry package/u, spec)
  }
  assert.throws(
    () => parseRemoteExternalPluginReference('https://plugins.example.invalid/archive.tgz\r\nwhoami'),
    /invalid|unsafe|must be a non-empty/u,
  )
})

test('a local source containing a directory link is a one-time reference and is never content-staged', async () => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root)
    const target = join(root, 'linked-package-store')
    const sourceLink = join(directory, 'node_modules-link')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'outside-source.txt'), 'before approval')
    await symlink(target, sourceLink, process.platform === 'win32' ? 'junction' : 'dir')

    const resolver = new ExternalPluginSourceResolver({ baseDir: root })
    const before = await resolver.resolve(directory)
    const summary = createExternalPluginSourceSummary(before)
    assert.equal(before.fingerprintKind, 'reference')
    assert.equal(before.hasLinkedEntries, true)
    assert.equal(before.approval.maximumTrustScope, 'once')
    assert.equal(summary.fingerprintKind, 'reference')
    assert.equal(summary.hasLinkedEntries, true)
    assert.equal(summary.approval.maximumTrustScope, 'once')

    // The descriptor is a stable reference to the selected root, not a claim
    // about bytes behind the junction. A target mutation must not become a
    // new content candidate or cause us to stage the external tree.
    await writeFile(join(target, 'outside-source.txt'), 'after approval')
    const after = await resolver.resolve(directory)
    assert.equal(after.sourceId, before.sourceId)
    assert.equal(after.candidateId, before.candidateId)
    assert.equal(after.contentFingerprint, before.contentFingerprint)

    const stagingDirectory = join(root, 'staging')
    await assert.rejects(
      stageExternalPluginSource(before, { stagingDirectory }),
      /only local content-addressed/u,
    )
    await assert.rejects(lstat(stagingDirectory), /ENOENT/u)
  })
})

test('a local source containing a file link is also a one-time reference', async (context) => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root)
    const target = join(root, 'linked-payload.mjs')
    const sourceLink = join(directory, 'linked-payload.mjs')
    await writeFile(target, 'export const payload = "verified"\n')
    try {
      await symlink(target, sourceLink, 'file')
    } catch (error) {
      // Developer Mode is normally disabled on production Windows machines.
      // The behavior is exercised where such a link can be created; the
      // production staging path itself avoids recreating the privileged link.
      if (process.platform === 'win32' && error?.code === 'EPERM') {
        context.skip('Windows file symlink creation requires Developer Mode')
        return
      }
      throw error
    }

    const original = await new ExternalPluginSourceResolver({ baseDir: root }).resolve(directory)
    assert.equal(original.fingerprintKind, 'reference')
    assert.equal(original.hasLinkedEntries, true)
    assert.equal(original.approval.maximumTrustScope, 'once')
    await assert.rejects(
      stageExternalPluginSource(original, { stagingDirectory: join(root, 'staging') }),
      /only local content-addressed/u,
    )
  })
})

test('descriptor assertion remains compatible with the prior local descriptor shape', () => {
  const descriptor = Object.freeze({
    schemaVersion: 1,
    sourceId: `sha256:${'a'.repeat(64)}`,
    candidateId: `sha256:${'b'.repeat(64)}`,
    sourceType: 'directory',
    referenceType: 'path',
    canonicalPath: 'C:\\private plugin',
    installSpec: 'file:///C:/private%20plugin',
    contentFingerprint: `sha256:${'c'.repeat(64)}`,
    package: Object.freeze({ name: '@external/legacy-plugin' }),
    loader: Object.freeze({}),
  })
  assert.equal(assertExternalPluginDescriptor(descriptor), descriptor)
  assert.throws(
    () => assertExternalPluginDescriptor(Object.freeze({
      ...descriptor,
      fingerprintKind: 'content',
      hasLinkedEntries: true,
    })),
    /linked local source must identify a reference/u,
  )
})

test('local tgz descriptors expose their package metadata and content fingerprint', async () => {
  await withTemporaryDirectory(async (root) => {
    const archive = join(root, 'plugin.tgz')
    const tar = Buffer.concat([
      tarEntry('package/package.json', JSON.stringify({ name: '@external/archive', version: '4.5.6' })),
      tarEntry('package/index.mjs', 'export default {}\n'),
      Buffer.alloc(1024),
    ])
    await writeFile(archive, gzipSync(tar))

    const descriptor = await resolveExternalPluginSource(archive, { baseDir: root })
    assert.equal(descriptor.sourceType, 'tarball')
    assert.equal(descriptor.package.name, '@external/archive')
    assert.equal(descriptor.package.version, '4.5.6')
    assert.equal(descriptor.loader.declaredDshBundle, false)
    assert.match(descriptor.installSpec, /^file:/u)
    assert.match(descriptor.contentFingerprint, /^sha256:[a-f0-9]{64}$/u)
  })
})

test('directory fingerprints notice content changes while source identity remains stable', async () => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root)
    const resolver = new ExternalPluginSourceResolver({ baseDir: root })
    const before = await resolver.resolve(directory)
    await writeFile(join(directory, 'index.mjs'), 'export default { changed: true }\n')
    const after = await resolver.resolve(directory)

    assert.equal(before.sourceId, after.sourceId)
    assert.notEqual(before.contentFingerprint, after.contentFingerprint)
    assert.notEqual(before.candidateId, after.candidateId)
  })
})

test('a confirmed local source is staged into the isolated session before pnpm consumes it', async () => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root, '@external/staged-source')
    const resolver = new ExternalPluginSourceResolver({ baseDir: root })
    const descriptor = await resolver.resolve(directory)
    const staged = await stageExternalPluginSource(descriptor, {
      stagingDirectory: join(root, 'free-session', 'plugin-staging'),
    })

    assert.equal(staged.sourceId, descriptor.sourceId)
    assert.equal(staged.candidateId, descriptor.candidateId)
    assert.equal(staged.contentFingerprint, descriptor.contentFingerprint)
    assert.notEqual(staged.installSpec, descriptor.installSpec)
    assert.equal(staged.loader.installSpec, staged.installSpec)
    assert.match(staged.installSpec, /plugin-staging/u)

    await writeFile(join(directory, 'index.mjs'), 'export default { replacedAfterConsent: true }\n')
    const stagedText = await readFile(join(fileURLToPath(staged.installSpec), 'index.mjs'), 'utf8')
    assert.equal(stagedText, 'export default {}\n')
  })
})

test('staging rejects a local source whose bytes differ from the confirmed fingerprint', async () => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root, '@external/raced-source')
    const descriptor = await resolveExternalPluginSource(directory, { baseDir: root })
    await writeFile(join(directory, 'index.mjs'), 'export default { changedBeforeCopy: true }\n')

    const stagingDirectory = join(root, 'free-session', 'plugin-staging')
    await assert.rejects(
      stageExternalPluginSource(descriptor, { stagingDirectory }),
      /changed while staging/u,
    )
    const digest = descriptor.contentFingerprint.slice('sha256:'.length)
    await assert.rejects(readFile(join(stagingDirectory, digest, 'index.mjs'), 'utf8'), /ENOENT/u)
  })
})

test('staging refuses a link introduced after an ordinary local source was confirmed', async () => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root, '@external/link-race')
    const descriptor = await resolveExternalPluginSource(directory, { baseDir: root })
    const target = join(root, 'outside-after-confirmation')
    await mkdir(target, { recursive: true })
    await writeFile(join(target, 'payload.mjs'), 'export default { outside: true }\n')
    await symlink(target, join(directory, 'late-linked-directory'), process.platform === 'win32' ? 'junction' : 'dir')

    const stagingDirectory = join(root, 'free-session', 'plugin-staging')
    await assert.rejects(
      stageExternalPluginSource(descriptor, { stagingDirectory }),
      /contains a linked entry and cannot be content-staged/u,
    )
    const digest = descriptor.contentFingerprint.slice('sha256:'.length)
    await assert.rejects(lstat(join(stagingDirectory, digest)), /ENOENT/u)
  })
})

test('unresolved remote references cannot be falsely staged as reviewed local bytes', async () => {
  const descriptor = await resolveExternalPluginSource('https://plugins.example.invalid/external.tgz')
  await assert.rejects(
    stageExternalPluginSource(descriptor, { stagingDirectory: join(tmpdir(), 'dsh-external-plugin-stage-remote') }),
    /only local content-addressed/u,
  )
})

test('public source summaries omit canonical filesystem paths and install specs', async () => {
  await withTemporaryDirectory(async (root) => {
    const directory = await createPluginDirectory(root, '@external/private-source')
    const descriptor = await resolveExternalPluginSource(directory, { baseDir: root })
    const summary = createExternalPluginSourceSummary(descriptor)
    const serialized = JSON.stringify(summary)

    assert.equal('canonicalPath' in summary, false)
    assert.equal('installSpec' in summary, false)
    assert.equal(serialized.includes(directory.replaceAll('\\', '/')), false)
    assert.equal(summary.displayName, '@external/private-source')
  })
})
