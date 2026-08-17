import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import {
  AGGREGATED_BUNDLES,
  BUILTIN_BUNDLES,
  BUILTIN_SKIN_PACKAGES,
  DESKTOP_PATCH_CONFIG,
  DEPENDENCY_ONLY_BUNDLES,
  DESKTOP_PLUGIN_COMPAT_PACKAGES,
  DESKTOP_SUPPORT_PACKAGES,
  MANAGED_RUNTIME_PACKAGES,
  RETIRED_MANAGED_PACKAGES,
  createDesktopProfileManifest,
  ensureDesktopProfile,
  mergeDesktopPatch,
  materializeFilesystemPath,
  packagePathSegments,
  resolveRuntimePackages,
  resolveDshCliPath,
} from '../src/profile.mjs'

test('packaged paths point at physical asar-unpacked files', () => {
  assert.equal(
    materializeFilesystemPath('C:\\app\\resources\\app.asar\\node_modules\\pkg'),
    'C:\\app\\resources\\app.asar.unpacked\\node_modules\\pkg',
  )
  assert.equal(materializeFilesystemPath('C:\\workspace\\node_modules\\pkg'), 'C:\\workspace\\node_modules\\pkg')
})

test('package path validation accepts NPM names and rejects path input', () => {
  assert.deepEqual(packagePathSegments('@deepseek-ai/dsh-pet'), ['@deepseek-ai', 'dsh-pet'])
  assert.deepEqual(packagePathSegments('plain-package'), ['plain-package'])
  for (const value of ['', '../escape', '@scope', '@scope/pkg/extra', 'file:package']) {
    assert.throws(() => packagePathSegments(value), /package name/)
  }
})

test('profile manifest preserves community bundles after managed bundles', () => {
  const manifest = createDesktopProfileManifest({
    dependencies: { '@community/example': '1.2.3' },
    dsh: { profile: { bundles: ['@community/example', '@deepseek-ai/dsh-base'] } },
  })

  assert.deepEqual(manifest.dsh.profile.bundles, [...BUILTIN_BUNDLES, '@community/example'])
  assert.equal(manifest.dependencies['@community/example'], '1.2.3')
  assert.equal(manifest.name, 'dsh-profile-desktop')
})

test('profile manifest removes bundles already supplied by the web UI aggregate', () => {
  const manifest = createDesktopProfileManifest({
    dependencies: {
      '@community/example': '1.2.3',
      '@linxin666/dsh-client-ui-aionui-panel': '0.1.2',
    },
    dsh: {
      profile: {
        bundles: [
          '@linxin666/dsh-client-ui-aionui-panel',
          '@linxin666/dsh-client-ui-git-graph',
          '@linxin666/dsh-client-ui-mode-switcher',
          '@linxin666/dsh-client-ui-task-board',
          '@linxin666/dsh-client-ui-skin-center',
          '@linxin666/dsh-skins',
          '@community/example',
        ],
      },
    },
  })

  assert.deepEqual(manifest.dsh.profile.bundles, [...BUILTIN_BUNDLES, '@community/example'])
  assert.equal(manifest.dependencies['@linxin666/dsh-client-ui-aionui-panel'], '0.1.2')
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-client-ui-aionui-panel'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-client-ui-git-graph'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-client-ui-community-plugins'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-client-ui-mode-switcher'), false)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-client-ui-skin-center'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-liangshen'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-tool-describe-image'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-web-ui-compat'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-client-ui-skin-harbor'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-client-ui-skin-qq2006'), false)
  assert.equal(BUILTIN_SKIN_PACKAGES.includes('@linxin666/dsh-client-ui-skin-qq2006'), false)
  assert.equal(RETIRED_MANAGED_PACKAGES.includes('@linxin666/dsh-client-ui-skin-qq2006'), true)
})

test('desktop profile includes one plugin store plus Codex login and reasoning controls', () => {
  assert.equal(BUILTIN_BUNDLES.includes('dshmarket'), true)
  assert.equal(BUILTIN_BUNDLES.includes('dsh-plugin-hub'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dshmarket'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dsh-plugin-hub'), false)
  assert.equal(BUILTIN_BUNDLES.includes('dsh-codex-connect'), true)
  assert.equal(BUILTIN_BUNDLES.includes('reasoning-slider'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dsh-codex-connect'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('reasoning-slider'), true)
  assert.equal(BUILTIN_BUNDLES.includes('@linxin666/dsh-client-ui-mode-switcher'), false)
  assert.equal(DEPENDENCY_ONLY_BUNDLES.includes('@linxin666/dsh-client-ui-mode-switcher'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-client-ui-mode-switcher'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-client-ui-community-plugins'), true)
  assert.doesNotMatch(DESKTOP_PATCH_CONFIG, /id: ui-mode-switcher/u)
  assert.equal(BUILTIN_BUNDLES.includes('@vectorize-io/hindsight-coding-agents'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@vectorize-io/hindsight-coding-agents'), false)
  assert.equal(RETIRED_MANAGED_PACKAGES.includes('@vectorize-io/hindsight-coding-agents'), true)
  assert.match(DESKTOP_PATCH_CONFIG, /id: dsh-market[\s\S]*profile: desktop/)
  assert.match(DESKTOP_PATCH_CONFIG, /id: dsh-market[\s\S]*allowRestart: false/)
  assert.match(DESKTOP_PATCH_CONFIG, /id: llm-deepseek[\s\S]*maxRetries: 4/u)
  assert.match(DESKTOP_PATCH_CONFIG, /retryableCodes:[\s\S]*STREAM_CLOSED/u)
})

test('desktop profile includes the official QQ Bot bundle', () => {
  assert.equal(BUILTIN_BUNDLES.includes('@tencent-connect/dsh-qqbot'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@tencent-connect/dsh-qqbot'), true)
})

test('desktop profile mounts the queue recovery compatibility bundle', () => {
  assert.equal(BUILTIN_BUNDLES.includes('@linxin666/dsh-desktop-compat'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-desktop-compat'), true)
})

test('desktop profile provides runtime dependencies omitted by supported community plugins', () => {
  assert.deepEqual(DESKTOP_PLUGIN_COMPAT_PACKAGES, ['schemastery'])
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('schemastery'), true)
})

test('community plugins can resolve desktop compatibility dependencies from the isolated profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-plugin-compat-'))
  const dshHome = join(root, 'home')
  const schemasteryRoot = resolveRuntimePackages(['schemastery']).get('schemastery')
  try {
    const { profileDir, manifest } = await ensureDesktopProfile({
      dshHome,
      packageRoots: new Map([['schemastery', schemasteryRoot]]),
    })
    const pluginRoot = join(profileDir, 'node_modules', '@nonamelego', 'dsh-catppuccin')
    await mkdir(pluginRoot, { recursive: true })
    await writeFile(join(pluginRoot, 'package.json'), JSON.stringify({
      name: '@nonamelego/dsh-catppuccin',
      type: 'module',
    }))
    await writeFile(join(pluginRoot, 'index.js'), "import 'schemastery'\nexport default true\n")

    assert.match(manifest.dependencies.schemastery, /^link:/u)
    assert.equal(
      await realpath(join(profileDir, 'node_modules', 'schemastery')),
      await realpath(schemasteryRoot),
    )
    assert.equal((await import(pathToFileURL(join(pluginRoot, 'index.js')).href)).default, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('desktop patch refresh removes the legacy profile skin section and preserves community rows', () => {
  const skinSection = '# --- dsh-skin managed (auto-generated; do not edit) ---\n- id: ui-skin-qq98\n# --- end dsh-skin managed ---'
  const communityRow = "- id: community\n  name: '@community/plugin'"
  const merged = mergeDesktopPatch(`${DESKTOP_PATCH_CONFIG}\n${skinSection}\n${communityRow}\n`)
  assert.equal(merged.match(/dsh-desktop managed/gu)?.length, 2)
  assert.doesNotMatch(merged, /ui-skin-qq98/u)
  assert.match(merged, /@community\/plugin/u)
  assert.equal(mergeDesktopPatch(merged), merged)
})

test('profile manifest retires obsolete managed packages', () => {
  const manifest = createDesktopProfileManifest({
    dependencies: {
      'dsh-plugin-hub': '0.1.0',
      '@linxin666/dsh-client-ui-skin-qq98': '0.1.2',
      '@vectorize-io/hindsight-coding-agents': '0.3.4',
      '@community/example': '1.0.0',
    },
    dsh: {
      profile: {
        bundles: [
          'dsh-plugin-hub',
          '@linxin666/dsh-client-ui-skin-qq98',
          '@vectorize-io/hindsight-coding-agents',
          '@community/example',
        ],
      },
    },
  })
  assert.equal(manifest.dependencies['dsh-plugin-hub'], undefined)
  assert.equal(manifest.dependencies['@linxin666/dsh-client-ui-skin-qq98'], undefined)
  assert.equal(manifest.dependencies['@vectorize-io/hindsight-coding-agents'], undefined)
  assert.equal(manifest.dependencies['@community/example'], '1.0.0')
  assert.deepEqual(manifest.dsh.profile.bundles, [...BUILTIN_BUNDLES, '@community/example'])
  assert.equal(RETIRED_MANAGED_PACKAGES.includes('dsh-plugin-hub'), true)
})

test('profile manifest keeps an existing Codex provider without double-owning the route', () => {
  const manifest = createDesktopProfileManifest({
    dependencies: { 'dsh-codex': '0.2.2', 'dsh-codex-connect': '0.1.0-alpha.4.5' },
    dsh: { profile: { bundles: ['dsh-codex'] } },
  })
  assert.equal(manifest.dsh.profile.bundles.includes('dsh-codex'), true)
  assert.equal(manifest.dsh.profile.bundles.includes('dsh-codex-connect'), false)
  assert.equal(manifest.dependencies['dsh-codex-connect'], undefined)
})

test('profile bootstrap retires its managed Codex Connect link when another provider owns the route', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-codex-conflict-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const packageRoot = join(root, 'dsh-codex-connect')
  try {
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'dsh-codex-connect' }))
    const packageRoots = new Map([['dsh-codex-connect', packageRoot]])
    await ensureDesktopProfile({ dshHome, packageRoots })

    const manifestPath = join(profileDir, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.dependencies['dsh-codex'] = '0.2.2'
    manifest.dsh.profile.bundles.push('dsh-codex')
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    const result = await ensureDesktopProfile({ dshHome, packageRoots })
    assert.equal(result.manifest.dsh.profile.bundles.includes('dsh-codex-connect'), false)
    assert.equal(result.manifest.dependencies['dsh-codex-connect'], undefined)
    await assert.rejects(
      realpath(join(profileDir, 'node_modules', 'dsh-codex-connect')),
      (error) => error?.code === 'ENOENT',
    )
    assert.equal((await readFile(join(profileDir, '.dsh-desktop-links.json'), 'utf8')).includes('dsh-codex-connect'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap removes Hindsight from profiles created by an earlier desktop build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-hindsight-retirement-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const packageName = '@vectorize-io/hindsight-coding-agents'
  const packageRoot = join(root, 'hindsight-coding-agents')
  try {
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: packageName }))
    await ensureDesktopProfile({ dshHome, packageRoots: new Map([[packageName, packageRoot]]) })

    const manifestPath = join(profileDir, 'package.json')
    const legacyManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    legacyManifest.dsh.profile.bundles.push(packageName)
    await writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`)

    const result = await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    assert.equal(result.manifest.dsh.profile.bundles.includes(packageName), false)
    assert.equal(result.manifest.dependencies[packageName], undefined)
    await assert.rejects(
      realpath(join(profileDir, 'node_modules', ...packagePathSegments(packageName))),
      (error) => error?.code === 'ENOENT',
    )
    assert.equal((await readFile(join(profileDir, '.dsh-desktop-links.json'), 'utf8')).includes(packageName), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap is idempotent and links every managed package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-'))
  const dshHome = join(root, 'home')
  const sourceRoot = join(root, 'packages')
  const packageRoots = new Map()

  for (const packageName of ['@linxin666/dsh-web-ui-all', '@linxin666/dsh-pet']) {
    const packageRoot = join(sourceRoot, ...packagePathSegments(packageName))
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0' }))
    packageRoots.set(packageName, packageRoot)
  }

  const first = await ensureDesktopProfile({ dshHome, packageRoots })
  const firstPatch = await readFile(join(first.profileDir, 'cordis.patch.yml'), 'utf8')
  await writeFile(join(first.profileDir, 'cordis.patch.yml'), `${firstPatch}\n- id: retained\n`)
  const second = await ensureDesktopProfile({ dshHome, packageRoots })
  const third = await ensureDesktopProfile({ dshHome, packageRoots })
  assert.equal(first.profileDir, second.profileDir)
  assert.equal(second.changed, true)
  assert.equal(third.changed, false)

  const manifest = JSON.parse(await readFile(join(first.profileDir, 'package.json'), 'utf8'))
  assert.deepEqual(manifest.dsh.profile.bundles, BUILTIN_BUNDLES)
  const retainedPatch = await readFile(join(first.profileDir, 'cordis.patch.yml'), 'utf8')
  assert.match(retainedPatch, /id: im-qqbot\n  disabled: true/u)
  assert.match(retainedPatch, /- id: retained/u)
  for (const [packageName, source] of packageRoots) {
    const linked = join(first.profileDir, 'node_modules', ...packagePathSegments(packageName))
    assert.equal(await realpath(linked), await realpath(source))
  }
})

test('profile bootstrap retargets a recorded Desktop link after the install root moves', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-retarget-'))
  const dshHome = join(root, 'home')
  const packageName = '@linxin666/dsh-client-ui-aionui-panel'
  const oldRoot = join(root, 'old-install', 'aionui-panel')
  const nextRoot = join(root, 'next-install', 'aionui-panel')
  try {
    for (const packageRoot of [oldRoot, nextRoot]) {
      await mkdir(packageRoot, { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0' }))
    }

    const first = await ensureDesktopProfile({
      dshHome,
      packageRoots: new Map([[packageName, oldRoot]]),
    })
    const target = join(first.profileDir, 'node_modules', ...packagePathSegments(packageName))
    assert.equal(await realpath(target), await realpath(oldRoot))

    const moved = await ensureDesktopProfile({
      dshHome,
      packageRoots: new Map([[packageName, nextRoot]]),
    })
    assert.equal(moved.changed, true)
    assert.equal(await realpath(target), await realpath(nextRoot))
    const records = JSON.parse(await readFile(join(first.profileDir, '.dsh-desktop-links.json'), 'utf8'))
    assert.equal(records[packageName].source, nextRoot)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap never replaces an unrecorded package target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-unmanaged-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const packageName = '@linxin666/dsh-client-ui-aionui-panel'
  const target = join(profileDir, 'node_modules', ...packagePathSegments(packageName))
  const source = join(root, 'packaged', 'aionui-panel')
  try {
    await mkdir(target, { recursive: true })
    await mkdir(source, { recursive: true })
    await writeFile(join(target, 'package.json'), JSON.stringify({ name: packageName, version: 'user-owned' }))
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: packageName, version: 'desktop' }))

    await assert.rejects(
      ensureDesktopProfile({ dshHome, packageRoots: new Map([[packageName, source]]) }),
      /refusing to replace unmanaged package/u,
    )
    assert.equal(JSON.parse(await readFile(join(target, 'package.json'), 'utf8')).version, 'user-owned')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap adopts a version-matching package left by an older Desktop', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-schemastery-upgrade-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const target = join(profileDir, 'node_modules', 'schemastery')
  const source = join(root, 'packaged', 'schemastery')
  try {
    await mkdir(target, { recursive: true })
    await mkdir(source, { recursive: true })
    await writeFile(join(target, 'package.json'), JSON.stringify({ name: 'schemastery', version: '3.18.0' }))
    await writeFile(join(target, 'legacy-marker.txt'), 'materialized by Desktop 2.1')
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'schemastery', version: '3.18.0' }))

    const result = await ensureDesktopProfile({
      dshHome,
      packageRoots: new Map([['schemastery', source]]),
    })

    assert.equal(await realpath(target), await realpath(source))
    const records = JSON.parse(await readFile(join(profileDir, '.dsh-desktop-links.json'), 'utf8'))
    assert.deepEqual(records.schemastery, { mode: 'link', source })
    assert.equal(result.changed, true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap upgrades an older package declared by the legacy Desktop profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-declared-upgrade-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const target = join(profileDir, 'node_modules', 'schemastery')
  const source = join(root, 'packaged', 'schemastery')
  try {
    await mkdir(target, { recursive: true })
    await mkdir(source, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { schemastery: '3.17.0' },
    }, null, 2)}\n`)
    await writeFile(join(target, 'package.json'), JSON.stringify({ name: 'schemastery', version: '3.17.0' }))
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'schemastery', version: '3.18.0' }))

    await ensureDesktopProfile({
      dshHome,
      packageRoots: new Map([['schemastery', source]]),
    })

    assert.equal(await realpath(target), await realpath(source))
    const records = JSON.parse(await readFile(join(profileDir, '.dsh-desktop-links.json'), 'utf8'))
    assert.deepEqual(records.schemastery, { mode: 'link', source })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap preserves an incompatible unrecorded schemastery package', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-schemastery-incompatible-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const target = join(profileDir, 'node_modules', 'schemastery')
  const source = join(root, 'packaged', 'schemastery')
  try {
    await mkdir(target, { recursive: true })
    await mkdir(source, { recursive: true })
    await writeFile(join(target, 'package.json'), JSON.stringify({ name: 'schemastery', version: '3.17.0' }))
    await writeFile(join(source, 'package.json'), JSON.stringify({ name: 'schemastery', version: '3.18.0' }))

    await assert.rejects(
      ensureDesktopProfile({ dshHome, packageRoots: new Map([['schemastery', source]]) }),
      /refusing to replace unmanaged package/u,
    )
    assert.equal(JSON.parse(await readFile(join(target, 'package.json'), 'utf8')).version, '3.17.0')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap moves a legacy profile skin section to the authoritative home patch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-skin-migration-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const packageRoot = join(root, 'runtime')
  const skinSection = '# --- dsh-skin managed (auto-generated; do not edit) ---\n- insert:\n    - id: ui-skin-qq98\n# --- end dsh-skin managed ---'
  try {
    await mkdir(profileDir, { recursive: true })
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: '@linxin666/dsh-web-ui-all' }))
    await writeFile(join(profileDir, 'cordis.patch.yml'), `${skinSection}\n\n- id: retained\n`)
    await writeFile(join(dshHome, 'cordis.patch.yml'), '- id: user-row\n')
    const packageRoots = new Map([['@linxin666/dsh-web-ui-all', packageRoot]])
    await ensureDesktopProfile({ dshHome, packageRoots })
    const profilePatch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    const homePatch = await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8')
    assert.doesNotMatch(profilePatch, /dsh-skin managed/u)
    assert.match(profilePatch, /- id: retained/u)
    assert.match(homePatch, /dsh-skin managed/u)
    assert.match(homePatch, /ui-skin-qq98/u)
    assert.match(homePatch, /- id: user-row/u)
    await ensureDesktopProfile({ dshHome, packageRoots })
    assert.equal(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), homePatch)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap preserves a newer home skin section while removing the legacy profile copy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-empty-home-patch-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const skinSection = '# --- dsh-skin managed (auto-generated; do not edit) ---\n- insert:\n    - id: ui-skin-qq98\n# --- end dsh-skin managed ---'
  const homeSkinSection = '# --- dsh-skin managed (auto-generated; do not edit) ---\n- insert:\n    - id: ui-skin-blue-fantasy\n# --- end dsh-skin managed ---'
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'cordis.patch.yml'), `${skinSection}\n`)
    await writeFile(join(dshHome, 'cordis.patch.yml'), `${homeSkinSection}\n`)
    await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    assert.equal(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), `${homeSkinSection}\n`)
    assert.doesNotMatch(await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8'), /dsh-skin managed/u)

    // Desktop 0.1.8 may already have completed the migration and left a
    // zero-byte file, so the repair must not depend on detecting legacy rows.
    await writeFile(join(dshHome, 'cordis.patch.yml'), '')
    await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    assert.equal(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), '[]\n')
    const stable = await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    assert.equal(stable.changed, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap keeps a migrated bundled skin resolvable without restoring its dependency', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-bundled-skin-alias-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const carrierRoot = join(root, 'dsh-skins')
  const skinRoot = join(carrierRoot, 'skins', 'qq98')
  const skinPackage = '@linxin666/dsh-client-ui-skin-qq98'
  const skinSection = `# --- dsh-skin managed (auto-generated; do not edit) ---\n- insert:\n    - id: ui-skin-qq98\n      name: '${skinPackage}'\n# --- end dsh-skin managed ---`
  try {
    await mkdir(profileDir, { recursive: true })
    await mkdir(skinRoot, { recursive: true })
    await writeFile(join(carrierRoot, 'package.json'), JSON.stringify({ name: '@linxin666/dsh-skins' }))
    await writeFile(join(skinRoot, 'package.json'), JSON.stringify({ name: skinPackage }))
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      dependencies: { [skinPackage]: '0.1.2' },
      dsh: { profile: { bundles: [skinPackage] } },
    }))
    await writeFile(join(dshHome, 'cordis.patch.yml'), `${skinSection}\n`)

    const packageRoots = new Map([['@linxin666/dsh-skins', carrierRoot]])
    const first = await ensureDesktopProfile({ dshHome, packageRoots })
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    const alias = join(profileDir, 'node_modules', '@linxin666', 'dsh-client-ui-skin-qq98')

    assert.equal(first.changed, true)
    assert.equal(manifest.dependencies[skinPackage], undefined)
    assert.equal(manifest.dsh.profile.bundles.includes(skinPackage), false)
    assert.equal(await realpath(alias), await realpath(skinRoot))
    assert.match(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), new RegExp(skinPackage, 'u'))
    const records = JSON.parse(await readFile(join(profileDir, '.dsh-desktop-links.json'), 'utf8'))
    assert.deepEqual(records[skinPackage], { mode: 'link', source: skinRoot })

    const second = await ensureDesktopProfile({ dshHome, packageRoots })
    assert.equal(second.changed, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime resolver finds every bundled and desktop support package', () => {
  const resolved = resolveRuntimePackages()
  assert.deepEqual([...resolved.keys()], [...resolved.keys()].toSorted())
  for (const packageName of MANAGED_RUNTIME_PACKAGES) {
    assert.equal(resolved.has(packageName), true, `missing ${packageName}`)
  }
  assert.deepEqual(DESKTOP_SUPPORT_PACKAGES, [
    '@deepseek-ai/dsh-client-ui-directory-picker-browse',
    '@deepseek-ai/dsh-host-directory-picker-browse',
  ])

  const aggregate = JSON.parse(readFileSync(join(resolved.get('@linxin666/dsh-web-ui-all'), 'package.json'), 'utf8'))
  const aggregatePatch = readFileSync(join(resolved.get('@linxin666/dsh-web-ui-all'), 'cordis.patch.yml'), 'utf8')
  assert.match(
    aggregatePatch,
    /- id: ui-mode-switcher\s+name: '@linxin666\/dsh-client-ui-mode-switcher'/u,
    'the published aggregate must mount the Desktop-owned mode switcher',
  )
  for (const packageName of AGGREGATED_BUNDLES) {
    const manifest = JSON.parse(readFileSync(join(resolved.get(packageName), 'package.json'), 'utf8'))
    assert.equal(manifest.version, aggregate.version, `${packageName} did not resolve from the aggregate release`)
  }
})

test('official DSH CLI composes the isolated desktop profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-compose-'))
  try {
    await ensureDesktopProfile({ dshHome: root })
    const result = spawnSync(
      process.execPath,
      [resolveDshCliPath(), '--profile', 'desktop', '--dump-config'],
      {
        encoding: 'utf8',
        env: { ...process.env, DSH_HOME: root },
        timeout: 20_000,
      },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /ui-task-board/)
    assert.match(result.stdout, /ui-mode-switcher/)
    assert.equal(result.stdout.match(/- id: ui-mode-switcher/gu)?.length, 1)
    assert.match(result.stdout, /ui-skin-center/)
    assert.match(result.stdout, /- id: pet/)
    assert.match(result.stdout, /- id: remote-web-ui/)
    assert.match(result.stdout, /- id: live-stats/)
    assert.match(result.stdout, /directory-picker-desktop-host/)
    assert.match(result.stdout, /dsh-host-directory-picker-browse/)
    assert.match(result.stdout, /directory-picker-desktop-client/)
    assert.match(result.stdout, /dsh-client-ui-directory-picker-browse/)
    assert.match(result.stdout, /- id: dsh-market/)
    assert.match(result.stdout, /profile: desktop/)
    assert.match(result.stdout, /- id: llm-deepseek[\s\S]*?maxRetries: 4/u)
    assert.match(result.stdout, /- id: llm-deepseek[\s\S]*?STREAM_CLOSED/u)
    assert.doesNotMatch(result.stdout, /- id: dsh-plugin-hub/)
    assert.match(result.stdout, /- id: llm-openai-codex/)
    assert.match(result.stdout, /name: dsh-codex-connect/)
    assert.match(result.stdout, /enableSearch: false/)
    assert.match(result.stdout, /- id: reasoning-slider/)
    assert.match(result.stdout, /- id: im-qqbot[\s\S]*?disabled: true/)
    assert.doesNotMatch(result.stdout, /dsh-host-directory-picker-native/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
