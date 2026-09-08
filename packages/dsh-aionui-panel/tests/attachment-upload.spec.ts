import { Readable } from 'node:stream'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createAttachmentHandler } from '../src/host/attachments.ts'
import { isLoopbackRequest } from '../src/host/routes.ts'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  // The production WorkspaceGate returns realpath, including when Windows TEMP
  // contains a short (8.3) path. Model that contract instead of a lexical path.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-attachments-test-'))); roots.push(root)
  const owner = { header: { cwd: root } }
  const handler = createAttachmentHandler(async () => ({ ok: true, canonical: root }), id => id === 'owned' ? owner : undefined, isLoopbackRequest)
  const request = async (name: string, bytes: Buffer, override: Record<string, unknown> = {}, method = 'POST') => {
    const req = Object.assign(Readable.from([bytes]), { method, socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'x-dsh-attachment': '1', 'x-dsh-session': 'owned', 'x-dsh-filename': encodeURIComponent(name), 'content-length': String(bytes.length), ...override } })
    let status = 0, body: { path: string; size: number; error: string }
    await handler(req as never, { writeHead(code: number) { status = code }, end(value: string) { body = JSON.parse(value) } } as never)
    return { status, body: body! }
  }
  return { root, request }
}
it('preserves arbitrary binary bytes and empty files under the owning session', async () => {
  const { root, request } = await fixture(), bytes = Buffer.from([0, 255, 3, 128])
  const result = await request('资料.bin', bytes)
  expect(result.status).toBe(200)
  expect(result.body.path).toMatch(/^\.\/\.dsh-attachments\/[a-f0-9]{32}\/file-/)
  expect(await readFile(join(root, result.body.path))).toEqual(bytes)
  expect((await request('empty.txt', Buffer.alloc(0))).body.size).toBe(0)
})
it('rejects cross-origin, missing sessions, path traversal and oversized requests before writes', async () => {
  const { root, request } = await fixture(), bytes = Buffer.from('x')
  expect((await request('x', bytes, { origin: 'https://untrusted.example' })).status).toBe(403)
  expect((await request('x', bytes, { 'x-dsh-session': 'unknown' })).status).toBe(403)
  expect((await request('../escape', bytes)).status).toBe(400)
  expect((await request('x', bytes, { 'content-length': String(101 * 1024 * 1024) })).status).toBe(413)
  expect(await readdir(root)).toEqual([])
})
it('rejects a workspace attachment directory pointing outside the authorized root', async () => {
  const { root, request } = await fixture()
  const outside = await mkdtemp(join(tmpdir(), 'dsh-attachment-outside-')); roots.push(outside)
  await symlink(outside, join(root, '.dsh-attachments'), process.platform === 'win32' ? 'junction' : 'dir')
  expect((await request('x.txt', Buffer.from('x'))).status).toBe(400)
  expect(await readdir(outside)).toEqual([])
})

it('checks restored file existence within the same session only', async () => {
  const { root, request } = await fixture()
  const result = await request('restored.txt', Buffer.from('x'))
  const headers = { 'x-dsh-path': encodeURI(result.body.path) }
  expect((await request('', Buffer.alloc(0), headers, 'HEAD')).status).toBe(200)
  expect((await request('', Buffer.alloc(0), { 'x-dsh-path': './.dsh-attachments/another/file/x' }, 'HEAD')).status).toBe(404)
  await rm(join(root, result.body.path))
  expect((await request('', Buffer.alloc(0), headers, 'HEAD')).status).toBe(404)
})
