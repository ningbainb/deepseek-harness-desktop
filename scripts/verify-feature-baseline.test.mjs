import test from 'node:test'
import assert from 'node:assert/strict'
import { validateFeatureBaseline } from './verify-feature-baseline.mjs'

const mockBaseline = {
  plugins: [
    {
      id: 'mock-plugin',
      package: '@linxin666/dsh-mock-plugin',
      path: 'packages/dsh-mock-plugin',
      description: 'Mock feature plugin',
      patchId: 'mock-plugin',
      requiredInAggregate: true,
      requiredInCordisPatch: true,
      requiredInDesktop: true,
    },
  ],
  desktopBuiltins: ['@deepseek-ai/dsh-base', 'mock-builtin-bundle'],
  desktopSurfaces: [
    {
      id: 'mock-surface',
      name: 'Mock Desktop Surface',
      e2eScript: 'scripts/mock-e2e.mjs',
    },
  ],
  skinCatalog: ['mock-theme'],
}

const mockAggregate = {
  patchFrom: ['../dsh-mock-plugin'],
  deps: ['../dsh-mock-plugin'],
}

const mockCordisPatch = '- insert:\n    - id: mock-plugin\n      name: "@linxin666/dsh-mock-plugin"'
const mockAggregatePkg = {
  dependencies: {
    '@linxin666/dsh-mock-plugin': 'workspace:*',
  },
}
const mockDesktopPkg = {
  dependencies: {
    '@linxin666/dsh-mock-plugin': 'workspace:*',
    '@deepseek-ai/dsh-base': '0.1.1',
    'mock-builtin-bundle': '1.0.0',
  },
}
const mockDesktopProfile = `
export const BUILTIN_BUNDLES = ['@deepseek-ai/dsh-base', 'mock-builtin-bundle']
export const AGGREGATED_BUNDLES = ['@linxin666/dsh-mock-plugin']
export const BUILTIN_SKIN_IDS = ['mock-theme']
`

test('validates complete baseline successfully', () => {
  const { errors } = validateFeatureBaseline(
    mockBaseline,
    mockAggregate,
    mockCordisPatch,
    mockAggregatePkg,
    mockDesktopPkg,
    mockDesktopProfile,
    () => true
  )
  assert.equal(errors.length, 0)
})

test('detects missing plugin directory', () => {
  const { errors } = validateFeatureBaseline(
    mockBaseline,
    mockAggregate,
    mockCordisPatch,
    mockAggregatePkg,
    mockDesktopPkg,
    mockDesktopProfile,
    (path) => !path.includes('packages/dsh-mock-plugin')
  )
  assert.ok(errors.some((e) => e.includes('[PLUGIN REMOVED]')))
})

test('detects missing plugin in aggregate manifest', () => {
  const emptyAggregate = { patchFrom: [], deps: [] }
  const { errors } = validateFeatureBaseline(
    mockBaseline,
    emptyAggregate,
    mockCordisPatch,
    mockAggregatePkg,
    mockDesktopPkg,
    mockDesktopProfile,
    () => true
  )
  assert.ok(errors.some((e) => e.includes('[AGGREGATE DRIFT]')))
})

test('detects missing cordis patch row', () => {
  const { errors } = validateFeatureBaseline(
    mockBaseline,
    mockAggregate,
    '# empty patch',
    mockAggregatePkg,
    mockDesktopPkg,
    mockDesktopProfile,
    () => true
  )
  assert.ok(errors.some((e) => e.includes('[PATCH MISSING]')))
})

test('detects removed dependency in aggregate package.json', () => {
  const emptyAggregatePkg = { dependencies: {} }
  const { errors } = validateFeatureBaseline(
    mockBaseline,
    mockAggregate,
    mockCordisPatch,
    emptyAggregatePkg,
    mockDesktopPkg,
    mockDesktopProfile,
    () => true
  )
  assert.ok(errors.some((e) => e.includes('[AGGREGATE DEP MISSING]')))
})

test('detects removed dependency in desktop package.json', () => {
  const emptyDesktopPkg = { dependencies: {} }
  const { errors } = validateFeatureBaseline(
    mockBaseline,
    mockAggregate,
    mockCordisPatch,
    mockAggregatePkg,
    emptyDesktopPkg,
    mockDesktopProfile,
    () => true
  )
  assert.ok(errors.some((e) => e.includes('[DESKTOP DEPENDENCY REMOVED]')))
})

test('detects removed builtin bundle in profile.mjs', () => {
  const profileWithoutBuiltin = `
export const BUILTIN_BUNDLES = ['@deepseek-ai/dsh-base']
export const AGGREGATED_BUNDLES = ['@linxin666/dsh-mock-plugin']
export const BUILTIN_SKIN_IDS = ['mock-theme']
`
  const { errors } = validateFeatureBaseline(
    mockBaseline,
    mockAggregate,
    mockCordisPatch,
    mockAggregatePkg,
    mockDesktopPkg,
    profileWithoutBuiltin,
    () => true
  )
  assert.ok(errors.some((e) => e.includes('[DESKTOP BUILTIN MISSING]')))
})

test('detects missing surface e2e test script', () => {
  const { errors } = validateFeatureBaseline(
    mockBaseline,
    mockAggregate,
    mockCordisPatch,
    mockAggregatePkg,
    mockDesktopPkg,
    mockDesktopProfile,
    (path) => !path.includes('mock-e2e.mjs')
  )
  assert.ok(errors.some((e) => e.includes('[E2E VERIFICATION SCRIPT MISSING]')))
})

test('detects missing theme skin in catalog', () => {
  const profileWithoutSkin = `
export const BUILTIN_BUNDLES = ['@deepseek-ai/dsh-base', 'mock-builtin-bundle']
export const AGGREGATED_BUNDLES = ['@linxin666/dsh-mock-plugin']
export const BUILTIN_SKIN_IDS = []
`
  const { errors } = validateFeatureBaseline(
    mockBaseline,
    mockAggregate,
    mockCordisPatch,
    mockAggregatePkg,
    mockDesktopPkg,
    profileWithoutSkin,
    () => true
  )
  assert.ok(errors.some((e) => e.includes('[THEME SKIN MISSING]')))
})