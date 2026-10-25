import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, realpath, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { parse } from 'yaml'
import { resolveRuntimePackages } from '../src/profile.mjs'

const appRequire = createRequire(new URL('../package.json', import.meta.url))
const webAppManifest = appRequire.resolve('@deepseek-ai/dsh-web-app/package.json')
const webAppRequire = createRequire(webAppManifest)

test('every bundled custom persona validates against the installed official SDK', async () => {
  const baseRequire = createRequire(appRequire.resolve('@deepseek-ai/dsh-base/package.json'))
  const { Config } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-persona')).href)
  assert.throws(() => Config({ text: 'legacy persona' }), /prefix/u)
  const runtimePackages = resolveRuntimePackages()
  for (const id of ['liangshen', 'value-mode']) {
    for (const path of [new URL(`../../../packages/dsh-${id}/presets/${id}/agent.cordis.yml`, import.meta.url),
      join(runtimePackages.get(`@linxin666/dsh-${id}`), 'presets', id, 'agent.cordis.yml')]) {
      const rows = parse(await readFile(path, 'utf8'), {
        customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }],
      })
      const persona = rows.find(row => row.name === '@deepseek-ai/dsh-persona')
      assert.ok(persona, `${id} must retain its persona`)
      const validated = Config(persona.config)
      const base = 'You are a helpful software engineer assistant.'
      assert.ok(validated.prefix.startsWith(base), `${id} must retain the official Minimal persona base`)
      assert.equal(validated.prefix.split(base).length - 1, 1, `${id} must not duplicate the persona base`)
      if (id === 'liangshen' && typeof path === 'string') {
        assert.match(validated.prefix, /Thinking Disruption/u)
        assert.match(validated.prefix, /Action-Oriented/u)
      }
      assert.equal(validated.complete, false, `${id} must permit post-bootstrap instructions`)
    }
  }
})

test('shipped LiangShen keeps the upstream Minimal prompt, workspace line and official tool surface after compaction', async () => {
  const root = resolveRuntimePackages().get('@linxin666/dsh-liangshen')
  const { apply } = await import(pathToFileURL(join(root, 'presets/liangshen/minimal-prompt.mjs')).href)
  const prompt = await import(pathToFileURL(webAppRequire.resolve('@deepseek-ai/dsh-system-prompt')).href)
  const listeners = new Map()
  apply({ on: (name, listener) => listeners.set(name, listener) }, { shellTools: ['bash'],
    commonTools: ['str_replace_editor'], compactionTools: ['read'] })
  const session = { events: [], snapshotEvents() { return this.events }, header: { cwd: '/workspace' } }
  const agent = { session }
  const sections = [{ name: prompt.PERSONA_PREFIX_SECTION, text: 'Persona' },
    { name: 'plan:policy', text: 'Plan policy' },
    { name: 'tools:sdk', text: 'Official tool definitions' },
    { name: prompt.PERSONA_SUFFIX_SECTION, text: 'Suffix' }]
  const assembly = { sections, contexts: [{ name: 'workspace', text: '/workspace' }],
    tools: ['bash', 'str_replace_editor', 'read', 'extra'].map(name => ({ name })) }
  const assemble = () => listeners.get('system-prompt/assemble')(undefined, { agent }, async () => assembly)
  const first = await assemble()
  const anchoredPersona = { ...sections[0], text: 'Persona\n\nYour working directory is /workspace.' }
  assert.deepEqual(first.sections, [anchoredPersona, sections[1]])
  assert.deepEqual(first.tools, assembly.tools, 'the current official tool roster must not be staged or truncated')
  const ptc = await listeners.get('system-prompt/assemble')(undefined, { agent }, async () => ({
    ...assembly, tools: [{ name: 'run_code' }],
  }))
  assert.deepEqual(ptc.sections, [anchoredPersona, sections[1], sections[2]],
    'the official SDK definitions must remain when run_code is present')
  const hostInstruction = { role: 'user', content: [{ type: 'text', text: 'Host workspace instructions' }] }
  const decision = await listeners.get('agent/pre-step')({ agent, messages: [hostInstruction] },
    async () => ({ kind: 'enter', messages: [hostInstruction] }))
  assert.deepEqual(decision.messages, [hostInstruction], 'host-owned instructions must not be dropped or duplicated')
  await listeners.get('session/event')(session, { type: 'compaction/end' })
  const compacted = await assemble()
  assert.deepEqual(compacted.sections, [anchoredPersona, sections[1]])
  assert.deepEqual(compacted.tools, assembly.tools)
})

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
  const identityTypes = await readPackageFile(manifest, 'lib/types/types.d.ts')
  const runtimeTypes = await readPackageFile(manifest, 'lib/types/runtime-types.d.ts')

  assert.match(identityTypes, /readonly id: SessionId/u)
  assert.match(runtimeTypes, /interface Agent \{[\s\S]*readonly session: Session/u)
  for (const event of ['agent/created', 'agent/pre-step', 'agent/request', 'agent/turn-stopping']) {
    assert.match(runtimeTypes, new RegExp(`['"]${event.replace('/', '\\/')}['"]`, 'u'))
  }
  assert.match(runtimeTypes, /'agent\/created'[\s\S]*@mode serial/u)
  assert.match(runtimeTypes, /Promise<LlmCallConfig>/u)
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

test('public Workspace contract keeps path and Session cwd immutable during relocation', async () => {
  const workspaceManifest = resolveManifest('@deepseek-ai/dsh-workspace')
  const sessionManifest = resolveManifest('@deepseek-ai/dsh-session')
  const workspaceControllerManifest = resolveManifest('@deepseek-ai/dsh-api-workspace-controller')
  const workspaceTypes = await readPackageFile(workspaceManifest, 'lib/types/types.d.ts')
  const registryTypes = await readPackageFile(workspaceManifest, 'lib/types/index.d.ts')
  const sessionTypes = await readPackageFile(sessionManifest, 'lib/types/types.d.ts')
  const clientTypes = await readPackageFile(workspaceControllerManifest, 'lib/types/client/service.d.ts')

  assert.match(workspaceTypes, /readonly path: string/u)
  assert.match(workspaceTypes, /readonly sessionIds: readonly SessionId\[\]/u)
  assert.match(workspaceTypes, /attachSession\(sessionId: SessionId\): Promise<void>/u)
  assert.match(workspaceTypes, /status\(\): Promise<'ok' \| 'missing-dir'>/u)
  assert.match(sessionTypes, /readonly cwd\?: string/u)
  assert.doesNotMatch(registryTypes, /(?:setPath|movePath|relocate)\(/u)
  assert.doesNotMatch(clientTypes, /(?:setPath|movePath|relocate)\(/u)
  assert.match(registryTypes, /create\(path: string, title\?: string\): Promise<Workspace>/u)
  assert.match(clientTypes, /create\(input: \{[\s\S]*path: string;[\s\S]*\}\): Promise<WorkspaceView>/u)
})

test('official Workspace rejects mismatched cwd and retains existing missing-directory membership without relocating Session headers', async () => {
  const baseRequire = createRequire(appRequire.resolve('@deepseek-ai/dsh-base/package.json'))
  const load = name => import(pathToFileURL(baseRequire.resolve(name)))
  const { Context } = await load('@deepseek-ai/cordis')
  const { Storage } = await load('@deepseek-ai/dsh-storage')
  const storageJson = await load('@deepseek-ai/dsh-storage-json')
  const storageDomain = await load('@deepseek-ai/dsh-storage-domain')
  const persistence = await load('@deepseek-ai/dsh-session-persistence-jsonl')
  const { WorkspaceRegistry } = await import(pathToFileURL(appRequire.resolve('@deepseek-ai/dsh-workspace')))
  const { SessionId, SESSION_FORMAT_VERSION } = await load('@deepseek-ai/dsh-session')
  const temporaryRoot = resolve(await realpath(tmpdir()))
  const root = await mkdtemp(join(temporaryRoot, 'dsh-workspace-sdk-'))
  const ctx = new Context()
  try {
    const directory = join(root, 'workspace')
    const otherDirectory = join(root, 'other-workspace')
    await mkdir(directory)
    await mkdir(otherDirectory)
    await ctx.plugin(Storage)
    await ctx.plugin(storageJson, { root: join(root, 'storage') })
    await ctx.plugin(storageDomain, { backend: 'json' })
    await ctx.plugin(persistence, { root: join(root, 'sessions'), compression: 'zstd' })
    const registration = ctx.plugin(WorkspaceRegistry)
    await registration
    const canonicalPath = await realpath(directory)
    const cwd = `${directory}${sep}.`
    const workspace = await ctx.workspaceRegistry.create(cwd)
    const workspaceId = workspace.id
    assert.equal(workspace.path, canonicalPath)
    assert.equal(await workspace.status(), 'ok')
    assert.equal((await ctx.workspaceRegistry.create(canonicalPath)).id, workspaceId)
    const headers = [
      { id: SessionId('matching'), cwd },
      { id: SessionId('mismatched'), cwd: otherDirectory },
      { id: SessionId('no-cwd') },
      { id: SessionId('not-yet-attached'), cwd },
    ].map(header => ({ version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false, delegationDepth: 0, ...header }))
    for (const header of headers) {
      const handle = await ctx.sessionPersistence.create(header)
      try { await handle.flush() }
      finally { await handle.close() }
    }
    await workspace.attachSession(headers[0].id)
    assert.deepEqual(workspace.sessionIds, [headers[0].id])
    const updatedAt = workspace.updatedAt
    await assert.rejects(workspace.attachSession(headers[1].id), /cwd resolves to/u)
    await assert.rejects(workspace.attachSession(headers[2].id), /no cwd/u)
    await assert.rejects(workspace.attachSession(SessionId('unknown')))
    assert.deepEqual(workspace.sessionIds, [headers[0].id])
    assert.equal(workspace.updatedAt, updatedAt, 'refused attachments must not mutate the workspace')
    const sessionPath = ctx.sessionPersistence.locate(headers[0]).path
    const sessionBytes = await readFile(sessionPath)
    await rename(directory, join(root, 'moved-workspace'))
    assert.equal(await workspace.status(), 'missing-dir')
    assert.equal(workspace.path, canonicalPath)
    await registration.dispose()
    await ctx.plugin(WorkspaceRegistry)
    const reopened = ctx.workspaceRegistry.get(workspaceId)
    assert.ok(reopened)
    assert.equal(reopened.path, canonicalPath)
    assert.equal(await reopened.status(), 'missing-dir')
    assert.deepEqual(reopened.sessionIds, [headers[0].id], 'an existing missing-directory candidate must survive reopening')
    await assert.rejects(reopened.attachSession(headers[3].id), /does not resolve/u)
    await reopened.setTitle('Missing directory retained')
    assert.deepEqual(reopened.sessionIds, [headers[0].id], 'a mutation must not prune an existing missing-directory candidate')
    assert.equal(reopened.path, canonicalPath)
    const reader = await ctx.sessionPersistence.open(headers[0].id, 'read')
    try { assert.deepEqual(reader.header, headers[0], 'relocation must not rewrite the Session cwd') }
    finally { await reader.close() }
    assert.deepEqual(await readFile(sessionPath), sessionBytes, 'workspace mutations must not rewrite the Session log')
  } finally {
    try { await ctx.fiber.dispose() }
    finally {
      const absoluteRoot = resolve(await realpath(root))
      assert.equal(absoluteRoot, resolve(root))
      assert.equal(dirname(absoluteRoot), temporaryRoot)
      assert.ok(basename(absoluteRoot).startsWith('dsh-workspace-sdk-'))
      await rm(absoluteRoot, { recursive: true, force: true })
    }
  }
})
