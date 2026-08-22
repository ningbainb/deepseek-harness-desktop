const { createHash } = require('node:crypto')
const { readFile, writeFile } = require('node:fs/promises')
const { createServer } = require('node:http')
const { app, BrowserWindow } = require('electron')

const LEGACY_TASK_LEDGER_KEY = 'dsh.taskBoard.v1'

function requiredEnvironment(name) {
  const value = process.env[name]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} is required`)
  return value
}

function portFromEnvironment() {
  const port = Number.parseInt(requiredEnvironment('DSH_DESKTOP_E2E_LEGACY_PORT'), 10)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error('DSH_DESKTOP_E2E_LEGACY_PORT is invalid')
  return port
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function readLegacyFixture(sourcePath) {
  const document = JSON.parse(await readFile(sourcePath, 'utf8'))
  if (document?.schemaVersion !== 1 || !Array.isArray(document.tasks)) {
    throw new Error('legacy localStorage fixture is invalid')
  }
  return JSON.stringify(document.tasks)
}

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      })
      response.end('<!doctype html><meta charset="utf-8"><title>migration storage helper</title>')
    })
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => resolve(server))
  })
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function writeResult(resultPath, value) {
  await writeFile(resultPath, `${JSON.stringify(value)}\n`, 'utf8')
}

async function main() {
  const mode = requiredEnvironment('DSH_DESKTOP_E2E_LEGACY_MODE')
  if (!['seed', 'read'].includes(mode)) throw new Error('DSH_DESKTOP_E2E_LEGACY_MODE is invalid')
  const userData = requiredEnvironment('DSH_DESKTOP_E2E_LEGACY_USER_DATA')
  const resultPath = requiredEnvironment('DSH_DESKTOP_E2E_LEGACY_RESULT')
  const port = portFromEnvironment()
  const sourcePath = process.argv[2]
  if (mode === 'seed' && (typeof sourcePath !== 'string' || sourcePath.length === 0)) {
    throw new Error('legacy localStorage source path is required for seed mode')
  }
  app.disableHardwareAcceleration()
  app.setPath('userData', userData)
  await app.whenReady()
  const server = await listen(port)
  let window
  try {
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    })
    await window.loadURL(`http://127.0.0.1:${port}/`)
    if (mode === 'seed') {
      const value = await readLegacyFixture(sourcePath)
      const stored = await window.webContents.executeJavaScript(`(() => {
        localStorage.setItem(${JSON.stringify(LEGACY_TASK_LEDGER_KEY)}, ${JSON.stringify(value)})
        return localStorage.getItem(${JSON.stringify(LEGACY_TASK_LEDGER_KEY)})
      })()`, true)
      if (stored !== value) throw new Error('legacy localStorage write did not verify')
      await window.webContents.session.flushStorageData()
      await writeResult(resultPath, { mode, found: true, sha256: sha256(value), bytes: Buffer.byteLength(value, 'utf8') })
    } else {
      const stored = await window.webContents.executeJavaScript(
        `localStorage.getItem(${JSON.stringify(LEGACY_TASK_LEDGER_KEY)})`,
        true,
      )
      await writeResult(resultPath, {
        mode,
        found: typeof stored === 'string',
        ...(typeof stored === 'string' ? { sha256: sha256(stored), bytes: Buffer.byteLength(stored, 'utf8') } : {}),
      })
    }
  } finally {
    if (window && !window.isDestroyed()) window.destroy()
    await close(server)
  }
}

main()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(`legacy localStorage helper failed: ${error instanceof Error ? error.message : String(error)}`)
    app.exit(1)
  })
