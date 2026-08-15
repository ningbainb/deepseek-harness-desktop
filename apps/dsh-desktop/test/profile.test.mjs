import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  AGGREGATED_BUNDLES,
  BUILTIN_BUNDLES,
  DESKTOP_PATCH_CONFIG,
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
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-client-ui-skin-center'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-liangshen'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-tool-describe-image'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-web-ui-compat'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-client-ui-skin-harbor'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-client-ui-skin-qq2006'), false)
})

test('desktop profile uses the base aggregate for the store, Codex login, and reasoning controls', () => {
  assert.equal(BUILTIN_BUNDLES.includes('dsh-desktop-base'), true)
  assert.equal(BUILTIN_BUNDLES.includes('@linxin666/dsh-web-ui-all'), false)
  assert.equal(BUILTIN_BUNDLES.includes('dshmarket'), false)
  assert.equal(BUILTIN_BUNDLES.includes('dsh-plugin-hub'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dsh-desktop-base'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dshmarket'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dsh-plugin-hub'), false)
  assert.equal(BUILTIN_BUNDLES.includes('dsh-codex-connect'), false)
  assert.equal(BUILTIN_BUNDLES.includes('reasoning-slider'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dsh-codex-connect'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('reasoning-slider'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-web-ui-all'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('dshmarket'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('dsh-codex-connect'), true)
  assert.equal(AGGREGATED_BUNDLES.includes('reasoning-slider'), true)
  assert.match(DESKTOP_PATCH_CONFIG, /id: dsh-market[\s\S]*profile: desktop/)
  assert.match(DESKTOP_PATCH_CONFIG, /id: dsh-market[\s\S]*allowRestart: false/)
})

test('desktop profile includes the official QQ Bot bundle', () => {
  assert.equal(BUILTIN_BUNDLES.includes('@tencent-connect/dsh-qqbot'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@tencent-connect/dsh-qqbot'), true)
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

test('profile manifest retires duplicate market and direct skin packages', () => {
  const manifest = createDesktopProfileManifest({
    dependencies: {
      'dsh-plugin-hub': '0.1.0',
      '@linxin666/dsh-client-ui-skin-qq98': '0.1.2',
      '@community/example': '1.0.0',
    },
    dsh: { profile: { bundles: ['dsh-plugin-hub', '@linxin666/dsh-client-ui-skin-qq98', '@community/example'] } },
  })
  assert.equal(manifest.dependencies['dsh-plugin-hub'], undefined)
  assert.equal(manifest.dependencies['@linxin666/dsh-client-ui-skin-qq98'], undefined)
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
  assert.equal(manifest.dsh.profile.bundles.includes('dsh-desktop-base'), true)
  assert.equal(manifest.dsh.profile.bundles.includes('dsh-codex-connect'), false)
  assert.equal(manifest.dependencies['dsh-codex-connect'], undefined)
})

test('profile bootstrap disables aggregate Codex Connect when another provider owns the route', async () => {
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
    const patch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    assert.equal(result.manifest.dsh.profile.bundles.includes('dsh-desktop-base'), true)
    assert.equal(result.manifest.dsh.profile.bundles.includes('dsh-codex-connect'), false)
    assert.match(result.manifest.dependencies['dsh-codex-connect'], /^link:/u)
    assert.equal(
      await realpath(join(profileDir, 'node_modules', 'dsh-codex-connect')),
      await realpath(packageRoot),
    )
    assert.match(patch, /- id: llm-openai-codex\n  disabled: true/u)
    assert.equal((await readFile(join(profileDir, '.dsh-desktop-links.json'), 'utf8')).includes('dsh-codex-connect'), true)
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

test('profile bootstrap safely resets legacy skin sections before retiring their package links', async () => {
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
    await writeFile(join(dshHome, 'cordis.patch.yml'), `- id: user-row\n\n${skinSection}\n`)
    const packageRoots = new Map([['@linxin666/dsh-web-ui-all', packageRoot]])
    await ensureDesktopProfile({ dshHome, packageRoots })
    const profilePatch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    const homePatch = await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8')
    assert.doesNotMatch(profilePatch, /dsh-skin managed/u)
    assert.match(profilePatch, /- id: retained/u)
    assert.doesNotMatch(homePatch, /dsh-skin managed/u)
    assert.match(homePatch, /- id: user-row/u)
    await ensureDesktopProfile({ dshHome, packageRoots })
    assert.equal(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), homePatch)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap keeps the DSH-home patch a valid YAML array after skin migration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-empty-home-patch-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const skinSection = '# --- dsh-skin managed (auto-generated; do not edit) ---\n- insert:\n    - id: ui-skin-qq98\n# --- end dsh-skin managed ---'
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'cordis.patch.yml'), `${skinSection}\n`)
    await writeFile(join(dshHome, 'cordis.patch.yml'), `${skinSection}\n`)
    await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    assert.equal(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), '[]\n')

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
