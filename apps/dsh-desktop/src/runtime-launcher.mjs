import { readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { stringify } from 'yaml'

import {
  boot,
  composeEntries,
  healProfilesModuleFallback,
  installFailLoud,
  loadLayeredEnv,
  loadOptionalPatches,
  loadOverlayPatches,
  loadProfileDirectory,
  watchUserPatches,
} from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { installProxyFromEnvironment } from '@deepseek-ai/dsh-http-proxy'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import { consumeRuntimeShutdownControl, listenRuntimeShutdownControl } from './runtime-shutdown-control.mjs'
import { createRuntimeEventStreamDrain } from './runtime-stream-drain.mjs'
import { createRuntimeStartupTiming } from './runtime-startup-timing.mjs'

const NAME = 'dsh-desktop'
const PROFILE_ROOT_FILENAME = 'cordis.yml'
const PROFILE_ROOT_CONFIG = '# Electron-owned DSH profile root; composition is supplied as patch layers.\n[]\n'
const TELEMETRY_ROW_ID = 'session-telemetry-otel'
const require = createRequire(import.meta.url)
const defaultInstallAnchor = require.resolve('@deepseek-ai/dsh/package.json')

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

  const environment = loadLayeredEnv(NAME)
  const disposeProxy = await installProxyFromEnvironment(environment, message => {
    process.stderr.write(`${NAME}: ${message}\n`)
  })
  markStartup('environment')
  const profileDir = join(dshHome, 'profiles', invocation.profile)
  const installAnchor = resolveInstallAnchor(invocation.dshCliPath)
  const profile = loadProfileDirectory(NAME, profileDir, installAnchor)
  await healProfilesModuleFallback({ installAnchor, profile, home: dshHome })
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

  let ctx
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
      const drained = await eventStreams.drain(ctx?.get('webServer')?.port)
      process.stdout.write(`[desktop] completed ${drained} event streams before Runtime disposal\n`)
      eventStreams.dispose()
      await ctx?.fiber.dispose()
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
    await disposeProxy()
  })

  const ready = createReadySignal()
  ctx = await boot(NAME, rootConfig, allPatches, hostCtx => {
    ctx = hostCtx
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
    provideCmdline(hostCtx, {
      args: invocation.args,
      exit: code => { void shutdown(code) },
      ready: ready.service,
    })
  })
  markStartup('boot')

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
    const composeLive = () => [
      ...bundlePatches,
      ...(loadOptionalPatches(NAME, profile.patchPath) ?? []),
      ...(loadOptionalPatches(NAME, homePatchPath) ?? []),
      ...overlayPatches,
      ...telemetryPatch([bundlePatches, profile.patches, homePatches, overlayPatches]),
    ]
    await watchUserPatches(ctx, { binName: NAME, filename: profile.patchPath, compose: composeLive })
    await watchUserPatches(ctx, { binName: NAME, filename: homePatchPath, compose: composeLive })
  }
  if (!shuttingDown && ctx.fiber.state === 2 && ctx.get('loader') !== undefined) {
    markStartup('ready')
    ready.commit()
  }
}

try {
  await run()
} catch (error) {
  process.stderr.write(`${NAME}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}
