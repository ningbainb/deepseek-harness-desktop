import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Read-only, bounded window-show observer. Collects PID ancestry, never titles or commands. */
export async function startWindowsConsoleObserver() {
  if (process.platform !== 'win32') return { stop: async () => ({ events: [], dropped: 0, elapsed: 0 }) }
  const child = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', fileURLToPath(new URL('./windows-console-observer.ps1', import.meta.url)),
  ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  let errors = ''
  let ready
  const readyPromise = new Promise(resolve => { ready = resolve })
  child.stdout.on('data', chunk => {
    output = (output + chunk).slice(-1_048_576)
    if (output.includes('DSH_CONSOLE_OBSERVER_READY')) ready()
  })
  child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4_096) })
  // An already-exited observer reports its failure through `closed`/timedOut;
  // do not turn the final stop signal into an unrelated unhandled EPIPE.
  child.stdin.on('error', () => {})
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`console observer failed (${code}): ${errors}`)))
  })
  let timer
  try {
    await Promise.race([
      readyPromise,
      closed.then(() => { throw new Error('console observer exited before ready') }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('console observer startup timed out')), 20_000) }),
    ])
  } catch (error) {
    child.kill()
    throw error
  } finally { clearTimeout(timer) }
  let stopped
  return {
    stop() {
      return stopped ??= (async () => {
        child.stdin.end('stop\n')
        let timeout
        try {
          await Promise.race([closed, new Promise((_, reject) => {
            timeout = setTimeout(() => { child.kill(); reject(new Error('console observer shutdown timed out')) }, 10_000)
          })])
        } finally { clearTimeout(timeout) }
        const result = JSON.parse(output.trim().split(/\r?\n/u).at(-1))
        if (result.timedOut) throw new Error('console observer observation deadline expired')
        return result
      })()
    },
  }
}
