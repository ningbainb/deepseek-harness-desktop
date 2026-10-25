import { readFile } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'

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

function safeFrontendPath(dist, pathname) {
  let decoded
  try { decoded = decodeURIComponent(pathname) } catch { return undefined }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.includes(':')
    || decoded.split('/').some(segment => /[. ]$/u.test(segment))) return undefined
  const candidate = resolve(dist, `.${decoded}`)
  const difference = relative(dist, candidate)
  return difference !== '..' && !difference.startsWith(`..${sep}`) ? candidate : undefined
}

export function createDesktopFrontendFetch({ dist, authorizeIndex, renderIndex, bootstrap, readAsset = readFile }) {
  const root = resolve(dist)
  const indexPath = join(root, 'index.html')
  const pending = new Map()
  const read = path => {
    let operation = pending.get(path)
    if (operation === undefined) {
      operation = Promise.resolve().then(() => readAsset(path)).finally(() => pending.delete(path))
      pending.set(path, operation)
    }
    return operation
  }
  return async request => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('method not allowed', { status: 405 })
    const { pathname } = new URL(request.url)
    let filePath = pathname === '/' ? indexPath : safeFrontendPath(root, pathname)
    if (filePath === undefined) return new Response('not found', { status: 404 })
    let body
    try {
      body = await read(filePath)
    } catch (error) {
      if (error?.code !== 'ENOENT' || extname(pathname) !== '') return new Response('not found', { status: 404 })
      filePath = indexPath
      body = await read(filePath)
    }
    const isIndex = filePath.toLowerCase() === indexPath.toLowerCase()
    if (isIndex) {
      const authorizationResponse = await authorizeIndex(request)
      if (authorizationResponse !== undefined) return authorizationResponse
      body = Buffer.from(renderIndex(body.toString('utf8').replace('</head>', `${bootstrap}</head>`)))
    }
    return new Response(request.method === 'HEAD' ? null : body, {
      status: 200,
      headers: {
        'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': isIndex ? 'no-store' : 'public, max-age=31536000, immutable',
      },
    })
  }
}
