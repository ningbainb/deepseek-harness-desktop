import assert from 'node:assert/strict'
import test from 'node:test'
import { parse, parseDocument } from 'yaml'
import { DESKTOP_PATCH_CONFIG, DESKTOP_PATCH_START, DESKTOP_PATCH_END, mergeDesktopPatch } from '../src/profile.mjs'
import { mergeQqBotPatch, QQBOT_PATCH_START, QQBOT_PATCH_END, readQqBotPatchEnabled } from '../src/extensions/qqbot.mjs'

const bootstrap = () => mergeQqBotPatch(DESKTOP_PATCH_CONFIG, false)
const rebuild = patch => mergeQqBotPatch(mergeDesktopPatch(patch), readQqBotPatchEnabled(patch) ?? false)

test('SDK YAML serialization preserves accepted preferences even inside managed comment boundaries', () => {
  const document = parseDocument(bootstrap())
  const preference = { id: 'personal-prompt', name: '@ningbainb/dsh-personal-prompt', config: {
    enabled: true, profiles: [{ id: 'synthetic-prompt', name: 'Packaged Prompt', content: 'Synthetic preference', enabled: true, scope: 'global', updatedAt: 1 }],
  } }
  document.add(document.createNode(preference))
  const saved = String(document)
  assert.ok(saved.indexOf('personal-prompt') < saved.indexOf(QQBOT_PATCH_END))
  assert.deepEqual(parse(rebuild(saved)).find(row => row.id === preference.id), preference)
  assert.equal(rebuild(rebuild(saved)), rebuild(saved))
})

test('SDK in-place provider and retry configuration edits survive repeated startup reconciliation', () => {
  const document = parseDocument(bootstrap())
  const index = document.contents.items.findIndex((_item, position) => document.getIn([position, 'id']) === 'llm-pi-ai')
  const providers = { 'synthetic-relay': { baseURL: 'http://127.0.0.1:12345/v1', apiKeyEnv: 'SYNTHETIC_ONLY_KEY', models: [{ id: 'synthetic-model' }] } }
  document.setIn([index, 'config', 'providers'], document.createNode(providers))
  const retryIndex = document.contents.items.findIndex((_item, position) => document.getIn([position, 'id']) === 'llm-deepseek')
  document.setIn([retryIndex, 'config', 'retryPolicy', 'maxRetries'], 9)
  const saved = String(document)
  const rebuilt = parse(rebuild(saved))
  assert.deepEqual(rebuilt.find(row => row.id === 'llm-pi-ai').config.providers, providers)
  assert.equal(rebuilt.find(row => row.id === 'llm-deepseek').config.retryPolicy.maxRetries, 9)
  assert.equal(rebuilt.filter(row => row.id === 'llm-pi-ai').length, 1)
  assert.equal(rebuild(rebuild(saved)), rebuild(saved))
})

test('managed inserts preserve changed and additional children without double mounting', () => {
  const document = parseDocument(bootstrap())
  const index = document.contents.items.findIndex((_item, position) => document.getIn([position, 'insert', 0, 'id']) === 'directory-picker-desktop-host')
  document.setIn([index, 'insert', 0, 'config'], document.createNode({ synthetic: true }))
  document.addIn([index, 'insert'], document.createNode({ id: 'user-insert', name: '@example/synthetic' }))
  const saved = String(document)
  const inserts = parse(rebuild(saved)).flatMap(row => row.insert ?? [])
  assert.equal(inserts.filter(row => row.id === 'directory-picker-desktop-host').length, 1)
  assert.deepEqual(inserts.find(row => row.id === 'directory-picker-desktop-host').config, { synthetic: true })
  assert.equal(inserts.filter(row => row.id === 'user-insert').length, 1)
  assert.equal(rebuild(rebuild(saved)), rebuild(saved))
})

test('QQ Bot switching preserves user options and unrelated disabled rows', () => {
  const document = parseDocument(bootstrap())
  const index = document.contents.items.findIndex((_item, position) => document.getIn([position, 'id']) === 'im-qqbot')
  document.setIn([index, 'config'], document.createNode({ synthetic: true }))
  document.add(document.createNode({ id: 'unrelated', disabled: true }))
  const saved = String(document)
  const enabled = mergeQqBotPatch(saved, true)
  assert.equal(readQqBotPatchEnabled(enabled), true)
  assert.deepEqual(parse(enabled).find(row => row.id === 'im-qqbot').config, { synthetic: true })
  assert.deepEqual(parse(enabled).find(row => row.id === 'unrelated'), { id: 'unrelated', disabled: true })
  const disabled = mergeQqBotPatch(enabled, false)
  assert.equal(readQqBotPatchEnabled(disabled), false)
  assert.equal(mergeQqBotPatch(disabled, false), disabled)
})

test('unknown rows, comments, and YAML tags survive reconciliation', () => {
  const saved = bootstrap().replace(QQBOT_PATCH_END, `- id: synthetic-tagged\n  config: !!map\n    value: synthetic\n  # user note\n${QQBOT_PATCH_END}`)
  const rebuilt = rebuild(saved)
  assert.match(rebuilt, /!!map/u)
  assert.match(rebuilt, /# user note/u)
  assert.deepEqual(parse(rebuilt).find(row => row.id === 'synthetic-tagged').config, { value: 'synthetic' })
  assert.equal(rebuild(rebuilt), rebuilt)
})

test('malformed, duplicate, or cross-boundary alias content fails closed', () => {
  const invalid = [
    bootstrap().replace(DESKTOP_PATCH_END, ''),
    bootstrap() + DESKTOP_PATCH_START,
    bootstrap().replace(DESKTOP_PATCH_END, `- id: llm-pi-ai\n  config: {}\n${DESKTOP_PATCH_END}`),
    bootstrap().replace(QQBOT_PATCH_END, `- id: broken\n  config: [\n${QQBOT_PATCH_END}`),
    `- id: anchor\n  config: &external { value: synthetic }\n${bootstrap().replace(QQBOT_PATCH_END, `- id: alias\n  config: *external\n${QQBOT_PATCH_END}`)}`,
  ]
  for (const source of invalid) assert.throws(() => rebuild(source))
})
