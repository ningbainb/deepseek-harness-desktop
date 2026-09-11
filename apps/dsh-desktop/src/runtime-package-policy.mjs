import {
  BUILTIN_RUNTIME_PACKAGES,
  DESKTOP_PLUGIN_COMPAT_PACKAGES,
  DESKTOP_REPAIR_BUNDLE,
  DESKTOP_SUPPORT_PACKAGES,
  DSH_BOOT_RUNTIME_PACKAGES,
} from './profile.mjs'

export const PACKAGE_OWNERSHIP = Object.freeze({
  DESKTOP_RUNTIME: 'desktop-runtime',
  DESKTOP_SUPPORT: 'desktop-support',
  BUILTIN_PLUGIN: 'builtin-plugin',
  COMMUNITY_PLUGIN: 'community-plugin',
  SHARED_SAFE: 'shared-safe',
})

const OWNERSHIP_VALUES = new Set(Object.values(PACKAGE_OWNERSHIP))

function packageRecord(name, { ownership, source, singleton = true, replaceable = false }) {
  if (typeof name !== 'string' || name.length === 0) throw new TypeError('package policy name is required')
  if (!OWNERSHIP_VALUES.has(ownership)) throw new TypeError(`package policy ownership is invalid for ${name}`)
  if (typeof source !== 'string' || source.length === 0) throw new TypeError(`package policy source is required for ${name}`)
  return Object.freeze({ name, ownership, source, singleton, replaceable })
}

/**
 * Build the single Desktop package-ownership registry. A package may not be
 * claimed by two categories: ambiguity here would make a dependency graph
 * validator less safe than the scattered lists it replaces.
 */
export function createRuntimePackagePolicy({
  desktopRuntime = [],
  desktopSupport = [],
  builtinPlugin = [],
  sharedSafe = [],
} = {}) {
  const records = new Map()
  const add = (names, options) => {
    for (const name of [...new Set(names)].toSorted()) {
      if (records.has(name)) throw new Error(`package ownership is declared more than once: ${name}`)
      records.set(name, packageRecord(name, options))
    }
  }
  add(desktopRuntime, {
    ownership: PACKAGE_OWNERSHIP.DESKTOP_RUNTIME,
    source: 'application-runtime',
  })
  add(desktopSupport, {
    ownership: PACKAGE_OWNERSHIP.DESKTOP_SUPPORT,
    source: 'desktop-support',
  })
  add(builtinPlugin, {
    ownership: PACKAGE_OWNERSHIP.BUILTIN_PLUGIN,
    source: 'builtin-bundle',
  })
  add(sharedSafe, {
    ownership: PACKAGE_OWNERSHIP.SHARED_SAFE,
    source: 'desktop-compatibility',
    singleton: false,
  })
  const packages = Object.freeze(Object.fromEntries(records))
  return Object.freeze({
    packages,
    names: Object.freeze(Object.keys(packages).toSorted()),
    get(name) { return packages[name] },
    owns(name) { return packages[name] !== undefined },
    isProtected(name) { return packages[name]?.replaceable === false },
  })
}

export const DESKTOP_RUNTIME_PACKAGE_POLICY = createRuntimePackagePolicy({
  desktopRuntime: DSH_BOOT_RUNTIME_PACKAGES,
  desktopSupport: DESKTOP_SUPPORT_PACKAGES,
  builtinPlugin: [...BUILTIN_RUNTIME_PACKAGES, DESKTOP_REPAIR_BUNDLE],
  sharedSafe: DESKTOP_PLUGIN_COMPAT_PACKAGES,
})
