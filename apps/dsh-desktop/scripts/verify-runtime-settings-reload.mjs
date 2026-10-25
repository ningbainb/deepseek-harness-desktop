import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseDocument } from 'yaml'

const APP_DIRECTORY = resolve(import.meta.dirname, '..')
const RPC_TIMEOUT_MS = 15_000
const EVENTS_TIMEOUT_MS = 15_000
const RELOAD_ERROR = /profile reload requires the root Include entry|config(?:uration)? reload[^\n]*failed|failed[^\n]*(?:root Include|config(?:uration)? reload)|configuration entry (?:changed during reload|is no longer available)|configuration plugin is no longer active/iu

export function parseSettingsReloadArguments(argv) {
  const options = { help: false, resources: undefined, executable: process.execPath }
  for (const argument of argv) {
    if (argument === '--help') options.help = true
    else if (argument.startsWith('--resources=') && argument.slice(12)) options.resources = resolve(argument.slice(12))
    else if (argument.startsWith('--executable=') && argument.slice(13)) options.executable = resolve(argument.slice(13))
    else throw new TypeError(`Unknown settings reload argument: ${argument}`)
  }
  return options
}

export function createSettingsRpcRequest(method, args = {}, rpcId = randomUUID()) {
  assert.ok(['settings/describe', 'settings/update', 'settings/mutate'].includes(method), 'Only settings configuration RPCs are allowed')
  return { type: 'client-request', rpcId, method, payload: { args } }
}

export function settingsNamespace(document, ns) {
  assert.equal(document.writable, true, 'The isolated profile must be writable')
  assert.equal(document.hasDocument, true, 'The SDK profile document must be present')
  const namespace = document.namespaces.find(entry => entry.ns === ns)
  assert.ok(namespace, `Missing real SDK settings namespace: ${ns}`)
  assert.equal(namespace.applies, 'live')
  assert.ok(Number.isInteger(namespace.revision))
  return namespace
}

export function createSettingsProvider(providerId, baseURL) {
  const url = new URL(baseURL)
  assert.equal(url.protocol, 'http:')
  assert.equal(url.hostname, '127.0.0.1', 'The verification provider must not address an online model service')
  return {
    providers: {
      [providerId]: {
        displayName: 'Settings Reload Verification',
        api: 'openai-completions',
        baseURL: url.href,
        models: ['reload-model-a', 'reload-model-b'].map(id => ({
          id,
          name: id,
          contextWindow: 32_768,
          maxTokens: 4_096,
        })),
      },
    },
  }
}

export function assertSettingsEventsReady(item) {
  assert.equal(item.done, false)
  assert.equal(item.value.type, 'ready')
  assert.equal(typeof item.value.clientId, 'string')
  assert.ok(item.value.clientId.length > 0)
  assert.equal(item.value.host.home, homedir())
}

export function assertNoRootIncludeReloadErrors(diagnostics) {
  const failures = diagnostics.filter(line => RELOAD_ERROR.test(line))
  assert.deepEqual(failures, [], 'Root Include configuration reload failed')
}

export function assertDesktopHmrGraph(graph) {
  assert.ok(Array.isArray(graph?.entries), 'The real module graph must contain entries')
  assert.equal(graph.entries.filter(entry => entry.id === '@linxin666/dsh-desktop-client-hmr').length, 1,
    'The module graph must retain exactly one asynchronous Desktop HMR owner')
  assert.equal(graph.entries.filter(entry => entry.id === '@deepseek-ai/dsh-client-hmr').length, 0,
    'A profile refresh must not restore the synchronous official HMR owner')
}

async function verifyDesktopHmrGraph(controller) {
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(new Error('Desktop HMR graph readiness timed out')), EVENTS_TIMEOUT_MS)
  let reader
  try {
    const response = await controller.fetch('http://dsh.internal/plugins/events', { signal: abort.signal })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /^text\/event-stream/u)
    assert.ok(response.body, 'The real HMR route must expose its event stream')
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let bytes = 0
    while (true) {
      const item = await reader.read()
      assert.equal(item.done, false, 'The HMR route ended before delivering its initial graph')
      bytes += item.value.byteLength
      assert.ok(bytes <= 1_048_576, 'The initial HMR graph exceeded the bounded event budget')
      buffer = (buffer + decoder.decode(item.value, { stream: true })).replaceAll('\r\n', '\n')
      let end
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (!data) continue
        const event = JSON.parse(data)
        assert.equal(event.type, 'graph', 'The first HMR data event must describe the actual module graph')
        assertDesktopHmrGraph(event.graph)
        return
      }
    }
  } finally {
    clearTimeout(timeout)
    abort.abort(new Error('Desktop HMR graph verification complete'))
    await reader?.cancel().catch(() => {})
    reader?.releaseLock()
  }
}

export function persistedSettingsConfig(contents, ns) {
  const document = parseDocument(contents)
  assert.equal(document.errors.length, 0, 'The persisted profile patch must remain valid YAML')
  const rows = document.toJS()
  assert.ok(Array.isArray(rows), 'The SDK must persist a profile patch list')
  const visit = entries => {
    for (const entry of entries) {
      if (entry.id === ns) return entry.config
      const nested = Array.isArray(entry.insert) ? entry.insert : entry.group && Array.isArray(entry.config) ? entry.config : []
      const found = visit(nested)
      if (found !== undefined) return found
    }
    return undefined
  }
  const config = visit(rows)
  assert.ok(config !== undefined, `Missing persisted configuration for ${ns}`)
  return config
}

async function settingsRpc(controller, method, args) {
  const request = createSettingsRpcRequest(method, args)
  const response = await controller.fetch(`http://dsh.internal/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  })
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}`)
  const envelope = await response.json()
  assert.equal(envelope.type, 'server-response')
  assert.equal(envelope.rpcId, request.rpcId)
  assert.equal(envelope.result.ok, true, `${method}: ${JSON.stringify(envelope.result)}`)
  return envelope.result.value
}

async function verifyEventsReady(controller) {
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(new Error('Settings reload $events readiness timed out')), EVENTS_TIMEOUT_MS)
  const stream = controller.openDuplex('$events', { args: {} }, abort.signal)
  const iterator = stream[Symbol.asyncIterator]()
  try {
    await stream.close()
    assertSettingsEventsReady(await iterator.next())
  } finally {
    clearTimeout(timeout)
    abort.abort(new Error('Settings reload $events readiness complete'))
    await iterator.return()
  }
}

async function updateSettings(controller, diagnostics, ns, patch) {
  const before = settingsNamespace(await settingsRpc(controller, 'settings/describe'), ns)
  const updated = await settingsRpc(controller, 'settings/update', { ns, patch, expectedRevision: before.revision })
  assert.equal(updated.ns, ns)
  assert.equal(updated.applies, 'live')
  assert.ok(updated.revision > before.revision, `${ns}: the live configuration revision did not advance`)
  assertNoRootIncludeReloadErrors(diagnostics)
  const readback = settingsNamespace(await settingsRpc(controller, 'settings/describe'), ns)
  assert.deepEqual(readback.value, updated.value)
  return readback
}

export async function runRuntimeSettingsReload(options = parseSettingsReloadArguments([])) {
  const appRoot = options.resources === undefined ? APP_DIRECTORY : join(options.resources, 'app.asar.unpacked')
  const controllerModule = await import(pathToFileURL(join(appRoot, 'src', 'runtime-controller.mjs')).href)
  const profileModule = await import(pathToFileURL(join(appRoot, 'src', 'profile.mjs')).href)
  const extensionIpcModule = await import(pathToFileURL(join(appRoot, 'src', 'extension-ipc.mjs')).href)
  const root = await mkdtemp(join(tmpdir(), 'dsh-runtime-settings-reload-'))
  const dshHome = join(root, 'community-home')
  const diagnostics = []
  const providerRequests = []
  const providerId = `settings-reload-${randomUUID().replaceAll('-', '')}`
  const rejectedProvider = createServer((request, response) => {
    providerRequests.push({ method: request.method, url: request.url })
    response.writeHead(503, { 'content-type': 'text/plain' })
    response.end('Model requests are forbidden in configuration verification')
  })
  let controller
  let unregisterExtensionIpc
  let stage = 'prepare'
  try {
    await new Promise((fulfill, reject) => {
      rejectedProvider.once('error', reject)
      rejectedProvider.listen(0, '127.0.0.1', fulfill)
    })
    const baseURL = `http://127.0.0.1:${rejectedProvider.address().port}/v1/`
    const providerPatch = createSettingsProvider(providerId, baseURL)
    const anchor = join(appRoot, 'package.json')
    const resolutionStarted = performance.now()
    const packageRoots = profileModule.resolveRuntimePackages(undefined, anchor)
    const packageResolutionMs = Math.round(performance.now() - resolutionStarted)
    const preparationStarted = performance.now()
    await profileModule.ensureDesktopProfile({ dshHome, packageRoots })
    const profilePreparationMs = Math.round(performance.now() - preparationStarted)
    const overlay = options.resources === undefined
      ? join(APP_DIRECTORY, 'runtime-support', 'desktop-pipe.patch.yml')
      : join(options.resources, 'runtime-support', 'desktop-pipe.patch.yml')
    controller = new controllerModule.DshRuntimeController({
      cliPath: profileModule.resolveDshCliPath(anchor),
      cwd: appRoot,
      dshHome,
      executable: options.executable,
      transport: 'pipe',
      patchFiles: [overlay],
      shutdownTimeoutMs: 15_000,
      autoRestart: false,
      environmentProvider: () => ({ DSH_AGENTS_HOME: join(root, 'agents-home'), DSH_TELEMETRY_DISABLED: '1' }),
      logStore: { append: async line => diagnostics.push(String(line)) },
    })
    stage = 'initial-boot'
    assert.equal(await controller.start(), controllerModule.DESKTOP_PIPE_RUNTIME_URL)
    await verifyEventsReady(controller)
    stage = 'initial-hmr-owner'
    await verifyDesktopHmrGraph(controller)
    stage = 'hmr-live-setting'
    assert.equal((await updateSettings(controller, diagnostics, 'client-hmr', { pollIntervalMs: 1250 })).value.pollIntervalMs, 1250)
    await verifyDesktopHmrGraph(controller)
    const profilePatch = join(dshHome, 'profiles', 'desktop', 'cordis.patch.yml')
    const rootIncludePath = join(dshHome, 'profiles', 'desktop', 'cordis.yml')
    const rootInclude = await readFile(rootIncludePath, 'utf8')
    assert.deepEqual(parseDocument(rootInclude).toJS(), [])
    stage = 'provider-update'
    const provider = await updateSettings(controller, diagnostics, 'llm-pi-ai', providerPatch)
    assert.equal(provider.value.providers[providerId].baseURL, baseURL)
    assert.deepEqual(provider.value.providers[providerId].models.map(model => model.id), ['reload-model-a', 'reload-model-b'])
    stage = 'capability-mutation-and-bridge-readback'
    const updatedCapability = await settingsRpc(controller, 'settings/mutate', {
      ns: 'llm-pi-ai', expectedRevision: provider.revision,
      ops: [{ op: 'set', path: ['providers', providerId, 'models', '0', 'input'], value: ['text', 'image'] }],
    })
    assert.ok(updatedCapability.revision > provider.revision)
    assert.deepEqual(updatedCapability.value.providers[providerId].models[0].input, ['text', 'image'])
    assert.deepEqual(updatedCapability.user.providers[providerId].models[0].input, ['text', 'image'])
    const capabilityReadback = settingsNamespace(await settingsRpc(controller, 'settings/describe'), 'llm-pi-ai')
    assert.deepEqual(capabilityReadback.value, updatedCapability.value)
    const bridgeResponse = await controller.fetch('http://dsh.internal/api/dsh-web-ui-settings/describe', {
      method: 'POST', signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    })
    assert.equal(bridgeResponse.status, 200)
    const bridge = await bridgeResponse.json()
    assert.equal(bridge.ok, true)
    const bridgeCapability = bridge.value.namespaces.find(entry => entry.ns === 'llm-pi-ai')
    assert.ok(bridgeCapability, 'The compatibility bridge must expose the same live model namespace')
    for (const field of ['value', 'user', 'revision']) assert.deepEqual(bridgeCapability[field], capabilityReadback[field])
    assertNoRootIncludeReloadErrors(diagnostics)
    stage = 'default-model-update'
    const initialSelection = { provider: providerId, model: 'reload-model-a' }
    const nextSelection = { provider: providerId, model: 'reload-model-b' }
    assert.deepEqual((await updateSettings(controller, diagnostics, 'agent-default-model', initialSelection)).value, initialSelection)
    assert.deepEqual((await updateSettings(controller, diagnostics, 'agent-default-model', nextSelection)).value, nextSelection)
    await verifyEventsReady(controller)
    stage = 'community-launcher-live-config'
    for (const enabled of [false, true, false]) {
      const community = await updateSettings(controller, diagnostics, 'web-ui-community-plugins', { enabled })
      assert.equal(community.value.enabled, enabled)
      const launcher = await updateSettings(controller, diagnostics, 'web-ui-desktop-launcher', { enabled })
      assert.equal(launcher.value.enabled, enabled)
      const shutdownRoute = await controller.fetch('http://dsh.internal/api/dsh-desktop-launcher/shutdown')
      assert.equal(shutdownRoute.status, enabled ? 405 : 404, 'Launcher route availability must follow the accepted live setting without invoking shutdown')
    }
    const saved = await readFile(profilePatch, 'utf8')
    assert.equal(persistedSettingsConfig(saved, 'client-hmr').pollIntervalMs, 1250)
    await verifyDesktopHmrGraph(controller)
    assert.deepEqual(persistedSettingsConfig(saved, 'agent-default-model'), nextSelection)
    assert.equal(persistedSettingsConfig(saved, 'llm-pi-ai').providers[providerId].baseURL, baseURL)
    assert.equal(persistedSettingsConfig(saved, 'web-ui-community-plugins').enabled, false)
    assert.equal(persistedSettingsConfig(saved, 'web-ui-desktop-launcher').enabled, false)
    assert.equal(await readFile(rootIncludePath, 'utf8'), rootInclude)
    stage = 'restart'
    assert.equal(await controller.restart(), controllerModule.DESKTOP_PIPE_RUNTIME_URL)
    await verifyEventsReady(controller)
    const restarted = await settingsRpc(controller, 'settings/describe')
    assert.equal(settingsNamespace(restarted, 'client-hmr').value.pollIntervalMs, 1250)
    await verifyDesktopHmrGraph(controller)
    assert.deepEqual(settingsNamespace(restarted, 'agent-default-model').value, nextSelection)
    const restartedProvider = settingsNamespace(restarted, 'llm-pi-ai').value.providers[providerId]
    assert.equal(restartedProvider.baseURL, baseURL)
    assert.deepEqual(restartedProvider.models.map(model => model.id), ['reload-model-a', 'reload-model-b'])
    assert.deepEqual(restartedProvider.models[0].input, ['text', 'image'])
    assert.deepEqual(persistedSettingsConfig(await readFile(profilePatch, 'utf8'), 'agent-default-model'), nextSelection)
    assert.equal(settingsNamespace(restarted, 'web-ui-community-plugins').value.enabled, false)
    assert.equal(settingsNamespace(restarted, 'web-ui-desktop-launcher').value.enabled, false)
    assert.equal((await controller.fetch('http://dsh.internal/api/dsh-desktop-launcher/shutdown')).status, 404)
    for (const ns of ['web-ui-community-plugins', 'web-ui-desktop-launcher']) {
      assert.equal((await updateSettings(controller, diagnostics, ns, { enabled: true })).value.enabled, true)
    }
    assert.equal((await controller.fetch('http://dsh.internal/api/dsh-desktop-launcher/shutdown')).status, 405)
    stage = 'profile-environment-repair'
    const patchBeforeRepair = await readFile(profilePatch, 'utf8')
    const handlers = new Map()
    const ipcMain = { surfaceRegistry: { assert: () => 'extensions' },
      removeHandler: channel => handlers.delete(channel),
      handle: (channel, handler) => handlers.set(channel, handler) }
    const qqBotBinding = new EventEmitter()
    qqBotBinding.status = () => ({ bound: false })
    unregisterExtensionIpc = extensionIpcModule.registerExtensionIpc({
      ipcMain, dialog: {}, shell: {}, getWindow: () => undefined,
      pluginManager: { inventory: async () => ({ plugins: [], skills: [] }) }, controller,
      ensureProfile: () => profileModule.ensureDesktopProfile({ dshHome, packageRoots }),
      projectRoot: root, dshHome, qqBotBinding,
    })
    const reset = await handlers.get('extensions:profile-reset')({ sender: {} })
    assert.equal(reset.reset, true)
    assert.equal(await readFile(join(reset.backupDirectory, 'cordis.patch.yml'), 'utf8'), patchBeforeRepair)
    await verifyEventsReady(controller)
    const repaired = await settingsRpc(controller, 'settings/describe')
    assert.equal(settingsNamespace(repaired, 'client-hmr').value.pollIntervalMs, 1250)
    await verifyDesktopHmrGraph(controller)
    assert.deepEqual(settingsNamespace(repaired, 'llm-pi-ai').value.providers[providerId], restartedProvider)
    assert.deepEqual(settingsNamespace(repaired, 'agent-default-model').value, nextSelection)
    assert.deepEqual(persistedSettingsConfig(await readFile(profilePatch, 'utf8'), 'llm-pi-ai'), persistedSettingsConfig(patchBeforeRepair, 'llm-pi-ai'))
    for (const ns of ['web-ui-community-plugins', 'web-ui-desktop-launcher']) assert.equal(settingsNamespace(repaired, ns).value.enabled, true)
    assertNoRootIncludeReloadErrors(diagnostics)
    assert.deepEqual(providerRequests, [], 'Configuration verification must not request model inference or catalog endpoints')
    return {
      transport: 'pipe',
      sdkSettingsRpc: true,
      sdkCapabilityMutation: true,
      bridgeMatchesOfficialSettings: true,
      profileReload: true,
      desktopHmrGraphChecks: 5,
      desktopHmrPollIntervalPersisted: true,
      rootIncludeReloadErrors: 0,
      eventsReadyChecks: 4,
      profileResetPreservedNewProvider: true,
      profileResetPreservedDefaultModel: true,
      restartPersisted: true,
      communityAndLauncherPersisted: true,
      launcherLiveRouteToggling: true,
      modelRequests: 0,
      packageCount: packageRoots.size,
      packageResolutionMs,
      profilePreparationMs,
      runtimeStartup: diagnostics.filter(line => line.includes('[runtime-startup]')),
    }
  } catch (error) {
    console.error(`Runtime settings reload failed at ${stage}:\n${diagnostics.slice(-120).join('\n') || '(no runtime diagnostics)'}`)
    throw error
  } finally {
    await unregisterExtensionIpc?.()
    try {
      await controller?.stop()
      assert.deepEqual(providerRequests, [], 'The complete Runtime lifecycle must not call the verification model provider')
    } finally {
      if (rejectedProvider.listening) await new Promise((fulfill, reject) => rejectedProvider.close(error => error ? reject(error) : fulfill()))
      if (process.env.DSH_DESKTOP_KEEP_TEST_HOME === '1') {
        await mkdir(join(root, 'logs'), { recursive: true })
        await writeFile(join(root, 'logs', 'runtime.log'), `${diagnostics.join('\n')}\n`)
        console.error(`Retained runtime settings reload fixture: ${root}`)
      } else await rm(root, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseSettingsReloadArguments(process.argv.slice(2))
  if (options.help) console.log('Usage: node scripts/verify-runtime-settings-reload.mjs [--resources=PATH] [--executable=PATH]\nRuns real isolated SDK settings RPC over the controller pipe, reloads the profile, verifies $events readiness, then restarts without model requests. Run only when no other heavy Runtime verification is active.')
  else console.log(JSON.stringify(await runRuntimeSettingsReload(options)))
}
