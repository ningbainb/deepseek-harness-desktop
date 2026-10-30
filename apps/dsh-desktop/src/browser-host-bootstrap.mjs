import { createRequire } from 'node:module'
import { basename, isAbsolute, normalize } from 'node:path'
import { realpathSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const BROWSER_HOST_MARKER = 'DSH_DESKTOP_BROWSER_HOST'
export const BROWSER_HOST_MARKER_VALUE = 'desktop-browser-host-v1'
export const BROWSER_HOST_ENTRY = 'DSH_DESKTOP_BROWSER_HOST_MAIN'
// Match profile.mjs without importing the full profile during child bootstrap.
// Both package resolution and filesystem checks must use the unpacked copy.
function installedFilesystemPath(path) {
  return path.replace(/([\\/])app\.asar([\\/])/u, '$1app.asar.unpacked$2')
}
const require = createRequire(installedFilesystemPath(fileURLToPath(import.meta.url)))

/** Resolve only the reviewed installed dependency, never a path supplied by argv or env. */
export function resolveInstalledBrowserHost() {
  const manifest = JSON.parse(readFileSync(installedFilesystemPath(require.resolve('dsh-builtin-browser/package.json')), 'utf8'))
  if (manifest.name !== 'dsh-builtin-browser' || manifest.version !== '0.4.14') {
    throw new Error('browser host requires the reviewed dsh-builtin-browser 0.4.14')
  }
  return realpathSync(installedFilesystemPath(require.resolve('dsh-builtin-browser/host-main')))
}

/** Project a private child-launch mode while preserving a user-selected Electron binary. */
export function browserRuntimeEnvironment({ env = process.env, execPath = process.execPath, isPackaged = false, hostMainPath, resolveHostMain = resolveInstalledBrowserHost } = {}) {
  const result = { ...env }
  delete result[BROWSER_HOST_MARKER]
  delete result[BROWSER_HOST_ENTRY]
  if (!isPackaged) return result
  const claimed = Object.hasOwn(env, BROWSER_HOST_MARKER) || Object.hasOwn(env, BROWSER_HOST_ENTRY)
  const inherited = claimed && env.ELECTRON_PATH === execPath
  if (Object.hasOwn(env, 'ELECTRON_PATH') && !inherited) return result
  const entry = hostMainPath ?? resolveHostMain()
  if (!isAbsolute(execPath) || !isAbsolute(entry)) throw new Error('browser host requires absolute installed paths')
  if (inherited && (env[BROWSER_HOST_MARKER] !== BROWSER_HOST_MARKER_VALUE
    || typeof env[BROWSER_HOST_ENTRY] !== 'string'
    || normalize(env[BROWSER_HOST_ENTRY]) !== normalize(entry)
    || realpathSync(env[BROWSER_HOST_ENTRY]) !== realpathSync(entry))) {
    throw new Error('browser host environment integrity failure')
  }
  result.ELECTRON_PATH = execPath
  result[BROWSER_HOST_MARKER] = BROWSER_HOST_MARKER_VALUE
  result[BROWSER_HOST_ENTRY] = realpathSync(entry)
  return result
}

/**
 * Must run before importing electron-app or taking Desktop's single-instance lock.
 * The vendor owns the token handshake, sandbox, CDP and BrowserWindow lifecycle.
 */
export async function runBrowserHostBootstrap({
  argv = process.argv, env = process.env,
  isElectronMain = Boolean(process.versions.electron) && process.type === 'browser',
  resolveHostMain = resolveInstalledBrowserHost,
  importHostMain = url => import(url),
} = {}) {
  const candidate = argv[2] === '--rpc-port' || (typeof argv[1] === 'string' && basename(argv[1]) === 'host-main.js')
    || Object.hasOwn(env, 'DSH_BROWSER_RPC_TOKEN')
  // Normal app launches may inherit the marker from a Desktop-owned terminal.
  // No script, port or RPC token means this is not a browser child invocation.
  if (!candidate) return false
  const invalid = () => new Error('invalid browser host invocation')
  if (!isElectronMain || env[BROWSER_HOST_MARKER] !== BROWSER_HOST_MARKER_VALUE
    || typeof env.DSH_BROWSER_RPC_TOKEN !== 'string' || !/^[a-f0-9]{48}$/.test(env.DSH_BROWSER_RPC_TOKEN)
    || Object.hasOwn(env, 'ELECTRON_RUN_AS_NODE') || Object.hasOwn(env, 'NODE_OPTIONS')
    || argv.length !== 4 || argv[2] !== '--rpc-port'
    || !/^[1-9]\d{0,4}$/.test(argv[3]) || Number(argv[3]) > 65535
    || typeof argv[1] !== 'string' || !isAbsolute(argv[1])) throw invalid()
  let trusted
  try {
    trusted = resolveHostMain()
    if (!isAbsolute(trusted) || basename(trusted) !== 'host-main.js'
      || normalize(argv[1]) !== normalize(trusted) || normalize(env[BROWSER_HOST_ENTRY] ?? '') !== normalize(trusted)
      || realpathSync(argv[1]) !== realpathSync(trusted)) throw invalid()
  } catch { throw invalid() }
  await importHostMain(pathToFileURL(trusted).href)
  return true
}
