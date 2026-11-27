import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH,
  createDesktopWorkspaceFileOpenRoute,
  resolveDesktopWorkspaceFileOpenTarget,
} from '../src/workspace-file-open-route.ts'
import {
  DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER,
  isDesktopWorkspaceFileOpenToken,
  isSafeDesktopWorkspaceFileOpenPath,
} from '../src/workspace-file-open-policy.ts'

const CAPABILITY_TOKEN = 'a'.repeat(43)

function fakeRequest(url: string, {
  body,
  method = 'POST',
  remoteAddress = '127.0.0.1',
  host = '127.0.0.1:43125',
  contentType = 'application/json',
  origin,
  secFetchSite,
  capabilityToken = CAPABILITY_TOKEN,
  includeCapabilityToken = true,
}: {
  body?: string
  method?: string
  remoteAddress?: string
  host?: string
  contentType?: string
  origin?: string
  secFetchSite?: string
  capabilityToken?: string
  includeCapabilityToken?: boolean
} = {}): Record<string | symbol, unknown> {
  const headers = {
    host,
    'content-type': contentType,
    ...(includeCapabilityToken ? { [DESKTOP_WORKSPACE_FILE_OPEN_TOKEN_HEADER]: capabilityToken } : {}),
    ...(origin === undefined ? {} : { origin }),
    ...(secFetchSite === undefined ? {} : { 'sec-fetch-site': secFetchSite }),
  }
  const request: Record<string | symbol, unknown> = {
    method,
    url,
    headers,
    socket: { remoteAddress },
  }
  if (body !== undefined) {
    request[Symbol.asyncIterator] = async function* iterate() {
      yield Buffer.from(body)
    }
  }
  return request
}

function fakeResponse(): { response: Record<string, unknown>; status: () => number; body: () => string } {
  let status = 0
  let body = ''
  return {
    response: {
      writeHead: (nextStatus: number) => { status = nextStatus },
      end: (value?: unknown) => { body = value === undefined ? '' : String(value) },
    },
    status: () => status,
    body: () => body,
  }
}

async function drive(
  handler: (request: never, response: never) => Promise<void>,
  body: string,
  options: Parameters<typeof fakeRequest>[1] = {},
): Promise<{ status: number; body: unknown }> {
  const response = fakeResponse()
  await handler(
    fakeRequest(DESKTOP_WORKSPACE_FILE_OPEN_TARGET_PATH, { ...options, body }) as never,
    response.response as never,
  )
  return { status: response.status(), body: JSON.parse(response.body()) }
}

describe('Desktop workspace native-open authority', () => {
  it('accepts only the opaque per-runtime capability token shape', () => {
    expect(isDesktopWorkspaceFileOpenToken(CAPABILITY_TOKEN)).toBe(true)
    for (const value of ['', 'short', `${CAPABILITY_TOKEN}=`, 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(42) + '*']) {
      expect(isDesktopWorkspaceFileOpenToken(value)).toBe(false)
    }
  })

  it('uses a single allowlist for safe documents and rejects shell-dispatched names', () => {
    for (const name of ['README.md', 'report.pdf', 'assets/photo.PNG', 'src/main.ts']) {
      expect(isSafeDesktopWorkspaceFileOpenPath(name)).toBe(true)
    }
    for (const name of [
      'payload.cmd', 'payload.ps1', 'payload.lnk', 'payload.exe', 'payload.cmd.',
      'safe.txt:payload.cmd', 'https://example.test/a.pdf', 'file:///C:/work/a.pdf',
    ]) {
      expect(isSafeDesktopWorkspaceFileOpenPath(name)).toBe(false)
    }
  })

  it('resolves only a regular allowlisted file under an exact registered workspace root', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'desktop-open-authority-')))
    const root = join(temporary, 'workspace')
    const secondRoot = join(temporary, 'second-workspace')
    await mkdir(join(root, 'nested'), { recursive: true })
    await mkdir(join(root, '.git'), { recursive: true })
    await mkdir(secondRoot)
    await writeFile(join(root, 'README.md'), '# workspace')
    await writeFile(join(root, 'nested', 'note.txt'), 'note')
    await writeFile(join(root, '.git', 'config.md'), 'private')
    await writeFile(join(secondRoot, 'README.md'), '# second workspace')
    await mkdir(join(root, 'directory.md'))
    const resolveByPath = vi.fn(async (path: string) => {
      if (path === root) return { path: root }
      if (path === secondRoot) return { path: secondRoot }
      return undefined
    })
    try {
      const result = await resolveDesktopWorkspaceFileOpenTarget(
        { resolveByPath },
        { root, path: 'README.md' },
      )
      expect(result).toEqual({ ok: true, value: { path: join(root, 'README.md') } })

      // A separately registered workspace is a valid owner, but it must be
      // supplied as its exact canonical root.
      const second = await resolveDesktopWorkspaceFileOpenTarget(
        { resolveByPath },
        { root: secondRoot, path: 'README.md' },
      )
      expect(second).toEqual({ ok: true, value: { path: join(secondRoot, 'README.md') } })

      // A registered parent is insufficient: the supplied root must not be
      // merely a directory below it.
      const nested = await resolveDesktopWorkspaceFileOpenTarget(
        { resolveByPath },
        { root: join(root, 'nested'), path: 'note.txt' },
      )
      expect(nested).toMatchObject({ ok: false, error: { code: 'workspace-unknown' } })
      expect(resolveByPath).toHaveBeenLastCalledWith(join(root, 'nested'))

      // Defend even if a future registry resolver accidentally uses a
      // containing-path lookup rather than its documented exact lookup.
      const containingResolver = vi.fn(async (path: string) => path.startsWith(root) ? { path: root } : undefined)
      const containing = await resolveDesktopWorkspaceFileOpenTarget(
        { resolveByPath: containingResolver },
        { root: join(root, 'nested'), path: 'note.txt' },
      )
      expect(containing).toMatchObject({ ok: false, error: { code: 'workspace-unknown' } })

      expect(await resolveDesktopWorkspaceFileOpenTarget(
        { resolveByPath },
        { root, path: '.git/config.md' },
      )).toMatchObject({ ok: false, error: { code: 'path-outside-root' } })
      expect(await resolveDesktopWorkspaceFileOpenTarget(
        { resolveByPath },
        { root, path: 'directory.md' },
      )).toMatchObject({ ok: false, error: { code: 'is-directory' } })
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })

  it('enforces the loopback route before consulting workspace authority and rejects unsafe files', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'desktop-open-route-')))
    const root = join(temporary, 'workspace')
    await mkdir(root)
    await writeFile(join(root, 'README.md'), '# workspace')
    await Promise.all(['payload.cmd', 'payload.ps1', 'payload.lnk', 'payload.exe'].map(async (name) => {
      await writeFile(join(root, name), 'unsafe')
    }))
    const resolveByPath = vi.fn(async (path: string) => path === root ? { path: root } : undefined)
    const route = createDesktopWorkspaceFileOpenRoute({ resolveByPath }, { capabilityToken: CAPABILITY_TOKEN })
    try {
      const safe = await drive(route.handler as never, JSON.stringify({ root, path: 'README.md' }))
      expect(safe.status).toBe(200)
      expect(safe.body).toEqual({ ok: true, value: { path: join(root, 'README.md') } })

      const oversized = JSON.stringify({ root, path: 'README.md' }).padEnd(1024 * 1024 + 1)
      const tooLarge = await drive(route.handler as never, oversized)
      expect(tooLarge.status).toBe(400)
      expect(resolveByPath).toHaveBeenCalledTimes(1)

      for (const path of [
        'payload.cmd', 'payload.ps1', 'payload.lnk', 'payload.exe',
        'payload.cmd.', 'safe.txt:payload.cmd', 'https://example.test/a.pdf',
      ]) {
        const denied = await drive(route.handler as never, JSON.stringify({ root, path }))
        expect(denied.status).toBe(400)
        expect(denied.body).toMatchObject({ ok: false, error: { code: 'bad-request' } })
      }

      const invalidContentType = await drive(
        route.handler as never,
        JSON.stringify({ root, path: 'README.md' }),
        { contentType: 'text/plain' },
      )
      expect(invalidContentType.status).toBe(415)

      const invalidJson = await drive(route.handler as never, '{')
      expect(invalidJson.status).toBe(400)

      const sameOrigin = await drive(
        route.handler as never,
        JSON.stringify({ root, path: 'README.md' }),
        { origin: 'http://127.0.0.1:43125' },
      )
      expect(sameOrigin.status).toBe(200)

      resolveByPath.mockClear()
      const noCapability = await drive(
        route.handler as never,
        JSON.stringify({ root, path: 'README.md' }),
        { origin: 'http://127.0.0.1:43125', includeCapabilityToken: false },
      )
      expect(noCapability.status).toBe(403)
      expect(noCapability.body).toEqual({
        ok: false,
        error: { code: 'forbidden', message: 'desktop capability required' },
      })
      // A same-origin renderer cannot use this route as a resolved-path
      // oracle: the rejection happens before body/workspace processing.
      expect(JSON.stringify(noCapability.body)).not.toContain(root)
      expect(resolveByPath).not.toHaveBeenCalled()

      const wrongCapability = await drive(
        route.handler as never,
        JSON.stringify({ root, path: 'README.md' }),
        { origin: 'http://127.0.0.1:43125', capabilityToken: 'b'.repeat(43) },
      )
      expect(wrongCapability.status).toBe(403)
      expect(JSON.stringify(wrongCapability.body)).not.toContain(root)
      expect(resolveByPath).not.toHaveBeenCalled()

      resolveByPath.mockClear()
      const crossOrigin = await drive(
        route.handler as never,
        JSON.stringify({ root, path: 'README.md' }),
        { origin: 'http://localhost:43125' },
      )
      expect(crossOrigin.status).toBe(403)
      expect(resolveByPath).not.toHaveBeenCalled()

      const remote = await drive(
        route.handler as never,
        JSON.stringify({ root, path: 'README.md' }),
        { remoteAddress: '192.168.1.30', host: '192.168.1.2:43125' },
      )
      expect(remote.status).toBe(403)
      expect(remote.body).toMatchObject({ ok: false, error: { code: 'forbidden' } })
      expect(resolveByPath).not.toHaveBeenCalled()
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })

  it('realpaths safe-looking symlinks before scope and type checks', async () => {
    const temporary = await realpath(await mkdtemp(join(tmpdir(), 'desktop-open-symlink-')))
    const root = join(temporary, 'workspace')
    const secondRoot = join(temporary, 'second-workspace')
    await mkdir(root)
    await mkdir(secondRoot)
    await writeFile(join(root, 'payload.cmd'), 'unsafe')
    await writeFile(join(secondRoot, 'README.md'), '# second workspace')
    const resolveByPath = async (path: string) => {
      if (path === root) return { path: root }
      if (path === secondRoot) return { path: secondRoot }
      return undefined
    }
    try {
      try {
        await symlink(join(root, 'payload.cmd'), join(root, 'looks-safe.md'), 'file')
        await symlink(join(secondRoot, 'README.md'), join(root, 'other-workspace.md'), 'file')
      } catch (error) {
        // Windows hosts without Developer Mode can forbid file symlinks. The
        // direct unsafe-type regression above still runs there; exercise the
        // final-realpath case wherever the OS grants this fixture capability.
        if ((error as NodeJS.ErrnoException).code === 'EPERM') return
        throw error
      }
      const result = await resolveDesktopWorkspaceFileOpenTarget(
        { resolveByPath },
        { root, path: 'looks-safe.md' },
      )
      expect(result).toMatchObject({ ok: false, error: { code: 'external-open-denied' } })
      const crossWorkspace = await resolveDesktopWorkspaceFileOpenTarget(
        { resolveByPath },
        { root, path: 'other-workspace.md' },
      )
      expect(crossWorkspace).toMatchObject({ ok: false, error: { code: 'path-outside-root' } })
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })
})
