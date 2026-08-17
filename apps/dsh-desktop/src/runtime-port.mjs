import { createServer } from 'node:net'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

function validPort(value) {
  return Number.isInteger(value) && value > 0 && value <= 65_535
}

export async function isLoopbackPortAvailable(port) {
  if (!validPort(port)) return false
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close((error) => resolve(error === undefined))
    })
  })
}

export async function selectPreferredRuntimePort(path, {
  checkAvailable = isLoopbackPortAvailable,
} = {}) {
  let state
  try {
    state = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    return 0
  }
  return validPort(state?.port) && await checkAvailable(state.port) ? state.port : 0
}

export async function persistRuntimePort(path, port) {
  if (!validPort(port)) throw new TypeError('runtime port must be an integer from 1 to 65535')
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  const backup = `${path}.bak-${process.pid}`
  let movedExisting = false
  try {
    await writeFile(temporary, `${JSON.stringify({ version: 1, port }, null, 2)}\n`)
    try {
      await rename(path, backup)
      movedExisting = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    await rename(temporary, path)
    if (movedExisting) await rm(backup, { force: true })
  } catch (error) {
    await rm(temporary, { force: true })
    if (movedExisting) {
      await rm(path, { force: true })
      await rename(backup, path)
    }
    throw error
  }
}
