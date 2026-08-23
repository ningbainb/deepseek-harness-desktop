import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'

import {
  AGGREGATED_BUNDLES,
  BUILTIN_BUNDLES,
  BUILTIN_SKIN_IDS,
  CODEX_PROVIDER_CONFLICTS,
  DESKTOP_PATCH_CONFIG,
  DESKTOP_AGGREGATE_WORKSPACE_OVERRIDE_PACKAGES,
  DEPENDENCY_ONLY_BUNDLES,
  DESKTOP_PLUGIN_COMPAT_PACKAGES,
  DESKTOP_RUNTIME_OVERRIDE_PACKAGES,
  DESKTOP_SUPPORT_PACKAGES,
  MANAGED_RUNTIME_PACKAGES,
  RETIRED_MANAGED_PACKAGES,
  createDesktopProfileManifest,
  ensureDesktopProfile,
  isSemanticallyEmptyPatch,
  mergeDesktopPatch,
  materializeFilesystemPath,
  packagePathSegments,
  resolveRuntimePackages,
  resolveDshCliPath,
} from '../src/profile.mjs'

function aggregateLoaderPackageNames(source) {
  const packageNames = new Set()
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry)
      return
    }
    if (value === null || typeof value !== 'object') return
    if (typeof value.id === 'string' && typeof value.name === 'string') {
      packageNames.add(value.name)
    }
    for (const entry of Object.values(value)) visit(entry)
  }
  visit(parse(source))
  return [...packageNames].toSorted()
}

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

test('profile manifest preserves versionless historical fields, dependency specs, and user bundle order', () => {
  const existing = {
    name: 'dsh-profile-desktop',
    private: false,
    type: 'module',
    scripts: {
      prepare: 'node user-prepare.mjs',
      custom: 'node custom.mjs',
    },
    pnpm: {
      overrides: {
        react: '18.3.1',
      },
      onlyBuiltDependencies: ['sharp'],
    },
    dependencies: {
      '@user/local-link': 'link:C:/plugins/local-link',
      '@user/file-plugin': 'file:../file-plugin',
      '@user/workspace-plugin': 'workspace:*',
      '@user/git-plugin': 'git+https://example.invalid/user/plugin.git#main',
      '@user/old-plugin': '1.4.2',
    },
    optionalDependencies: {
      '@user/optional': '^2.0.0',
    },
    dsh: {
      customRuntimeField: { enabled: true },
      profile: {
        label: '用户自己的桌面配置',
        bundles: [
          '@user/local-link',
          '@user/old-plugin',
          '@user/local-link',
        ],
      },
    },
    userMetadata: {
      source: 'historical-versionless-profile',
    },
  }

  const result = createDesktopProfileManifest(existing)

  assert.equal(Object.hasOwn(result, 'version'), false)
  assert.equal(result.name, 'dsh-profile-desktop')
  assert.equal(result.private, true)
  assert.equal(result.type, existing.type)
  assert.deepEqual(result.scripts, existing.scripts)
  assert.deepEqual(result.pnpm, existing.pnpm)
  assert.deepEqual(result.optionalDependencies, existing.optionalDependencies)
  assert.deepEqual(result.userMetadata, existing.userMetadata)
  assert.deepEqual(result.dependencies, existing.dependencies)
  assert.equal(result.dsh.customRuntimeField, existing.dsh.customRuntimeField)
  assert.equal(result.dsh.profile.label, existing.dsh.profile.label)
  assert.deepEqual(result.dsh.profile.bundles, [
    ...BUILTIN_BUNDLES,
    '@user/local-link',
    '@user/old-plugin',
  ])
})

test('builtins mode uses the same Home but a separate profile with no user bundles or dependencies', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-mode-'))
  const fullProfileDir = join(dshHome, 'profiles', 'desktop')
  try {
    await mkdir(fullProfileDir, { recursive: true })
    const original = {
      name: 'historical-profile',
      dependencies: { '@user/plugin': 'link:C:/user/plugin' },
      dsh: { profile: { bundles: ['@user/plugin'] } },
      userField: { preserved: true },
    }
    await writeFile(join(fullProfileDir, 'package.json'), `${JSON.stringify(original, null, 2)}\n`)

    const builtins = await ensureDesktopProfile({ dshHome, packageRoots: new Map(), mode: 'builtins' })
    assert.equal(builtins.profileDir, join(dshHome, 'profiles', 'desktop-builtins'))
    assert.deepEqual(builtins.manifest.dependencies, {})
    assert.deepEqual(builtins.manifest.dsh.profile.bundles, BUILTIN_BUNDLES)
    assert.equal('userField' in builtins.manifest, false)
    assert.deepEqual(JSON.parse(await readFile(join(fullProfileDir, 'package.json'), 'utf8')), original)
  } finally {
    await rm(dshHome, { recursive: true, force: true })
  }
})

test('profile mode names are bounded and repair mode has its own managed directory', async () => {
  const dshHome = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-repair-mode-'))
  try {
    const repair = await ensureDesktopProfile({ dshHome, packageRoots: new Map(), mode: 'repair' })
    assert.equal(repair.profileDir, join(dshHome, 'profiles', 'desktop-repair'))
    assert.deepEqual(repair.manifest.dependencies, {})
    assert.deepEqual(repair.manifest.dsh.profile.bundles, ['@linxin666/dsh-desktop-repair'])
    assert.equal(await readFile(join(repair.profileDir, 'cordis.patch.yml'), 'utf8'), '[]\n')
    await assert.rejects(
      ensureDesktopProfile({ dshHome, packageRoots: new Map(), mode: 'isolated' }),
      /profile mode/u,
    )
  } finally {
    await rm(dshHome, { recursive: true, force: true })
  }
})

test('host-only repair bundle remains dormant in the normal full profile', () => {
  const manifest = createDesktopProfileManifest({
    dsh: { profile: { bundles: ['@linxin666/dsh-desktop-repair', '@user/plugin'] } },
  })
  assert.equal(manifest.dsh.profile.bundles.includes('@linxin666/dsh-desktop-repair'), false)
  assert.equal(manifest.dsh.profile.bundles.includes('@user/plugin'), true)
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
  assert.equal(BUILTIN_SKIN_IDS.includes('qq2006'), false)
  assert.equal(BUILTIN_SKIN_IDS.includes('maid-atelier'), true)
  assert.equal(RETIRED_MANAGED_PACKAGES.includes('@linxin666/dsh-client-ui-skin-qq2006'), true)
})

test('desktop profile uses the RC.1 native Codex provider plus the native market and reasoning controls', () => {
  assert.equal(BUILTIN_BUNDLES.includes('dshmarket'), false)
  assert.equal(BUILTIN_BUNDLES.includes('dsh-plugin-hub'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dshmarket'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dsh-plugin-hub'), false)
  assert.equal(RETIRED_MANAGED_PACKAGES.includes('dshmarket'), true)
  assert.equal(BUILTIN_BUNDLES.includes('dsh-codex-connect'), false)
  assert.equal(BUILTIN_BUNDLES.includes('reasoning-slider'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('dsh-codex-connect'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('reasoning-slider'), true)
  assert.equal(BUILTIN_BUNDLES.includes('@linxin666/dsh-client-ui-mode-switcher'), false)
  assert.equal(DEPENDENCY_ONLY_BUNDLES.includes('@linxin666/dsh-client-ui-mode-switcher'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-client-ui-mode-switcher'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-client-ui-community-plugins'), true)
  assert.doesNotMatch(DESKTOP_PATCH_CONFIG, /id: ui-mode-switcher/u)
  assert.equal(BUILTIN_BUNDLES.includes('@vectorize-io/hindsight-coding-agents'), false)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@vectorize-io/hindsight-coding-agents'), false)
  assert.equal(RETIRED_MANAGED_PACKAGES.includes('@vectorize-io/hindsight-coding-agents'), true)
  assert.doesNotMatch(DESKTOP_PATCH_CONFIG, /id: dsh-market/u)
  assert.match(DESKTOP_PATCH_CONFIG, /id: llm-deepseek[\s\S]*maxRetries: 4/u)
  assert.match(DESKTOP_PATCH_CONFIG, /retryableCodes:[\s\S]*STREAM_CLOSED/u)
})

test('desktop profile mounts authorization and activates the native Codex model catalog', () => {
  assert.equal(
    [...DESKTOP_PATCH_CONFIG.matchAll(/name: '@deepseek-ai\/dsh-authorization'/gu)].length,
    1,
  )
  assert.match(
    DESKTOP_PATCH_CONFIG,
    /- id: llm-pi-ai[\s\S]*?providers:\s*\n\s+openai-codex: \{\}/u,
  )
  for (const packageName of ['dsh-codex', 'dsh-codex-auth', 'dsh-codex-connect']) {
    assert.equal(CODEX_PROVIDER_CONFLICTS.includes(packageName), true)
    assert.equal(MANAGED_RUNTIME_PACKAGES.includes(packageName), false)
  }
})

test('desktop profile includes the official QQ Bot bundle', () => {
  assert.equal(BUILTIN_BUNDLES.includes('@tencent-connect/dsh-qqbot'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@tencent-connect/dsh-qqbot'), true)
})

test('desktop profile always mounts the compatibility bundle that owns native workspace opening', () => {
  assert.equal(BUILTIN_BUNDLES.includes('@linxin666/dsh-desktop-compat'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-desktop-compat'), true)
})

test('desktop profile receives the independent particle theme from dependency reconciliation exactly once', () => {
  assert.equal(BUILTIN_BUNDLES.includes('@linxin666/dsh-particle-theme'), false)
  assert.equal(AGGREGATED_BUNDLES.includes('@linxin666/dsh-particle-theme'), false)
  assert.equal(DEPENDENCY_ONLY_BUNDLES.includes('@linxin666/dsh-particle-theme'), true)
  assert.equal(MANAGED_RUNTIME_PACKAGES.includes('@linxin666/dsh-particle-theme'), true)
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

test('desktop patch refresh preserves Desktop market state and community rows', () => {
  const skinSection = '# --- dsh-desktop skin state (auto-generated; do not edit) ---\n- id: dsh-liquid-glass\n  disabled: false\n# --- end dsh-desktop skin state ---'
  const communityRow = "- id: community\n  name: '@community/plugin'"
  const merged = mergeDesktopPatch(`${DESKTOP_PATCH_CONFIG}\n${skinSection}\n${communityRow}\n`)
  assert.equal(merged.match(/dsh-desktop managed/gu)?.length, 2)
  assert.match(merged, /dsh-liquid-glass/u)
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

test('profile manifest retires legacy Codex providers now owned by RC.1 llm-pi-ai', () => {
  const manifest = createDesktopProfileManifest({
    dependencies: { 'dsh-codex': '0.2.2', 'dsh-codex-connect': '0.1.0-alpha.4.5' },
    dsh: { profile: { bundles: ['dsh-codex'] } },
  })
  assert.equal(manifest.dsh.profile.bundles.includes('dsh-codex'), false)
  assert.equal(manifest.dsh.profile.bundles.includes('dsh-codex-connect'), false)
  assert.equal(manifest.dependencies['dsh-codex'], undefined)
  assert.equal(manifest.dependencies['dsh-codex-connect'], undefined)
})

test('profile bootstrap refuses to link the legacy Codex Connect provider on RC.1', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-codex-conflict-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const packageRoot = join(root, 'dsh-codex-connect')
  try {
    await mkdir(packageRoot, { recursive: true })
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: 'dsh-codex-connect' }))
    const packageRoots = new Map([['dsh-codex-connect', packageRoot]])
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

test('profile bootstrap adopts an unrecorded Desktop link declared by an older profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-profile-unrecorded-link-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const packageName = '@linxin666/dsh-desktop-repair'
  const oldRoot = join(root, 'old-build', 'desktop-repair')
  const nextRoot = join(root, 'installed', 'desktop-repair')
  const target = join(profileDir, 'node_modules', ...packagePathSegments(packageName))
  try {
    for (const packageRoot of [oldRoot, nextRoot]) {
      await mkdir(packageRoot, { recursive: true })
      await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ name: packageName, version: '0.1.0' }))
    }
    await mkdir(dirname(target), { recursive: true })
    await symlink(oldRoot, target, process.platform === 'win32' ? 'junction' : 'dir')
    await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
      name: 'dsh-profile-desktop',
      private: true,
      dependencies: { [packageName]: `link:${oldRoot.replaceAll('\\', '/')}` },
      dsh: { profile: { bundles: BUILTIN_BUNDLES } },
    }, null, 2)}\n`)

    const result = await ensureDesktopProfile({
      dshHome,
      packageRoots: new Map([[packageName, nextRoot]]),
    })

    assert.equal(result.changed, true)
    assert.equal(await realpath(target), await realpath(nextRoot))
    const records = JSON.parse(await readFile(join(profileDir, '.dsh-desktop-links.json'), 'utf8'))
    assert.deepEqual(records[packageName], { mode: 'link', source: nextRoot })
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

test('profile bootstrap migrates legacy skin selection before DSH loads and preserves non-skin rows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-skin-migration-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const profileSkinSection = [
    '# --- dsh-skin managed (auto-generated; do not edit) ---',
    '- insert:',
    '    - id: ui-skin-xp',
    `      name: '@linxin666/dsh-client-ui-skin-xp'`,
    '- id: dsh-solarized',
    '  disabled: true',
    '- insert:',
    '    - id: retained-community',
    `      name: '@community/plugin'`,
    '# --- end dsh-skin managed ---',
  ].join('\n')
  const homeSkinSection = [
    '# --- dsh-skin managed (auto-generated; do not edit) ---',
    '- insert:',
    '    - id: ui-skin-blue-fantasy',
    `      name: '@linxin666/dsh-client-ui-skin-blue-fantasy'`,
    '- id: dsh-liquid-glass',
    '  disabled: false',
    '- insert:',
    '    - id: home-community',
    `      name: '@community/home'`,
    '# --- end dsh-skin managed ---',
  ].join('\n')
  const desktopMarketState = [
    '# --- dsh-desktop skin state (auto-generated; do not edit) ---',
    '- id: dsh-solarized',
    '  disabled: false',
    '# --- end dsh-desktop skin state ---',
  ].join('\n')
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      dependencies: { '@linxin666/dsh-client-ui-skin-xp': '0.1.18' },
      dsh: { profile: { bundles: ['@linxin666/dsh-client-ui-skin-xp'] } },
    }))
    await writeFile(join(profileDir, 'cordis.patch.yml'), profileSkinSection + '\n\n' + desktopMarketState + '\n')
    await writeFile(join(dshHome, 'cordis.patch.yml'), homeSkinSection + '\n\n- id: home-user\n')

    const first = await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    const profilePatch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    const homePatch = await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8')
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))

    assert.equal(first.changed, true)
    assert.deepEqual(JSON.parse(await readFile(join(dshHome, 'skin-center-active.json'), 'utf8')), { active: 'xp' })
    assert.equal(manifest.dependencies['@linxin666/dsh-client-ui-skin-xp'], undefined)
    assert.equal(manifest.dsh.profile.bundles.includes('@linxin666/dsh-client-ui-skin-xp'), false)
    assert.doesNotMatch(profilePatch, /dsh-skin managed|dsh-client-ui-skin-|ui-skin-/u)
    assert.match(profilePatch, /- id: retained-community\r?\n\s+name: '@community\/plugin'/u)
    assert.match(profilePatch, /- id: home-community\r?\n\s+name: '@community\/home'/u)
    assert.match(profilePatch, /- id: dsh-solarized\r?\n  disabled: false/u)
    assert.match(profilePatch, /- id: dsh-liquid-glass\r?\n  disabled: false/u)
    assert.doesNotMatch(homePatch, /dsh-skin managed|ui-skin-|@community\/home/u)
    assert.match(homePatch, /- id: home-user/u)

    const stable = await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    assert.equal(stable.changed, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('published aggregate loader dependencies are linked into the isolated Desktop profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-aggregate-loaders-'))
  try {
    const resolved = resolveRuntimePackages()
    const aggregateRoot = resolved.get('@linxin666/dsh-web-ui-all')
    if (aggregateRoot === undefined) throw new Error('published web UI aggregate is missing')
    const loaderPackages = aggregateLoaderPackageNames(
      readFileSync(join(aggregateRoot, 'cordis.patch.yml'), 'utf8'),
    )
    const { profileDir, manifest } = await ensureDesktopProfile({ dshHome: root })

    assert.ok(loaderPackages.length > 0, 'published aggregate must declare loader packages')
    for (const packageName of loaderPackages) {
      assert.equal(
        MANAGED_RUNTIME_PACKAGES.includes(packageName),
        true,
        `aggregate loader package must be managed by the isolated Desktop profile: ${packageName}`,
      )
      const sourceDir = resolved.get(packageName)
      assert.notEqual(sourceDir, undefined, `aggregate loader package must resolve: ${packageName}`)
      assert.match(manifest.dependencies[packageName], /^link:/u)
      assert.equal(
        await realpath(join(profileDir, 'node_modules', ...packagePathSegments(packageName))),
        await realpath(sourceDir),
        `aggregate loader package must be linked into the Desktop profile: ${packageName}`,
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap preserves explicit Skin Center state and archives an unsupported legacy skin', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-retired-skin-migration-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const profileSkinSection = [
    '# --- dsh-skin managed (auto-generated; do not edit) ---',
    '- insert:',
    '    - id: ui-skin-qq98',
    `      name: '@deepseek-ai/dsh-client-ui-skin-qq98'`,
    '# --- end dsh-skin managed ---',
  ].join('\n')
  const homeSkinSection = [
    '# --- dsh-skin managed (auto-generated; do not edit) ---',
    '- insert:',
    '    - id: ui-skin-xp',
    `      name: '@linxin666/dsh-client-ui-skin-xp'`,
    '# --- end dsh-skin managed ---',
  ].join('\n')
  try {
    await mkdir(profileDir, { recursive: true })
    await writeFile(join(profileDir, 'cordis.patch.yml'), profileSkinSection + '\n')
    await writeFile(join(dshHome, 'cordis.patch.yml'), homeSkinSection + '\n')
    await writeFile(join(dshHome, 'skin-center-active.json'), JSON.stringify({ active: 'mint' }) + '\n')

    await ensureDesktopProfile({ dshHome, packageRoots: new Map() })

    const profilePatch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    assert.deepEqual(JSON.parse(await readFile(join(dshHome, 'skin-center-active.json'), 'utf8')), { active: 'mint' })
    assert.deepEqual(JSON.parse(await readFile(join(profileDir, '.dsh-desktop-retired-skin.json'), 'utf8')), {
      schemaVersion: 1,
      packageName: '@deepseek-ai/dsh-client-ui-skin-qq98',
      skinId: 'qq98',
      reason: 'not-bundled-by-skin-center-v2',
    })
    assert.doesNotMatch(profilePatch, /dsh-skin managed|dsh-client-ui-skin-|ui-skin-/u)
    assert.equal(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), '[]\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap repairs semantically empty patch documents without replacing user entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-empty-patch-shapes-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  try {
    await mkdir(profileDir, { recursive: true })
    assert.equal(isSemanticallyEmptyPatch(''), true)
    assert.equal(isSemanticallyEmptyPatch('# legacy placeholder\n{}\n'), true)
    assert.equal(isSemanticallyEmptyPatch('[]\n'), true)
    assert.equal(isSemanticallyEmptyPatch('- id: retained\n'), false)
    assert.equal(isSemanticallyEmptyPatch('plugin: retained\n'), false)
    assert.equal(isSemanticallyEmptyPatch('{invalid'), false)

    await writeFile(join(dshHome, 'cordis.patch.yml'), '# legacy placeholder\n{}\n')
    await writeFile(join(profileDir, 'cordis.patch.yml'), '{}\n')
    await ensureDesktopProfile({ dshHome, packageRoots: new Map() })

    assert.equal(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), '[]\n')
    const profilePatch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    assert.match(profilePatch, /dsh-desktop managed/u)
    assert.doesNotMatch(profilePatch, /^\{\}$/mu)
    const composed = spawnSync(
      process.execPath,
      [resolveDshCliPath(), '--profile', 'desktop', '--dump-config'],
      {
        encoding: 'utf8',
        env: { ...process.env, DSH_HOME: dshHome },
        timeout: 20_000,
      },
    )
    assert.equal(composed.status, 0, composed.stderr)

    await writeFile(join(dshHome, 'cordis.patch.yml'), 'plugin: retained\n')
    await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    assert.equal(await readFile(join(dshHome, 'cordis.patch.yml'), 'utf8'), 'plugin: retained\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('profile bootstrap removes standalone legacy skin loaders and retires owned links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-standalone-skin-migration-'))
  const dshHome = join(root, 'home')
  const profileDir = join(dshHome, 'profiles', 'desktop')
  const skinPackage = '@deepseek-ai/dsh-client-ui-skin-xp'
  const skinTarget = join(profileDir, 'node_modules', ...packagePathSegments(skinPackage))
  const standaloneRows = [
    '- insert:',
    '    - id: ui-skin-xp',
    `      name: '${skinPackage}'`,
    '- insert:',
    '    - id: retained-community',
    `      name: '@community/plugin'`,
    '- id: retained',
  ].join('\n')
  try {
    await mkdir(profileDir, { recursive: true })
    await mkdir(skinTarget, { recursive: true })
    await writeFile(join(skinTarget, 'package.json'), JSON.stringify({ name: skinPackage }))
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      dependencies: { [skinPackage]: '0.1.2' },
      dsh: { profile: { bundles: [skinPackage] } },
    }))
    await writeFile(join(profileDir, '.dsh-desktop-links.json'), JSON.stringify({
      [skinPackage]: { mode: 'copy', source: 'legacy-carrier' },
    }))
    await writeFile(join(profileDir, 'cordis.patch.yml'), standaloneRows + '\n')

    const first = await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    const profilePatch = await readFile(join(profileDir, 'cordis.patch.yml'), 'utf8')
    const records = JSON.parse(await readFile(join(profileDir, '.dsh-desktop-links.json'), 'utf8'))

    assert.equal(first.changed, true)
    assert.equal(manifest.dependencies[skinPackage], undefined)
    assert.equal(manifest.dsh.profile.bundles.includes(skinPackage), false)
    assert.deepEqual(JSON.parse(await readFile(join(dshHome, 'skin-center-active.json'), 'utf8')), { active: 'xp' })
    assert.doesNotMatch(profilePatch, /dsh-client-ui-skin-|ui-skin-/u)
    assert.match(profilePatch, /- id: retained-community\r?\n\s+name: '@community\/plugin'/u)
    assert.match(profilePatch, /- id: retained/u)
    await assert.rejects(realpath(skinTarget), (error) => error?.code === 'ENOENT')
    assert.equal(records[skinPackage], undefined)

    const second = await ensureDesktopProfile({ dshHome, packageRoots: new Map() })
    assert.equal(second.changed, false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime resolver finds every bundled and desktop support package', async () => {
  const resolved = resolveRuntimePackages()
  assert.deepEqual([...resolved.keys()], [...resolved.keys()].toSorted())
  for (const packageName of MANAGED_RUNTIME_PACKAGES) {
    assert.equal(resolved.has(packageName), true, `missing ${packageName}`)
  }
  assert.deepEqual(DESKTOP_SUPPORT_PACKAGES, [
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-agent-default-model',
    '@deepseek-ai/dsh-client-ui-directory-picker-browse',
    '@deepseek-ai/dsh-host-directory-picker-browse',
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-session-persistence',
    '@deepseek-ai/dsh-workspace',
  ])

  const aggregate = JSON.parse(readFileSync(join(resolved.get('@linxin666/dsh-web-ui-all'), 'package.json'), 'utf8'))
  const aggregatePatch = readFileSync(join(resolved.get('@linxin666/dsh-web-ui-all'), 'cordis.patch.yml'), 'utf8')
  assert.match(
    aggregatePatch,
    /- id: web-ui-mode-switcher\s+name: '@linxin666\/dsh-client-ui-mode-switcher'/u,
    'the published aggregate must mount the Desktop-owned mode switcher',
  )
  assert.doesNotMatch(
    aggregatePatch,
    /- id: ui-community-plugins\s+name: '@linxin666\/dsh-client-ui-community-plugins'/u,
    'the settings override already owns the community plugin index',
  )
  assert.deepEqual(DESKTOP_RUNTIME_OVERRIDE_PACKAGES, [
    '@linxin666/dsh-client-ui-web-ui-settings',
    '@linxin666/dsh-live-stats',
  ])
  assert.deepEqual(DESKTOP_AGGREGATE_WORKSPACE_OVERRIDE_PACKAGES, [
    '@linxin666/dsh-client-ui-aionui-panel',
    '@linxin666/dsh-client-ui-git-graph',
    '@linxin666/dsh-client-ui-task-board',
    '@linxin666/dsh-ssh',
  ])
  assert.match(
    resolved.get('@linxin666/dsh-client-ui-web-ui-settings'),
    /packages[\\/]dsh-web-ui-settings$/u,
  )
  for (const packageName of AGGREGATED_BUNDLES) {
    if (
      DESKTOP_RUNTIME_OVERRIDE_PACKAGES.includes(packageName)
      || DESKTOP_AGGREGATE_WORKSPACE_OVERRIDE_PACKAGES.includes(packageName)
      || packageName === 'dsh-better-sidebar'
    ) continue
    const manifest = JSON.parse(readFileSync(join(resolved.get(packageName), 'package.json'), 'utf8'))
    assert.equal(manifest.version, aggregate.version, `${packageName} did not resolve from the aggregate release`)
  }
  for (const packageName of DESKTOP_AGGREGATE_WORKSPACE_OVERRIDE_PACKAGES) {
    assert.match(resolved.get(packageName), /packages[\\/](?:dsh-aionui-panel|dsh-git-graph|dsh-task-board|dsh-ssh)$/u)
  }
  const aionRoot = resolved.get('@linxin666/dsh-client-ui-aionui-panel')
  assert.match(aionRoot, /packages[\\/]dsh-aionui-panel$/u)
  const aionManifest = JSON.parse(readFileSync(join(aionRoot, 'package.json'), 'utf8'))
  const aionHost = readFileSync(join(aionRoot, 'lib', 'index.js'), 'utf8')
  const aionClient = readFileSync(join(aionRoot, 'lib', 'client.js'), 'utf8')
  const desktopCompatRoot = resolved.get('@linxin666/dsh-desktop-compat')
  const desktopCompatHost = readFileSync(join(desktopCompatRoot, 'lib', 'index.js'), 'utf8')
  const desktopOpenPolicy = await import(pathToFileURL(join(desktopCompatRoot, 'lib', 'workspace-file-open-policy.js')).href)
  assert.equal(aionManifest.dsh.compatibility.capabilities.includes('workspace-files.open'), true)
  assert.doesNotMatch(aionHost, /\/aionui-panel\/desktop-open-target/u)
  assert.match(aionClient, /openWorkspaceFile/u)
  assert.match(desktopCompatHost, /\/desktop\/workspace-file-open-target/u)
  assert.match(desktopCompatHost, /resolveByPath/u)
  assert.equal(desktopOpenPolicy.isSafeDesktopWorkspaceFileOpenPath('README.md'), true)
  assert.equal(desktopOpenPolicy.isSafeDesktopWorkspaceFileOpenPath('payload.cmd'), false)
})

async function createIsolatedDshCli(root) {
  // DSH deliberately resolves profile bundles from its own installation before
  // the profile. In this workspace, that lookup can otherwise discover the
  // older local aggregate package via pnpm's workspace-link layer. Recreate
  // the relevant package-install layout in the test temp directory so this
  // composition assertion exercises the app's pinned published aggregate.
  const sourceDshRoot = dirname(dirname(resolveDshCliPath()))
  const sourceModules = dirname(dirname(sourceDshRoot))
  const sourceDeepseekScope = join(sourceModules, '@deepseek-ai')
  const isolatedModules = join(root, 'runtime', 'node_modules')
  const isolatedDeepseekScope = join(isolatedModules, '@deepseek-ai')
  const isolatedDshRoot = join(isolatedDeepseekScope, 'dsh')

  await mkdir(isolatedDeepseekScope, { recursive: true })
  await cp(sourceDshRoot, isolatedDshRoot, { recursive: true })
  for (const entry of await readdir(sourceModules, { withFileTypes: true })) {
    if (entry.name === '.bin' || entry.name === '@deepseek-ai' || entry.name === '@linxin666') continue
    await symlink(resolve(sourceModules, entry.name), join(isolatedModules, entry.name), 'junction')
  }
  for (const entry of await readdir(sourceDeepseekScope, { withFileTypes: true })) {
    if (entry.name === 'dsh') continue
    await symlink(resolve(sourceDeepseekScope, entry.name), join(isolatedDeepseekScope, entry.name), 'junction')
  }

  const aggregateRoot = resolveRuntimePackages(['@linxin666/dsh-web-ui-all'])
    .get('@linxin666/dsh-web-ui-all')
  if (aggregateRoot === undefined) throw new Error('published web UI aggregate is missing')
  const isolatedLinxinScope = join(isolatedModules, '@linxin666')
  await mkdir(isolatedLinxinScope, { recursive: true })
  await symlink(aggregateRoot, join(isolatedLinxinScope, 'dsh-web-ui-all'), 'junction')

  return join(isolatedDshRoot, 'lib', 'bin.js')
}

test('official DSH CLI composes the isolated desktop profile', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-compose-'))
  try {
    await ensureDesktopProfile({ dshHome: root })
    const isolatedCliPath = await createIsolatedDshCli(root)
    const result = spawnSync(
      process.execPath,
      [isolatedCliPath, '--profile', 'desktop', '--dump-config'],
      {
        encoding: 'utf8',
        env: { ...process.env, DSH_HOME: root },
        timeout: 20_000,
      },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /- id: web-ui-task-board/)
    assert.equal(result.stdout.match(/- id: web-ui-mode-switcher/gu)?.length, 1)
    assert.match(result.stdout, /- id: web-ui-plugin-manager/)
    assert.match(result.stdout, /- id: web-ui-skill-explorer/)
    assert.match(result.stdout, /- id: web-ui-better-sidebar/)
    assert.match(result.stdout, /- id: web-ui-skin-center/)
    assert.match(result.stdout, /- id: web-ui-pet/)
    assert.match(result.stdout, /- id: web-ui-remote-web-ui/)
    assert.match(result.stdout, /- id: live-stats/)
    assert.match(result.stdout, /directory-picker-desktop-host/)
    assert.match(result.stdout, /dsh-host-directory-picker-browse/)
    assert.match(result.stdout, /directory-picker-desktop-client/)
    assert.match(result.stdout, /dsh-client-ui-directory-picker-browse/)
    assert.doesNotMatch(result.stdout, /- id: dsh-market/u)
    assert.match(result.stdout, /- id: llm-deepseek[\s\S]*?maxRetries: 4/u)
    assert.match(result.stdout, /- id: llm-deepseek[\s\S]*?STREAM_CLOSED/u)
    assert.doesNotMatch(result.stdout, /- id: dsh-plugin-hub/)
    assert.match(result.stdout, /- id: llm-pi-ai/)
    assert.match(result.stdout, /name: '@deepseek-ai\/dsh-llm-pi-ai'/)
    assert.match(result.stdout, /- id: llm-pi-ai[\s\S]*?providers:\s*\n\s+openai-codex: \{\}/u)
    assert.doesNotMatch(result.stdout, /name: dsh-codex-connect/)
    assert.match(result.stdout, /- id: reasoning-slider/)
    assert.match(result.stdout, /- id: im-qqbot[\s\S]*?disabled: true/)
    assert.doesNotMatch(result.stdout, /dsh-host-directory-picker-native/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
