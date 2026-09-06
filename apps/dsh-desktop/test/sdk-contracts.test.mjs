import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'

const appRequire = createRequire(new URL('../package.json', import.meta.url))
const webAppManifest = appRequire.resolve('@deepseek-ai/dsh-web-app/package.json')
const webAppRequire = createRequire(webAppManifest)

function resolveManifest(name, resolver = appRequire) {
  return resolver.resolve(`${name}/package.json`)
}

async function readPackageFile(manifest, relativePath) {
  return readFile(join(dirname(manifest), relativePath), 'utf8')
}

test('public SystemPrompt contract supports section and variable assembly', async () => {
  const manifest = resolveManifest('@deepseek-ai/dsh-system-prompt', webAppRequire)
  const types = await readPackageFile(manifest, 'lib/types/index.d.ts')

  assert.match(types, /interface AssembleContext/u)
  assert.match(types, /interface PromptSection/u)
  assert.match(types, /section\(section: PromptSection\): \(\) => void/u)
  assert.match(types, /variable\(name: string, provider: \(context: AssembleContext\)/u)
  assert.match(types, /assemble\(context\?: AssembleContext\): Promise<PromptAssembly>/u)
  assert.match(types, /sections: AssembledSection\[\]/u)
  assert.match(types, /variables: Record<string, string \| undefined>/u)
})

test('public Agent contract exposes scoped lifecycle hooks and session identity', async () => {
  const manifest = resolveManifest('@deepseek-ai/dsh-agent')
  const types = await readPackageFile(manifest, 'lib/types/runtime-types.d.ts')

  assert.match(types, /readonly id: SessionId/u)
  assert.match(types, /readonly session: Session/u)
  for (const event of ['agent/session-start', 'agent/pre-step', 'agent/request', 'agent/turn-stopping']) {
    assert.match(types, new RegExp(`['"]${event.replace('/', '\\/')}['"]`, 'u'))
  }
  assert.match(types, /Promise<LlmCallConfig>/u)
})

test('public model selection and slot contracts support one shared session directory', async () => {
  const modelManifest = resolveManifest('@deepseek-ai/dsh-client-ui-model-selection', webAppRequire)
  const slotManifest = resolveManifest('@deepseek-ai/dsh-client-ui-slots', webAppRequire)
  const selectionTypes = await readPackageFile(modelManifest, 'lib/types/client/slots.d.ts')
    + await readPackageFile(modelManifest, 'lib/types/client/service.d.ts')
    + await readPackageFile(modelManifest, 'lib/types/client/directory.d.ts')
  const selectionClient = await readPackageFile(modelManifest, 'lib/client.js')
  const slotTypes = await readPackageFile(slotManifest, 'lib/types/index.d.ts')

  assert.match(selectionTypes, /interface ModelSelectInjected/u)
  assert.match(selectionTypes, /ModelDirectoryState/u)
  assert.match(selectionTypes, /directoryFor\(sessionId: SessionId\)/u)
  assert.match(selectionTypes, /conversation\.input\.model/u)
  assert.match(selectionClient, /slots\.inject\("conversation\.input\.model"/u)
  assert.match(slotTypes, /priority\?: number/u)
  assert.match(slotTypes, /same-priority second registration throws/u)
})

test('public command and atomic-write contracts support the planned seams', async () => {
  const commandManifest = resolveManifest('@deepseek-ai/dsh-client-ui-commands', webAppRequire)
  const commandTypes = await readPackageFile(commandManifest, 'lib/types/client/contract.d.ts')
  const commandClient = await readPackageFile(commandManifest, 'lib/client.js')
  const atomicManifest = resolveManifest('@deepseek-ai/dsh-atomic-write')
  const atomicTypes = await readPackageFile(atomicManifest, 'lib/types/index.d.ts')

  assert.match(commandTypes, /interface CommandDecoration/u)
  assert.match(commandTypes, /decorate\(decoration: CommandDecoration\): \(\) => void/u)
  assert.match(commandClient, /decorate\(decoration\)/u)
  assert.match(atomicTypes, /function writeFileAtomic\(filename: string, content: string/u)
  assert.match(atomicTypes, /function withFileLock<T>\(filename: string/u)
  assert.match(atomicTypes, /dirMode\?: number/u)
})
