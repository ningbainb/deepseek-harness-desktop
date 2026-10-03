import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { stringify } from 'yaml'

import {
  boot,
  composeEntries,
  createRuntimeResolution,
  installFailLoud,
  loadLayeredEnv,
  loadOptionalPatches,
  loadOverlayPatches,
  loadProfileDirectory,
  PluginPackages,
  prepareProfilePatches,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { installProxyFromEnvironment } from '@deepseek-ai/dsh-http-proxy'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import {
  createRuntimePipeServer,
  RUNTIME_PIPE_ADDRESS_ENV,
  RUNTIME_PIPE_GENERATION_ENV,
  RUNTIME_PIPE_READY_LINE,
  RUNTIME_PIPE_TOKEN_ENV,
} from './runtime-pipe.mjs'
import { mergeDesktopPipeCookies } from './runtime-cookie.mjs'
import { desktopLocalPath } from './desktop-remote-path.mjs'
import { consumeRuntimeShutdownControl, listenRuntimeShutdownControl } from './runtime-shutdown-control.mjs'
import { createRuntimeEventStreamDrain } from './runtime-stream-drain.mjs'
import { createRuntimeStartupTiming } from './runtime-startup-timing.mjs'
import { transportBootstrapScript } from './runtime-renderer-bootstrap.mjs'
import { createRuntimeAccountCallback } from './runtime-account-callback.mjs'
import { openDesktopWireStream } from './runtime-wire-stream.mjs'
import {
  adaptRuntimeLegacySettingsPatches,
  diagnoseRuntimeLegacySettingsHealth,
  prepareRuntimeLegacySettings,
} from './runtime-legacy-settings.mjs'

const NAME = 'dsh-desktop'
const PROFILE_ROOT_FILENAME = 'cordis.yml'
const PROFILE_ROOT_CONFIG = '# Electron-owned DSH profile root; composition is supplied as patch layers.\n[]\n'
const TELEMETRY_ROW_ID = 'session-telemetry-otel'
const require = createRequire(import.meta.url)
const defaultInstallAnchor = require.resolve('@deepseek-ai/dsh/package.json')

async function watchDesktopUserPatches(ctx, filename, rootConfig, compose) {
  const hmr = ctx.get('hmr')
  const loader = ctx.get('loader')
  if (!hmr || !loader) throw new Error('live desktop patch reload requires HMR and Loader')
  const rootUrl = pathToFileURL(rootConfig).href
  const entry = [...loader.entries()].find(candidate =>
    candidate.options.name === 'cordis:include' && candidate.options.config?.path === rootUrl)
  if (!entry) throw new Error('live desktop patch reload could not find the root Include entry')
  return hmr.registerConfig(filename, async () => {
    const patches = prepareProfilePatches(ctx, compose(), pathToFileURL(dirname(rootConfig)).href + '/', NAME)
    const { patches: _oldPatches, ...config } = entry.options.config
    await entry.update({ config: { ...config, patches } })
  })
}

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
})

function runtimePipeIdentityFromEnvironment(environment = process.env) {
  const address = environment[RUNTIME_PIPE_ADDRESS_ENV]
  if (address === undefined || address === '') return undefined
  return {
    address,
    token: environment[RUNTIME_PIPE_TOKEN_ENV],
    generation: environment[RUNTIME_PIPE_GENERATION_ENV],
  }
}

function resolveFrontendDist() {
  const webAppRequire = createRequire(require.resolve('@deepseek-ai/dsh-web-app/package.json'))
  return join(dirname(webAppRequire.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist')
}

function safeFrontendPath(dist, pathname) {
  let decoded
  try { decoded = decodeURIComponent(pathname) } catch { return undefined }
  const candidate = resolve(dist, `.${decoded}`)
  const within = candidate === dist || (!relative(dist, candidate).startsWith(`..${sep}`) && relative(dist, candidate) !== '..')
  return within ? candidate : undefined
}

function createDesktopPipeFetch(ctx, accountCallbackOrigin) {
  const api = ctx.connection.createSharedFetchHandler('/api')
  const dist = resolveFrontendDist()
  const indexPath = join(dist, 'index.html')
  let sessionCookiePromise
  const sessionCookie = () => {
    sessionCookiePromise ??= (async () => {
      const launchUrl = ctx.connection.authenticatedUrl(`http://${ctx.webServer.host}/`)
      const response = await ctx.webServer.authorizeIndex(new Request(launchUrl))
      const setCookie = response?.headers.get('set-cookie')
      const cookie = setCookie?.split(';', 1)[0]
      if (response?.status !== 303 || cookie === undefined || cookie === '') {
        throw new Error('desktop pipe failed to establish the official browser session')
      }
      return cookie
    })()
    return sessionCookiePromise
  }
  return async (sourceRequest) => {
    const headers = new Headers(sourceRequest.headers)
    const sourceCookie = headers.get('cookie')
    const browserCookie = await sessionCookie()
    headers.set('cookie', mergeDesktopPipeCookies(browserCookie, sourceCookie))
    const request = new Request(sourceRequest, { headers })
    const url = new URL(request.url)
    const localPath = desktopLocalPath(url.pathname)
    const redirected = localPath !== url.pathname
    if (redirected) url.pathname = localPath
    const localRequest = redirected ? new Request(url, request) : request
    const route = ctx.webServer.match(url.pathname)
    if (route !== undefined && route.path !== '/api' && route.path !== '/plugins') return ctx.webServer.fetch(localRequest)
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return api.fetch(localRequest)
    if (url.pathname === '/plugins' || url.pathname.startsWith('/plugins/')) return ctx.clientModules.fetchBundle(localRequest)
    if (route !== undefined) return ctx.webServer.fetch(localRequest)
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 })

    const requested = url.pathname === '/' ? indexPath : safeFrontendPath(dist, url.pathname)
    let body
    let filePath = requested
    try {
      body = readFileSync(filePath)
    } catch (error) {
      if (error?.code !== 'ENOENT' || extname(url.pathname) !== '') return new Response('not found', { status: 404 })
      filePath = indexPath
      body = readFileSync(filePath)
    }
    if (filePath === indexPath) {
      const authorizationResponse = await ctx.webServer.authorizeIndex(request)
      if (authorizationResponse !== undefined) return authorizationResponse
      const bootstrap = `<script>${transportBootstrapScript({ accountCallbackOrigin })}</script>`
      body = Buffer.from(ctx.webServer.renderIndex(body.toString('utf8').replace('</head>', `${bootstrap}</head>`)))
    }
    return new Response(request.method === 'HEAD' ? null : body, {
      status: 200,
      headers: {
        'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': filePath === indexPath ? 'no-store' : 'public, max-age=31536000, immutable',
      },
    })
  }
}

function parseArguments(argv) {
  const result = { profile: undefined, patchFiles: [], args: [], dumpConfig: false, dshCliPath: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--dump-config') {
      result.dumpConfig = true
      continue
    }
    if (argument === '--profile' || argument === '--patch' || argument === '--dsh-cli') {
      const value = argv[index + 1]
      if (value === undefined || value === '') throw new Error(`${argument} needs a value`)
      if (argument === '--profile') result.profile = value
      else if (argument === '--patch') result.patchFiles.push(value)
      else result.dshCliPath = value
      index += 1
      continue
    }
    result.args.push(argument)
  }
  if (result.profile === undefined) throw new Error('--profile needs a value')
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(result.profile)) throw new Error('profile name is invalid')
  return result
}

function resolveInstallAnchor(dshCliPath) {
  if (dshCliPath === undefined) return defaultInstallAnchor
  if (!isAbsolute(dshCliPath) || basename(dshCliPath).toLowerCase() !== 'bin.js') {
    throw new Error('--dsh-cli must name an absolute @deepseek-ai/dsh lib/bin.js path')
  }
  const libDirectory = dirname(dshCliPath)
  if (basename(libDirectory).toLowerCase() !== 'lib') {
    throw new Error('--dsh-cli must name an absolute @deepseek-ai/dsh lib/bin.js path')
  }
  const manifestPath = join(dirname(libDirectory), 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest?.name !== '@deepseek-ai/dsh') {
    throw new Error('--dsh-cli package is not @deepseek-ai/dsh')
  }
  return manifestPath
}

function createReadySignal() {
  let committed = false
  const listeners = new Set()
  return {
    service: {
      onReady(listener) {
        if (committed) {
          listener()
          return () => {}
        }
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    commit() {
      if (committed) return
      committed = true
      for (const listener of [...listeners]) listener()
      listeners.clear()
    },
  }
}

function telemetryPatch(layers) {
  if ((process.env.DSH_TELEMETRY_DISABLED ?? '') === '') return []
  const hasTelemetry = composeEntries(layers).some(row => row.id === TELEMETRY_ROW_ID)
  return hasTelemetry ? [{ id: TELEMETRY_ROW_ID, disabled: true }] : []
}

async function run() {
  // Consume before layered environment loading so plugins and their children
  // never inherit the Desktop's private stop capability.
  const shutdownControl = consumeRuntimeShutdownControl()
  const invocation = parseArguments(process.argv.slice(2))
  const markStartup = createRuntimeStartupTiming({
    enabled: !invocation.dumpConfig,
    emit: line => process.stdout.write(`${line}\n`),
  })
  // Entry includes Node initialization and this module's static dependency graph.
  markStartup('entry')
  const dshHome = process.env.DSH_HOME
  if (typeof dshHome !== 'string' || dshHome === '') throw new Error('DSH_HOME is required')
  process.env.DSH_CLIENT_VERSION ??= require('../package.json').version

  const environment = loadLayeredEnv(NAME)
  const disposeProxy = await installProxyFromEnvironment(environment, message => {
    process.stderr.write(`${NAME}: ${message}\n`)
  })
  markStartup('environment')
  const profileDir = join(dshHome, 'profiles', invocation.profile)
  const installAnchor = resolveInstallAnchor(invocation.dshCliPath)
  const runtimeManifest = JSON.parse(readFileSync(installAnchor, 'utf8'))
  const pipeIdentity = runtimePipeIdentityFromEnvironment()
  const profile = loadProfileDirectory(NAME, profileDir, installAnchor)
  const resolution = await createRuntimeResolution({ installAnchor, profile, home: dshHome })
  const profileContext = {
    name: invocation.profile,
    dir: profile.dir,
    patchPath: profile.patchPath,
    installAnchor,
    startedBundles: profile.layers.map(layer => layer.packageName),
    cwd: process.cwd(),
    home: dshHome,
    overlays: invocation.patchFiles.flatMap(path => loadOverlayPatches(NAME, resolve(path))),
    telemetryDisabledEnv: process.env.DSH_TELEMETRY_DISABLED,
  }
  const rootConfig = join(profile.dir, PROFILE_ROOT_FILENAME)
  writeFileSync(rootConfig, PROFILE_ROOT_CONFIG)
  markStartup('profile')

  const homePatchPath = join(dshHome, 'cordis.patch.yml')
  const bundlePatches = profile.layers.flatMap(layer => layer.patches)
  const homePatches = loadOptionalPatches(NAME, homePatchPath) ?? []
  const overlayPatches = invocation.patchFiles.flatMap(path => loadOverlayPatches(NAME, resolve(path)))
  const baseLayers = [bundlePatches, profile.patches, homePatches, overlayPatches]
  const allPatches = [...baseLayers.flat(), ...telemetryPatch(baseLayers)]
  markStartup('patches')
  if (invocation.dumpConfig) {
    process.stdout.write(stringify(composeEntries(allPatches)))
    await disposeProxy()
    return
  }

  const legacySettings = await prepareRuntimeLegacySettings({
    home: dshHome,
    profilePatchPath: profile.patchPath,
    patches: allPatches,
  })
  markStartup('legacy-settings')
  let migrationCommitted = false
  let ctx
  let pipeServer
  let accountCallback
  const eventStreams = createRuntimeEventStreamDrain()
  let shuttingDown = false
  let forceTimer
  const shutdown = async (code) => {
    if (shuttingDown) {
      process.exit(code)
      return
    }
    shuttingDown = true
    forceTimer = setTimeout(() => process.exit(code), 5_000)
    forceTimer.unref()
    try {
      const drained = pipeIdentity === undefined ? await eventStreams.drain(ctx?.get('webServer')?.port) : 0
      process.stdout.write(`[desktop] completed ${drained} event streams before Runtime disposal\n`)
      eventStreams.dispose()
      await accountCallback?.close()
      await pipeServer?.close()
      await ctx?.fiber.dispose()
      if (!migrationCommitted) await legacySettings.rollback()
      await disposeProxy()
      clearTimeout(forceTimer)
      process.exitCode = code
    } catch {
      process.exit(code)
    }
  }
  process.on('SIGTERM', () => { void shutdown(0) })
  process.on('SIGINT', () => { void shutdown(130) })
  installFailLoud(NAME, process, async () => {
    await ctx?.fiber.dispose()
    if (!migrationCommitted) await legacySettings.rollback()
    await disposeProxy()
  })

  try {
    const ready = createReadySignal()
    ctx = await boot(NAME, rootConfig, legacySettings.patches, async hostCtx => {
      ctx = hostCtx
      hostCtx.provide('profileContext', profileContext)
      hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
      await hostCtx.plugin(PluginPackages, { resolution })
      provideCmdline(hostCtx, {
        args: invocation.args,
        exit: code => { void shutdown(code) },
        ready: ready.service,
      })
    })
    markStartup('boot')

    if (pipeIdentity !== undefined) {
      if (ctx.get('webServer') === undefined || ctx.webServer.port !== 0 || typeof ctx.webServer.fetch !== 'function') {
        throw new Error('desktop pipe mode requires the no-listener WebRoute adapter')
      }
      if (ctx.get('connection') === undefined || ctx.get('clientModules') === undefined || ctx.get('typertGateway') === undefined) {
        throw new Error('desktop pipe mode requires connection, clientModules, and typertGateway services')
      }
      accountCallback = await createRuntimeAccountCallback({ webServer: ctx.webServer })
      pipeServer = await createRuntimePipeServer({
        identity: pipeIdentity,
        runtimeVersion: runtimeManifest.version,
        profile: invocation.profile,
        fetch: createDesktopPipeFetch(ctx, accountCallback.origin),
        openStream: (endpoint, payload, signal) => openDesktopWireStream(ctx, endpoint, payload, signal),
        openDuplex: (endpoint, payload, input, signal) => endpoint === 'websocket'
          ? ctx.webServer.openDuplex(endpoint, payload, input, signal)
          : openDesktopWireStream(ctx, endpoint, payload, signal, input),
      })
    }

    await listenRuntimeShutdownControl(shutdownControl, () => shutdown(0), {
      // Cleanup has completed and its acknowledgement has reached the pipe.
      // Unrelated surviving handles must not delay an already committed stop.
      onStopped: () => process.exit(process.exitCode ?? 0),
    })

    if (profile.patchReload === 'live' && ctx.fiber.state === 2 && ctx.get('loader') !== undefined) {
      if (ctx.get('hmr') === undefined) {
        if (ctx.get('timer') === undefined) await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-timer' })
        await ctx.loader.create({ name: '@deepseek-ai/cordis-plugin-hmr', config: { root: [] } })
      }
      const composeLive = () => adaptRuntimeLegacySettingsPatches([
        ...bundlePatches,
        ...(loadOptionalPatches(NAME, profile.patchPath) ?? []),
        ...(loadOptionalPatches(NAME, homePatchPath) ?? []),
        ...overlayPatches,
        ...telemetryPatch([bundlePatches, profile.patches, homePatches, overlayPatches]),
      ])
      await watchDesktopUserPatches(ctx, profile.patchPath, rootConfig, composeLive)
      await watchDesktopUserPatches(ctx, homePatchPath, rootConfig, composeLive)
    }
    if (!shuttingDown && ctx.fiber.state === 2 && ctx.get('loader') !== undefined) {
      await legacySettings.commit({ verify: async ({ patches }) => {
        const health = await diagnoseRuntimeLegacySettingsHealth(ctx, { patches })
        if (!health.healthy) process.stderr.write(`[legacy-settings-health] ${JSON.stringify(health)}\n`)
        return health.healthy
      } })
      migrationCommitted = true
      if (pipeIdentity !== undefined) process.stdout.write(`${RUNTIME_PIPE_READY_LINE}\n`)
      markStartup('ready')
      ready.commit()
    } else if (!migrationCommitted) {
      throw new Error('desktop Runtime did not reach migration commit readiness')
    }
  } catch (error) {
    await accountCallback?.close()
    await pipeServer?.close()
    await ctx?.fiber.dispose()
    if (!migrationCommitted) await legacySettings.rollback()
    await disposeProxy()
    throw error
  }
}

try {
  await run()
} catch (error) {
  process.stderr.write(`${NAME}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}
