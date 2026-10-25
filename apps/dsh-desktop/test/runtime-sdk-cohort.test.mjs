import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { parse } from 'yaml'

const root = resolve(import.meta.dirname, '../../..')
const readJson = path => JSON.parse(readFileSync(join(root, path), 'utf8'))
const desktop = readJson('apps/dsh-desktop/package.json')
const version = desktop.dependencies['@deepseek-ai/dsh']
const workspace = parse(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'))

test('Desktop and workspace builds use one exact official DSH SDK cohort', () => {
  assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u)
  const manifests = ['apps/dsh-desktop/package.json', 'shared/package.json']
  for (const directory of ['packages', 'packages/skins']) {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== 'skins') manifests.push(`${directory}/${entry.name}/package.json`)
    }
  }
  for (const path of manifests) {
    const manifest = readJson(path)
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, selected] of Object.entries(manifest[section] ?? {})) {
        if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
          assert.equal(selected, version, `${path}: ${section}.${name}`)
        }
        if (name === '@deepseek-ai/schemastery') {
          assert.equal(selected, workspace.overrides[name], `${path}: ${section}.${name}`)
        }
      }
    }
  }
  assert.equal(readJson('apps/dsh-desktop/runtime-support/builtin-plugin-adaptation.json').runtimeVersion, version)
})

test('runtime identity overrides match the reviewed official SDK cohort', () => {
  assert.equal(workspace.overrides['@deepseek-ai/dsh-client-ui-theme'], version)
  assert.match(workspace.overrides['@deepseek-ai/schemastery'], /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u)
  const store = workspace.packageExtensions[`@deepseek-ai/dsh-client-store@${version}`]
  assert.ok(store.dependencies.immer)
  assert.ok(store.dependencies.zustand)
  const primitives = workspace.packageExtensions[`@deepseek-ai/dsh-client-ui-primitives@${version}`]
  for (const name of ['@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-util-code-language', '@deepseek-ai/dsh-util-workspace-path']) {
    assert.equal(primitives.dependencies[name], version, name)
  }
  for (const name of ['@shikijs/langs', 'shiki', 'katex', 'diff']) assert.ok(primitives.dependencies[name], name)
})
