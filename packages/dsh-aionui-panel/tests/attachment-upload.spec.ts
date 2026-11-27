import { Readable } from 'node:stream'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createAttachmentHandler } from '../src/host/attachments.ts'
import { isLoopbackRequest } from '../src/host/routes.ts'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(options?: Parameters<typeof createAttachmentHandler>[3]) {
  // The production WorkspaceGate returns realpath, including when Windows TEMP
  // contains a short (8.3) path. Model that contract instead of a lexical path.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-attachments-test-'))); roots.push(root)
  const owner = { header: { cwd: root } }
  const handler = createAttachmentHandler(async () => ({ ok: true, canonical: root }), id => id === 'owned' ? owner : undefined, isLoopbackRequest, options)
  const request = async (name: string, bytes: Buffer, override: Record<string, unknown> = {}, method = 'POST') => {
    const req = Object.assign(Readable.from([bytes]), { method, socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'x-dsh-attachment': '1', 'x-dsh-session': 'owned', 'x-dsh-filename': encodeURIComponent(name), 'content-length': String(bytes.length), ...override } })
    let status = 0, body: { path: string; size: number; error: string; summary?: string; truncated?: boolean }
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

it('admits bounded uploads over the private transport without HTTP framing headers', async () => {
  const { root, request } = await fixture()
  const bytes = Buffer.from('document fixture')
  const result = await request('report.docx', bytes, { 'content-length': undefined, 'x-dsh-attachment-size': String(bytes.length) })
  expect(result.status).toBe(200)
  expect(await readFile(join(root, result.body.path))).toEqual(bytes)
  expect((await request('report.docx', bytes, { 'x-dsh-attachment-size': '3' })).status).toBe(400)
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

it('extracts only authorized attachment text, returning a bounded excerpt', async () => {
  const parsed = '第一段内容\n'.repeat(1800)
  const calls: Array<{ root: string; path: string }> = []
  const { root, request } = await fixture({
    canSummarize: (_id, req) => req.headers['x-test-owner'] === 'yes',
    summarize: async (root, path) => { calls.push({ root, path }); return parsed },
  })
  const upload = await request('报告.docx', Buffer.from('doc'))
  const headers = { 'x-dsh-attachment-mode': 'summary', 'x-dsh-path': encodeURI(upload.body.path) }
  expect((await request('', Buffer.alloc(0), headers)).status).toBe(403)
  expect((await request('', Buffer.alloc(0), { ...headers, 'x-test-owner': 'yes', 'x-dsh-path': './.dsh-attachments/another/file/x.docx' })).status).toBe(404)
  const result = await request('', Buffer.alloc(0), { ...headers, 'x-test-owner': 'yes' })
  expect(result).toMatchObject({ status: 200, body: { summary: expect.stringContaining('第一段内容'), truncated: true } })
  expect(result.body.summary!.length).toBeLessThanOrEqual(4000)
  const parts = upload.body.path.split('/')
  expect(calls).toEqual([{ root: join(root, ...parts.slice(1, 3)), path: join(...parts.slice(3)) }])
})
