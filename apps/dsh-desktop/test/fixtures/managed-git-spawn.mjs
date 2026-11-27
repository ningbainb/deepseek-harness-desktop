import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

export function successfulGitSpawn(version, calls = []) {
  return (executable, args, options) => {
    calls.push({ executable, args, options })
    const child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.kill = () => {
      queueMicrotask(() => child.emit('close', null, 'SIGTERM'))
      return true
    }
    queueMicrotask(() => {
      child.stdout.write(`git version ${version}\n`)
      child.stdout.end()
      child.stderr.end()
      child.emit('close', 0, null)
    })
    return child
  }
}
