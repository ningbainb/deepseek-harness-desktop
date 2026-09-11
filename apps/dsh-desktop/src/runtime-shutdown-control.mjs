import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createConnection, createServer } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const RUNTIME_SHUTDOWN_CONTROL_ENV = 'DSH_DESKTOP_SHUTDOWN_CONTROL'

export function createRuntimeShutdownControl(platform = process.platform) {
  const name = `dsh-stop-${randomBytes(16).toString('hex')}`
  return {
    path: platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`),
    token: randomBytes(32).toString('hex'),
  }
}

export function consumeRuntimeShutdownControl(environment = process.env) {
  const raw = environment[RUNTIME_SHUTDOWN_CONTROL_ENV]
  delete environment[RUNTIME_SHUTDOWN_CONTROL_ENV]
  if (!raw) return undefined
  let control
  try { control = JSON.parse(raw) } catch { throw new Error('Invalid Desktop shutdown control') }
  const expectedPrefix = process.platform === 'win32' ? '\\\\.\\pipe\\dsh-stop-' : join(tmpdir(), 'dsh-stop-')
  const suffix = process.platform === 'win32' ? '[a-f0-9]{32}' : '[a-f0-9]{32}\\.sock'
  if (typeof control?.path !== 'string' || !control.path.startsWith(expectedPrefix)
    || control.path.length !== expectedPrefix.length + (process.platform === 'win32' ? 32 : 37)
    || !new RegExp(`^${suffix}$`).test(control.path.slice(expectedPrefix.length))
    || typeof control?.token !== 'string' || control.token.length !== 64
    || !/^[a-f0-9]{64}$/.test(control.token)) throw new Error('Invalid Desktop shutdown control')
  return control
}

/** Private capability, not an HTTP route or a command execution interface. */
export async function listenRuntimeShutdownControl(control, shutdown, { onStopped = () => {} } = {}) {
  if (!control) return () => {}
  let stopping = false
  const sockets = new Set()
  const server = createServer(socket => {
    if (stopping || sockets.size >= 4) { socket.destroy(); return }
    sockets.add(socket)
    socket.setTimeout(1000, () => socket.destroy())
    socket.on('error', () => {})
    socket.on('close', () => sockets.delete(socket))
    let input = ''
    socket.on('data', chunk => {
      if (stopping) { socket.destroy(); return }
      input += chunk.toString('utf8')
      if (input.length > 80) { socket.destroy(); return }
      if (!input.endsWith('\n')) return
      if (input.length !== 70 || !/^stop [a-f0-9]{64}\n$/.test(input)
        || !timingSafeEqual(Buffer.from(input.slice(5, -1)), Buffer.from(control.token))) {
        socket.destroy(); return
      }
      stopping = true
      socket.setTimeout(0)
      socket.removeAllListeners('data')
      for (const other of sockets) if (other !== socket) other.destroy()
      server.close()
      // A failed cleanup is not a successful acknowledgement. The Desktop's
      // existing process-tree timeout remains the final authority.
      void Promise.resolve().then(shutdown).then(() => socket.end('stopped\n', onStopped), () => socket.destroy())
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(control.path, () => { server.off('error', reject); resolve() })
  })
  server.on('error', () => {})
  server.unref()
  return () => {
    stopping = true
    server.close()
    for (const socket of sockets) socket.destroy()
  }
}

export function requestRuntimeShutdown(control, timeoutMs = 3000) {
  return new Promise(resolve => {
    const socket = createConnection(control.path)
    let settled = false
    let response = ''
    const finish = success => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(success)
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    socket.once('connect', () => socket.write(`stop ${control.token}\n`))
    socket.on('data', chunk => {
      response += chunk.toString('utf8')
      if (response === 'stopped\n') finish(true)
      else if (response.length >= 8) finish(false)
    })
    socket.once('error', () => finish(false))
    socket.once('close', () => finish(false))
  })
}
