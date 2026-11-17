import { prepareInstalledBrowserUpgrade } from './browser-upgrade-preflight.mjs'

const allowed = new Set(['--probe', '--home', '--archive', '--parent-pid'])
const options = {}
for (const value of process.argv.slice(2)) {
  const index = value.indexOf('=')
  const key = index < 0 ? value : value.slice(0, index)
  if (!allowed.has(key) || Object.hasOwn(options, key)) throw Error('Invalid browser preflight argument')
  options[key] = index < 0 ? true : value.slice(index + 1)
}
try {
  if (process.env.ELECTRON_RUN_AS_NODE !== '1' || process.versions.electron !== '44.7.0') throw Error('Browser preflight requires the verified desktop Electron 44.7.0 Node carrier')
  if (options['--probe']) console.log(JSON.stringify({ probe: true, electron: process.versions.electron, node: process.versions.node, runAsNode: true }))
  else {
    const controller = new AbortController()
    let parentWatch
    if (options['--parent-pid'] !== undefined) {
      const parentPid = Number(options['--parent-pid'])
      if (!Number.isSafeInteger(parentPid) || parentPid < 1) throw Error('Invalid installer parent PID')
      try { process.kill(parentPid, 0) } catch { controller.abort(Error('Installer cancelled or exited')) }
      parentWatch = setInterval(() => {
        try { process.kill(parentPid, 0) } catch { controller.abort(Error('Installer cancelled or exited')) }
      }, 150)
      parentWatch.unref()
    }
    process.on('SIGINT', () => controller.abort(Error('Browser preflight cancelled')))
    process.on('SIGTERM', () => controller.abort(Error('Browser preflight cancelled')))
    let idleTimer, previousProgress
    const refreshIdleBudget = status => {
      const progress = `${status?.phase ?? 'starting'}:${status?.receivedBytes ?? 0}`
      if (progress === previousProgress) return
      previousProgress = progress
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort(Error('Browser preflight made no progress for 30 seconds')), 30000)
      idleTimer.unref()
    }
    refreshIdleBudget()
    let result
    try { result = await prepareInstalledBrowserUpgrade({ home: options['--home'], archivePath: options['--archive'], signal: controller.signal,
      onProgress: status => { refreshIdleBudget(status); console.log(JSON.stringify({ browserComponent: status })) },
    }) } finally { clearInterval(parentWatch); clearTimeout(idleTimer) }
    console.log(JSON.stringify({ browserPreflight: result }))
  }
} catch (error) {
  console.error(`Browser component preflight failed: ${error.message}`)
  process.exitCode = 37
}
