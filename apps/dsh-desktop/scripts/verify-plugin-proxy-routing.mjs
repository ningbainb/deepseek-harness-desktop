#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { connect as connectTcp } from 'node:net'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runtimeProxyEnvironmentFor } from '../src/network-proxy.mjs'
import { resolvePnpmCliPath, runPnpm } from '../src/extensions/plugins.mjs'

const packageSpec = 'dsh-paperclip@0.2.5'
const allowedRegistryHost = 'registry.npmjs.org'
const temporary = await mkdtemp(join(tmpdir(), 'dsh-plugin-proxy-route-'))
const profileDir = join(temporary, 'profile')
const storeDir = join(temporary, 'pnpm-store')
const connectAuthorities = []
const directHttpRequests = []
const sockets = new Set()

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('proxy address is unavailable'))
        return
      }
      resolveListen(address.port)
    })
  })
}

async function close(server) {
  for (const socket of sockets) socket.destroy()
  await new Promise(resolveClose => server.close(() => resolveClose()))
}

const proxy = createServer((request, response) => {
  directHttpRequests.push(request.url ?? '')
  response.writeHead(403, { 'content-type': 'text/plain' })
  response.end('HTTPS registry traffic is required')
})

proxy.on('connection', socket => {
  sockets.add(socket)
  socket.once('close', () => sockets.delete(socket))
})

proxy.on('connect', (request, clientSocket, head) => {
  let destination
  try {
    destination = new URL(`http://${request.url ?? ''}`)
  } catch {
    clientSocket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    return
  }
  const host = destination.hostname.toLowerCase()
  const port = Number(destination.port || 443)
  if (host !== allowedRegistryHost || port !== 443) {
    clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    return
  }
  connectAuthorities.push(`${host}:${port}`)
  const upstream = connectTcp({ host, port }, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length > 0) upstream.write(head)
    clientSocket.pipe(upstream).pipe(clientSocket)
  })
  sockets.add(upstream)
  upstream.once('close', () => sockets.delete(upstream))
  upstream.once('error', () => clientSocket.destroy())
  clientSocket.once('error', () => upstream.destroy())
})

try {
  await mkdir(profileDir, { recursive: true })
  await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'dsh-plugin-proxy-route-fixture',
    private: true,
    version: '0.0.0',
  }, null, 2)}\n`)
  const proxyPort = await listen(proxy)
  const projection = runtimeProxyEnvironmentFor({
    mode: 'fixed_servers',
    proxyRules: `http=http://127.0.0.1:${proxyPort};https=http://127.0.0.1:${proxyPort}`,
    proxyBypassRules: 'localhost,127.0.0.1',
  })
  assert.equal(projection.status, 'configured')

  await runPnpm({
    pnpmCli: resolvePnpmCliPath(),
    profileDir,
    executable: process.execPath,
    environment: {
      ...process.env,
      ...projection.environment,
    },
    args: [
      'add',
      packageSpec,
      '--save-exact',
      '--ignore-scripts',
      '--lockfile=false',
      '--strict-peer-dependencies=false',
      `--store-dir=${storeDir}`,
      '--registry=https://registry.npmjs.org/',
      '--config.manage-package-manager-versions=false',
    ],
    timeoutMs: 180_000,
  })

  const installed = JSON.parse(await readFile(join(profileDir, 'node_modules', 'dsh-paperclip', 'package.json'), 'utf8'))
  assert.equal(installed.name, 'dsh-paperclip')
  assert.equal(installed.version, '0.2.5')
  assert.equal(typeof installed.dsh?.bundle?.patch, 'string')
  assert.ok(connectAuthorities.length > 0, 'pnpm did not route an HTTPS request through the controlled proxy')
  assert.ok(connectAuthorities.every(authority => authority === `${allowedRegistryHost}:443`))
  assert.deepEqual(directHttpRequests, [])

  console.log(`verified ${packageSpec} installation through the Desktop pnpm child runner and controlled registry proxy (${connectAuthorities.length} CONNECT requests)`)
} finally {
  await close(proxy).catch(() => undefined)
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
}
