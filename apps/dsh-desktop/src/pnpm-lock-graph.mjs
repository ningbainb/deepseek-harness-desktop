import { parse } from 'yaml'

function record(value, label) {
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value
}

function lockfileMajor(value) {
  const match = /^(\d+)(?:\.|$)/u.exec(String(value ?? ''))
  if (match === null) throw new TypeError('pnpm lockfileVersion is invalid')
  return Number(match[1])
}

function locatorForProtectedPackage(locator, names) {
  const value = String(locator)
  for (const name of names) {
    const prefix = `${name}@`
    if (!value.startsWith(prefix)) continue
    const version = value.slice(prefix.length).split('(')[0]
    return { locator: value, name, version }
  }
  return undefined
}

/** A structural pnpm v9 lock graph. No CLI text is used as security evidence. */
export class PnpmLockGraph {
  constructor(document) {
    if (document === null || typeof document !== 'object' || Array.isArray(document)) {
      throw new TypeError('pnpm lockfile must be an object')
    }
    const major = lockfileMajor(document.lockfileVersion)
    if (major !== 9) throw new Error(`unsupported pnpm lockfile version: ${String(document.lockfileVersion)}`)
    this.lockfileVersion = String(document.lockfileVersion)
    this.importers = Object.freeze(record(document.importers, 'pnpm importers'))
    this.packages = Object.freeze(record(document.packages, 'pnpm packages'))
    this.snapshots = Object.freeze(record(document.snapshots, 'pnpm snapshots'))
    Object.freeze(this)
  }

  static parse(source) {
    let document
    try {
      document = parse(String(source), { uniqueKeys: true })
    } catch (error) {
      throw new Error('pnpm lockfile is invalid', { cause: error })
    }
    return new PnpmLockGraph(document)
  }

  protectedPackages(policy) {
    if (!policy || !Array.isArray(policy.names)) throw new TypeError('package policy is required')
    const names = [...policy.names].sort((left, right) => right.length - left.length)
    const locators = new Set([...Object.keys(this.packages), ...Object.keys(this.snapshots)])
    return Object.freeze([...locators]
      .map(locator => locatorForProtectedPackage(locator, names))
      .filter(Boolean)
      .toSorted((left, right) => left.locator.localeCompare(right.locator))
      .map(Object.freeze))
  }
}
